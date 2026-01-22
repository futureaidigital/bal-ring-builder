// app/routes/app.origins.tsx

import React, { useState, useCallback, useEffect } from 'react';
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation, useFetcher } from "@remix-run/react";
import { 
  Page, 
  Card,
  Layout,
  Button,
  Badge,
  TextField,
  Banner,
  DataTable,
  Modal,
  TextContainer,
  Tabs,
  EmptyState,
  Thumbnail,
  SkeletonBodyText,
  Toast,
  Frame,
  Select,
  FormLayout
} from '@shopify/polaris';
import { authenticate } from "../shopify.server";
import { prisma } from "../utils/db.server";
// Helper functions (inline since we're keeping it simple)
const extractOriginsFromProducts = (products) => {
  const origins = new Set();
  products.forEach(product => {
    const origin = product.metafields?.gemstone_origin;
    if (origin) origins.add(origin);
  });
  return Array.from(origins).sort();
};

const extractTreatmentsFromProducts = (products) => {
  const treatments = new Set();
  products.forEach(product => {
    const treatment = product.metafields?.gemstone_treatment;
    if (treatment) treatments.add(treatment);
  });
  return Array.from(treatments).sort();
};

const extractCertificationsFromProducts = (products) => {
  const certifications = new Set();
  products.forEach(product => {
    const cert = product.metafields?.certification_laboratory;
    if (cert) certifications.add(cert);
  });
  return Array.from(certifications).sort();
};

// GraphQL query to get products with metafields
const PRODUCTS_WITH_METAFIELDS_QUERY = `
  query GetProductsWithMetafields($first: Int!, $query: String) {
    products(first: $first, query: $query) {
      edges {
        node {
          id
          gemstoneOrigin: metafield(namespace: "custom", key: "gemstone_origin") { value }
          gemstoneTreatment: metafield(namespace: "custom", key: "gemstone_treatment") { value }
          certificationLaboratory: metafield(namespace: "custom", key: "certification_laboratory") { value }
        }
      }
    }
  }
`;

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  
  try {
    // Get all gemstone products to extract used metafield values
    const response = await admin.graphql(PRODUCTS_WITH_METAFIELDS_QUERY, {
      variables: {
        first: 250,
        query: '(product_type:"Precious stone" OR tag:gemstone)'
      }
    });

    const data = await response.json();
    const products = data.data.products.edges.map(edge => ({
      metafields: {
        gemstone_origin: edge.node.gemstoneOrigin?.value,
        gemstone_treatment: edge.node.gemstoneTreatment?.value,
        certification_laboratory: edge.node.certificationLaboratory?.value
      }
    }));

    // Extract unique values
    const usedOrigins = extractOriginsFromProducts(products);
    const usedTreatments = extractTreatmentsFromProducts(products);
    const usedCertifications = extractCertificationsFromProducts(products);

    // Get existing definitions from database
    const existingDefinitions = await prisma.originDefinition.findMany({
      where: { shop: session.shop },
      orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }]
    });

    return json({
      usedOrigins,
      usedTreatments,
      usedCertifications,
      existingDefinitions,
      shop: session.shop
    });
  } catch (error) {
    console.error('Error loading origins data:', error);
    return json({
      usedOrigins: [],
      usedTreatments: [],
      usedCertifications: [],
      existingDefinitions: [],
      error: error.message,
      shop: session.shop
    });
  }
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const actionType = formData.get("action");

  try {
    switch (actionType) {
      case "create":
        const newDefinition = await prisma.originDefinition.create({
          data: {
            shop: session.shop,
            name: formData.get("name"),
            title: formData.get("title"),
            description: formData.get("description"),
            imageUrl: formData.get("imageUrl") || null,
            category: formData.get("category"),
            sortOrder: parseInt(formData.get("sortOrder")) || 0
          }
        });
        return json({ success: true, message: "Definition created successfully", definition: newDefinition });

      case "update":
        const updatedDefinition = await prisma.originDefinition.update({
          where: { id: formData.get("id") },
          data: {
            title: formData.get("title"),
            description: formData.get("description"),
            imageUrl: formData.get("imageUrl") || null,
            sortOrder: parseInt(formData.get("sortOrder")) || 0,
            isActive: formData.get("isActive") === "true"
          }
        });
        return json({ success: true, message: "Definition updated successfully", definition: updatedDefinition });

      case "delete":
        await prisma.originDefinition.delete({
          where: { id: formData.get("id") }
        });
        return json({ success: true, message: "Definition deleted successfully" });

      default:
        return json({ error: "Invalid action" }, { status: 400 });
    }
  } catch (error) {
    console.error('Error in origins action:', error);
    return json({ error: error.message }, { status: 500 });
  }
};

