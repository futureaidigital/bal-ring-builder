import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.public.appProxy(request);
  
  const url = new URL(request.url);
  const handle = url.searchParams.get("handle");
  
  if (!handle) {
    return json({ error: "Product handle required" }, { status: 400 });
  }

  try {
    const response = await admin.graphql(
      `#graphql
        query getProduct($handle: String!) {
          productByHandle(handle: $handle) {
            id
            title
            handle
            productType
            vendor
            tags
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
            featuredImage {
              url
              altText
            }
            images(first: 10) {
              edges {
                node {
                  url
                  altText
                }
              }
            }
            variants(first: 100) {
              edges {
                node {
                  id
                  title
                  price
                  selectedOptions {
                    name
                    value
                  }
                  metalWeight: metafield(namespace: "custom", key: "metal_weight") {
                    value
                  }
                  accentCaratWeight: metafield(namespace: "custom", key: "accent_carat_weight") {
                    value
                  }
                  accentStoneSize: metafield(namespace: "custom", key: "accent_stone_size") {
                    value
                  }
                  accentStoneCount: metafield(namespace: "custom", key: "accent_stone_count") {
                    value
                  }
                  maxStoneSize: metafield(namespace: "custom", key: "max_stone_size") {
                    value
                  }
                  minStoneSize: metafield(namespace: "custom", key: "min_stone_size") {
                    value
                  }
                  accentStoneType: metafield(namespace: "custom", key: "accent_stone_type") {
                    value
                  }
                  accentStoneQuality: metafield(namespace: "custom", key: "accent_stone_quality") {
                    value
                  }
                  accentStoneShape: metafield(namespace: "custom", key: "accent_stone_shape") {
                    value
                  }
                  metalType: metafield(namespace: "custom", key: "metal_type") {
                    value
                  }
                }
              }
            }
            gemstoneType: metafield(namespace: "custom", key: "gemstone_type") {
              value
            }
            stoneType: metafield(namespace: "custom", key: "stone_type") {
              value
            }
            gemstoneWeight: metafield(namespace: "custom", key: "gemstone_weight") {
              value
            }
            gemstoneShape: metafield(namespace: "custom", key: "gemstone_shape") {
              value
            }
            gemstoneColor: metafield(namespace: "custom", key: "gemstone_color") {
              value
            }
            gemstoneTreatment: metafield(namespace: "custom", key: "gemstone_treatment") {
              value
            }
            gemstoneOrigin: metafield(namespace: "custom", key: "gemstone_origin") {
              value
            }
            certificationLaboratory: metafield(namespace: "custom", key: "certification_laboratory") {
              value
            }
            centerStoneShape: metafield(namespace: "custom", key: "center_stone_shape") {
              value
            }
            ringStyle: metafield(namespace: "custom", key: "ring_style") {
              value
            }
            productStyle: metafield(namespace: "custom", key: "product_style") {
              value
            }
            metalType: metafield(namespace: "custom", key: "metal_type") {
              value
            }
            gemstoneDimensions: metafield(namespace: "custom", key: "gemstone_dimensions") {
              value
            }
          }
        }
      `,
      {
        variables: {
          handle: handle,
        },
      }
    );

    const { data } = await response.json();
    
    if (!data.productByHandle) {
      return json({ error: "Product not found" }, { status: 404 });
    }

    // Transform the data to a simpler format
    const product = data.productByHandle;
    
    // Convert metafields to object
    const metafields = {
      gemstone_type: product.gemstoneType?.value || product.stoneType?.value,
      stone_type: product.stoneType?.value,
      gemstone_weight: product.gemstoneWeight?.value,
      gemstone_shape: product.gemstoneShape?.value,
      gemstone_color: product.gemstoneColor?.value,
      gemstone_treatment: product.gemstoneTreatment?.value,
      gemstone_origin: product.gemstoneOrigin?.value,
      certification_laboratory: product.certificationLaboratory?.value,
      center_stone_shape: product.centerStoneShape?.value,
      ring_style: product.ringStyle?.value || product.productStyle?.value,
      product_style: product.productStyle?.value,
      metal_type: product.metalType?.value,
      gemstone_dimensions: product.gemstoneDimensions?.value
    };
    
    // Remove null/undefined values
    Object.keys(metafields).forEach(key => {
      if (!metafields[key]) {
        delete metafields[key];
      }
    });

    // Format variants
    const variants = product.variants.edges.map(edge => {
      const variant = edge.node;
      const options = {};
      variant.selectedOptions.forEach((opt, index) => {
        options[`option${index + 1}`] = opt.value;
      });
      
      // Process variant metafields
      const variantMetafields = {};
      if (variant.metafields && variant.metafields.length > 0) {
        variant.metafields.forEach(field => {
          if (field.value) {
            variantMetafields[field.key] = field.value;
          }
        });
      }
      
      return {
        id: variant.id.split('/').pop(), // Extract numeric ID
        title: variant.title,
        price: parseFloat(variant.price) * 100, // Convert to cents
        ...options,
        metafields: variantMetafields
      };
    });
    
    // Format images
    const images = product.images.edges.map(edge => edge.node.url);

    // Build response
    const productData = {
      id: product.id.split('/').pop(),
      handle: product.handle,
      title: product.title,
      type: product.productType,
      vendor: product.vendor,
      tags: product.tags,
      price: parseFloat(product.priceRangeV2.minVariantPrice.amount) * 100, // Convert to cents
      featured_image: product.featuredImage?.url,
      images: images,
      variants: variants,
      metafields: metafields
    };

    // Add CORS headers for frontend access
    return json(productData, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });

  } catch (error) {
    console.error("Error fetching product:", error);
    return json({ error: "Failed to fetch product" }, { status: 500 });
  }
};