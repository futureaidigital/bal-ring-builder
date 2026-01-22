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
  Select
} from '@shopify/polaris';
import { authenticate } from "../shopify.server";
import { prisma } from "../utils/db.server";
import { useNavigate } from "@remix-run/react";

// GraphQL query to fetch products
const PRODUCTS_QUERY = `
  query GetProducts($first: Int!, $query: String, $after: String) {
    products(first: $first, query: $query, after: $after) {
      edges {
        node {
          id
          title
          handle
          productType
          status
          vendor
          featuredImage {
            url
            altText
          }
          priceRangeV2 {
            minVariantPrice {
              amount
              currencyCode
            }
            maxVariantPrice {
              amount
              currencyCode
            }
          }
          totalInventory
          tags
          metafields(first: 20, namespace: "custom") {
            edges {
              node {
                key
                value
              }
            }
          }
          variants(first: 100) {
            edges {
              node {
                inventoryQuantity
              }
            }
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const productType = url.searchParams.get("type") || "gemstone";
  const searchQuery = url.searchParams.get("search") || "";
  
  try {
    // Build Shopify query
    let shopifyQuery = productType === 'gemstone' 
      ? '(product_type:"Precious stone" OR tag:gemstone)'
      : '(tag:Setting_Ring OR tag:Setting_Pendant)';
    
    if (searchQuery) {
      shopifyQuery += ` AND (title:*${searchQuery}* OR tag:*${searchQuery}*)`;
    }

    // Fetch all products from Shopify
    let allProducts = [];
    let hasNextPage = true;
    let cursor = null;
    
    while (hasNextPage && allProducts.length < 250) {
      const response = await admin.graphql(PRODUCTS_QUERY, {
        variables: {
          first: 50,
          query: shopifyQuery,
          after: cursor
        }
      });

      const data = await response.json();
      
      if (data.errors) {
        throw new Error('Failed to fetch products from Shopify');
      }
      
      const products = data.data.products.edges;
      allProducts = [...allProducts, ...products];
      
      hasNextPage = data.data.products.pageInfo.hasNextPage;
      cursor = data.data.products.pageInfo.endCursor;
    }

    // Get active products from minimal database
    const activeProducts = await prisma.activeProduct.findMany({
      where: {
        shop: session.shop,
        type: productType === 'gemstone' ? 'gemstone' : { in: ['ring', 'pendant'] }
      }
    });

    const activeProductIds = new Set(activeProducts.map(p => p.productId));
    
    // Process products
    const processedProducts = allProducts.map(({ node }) => {
      const metafields = {};
      
      // Extract metafields
      node.metafields.edges.forEach(({ node: metafield }) => {
        metafields[metafield.key] = metafield.value;
      });

      // Extract product ID from GID
      const productId = node.id.split('/').pop();

      // Validation logic
      let validation = {};
      if (productType === 'gemstone') {
        validation = {
          weight: !!(metafields.gemstone_weight || metafields.weight),
          shape: !!(metafields.gemstone_shape || metafields.shape),
          type: !!(metafields.gemstone_type || metafields.stone_type),
          hasAllRequired: false
        };
        validation.hasAllRequired = validation.weight && validation.shape && validation.type;
      } else {
        validation = {
          centerStoneShape: !!(metafields.center_stone_shape || metafields.stone_shape),
          hasAllRequired: false
        };
        validation.hasAllRequired = validation.centerStoneShape;
      }
      
      // Calculate inventory
      const totalInventory = node.variants.edges.reduce((sum, { node: variant }) => 
        sum + (variant.inventoryQuantity || 0), 0
      );

      return {
        id: productId,
        title: node.title,
        handle: node.handle,
        productType: node.productType,
        vendor: node.vendor || 'Unknown',
        status: node.status,
        imageUrl: node.featuredImage?.url,
        imageAlt: node.featuredImage?.altText || node.title,
        price: parseFloat(node.priceRangeV2.minVariantPrice.amount),
        maxPrice: parseFloat(node.priceRangeV2.maxVariantPrice.amount),
        currency: node.priceRangeV2.minVariantPrice.currencyCode,
        inventory: totalInventory,
        tags: node.tags || [],
        imported: activeProductIds.has(productId),
        validation,
        metafields,
        variantCount: node.variants.edges.length
      };
    });

    // Get stats from database
    const stats = {
      gemstones: await prisma.activeProduct.count({
        where: { shop: session.shop, type: 'gemstone' }
      }),
      rings: await prisma.activeProduct.count({
        where: { shop: session.shop, type: 'ring' }
      }),
      pendants: await prisma.activeProduct.count({
        where: { shop: session.shop, type: 'pendant' }
      }),
      settings: 0, // Will be calculated
      totalProducts: 0,
      readyToImport: processedProducts.filter(p => !p.imported && p.validation.hasAllRequired).length
    };
    
    stats.settings = stats.rings + stats.pendants;
    stats.totalProducts = stats.gemstones + stats.settings;

    return json({ 
      products: processedProducts,
      stats,
      shopCurrency: processedProducts[0]?.currency || 'USD',
      productType,
      shop: session.shop
    });
  } catch (error) {
    console.error('Error fetching products:', error);
    return json({ 
      products: [], 
      stats: { gemstones: 0, settings: 0, rings: 0, pendants: 0, totalProducts: 0, readyToImport: 0 },
      error: error.message,
      productType,
      shop: session.shop
    });
  }
};

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const actionType = formData.get("action");
  const productId = formData.get("productId");
  const productHandle = formData.get("productHandle");
  const productType = formData.get("productType");
  const productTitle = formData.get("productTitle");

  try {
    switch (actionType) {
      case "import":
        await prisma.activeProduct.create({
          data: {
            shop: session.shop,
            productId: productId,
            handle: productHandle,
            type: productType === 'gemstone' ? 'gemstone' : 
                  (formData.get("actualProductType") === 'Pendant' ? 'pendant' : 'ring')
          }
        });
        return json({ success: true, message: `${productTitle} added to ring builder` });
        
      case "remove":
        await prisma.activeProduct.delete({
          where: {
            shop_productId: {
              shop: session.shop,
              productId: productId
            }
          }
        });
        return json({ success: true, message: `${productTitle} removed from ring builder` });
        
      case "bulk-import":
        const productIds = formData.getAll("productIds[]");
        const productHandles = formData.getAll("productHandles[]");
        const productTypes = formData.getAll("productTypes[]");
        
        // Since SQLite doesn't support skipDuplicates, we'll use a transaction
        let imported = 0;
        for (let i = 0; i < productIds.length; i++) {
          try {
            await prisma.activeProduct.create({
              data: {
                shop: session.shop,
                productId: productIds[i],
                handle: productHandles[i],
                type: productType === 'gemstone' ? 'gemstone' : 
                      (productTypes[i] === 'Pendant' ? 'pendant' : 'ring')
              }
            });
            imported++;
          } catch (error) {
            // Skip if already exists (unique constraint violation)
            if (error.code !== 'P2002') {
              throw error;
            }
          }
        }
        
        return json({ 
          success: true, 
          message: `${imported} products added to ring builder` 
        });
        
      default:
        return json({ error: "Invalid action" }, { status: 400 });
    }
  } catch (error) {
    console.error('Error in action:', error);
    return json({ 
      error: error.message || "An error occurred"
    }, { status: 500 });
  }
};

// Main component
export default function MerchantDashboard() {
  const { 
    products = [], 
    stats, 
    shopCurrency, 
    error, 
    productType: initialProductType, 
    shop
  } = useLoaderData();

  const [selectedTab, setSelectedTab] = useState(initialProductType === 'setting' ? 1 : 0);
  const [searchValue, setSearchValue] = useState('');
  const [modalActive, setModalActive] = useState(false);
  const [modalContent, setModalContent] = useState(null);
  const [toastActive, setToastActive] = useState(false);
  const [toastContent, setToastContent] = useState('');
  const [toastError, setToastError] = useState(false);
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [filterStatus, setFilterStatus] = useState('all');
  const [sortBy, setSortBy] = useState('title');
  
  const navigation = useNavigation();
  const fetcher = useFetcher();
  const navigate = useNavigate();
  
  const isLoading = navigation.state === "loading";
  const isSubmitting = navigation.state === "submitting";

  // Show toast notifications
  useEffect(() => {
    if (fetcher.data?.message || fetcher.data?.error) {
      setToastContent(fetcher.data.message || fetcher.data.error);
      setToastError(!!fetcher.data.error);
      setToastActive(true);
    }
  }, [fetcher.data]);

  // Handle tab change
  const handleTabChange = useCallback((selectedTabIndex) => {
    setSelectedTab(selectedTabIndex);
    setSelectedProducts([]);
    
    if (selectedTabIndex === 2) {
      // Navigate to origins management page
      navigate('/app/origins');
      return;
    }
    
    const newType = selectedTabIndex === 0 ? 'gemstone' : 'setting';
    navigate(`?type=${newType}`);
  }, [navigate]);

  // Filter and sort products BEFORE using them
  let filteredProducts = products.filter(product => {
    const matchesSearch = product.title.toLowerCase().includes(searchValue.toLowerCase()) ||
                         product.tags.some(tag => tag.toLowerCase().includes(searchValue.toLowerCase()));
    
    const matchesStatus = filterStatus === 'all' ||
                         (filterStatus === 'imported' && product.imported) ||
                         (filterStatus === 'ready' && !product.imported && product.validation.hasAllRequired) ||
                         (filterStatus === 'incomplete' && !product.imported && !product.validation.hasAllRequired);
    
    return matchesSearch && matchesStatus;
  });

  // Sort products
  filteredProducts = filteredProducts.sort((a, b) => {
    switch (sortBy) {
      case 'title':
        return a.title.localeCompare(b.title);
      case 'price':
        return a.price - b.price;
      case 'inventory':
        return b.inventory - a.inventory;
      case 'status':
        if (a.imported !== b.imported) return a.imported ? -1 : 1;
        return a.validation.hasAllRequired ? -1 : 1;
      default:
        return 0;
    }
  });

  // Import/Remove handler
  const handleImportToggle = useCallback((product) => {
    const productType = selectedTab === 0 ? 'gemstone' : 'setting';
    
    // Check validation
    if (!product.validation.hasAllRequired && !product.imported) {
      const missingFields = Object.entries(product.validation)
        .filter(([key, value]) => key !== 'hasAllRequired' && !value)
        .map(([key]) => {
          const fieldMap = {
            weight: 'Weight (gemstone_weight)',
            shape: 'Shape (gemstone_shape)',
            type: 'Stone Type (gemstone_type)',
            centerStoneShape: 'Center Stone Shape (center_stone_shape)'
          };
          return fieldMap[key] || key;
        });

      setModalContent({
        title: 'Missing Required Fields',
        message: (
          <div>
            <p>This product is missing required metafields:</p>
            <ul style={{ marginTop: '10px', marginLeft: '20px' }}>
              {missingFields.map((field, index) => (
                <li key={index}>{field}</li>
              ))}
            </ul>
            <p style={{ marginTop: '10px' }}>
              Please add these metafields in Shopify before importing.
            </p>
          </div>
        ),
        primaryAction: {
          content: 'OK',
          onAction: () => {
            setModalActive(false);
          }
        }
      });
      setModalActive(true);
      return;
    }

    // Confirm removal
    if (product.imported) {
      setModalContent({
        title: 'Remove Product',
        message: `Are you sure you want to remove "${product.title}" from the ring builder?`,
        primaryAction: {
          content: 'Remove',
          destructive: true,
          onAction: () => {
            submitAction("remove", product);
            setModalActive(false);
          }
        }
      });
      setModalActive(true);
      return;
    }

    // Import product
    submitAction("import", product);
  }, [selectedTab, shop, filteredProducts]);

  const submitAction = (action, product) => {
    const formData = new FormData();
    formData.append("action", action);
    formData.append("productId", product.id);
    formData.append("productHandle", product.handle);
    formData.append("productType", selectedTab === 0 ? 'gemstone' : 'setting');
    formData.append("productTitle", product.title);
    formData.append("actualProductType", product.productType);
    fetcher.submit(formData, { method: "post" });
  };

  // Bulk import
  const handleBulkImport = useCallback(() => {
    if (selectedProducts.length === 0) return;
    
    const productType = selectedTab === 0 ? 'gemstone' : 'setting';
    const readyProducts = selectedProducts.filter(id => {
      const product = filteredProducts.find(p => p.id === id);
      return product && !product.imported && product.validation.hasAllRequired;
    });

    if (readyProducts.length === 0) {
      setToastContent('No selected products are ready for import');
      setToastError(true);
      setToastActive(true);
      return;
    }

    const formData = new FormData();
    formData.append("action", "bulk-import");
    formData.append("productType", productType);
    
    readyProducts.forEach(id => {
      const product = filteredProducts.find(p => p.id === id);
      formData.append("productIds[]", id);
      formData.append("productHandles[]", product.handle);
      formData.append("productTypes[]", product.productType);
    });
    
    fetcher.submit(formData, { method: "post" });
    setSelectedProducts([]);
  }, [selectedProducts, selectedTab, filteredProducts]);

  // Create table rows
  const rows = filteredProducts.map(product => {
    const isGemstone = selectedTab === 0;
    const isSelected = selectedProducts.includes(product.id);
    
    return [
      // Checkbox
      <div onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => {
            setSelectedProducts(prev =>
              isSelected
                ? prev.filter(id => id !== product.id)
                : [...prev, product.id]
            );
          }}
        />
      </div>,
      // Product info
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {product.imageUrl ? (
          <Thumbnail
            source={product.imageUrl}
            alt={product.imageAlt}
            size="small"
          />
        ) : (
          <div style={{ 
            width: '50px', 
            height: '50px', 
            backgroundColor: '#f4f6f8',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '12px',
            color: '#8c9196'
          }}>
            {isGemstone ? '💎' : '💍'}
          </div>
        )}
        <div>
          <div style={{ fontWeight: '600', marginBottom: '4px' }}>{product.title}</div>
          <div style={{ fontSize: '13px', color: '#6d7175' }}>
            {shopCurrency}{product.price.toFixed(2)}
            {product.maxPrice > product.price && ` - ${shopCurrency}${product.maxPrice.toFixed(2)}`}
            {' • '}
            {product.inventory} in stock
          </div>
          <div style={{ fontSize: '12px', color: '#8c9196', marginTop: '2px' }}>
            {product.vendor} • {product.handle}
          </div>
        </div>
      </div>,
      // Status
      <div>
        {product.imported ? (
          <Badge status="success">Active</Badge>
        ) : product.validation.hasAllRequired ? (
          <Badge status="info">Ready</Badge>
        ) : (
          <Badge status="warning">Incomplete</Badge>
        )}
      </div>,
      // Details
      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
        {isGemstone ? (
          <>
            {product.metafields.gemstone_type && (
              <Badge size="small" status="info">{product.metafields.gemstone_type}</Badge>
            )}
            {product.metafields.gemstone_shape && (
              <Badge size="small">{product.metafields.gemstone_shape}</Badge>
            )}
            {product.metafields.gemstone_weight && (
              <Badge size="small">{product.metafields.gemstone_weight}ct</Badge>
            )}
          </>
        ) : (
          <>
            {product.productType && (
              <Badge size="small" status="info">{product.productType}</Badge>
            )}
            {product.metafields.center_stone_shape && (
              <Badge size="small">For: {product.metafields.center_stone_shape}</Badge>
            )}
          </>
        )}
      </div>,
      // Actions
      <div style={{ display: 'flex', gap: '8px' }}>
        <Button
          size="slim"
          primary={!product.imported}
          loading={isSubmitting}
          onClick={() => handleImportToggle(product)}
        >
          {product.imported ? 'Remove' : 'Import'}
        </Button>
      </div>
    ];
  });

  if (error) {
    return (
      <Page title="Ring Builder Dashboard">
        <Layout>
          <Layout.Section>
            <Banner
              title="Error loading products"
              status="critical"
              action={{
                content: 'Retry',
                onAction: () => window.location.reload()
              }}
            >
              <p>{error}</p>
            </Banner>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  const tabs = [
    {
      id: 'gemstones',
      content: `💎 Gemstones (${stats.gemstones})`,
      panelID: 'gemstones-panel',
    },
    {
      id: 'settings',
      content: `💍 Settings (${stats.settings})`,
      panelID: 'settings-panel',
    },
    {
      id: 'origins',
      content: '🌍 Gemstone Info',
      panelID: 'origins-panel',
    },
  ];

  const filterOptions = [
    { label: 'All Products', value: 'all' },
    { label: 'Active', value: 'imported' },
    { label: 'Ready to Import', value: 'ready' },
    { label: 'Incomplete', value: 'incomplete' },
  ];

  const sortOptions = [
    { label: 'Name', value: 'title' },
    { label: 'Price', value: 'price' },
    { label: 'Inventory', value: 'inventory' },
    { label: 'Status', value: 'status' },
  ];

  const emptyStateMarkup = (
    <EmptyState
      heading={selectedTab === 0 ? "No gemstones found" : "No settings found"}
      image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
    >
      <p>
      {selectedTab === 0 
        ? "Create products with type 'Precious stone' or tag 'gemstone' to see them here."
        : "Tag products with 'Setting_Ring' or 'Setting_Pendant' to see them here."}
      </p>
    </EmptyState>
  );

  return (
    <Frame>
      <Page
        title="Ring Builder Manager"
        subtitle="Manage gemstones and settings for your custom jewelry builder"
        primaryAction={{
          content: 'Refresh',
          onAction: () => window.location.reload()
        }}
      >
        <Layout>
          {/* Statistics Cards */}
          <Layout.Section>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
              <Card>
                <div style={{ padding: '20px', textAlign: 'center' }}>
                  <p style={{ fontSize: '14px', color: '#6d7175', marginBottom: '8px' }}>Active Gemstones</p>
                  <p style={{ fontSize: '32px', fontWeight: '600', color: '#212b36' }}>{stats.gemstones}</p>
                </div>
              </Card>
              <Card>
                <div style={{ padding: '20px', textAlign: 'center' }}>
                  <p style={{ fontSize: '14px', color: '#6d7175', marginBottom: '8px' }}>Ring Settings</p>
                  <p style={{ fontSize: '32px', fontWeight: '600', color: '#212b36' }}>{stats.rings}</p>
                </div>
              </Card>
              <Card>
                <div style={{ padding: '20px', textAlign: 'center' }}>
                  <p style={{ fontSize: '14px', color: '#6d7175', marginBottom: '8px' }}>Pendant Settings</p>
                  <p style={{ fontSize: '32px', fontWeight: '600', color: '#212b36' }}>{stats.pendants}</p>
                </div>
              </Card>
              <Card>
                <div style={{ padding: '20px', textAlign: 'center' }}>
                  <p style={{ fontSize: '14px', color: '#6d7175', marginBottom: '8px' }}>Ready to Import</p>
                  <p style={{ fontSize: '32px', fontWeight: '600', color: '#008060' }}>{stats.readyToImport}</p>
                </div>
              </Card>
            </div>
          </Layout.Section>

          {/* Instructions */}
          <Layout.Section>
            <Card>
              <Banner
                title="How the Ring Builder Works"
                status="info"
              >
                <ol style={{ marginLeft: '20px', marginTop: '8px' }}>
                  <li>Import your gemstones and settings from your Shopify catalog</li>
                  <li>Customers browse and pair gemstones with their preferred setting</li>
                  <li>When they click "Add to Cart", both items are added as separate line items</li>
                  <li>You fulfill the order by setting the chosen stone in the selected ring or pendant</li>
                </ol>
              </Banner>
            </Card>
          </Layout.Section>

          {/* Main Content */}
          <Layout.Section>
            <Card>
              <Tabs tabs={tabs} selected={selectedTab} onSelect={handleTabChange}>
                {/* Toolbar */}
                <div style={{ padding: '16px', borderBottom: '1px solid #e1e3e5', backgroundColor: '#f9fafb' }}>
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: '200px' }}>
                      <TextField
                        placeholder={`Search ${selectedTab === 0 ? 'gemstones' : 'settings'}...`}
                        value={searchValue}
                        onChange={setSearchValue}
                        clearButton
                        onClearButtonClick={() => setSearchValue('')}
                        autoComplete="off"
                      />
                    </div>
                    <Select
                      label="Filter"
                      labelHidden
                      options={filterOptions}
                      value={filterStatus}
                      onChange={setFilterStatus}
                    />
                    <Select
                      label="Sort"
                      labelHidden
                      options={sortOptions}
                      value={sortBy}
                      onChange={setSortBy}
                    />
                    {selectedProducts.length > 0 && (
                      <Button
                        primary
                        onClick={handleBulkImport}
                        loading={isSubmitting}
                      >
                        Import {selectedProducts.length} Selected
                      </Button>
                    )}
                  </div>
                </div>

                {/* Table */}
                {isLoading ? (
                  <div style={{ padding: '20px' }}>
                    <SkeletonBodyText lines={10} />
                  </div>
                ) : filteredProducts.length === 0 ? (
                  searchValue || filterStatus !== 'all' ? (
                    <div style={{ padding: '40px', textAlign: 'center' }}>
                      <p>No products found matching your criteria</p>
                      <Button 
                        onClick={() => {
                          setSearchValue('');
                          setFilterStatus('all');
                        }} 
                        plain
                      >
                        Clear filters
                      </Button>
                    </div>
                  ) : (
                    emptyStateMarkup
                  )
                ) : (
                  <>
                    <DataTable
                      columnContentTypes={['text', 'text', 'text', 'text', 'text']}
                      headings={[
                        <input
                          type="checkbox"
                          checked={selectedProducts.length === filteredProducts.length && filteredProducts.length > 0}
                          onChange={() => {
                            if (selectedProducts.length === filteredProducts.length) {
                              setSelectedProducts([]);
                            } else {
                              setSelectedProducts(filteredProducts.map(p => p.id));
                            }
                          }}
                        />,
                        'Product',
                        'Status',
                        'Details',
                        'Action'
                      ]}
                      rows={rows}
                      hoverable
                    />
                    
                    {/* Footer */}
                    <div style={{ 
                      padding: '16px 20px', 
                      borderTop: '1px solid #e1e3e5',
                      backgroundColor: '#f6f6f7',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}>
                      <div>
                        <p style={{ margin: 0 }}>
                          Showing {filteredProducts.length} of {products.length} {selectedTab === 0 ? 'gemstones' : 'settings'}
                        </p>
                      </div>
                    </div>
                  </>
                )}
              </Tabs>
            </Card>
          </Layout.Section>

          {/* Required Metafields Info */}
          <Layout.Section>
            <Card title="Required Product Information" sectioned>
              <div style={{ display: 'grid', gap: '24px', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
                <div>
                  <h3 style={{ marginBottom: '12px' }}>For Gemstones</h3>
                  <div style={{ backgroundColor: '#f6f6f7', padding: '16px', borderRadius: '8px' }}>
                    <p style={{ marginBottom: '8px', fontSize: '13px', fontWeight: '600' }}>
                      Product Type: "Precious stone" OR Tag: "gemstone"
                    </p>
                    <p style={{ marginBottom: '12px', fontSize: '13px', color: '#6d7175' }}>
                      Required metafields (namespace: custom):
                    </p>
                    <ul style={{ marginLeft: '20px', fontSize: '13px' }}>
                      <li><strong>gemstone_weight</strong> - Weight in carats</li>
                      <li><strong>gemstone_shape</strong> - Cut shape</li>
                      <li><strong>gemstone_type</strong> - Stone type</li>
                    </ul>
                  </div>
                </div>
                
               <div>
                  <h3 style={{ marginBottom: '12px' }}>For Settings</h3>
                  <div style={{ backgroundColor: '#f6f6f7', padding: '16px', borderRadius: '8px' }}>
                    <p style={{ marginBottom: '8px', fontSize: '13px', fontWeight: '600' }}>
                      Required Tags: "Setting_Ring" OR "Setting_Pendant"
                    </p>
                    <p style={{ marginBottom: '12px', fontSize: '13px', color: '#6d7175' }}>
                      Required metafields (namespace: custom):
                    </p>
                    <ul style={{ marginLeft: '20px', fontSize: '13px' }}>
                      <li><strong>center_stone_shape</strong> - Compatible stone shapes</li>
                    </ul>
                  </div>
                </div>
              </div>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>

      {/* Modal */}
      {modalActive && (
        <Modal
          open={modalActive}
          onClose={() => setModalActive(false)}
          title={modalContent?.title}
          primaryAction={modalContent?.primaryAction}
          secondaryActions={[
            {
              content: 'Cancel',
              onAction: () => setModalActive(false),
            },
          ]}
        >
          <Modal.Section>
            <TextContainer>
              {typeof modalContent?.message === 'string' ? (
                <p>{modalContent.message}</p>
              ) : (
                modalContent?.message
              )}
            </TextContainer>
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