export default function OriginsManagement() {
  const { 
    usedOrigins = [], 
    usedTreatments = [], 
    usedCertifications = [],
    existingDefinitions = [],
    error,
    shop
  } = useLoaderData();

  const [selectedTab, setSelectedTab] = useState(0);
  const [modalActive, setModalActive] = useState(false);
  const [modalContent, setModalContent] = useState(null);
  const [editingDefinition, setEditingDefinition] = useState(null);
  const [toastActive, setToastActive] = useState(false);
  const [toastContent, setToastContent] = useState('');
  const [toastError, setToastError] = useState(false);

  const fetcher = useFetcher();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  // Show toast notifications
  useEffect(() => {
    if (fetcher.data?.message || fetcher.data?.error) {
      setToastContent(fetcher.data.message || fetcher.data.error);
      setToastError(!!fetcher.data.error);
      setToastActive(true);
    }
  }, [fetcher.data]);

  const tabs = [
    { id: 'origins', content: `🌍 Origins (${usedOrigins.length})`, panelID: 'origins-panel' },
    { id: 'treatments', content: `⚗️ Treatments (${usedTreatments.length})`, panelID: 'treatments-panel' },
    { id: 'certificates', content: `📜 Certificates (${usedCertifications.length})`, panelID: 'certificates-panel' },
  ];

  const getCurrentCategoryData = () => {
    const categories = ['origin', 'treatment', 'certificate'];
    const currentCategory = categories[selectedTab];
    const usedValues = [usedOrigins, usedTreatments, usedCertifications][selectedTab];
    const definitions = existingDefinitions.filter(def => def.category === currentCategory);
    
    return { currentCategory, usedValues, definitions };
  };

  const handleCreateDefinition = (name) => {
    const { currentCategory } = getCurrentCategoryData();
    setEditingDefinition({
      name,
      title: '',
      description: '',
      imageUrl: '',
      category: currentCategory,
      sortOrder: 0,
      isNew: true
    });
    setModalActive(true);
  };

  const handleEditDefinition = (definition) => {
    setEditingDefinition({ ...definition, isNew: false });
    setModalActive(true);
  };

  const handleSubmitDefinition = () => {
    const formData = new FormData();
    formData.append("action", editingDefinition.isNew ? "create" : "update");
    if (!editingDefinition.isNew) {
      formData.append("id", editingDefinition.id);
    }
    formData.append("name", editingDefinition.name);
    formData.append("title", editingDefinition.title);
    formData.append("description", editingDefinition.description);
    formData.append("imageUrl", editingDefinition.imageUrl || '');
    formData.append("category", editingDefinition.category);
    formData.append("sortOrder", editingDefinition.sortOrder.toString());
    formData.append("isActive", editingDefinition.isActive !== false ? "true" : "false");
    
    fetcher.submit(formData, { method: "post" });
    setModalActive(false);
    setEditingDefinition(null);
  };

  const renderCategoryPanel = () => {
    const { currentCategory, usedValues, definitions } = getCurrentCategoryData();
    
    if (usedValues.length === 0) {
      return (
        <EmptyState
          heading={`No ${currentCategory}s found in your products`}
          image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
        >
          <p>Add metafields to your gemstone products to see {currentCategory}s here.</p>
        </EmptyState>
      );
    }

    const rows = usedValues.map(value => {
      const existingDef = definitions.find(def => def.name === value);
      
      return [
        value,
        existingDef ? (
          <Badge status="success">Configured</Badge>
        ) : (
          <Badge status="attention">Not configured</Badge>
        ),
        existingDef?.title || '-',
        existingDef?.description ? 
          <div style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {existingDef.description}
          </div> : '-',
        existingDef?.imageUrl ? (
          <Thumbnail source={existingDef.imageUrl} alt={existingDef.title} size="small" />
        ) : '-',
        <div style={{ display: 'flex', gap: '8px' }}>
          {existingDef ? (
            <>
              <Button size="slim" onClick={() => handleEditDefinition(existingDef)}>
                Edit
              </Button>
              <Button 
                size="slim" 
                destructive 
                onClick={() => {
                  const formData = new FormData();
                  formData.append("action", "delete");
                  formData.append("id", existingDef.id);
                  fetcher.submit(formData, { method: "post" });
                }}
              >
                Delete
              </Button>
            </>
          ) : (
            <Button size="slim" primary onClick={() => handleCreateDefinition(value)}>
              Configure
            </Button>
          )}
        </div>
      ];
    });

    return (
      <DataTable
        columnContentTypes={['text', 'text', 'text', 'text', 'text', 'text']}
        headings={['Value', 'Status', 'Display Title', 'Description', 'Image', 'Actions']}
        rows={rows}
        hoverable
      />
    );
  };

  if (error) {
    return (
      <Page title="Gemstone Information Manager">
        <Layout>
          <Layout.Section>
            <Banner title="Error loading data" status="critical">
              <p>{error}</p>
            </Banner>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  return (
    <Frame>
      <Page
        title="Gemstone Information Manager"
        subtitle="Configure how origins, treatments, and certificates are displayed to customers"
        primaryAction={{
          content: 'Preview Table',
          onAction: () => window.open('/apps/ring-builder/gemstone-info', '_blank')
        }}
      >
        <Layout>
          <Layout.Section>
            <Banner
              title="How this works"
              status="info"
            >
              <p>
                We automatically detect origins, treatments, and certificates from your product metafields. 
                Configure how each one is displayed in your customer-facing gemstone information table.
              </p>
            </Banner>
          </Layout.Section>

          <Layout.Section>
            <Card>
              <Tabs tabs={tabs} selected={selectedTab} onSelect={setSelectedTab}>
                <div style={{ padding: '20px' }}>
                  {renderCategoryPanel()}
                </div>
              </Tabs>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>

      {/* Edit/Create Modal */}
      {modalActive && editingDefinition && (
        <Modal
          open={modalActive}
          onClose={() => {
            setModalActive(false);
            setEditingDefinition(null);
          }}
          title={editingDefinition.isNew ? `Configure ${editingDefinition.name}` : `Edit ${editingDefinition.name}`}
          primaryAction={{
            content: editingDefinition.isNew ? 'Create' : 'Save',
            onAction: handleSubmitDefinition,
            loading: isSubmitting
          }}
          secondaryActions={[
            {
              content: 'Cancel',
              onAction: () => {
                setModalActive(false);
                setEditingDefinition(null);
              }
            }
          ]}
        >
          <Modal.Section>
            <FormLayout>
              <TextField
                label="Display Title"
                value={editingDefinition.title}
                onChange={(value) => setEditingDefinition(prev => ({ ...prev, title: value }))}
                placeholder="e.g., Ceylon Sapphires, Heat Treatment Process"
                helpText="This will be shown as the heading in the information table"
              />
              
              <TextField
                label="Description"
                value={editingDefinition.description}
                onChange={(value) => setEditingDefinition(prev => ({ ...prev, description: value }))}
                multiline={4}
                placeholder="Detailed description for customers..."
                helpText="Explain what this origin/treatment/certificate means"
              />
              
              <TextField
                label="Image URL (optional)"
                value={editingDefinition.imageUrl}
                onChange={(value) => setEditingDefinition(prev => ({ ...prev, imageUrl: value }))}
                placeholder="https://..."
                helpText="Image to display in the information table"
              />
              
              <TextField
                label="Sort Order"
                type="number"
                value={editingDefinition.sortOrder.toString()}
                onChange={(value) => setEditingDefinition(prev => ({ 
                  ...prev, 
                  sortOrder: parseInt(value) || 0 
                }))}
                helpText="Lower numbers appear first in the table"
              />
            </FormLayout>
          </Modal.Section>
        </Modal>
      )}

      {/* Toast */}
      {toastActive && (
        <Toast
          content={toastContent}
          onDismiss={() => setToastActive(false)}
          error={toastError}
          duration={4500}
        />
      )}
    </Frame>
  );
}