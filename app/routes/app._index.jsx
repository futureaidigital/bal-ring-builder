import { json } from "@remix-run/node";
import { useLoaderData, Link } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Button,
  Text,
  BlockStack,
  Box,
  InlineStack,
  Badge,
  Banner,
  List,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { prisma } from "../utils/db.server";
export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  
  // Get counts from database
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
  };
  
  stats.totalProducts = stats.gemstones + stats.rings + stats.pendants;
  
  return json({ shop: session.shop, stats });
};

export default function Index() {
  const { shop, stats } = useLoaderData();
  
  return (
    <Page title="NanoGem Ring Builder">
      <Layout>
        {/* Welcome Section */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingLg">
                Welcome to NanoGem Ring Builder
              </Text>
              <Text as="p">
                Create a custom jewelry shopping experience by allowing customers to pair diamonds with their perfect setting.
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Stats Overview */}
        <Layout.Section>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">
              Your Ring Builder Inventory
            </Text>
            <InlineStack gap="400" wrap>
              <Card>
                <Box padding="400">
                  <BlockStack gap="200">
                    <Text as="p" variant="bodySm" color="subdued">
                      Active Diamonds
                    </Text>
                    <Text as="p" variant="heading2xl">
                      {stats.gemstones}
                    </Text>
                  </BlockStack>
                </Box>
              </Card>
              <Card>
                <Box padding="400">
                  <BlockStack gap="200">
                    <Text as="p" variant="bodySm" color="subdued">
                      Ring Settings
                    </Text>
                    <Text as="p" variant="heading2xl">
                      {stats.rings}
                    </Text>
                  </BlockStack>
                </Box>
              </Card>
              <Card>
                <Box padding="400">
                  <BlockStack gap="200">
                    <Text as="p" variant="bodySm" color="subdued">
                      Pendant Settings
                    </Text>
                    <Text as="p" variant="heading2xl">
                      {stats.pendants}
                    </Text>
                  </BlockStack>
                </Box>
              </Card>
              <Card>
                <Box padding="400">
                  <BlockStack gap="200">
                    <Text as="p" variant="bodySm" color="subdued">
                      Total Products
                    </Text>
                    <Text as="p" variant="heading2xl">
                      {stats.totalProducts}
                    </Text>
                  </BlockStack>
                </Box>
              </Card>
            </InlineStack>
          </BlockStack>
        </Layout.Section>

        {/* Quick Actions */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                Quick Actions
              </Text>
              <InlineStack gap="300">
                <Link to="/app/merchant-dashboard">
                  <Button primary>Manage Products</Button>
                </Link>
                {stats.totalProducts === 0 && (
                  <Badge status="attention">No products imported yet</Badge>
                )}
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Setup Guide */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                Setup Guide
              </Text>
              <Banner
                title="Theme Setup Required"
                status="info"
              >
                <p>To display the Ring Builder on your store:</p>
                <List type="number">
                  <List.Item>
                    Go to your theme editor
                  </List.Item>
                  <List.Item>
                    Navigate to a diamond product page
                  </List.Item>
                  <List.Item>
                    Add the "Ring Builder" app block
                  </List.Item>
                  <List.Item>
                    Configure the block settings
                  </List.Item>
                </List>
              </Banner>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* How It Works */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                How It Works
              </Text>
              <List>
                <List.Item>
                  <strong>Import Products:</strong> Add diamonds and settings from your catalog
                </List.Item>
                <List.Item>
                  <strong>Customer Browses:</strong> Shoppers view diamonds with the Ring Builder
                </List.Item>
                <List.Item>
                  <strong>Select & Customize:</strong> They choose their perfect stone and setting combination
                </List.Item>
                <List.Item>
                  <strong>Add to Cart:</strong> Both items are added as separate products
                </List.Item>
                <List.Item>
                  <strong>Fulfill Order:</strong> You create their custom jewelry piece
                </List.Item>
              </List>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Requirements */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                Product Requirements
              </Text>
              <InlineStack gap="800" wrap>
                <BlockStack gap="200">
                  <Text as="h3" variant="headingSm">
                    Diamonds
                  </Text>
                  <Text as="p" variant="bodySm" color="subdued">
                    Must have:
                  </Text>
                  <List type="bullet">
                    <List.Item>Product type: "Loose Stone" OR tag: "Loose Stone"</List.Item>
                    <List.Item>Metafield: stone_weight (carat)</List.Item>
                    <List.Item>Metafield: stone_shape</List.Item>
                    <List.Item>Metafield: stone_color</List.Item>
                    <List.Item>Metafield: stone_clarity</List.Item>
                  </List>
                </BlockStack>
                <BlockStack gap="200">
                  <Text as="h3" variant="headingSm">
                    Settings
                  </Text>
                  <Text as="p" variant="bodySm" color="subdued">
                    Must have:
                  </Text>
                  <List type="bullet">
                    <List.Item>Product type: "Ring" or "Pendant"</List.Item>
                    <List.Item>Metafield: center_stone_shape</List.Item>
                  </List>
                </BlockStack>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}