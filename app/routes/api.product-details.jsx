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
            # Diamond metafields
            labDiamondType: metafield(namespace: "custom", key: "lab_diamond_type") {
              value
            }
            stoneWeight: metafield(namespace: "custom", key: "stone_weight") {
              value
            }
            stoneShape: metafield(namespace: "custom", key: "stone_shape") {
              value
            }
            stoneColor: metafield(namespace: "custom", key: "stone_color") {
              value
            }
            stoneClarity: metafield(namespace: "custom", key: "stone_clarity") {
              value
            }
            stoneDimensions: metafield(namespace: "custom", key: "stone_dimensions") {
              value
            }
            cutGrade: metafield(namespace: "custom", key: "cut_grade") {
              value
            }
            polishGrade: metafield(namespace: "custom", key: "polish_grade") {
              value
            }
            symmetryGrade: metafield(namespace: "custom", key: "symmetry_grade") {
              value
            }
            treatment: metafield(namespace: "custom", key: "treatment") {
              value
            }
            certificate: metafield(namespace: "custom", key: "certificate") {
              value
            }
            fluorescence: metafield(namespace: "custom", key: "fluorescence") {
              value
            }
            # Setting metafields
            centerStoneShape: metafield(namespace: "custom", key: "center_stone_shape") {
              value
            }
            ringStyle: metafield(namespace: "custom", key: "ring_style") {
              value
            }
            metalType: metafield(namespace: "custom", key: "metal_type") {
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
    
    // Parse shape from metaobject reference (format: "center_stone_shape.round" -> "Round")
    const parseShape = (shapeValue) => {
      if (!shapeValue) return '';
      if (shapeValue.includes('.')) {
        const shapePart = shapeValue.split('.').pop();
        return shapePart.charAt(0).toUpperCase() + shapePart.slice(1);
      }
      return shapeValue;
    };

    // Parse diamond type from metaobject reference
    const parseDiamondType = (typeValue) => {
      if (!typeValue) return '';
      if (typeValue.includes('.')) {
        const typePart = typeValue.split('.').pop();
        return typePart.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      }
      return typeValue;
    };

    // Parse certificate (format: "IGI - LG737512445")
    const certificateValue = product.certificate?.value || '';
    const certParts = certificateValue.split(' - ');
    const certLab = certParts[0] || '';
    const certNumber = certParts[1] || '';

    // Convert metafields to object - Updated for diamonds
    const metafields = {
      // Diamond fields
      diamond_type: parseDiamondType(product.labDiamondType?.value),
      stone_weight: product.stoneWeight?.value,
      stone_shape: parseShape(product.stoneShape?.value),
      stone_color: product.stoneColor?.value,
      stone_clarity: product.stoneClarity?.value,
      stone_dimensions: product.stoneDimensions?.value,
      cut_grade: product.cutGrade?.value,
      polish_grade: product.polishGrade?.value,
      symmetry_grade: product.symmetryGrade?.value,
      treatment: product.treatment?.value,
      fluorescence: product.fluorescence?.value,
      certification_laboratory: certLab,
      certification_number: certNumber,
      certificate_full: certificateValue,
      // Setting fields
      center_stone_shape: parseShape(product.centerStoneShape?.value),
      ring_style: product.ringStyle?.value,
      metal_type: product.metalType?.value
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