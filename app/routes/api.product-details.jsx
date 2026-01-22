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
            # Diamond metafields - with reference resolution for metaobject fields
            labDiamondType: metafield(namespace: "custom", key: "lab_diamond_type") {
              value
              type
              reference {
                ... on Metaobject {
                  displayName
                  handle
                }
              }
              references(first: 10) {
                nodes {
                  ... on Metaobject {
                    displayName
                    handle
                  }
                }
              }
            }
            stoneWeight: metafield(namespace: "custom", key: "stone_weight") {
              value
            }
            stoneShape: metafield(namespace: "custom", key: "stone_shape") {
              value
              type
              reference {
                ... on Metaobject {
                  displayName
                  handle
                }
              }
              references(first: 10) {
                nodes {
                  ... on Metaobject {
                    displayName
                    handle
                  }
                }
              }
            }
            stoneColor: metafield(namespace: "custom", key: "stone_color") {
              value
              type
              reference {
                ... on Metaobject {
                  displayName
                  handle
                }
              }
              references(first: 10) {
                nodes {
                  ... on Metaobject {
                    displayName
                    handle
                  }
                }
              }
            }
            stoneClarity: metafield(namespace: "custom", key: "stone_clarity") {
              value
              type
              reference {
                ... on Metaobject {
                  displayName
                  handle
                }
              }
              references(first: 10) {
                nodes {
                  ... on Metaobject {
                    displayName
                    handle
                  }
                }
              }
            }
            stoneDimensions: metafield(namespace: "custom", key: "stone_dimensions") {
              value
            }
            cutGrade: metafield(namespace: "custom", key: "cut_grade") {
              value
              type
              reference {
                ... on Metaobject {
                  displayName
                  handle
                }
              }
              references(first: 10) {
                nodes {
                  ... on Metaobject {
                    displayName
                    handle
                  }
                }
              }
            }
            polishGrade: metafield(namespace: "custom", key: "polish_grade") {
              value
              type
              reference {
                ... on Metaobject {
                  displayName
                  handle
                }
              }
              references(first: 10) {
                nodes {
                  ... on Metaobject {
                    displayName
                    handle
                  }
                }
              }
            }
            symmetryGrade: metafield(namespace: "custom", key: "symmetry_grade") {
              value
              type
              reference {
                ... on Metaobject {
                  displayName
                  handle
                }
              }
              references(first: 10) {
                nodes {
                  ... on Metaobject {
                    displayName
                    handle
                  }
                }
              }
            }
            treatment: metafield(namespace: "custom", key: "treatment") {
              value
            }
            certificate: metafield(namespace: "custom", key: "certificate") {
              value
            }
            fluorescence: metafield(namespace: "custom", key: "fluorescence") {
              value
              type
              reference {
                ... on Metaobject {
                  displayName
                  handle
                }
              }
              references(first: 10) {
                nodes {
                  ... on Metaobject {
                    displayName
                    handle
                  }
                }
              }
            }
            # Setting metafields - with reference resolution
            centerStoneShape: metafield(namespace: "custom", key: "center_stone_shape") {
              value
              type
              reference {
                ... on Metaobject {
                  displayName
                  handle
                }
              }
              references(first: 10) {
                nodes {
                  ... on Metaobject {
                    displayName
                    handle
                  }
                }
              }
            }
            ringStyle: metafield(namespace: "custom", key: "ring_style") {
              value
              type
              reference {
                ... on Metaobject {
                  displayName
                  handle
                }
              }
              references(first: 10) {
                nodes {
                  ... on Metaobject {
                    displayName
                    handle
                  }
                }
              }
            }
            metalType: metafield(namespace: "custom", key: "metal_type") {
              value
              type
              reference {
                ... on Metaobject {
                  displayName
                  handle
                }
              }
              references(first: 10) {
                nodes {
                  ... on Metaobject {
                    displayName
                    handle
                  }
                }
              }
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

    // DEBUG: Log raw metafield data
    console.log('=== PRODUCT-DETAILS DEBUG for:', product.title, '===');
    console.log('stoneShape raw:', JSON.stringify(product.stoneShape));
    console.log('ringStyle raw:', JSON.stringify(product.ringStyle));
    console.log('labDiamondType raw:', JSON.stringify(product.labDiamondType));

    // Helper to extract GIDs from a value
    const extractGids = (value) => {
      if (!value) return [];
      const gids = [];

      // Handle JSON array
      if (value.startsWith('[')) {
        try {
          const arr = JSON.parse(value);
          if (Array.isArray(arr)) {
            arr.forEach(item => {
              if (typeof item === 'string' && item.includes('gid://shopify/Metaobject')) {
                gids.push(item);
              }
            });
          }
        } catch (e) {}
      }
      // Handle single GID
      else if (value.includes('gid://shopify/Metaobject')) {
        gids.push(value);
      }

      return gids;
    };

    // Collect all unresolved GIDs from metafields
    const unresolvedGids = new Set();
    const metafieldsToCheck = [
      product.labDiamondType,
      product.stoneShape,
      product.stoneColor,
      product.stoneClarity,
      product.cutGrade,
      product.polishGrade,
      product.symmetryGrade,
      product.fluorescence,
      product.centerStoneShape,
      product.ringStyle,
      product.metalType
    ];

    metafieldsToCheck.forEach(mf => {
      if (!mf) return;
      // If reference/references didn't resolve, collect the GIDs
      const hasResolvedRef = mf.reference?.displayName || mf.reference?.handle;
      const hasResolvedRefs = mf.references?.nodes?.length > 0;

      if (!hasResolvedRef && !hasResolvedRefs && mf.value) {
        extractGids(mf.value).forEach(gid => unresolvedGids.add(gid));
      }
    });

    // Fetch unresolved metaobjects in a second query
    const metaobjectMap = new Map();
    console.log('Unresolved GIDs:', Array.from(unresolvedGids));

    if (unresolvedGids.size > 0) {
      const gidArray = Array.from(unresolvedGids);
      console.log('Fetching metaobjects for GIDs:', gidArray);
      try {
        const metaobjectResponse = await admin.graphql(
          `#graphql
            query getMetaobjects($ids: [ID!]!) {
              nodes(ids: $ids) {
                ... on Metaobject {
                  id
                  displayName
                  handle
                }
              }
            }
          `,
          {
            variables: {
              ids: gidArray,
            },
          }
        );
        const metaobjectData = await metaobjectResponse.json();
        console.log('Metaobject response:', JSON.stringify(metaobjectData));

        if (metaobjectData.data?.nodes) {
          metaobjectData.data.nodes.forEach(node => {
            if (node && node.id) {
              console.log('Resolved metaobject:', node.id, '->', node.displayName || node.handle);
              metaobjectMap.set(node.id, node.displayName || node.handle || '');
            }
          });
        }
        console.log('Metaobject map:', Object.fromEntries(metaobjectMap));
      } catch (e) {
        console.error('Error fetching metaobjects:', e);
      }
    }

    // Helper to extract value from metaobject references
    const getMetafieldValue = (metafield) => {
      if (!metafield) return '';

      // Check for single metaobject reference first (metaobject_reference type)
      if (metafield.reference?.displayName || metafield.reference?.handle) {
        return metafield.reference.displayName || metafield.reference.handle || '';
      }

      // Check if it has resolved references (list.metaobject_reference type)
      if (metafield.references?.nodes?.length > 0) {
        const values = metafield.references.nodes.map(node => node.displayName || node.handle || '');
        return values.filter(v => v).join(', ');
      }

      // Fallback: try to resolve from our fetched metaobjects
      if (metafield.value) {
        const gids = extractGids(metafield.value);
        if (gids.length > 0) {
          const resolved = gids.map(gid => metaobjectMap.get(gid)).filter(v => v);
          if (resolved.length > 0) {
            return resolved.join(', ');
          }
        }
      }

      // Handle single metaobject_reference - check if value looks like a GID (unresolved)
      if (metafield.value && metafield.value.includes('gid://shopify/Metaobject')) {
        return '';
      }

      // Handle JSON array strings (list references stored as JSON)
      if (metafield.value && metafield.value.startsWith('[')) {
        try {
          const arr = JSON.parse(metafield.value);
          if (Array.isArray(arr) && arr[0]?.includes?.('gid://shopify/Metaobject')) {
            return '';
          }
        } catch (e) {
          // Not valid JSON, fall through
        }
      }

      // Parse legacy formats like "center_stone_shape.round" -> "Round"
      if (metafield.value && metafield.value.includes('.') && !metafield.value.includes('gid://')) {
        const lastPart = metafield.value.split('.').pop();
        return lastPart.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      }

      return metafield.value || '';
    };

    // Parse certificate (format: "IGI - LG737512445")
    const certificateValue = product.certificate?.value || '';
    const certParts = certificateValue.split(' - ');
    const certLab = certParts[0] || '';
    const certNumber = certParts[1] || '';

    // Convert metafields to object - Updated for diamonds with reference resolution
    const metafields = {
      // Diamond fields
      diamond_type: getMetafieldValue(product.labDiamondType),
      stone_weight: product.stoneWeight?.value || '',
      stone_shape: getMetafieldValue(product.stoneShape),
      stone_color: getMetafieldValue(product.stoneColor),
      stone_clarity: getMetafieldValue(product.stoneClarity),
      stone_dimensions: product.stoneDimensions?.value || '',
      cut_grade: getMetafieldValue(product.cutGrade),
      polish_grade: getMetafieldValue(product.polishGrade),
      symmetry_grade: getMetafieldValue(product.symmetryGrade),
      treatment: product.treatment?.value || '',
      fluorescence: getMetafieldValue(product.fluorescence),
      certification_laboratory: certLab,
      certification_number: certNumber,
      certificate_full: certificateValue,
      // Setting fields
      center_stone_shape: getMetafieldValue(product.centerStoneShape),
      ring_style: getMetafieldValue(product.ringStyle),
      metal_type: getMetafieldValue(product.metalType)
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

      // Process variant metafields from aliased GraphQL fields
      const variantMetafields = {};

      // Map the aliased metafield names to their values
      const variantMetafieldMap = {
        'metal_weight': variant.metalWeight?.value,
        'accent_carat_weight': variant.accentCaratWeight?.value,
        'accent_stone_size': variant.accentStoneSize?.value,
        'accent_stone_count': variant.accentStoneCount?.value,
        'max_stone_size': variant.maxStoneSize?.value,
        'min_stone_size': variant.minStoneSize?.value,
        'accent_stone_type': variant.accentStoneType?.value,
        'accent_stone_quality': variant.accentStoneQuality?.value,
        'accent_stone_shape': variant.accentStoneShape?.value,
        'metal_type': variant.metalType?.value
      };

      // Only include non-null values
      Object.entries(variantMetafieldMap).forEach(([key, value]) => {
        if (value) {
          variantMetafields[key] = value;
        }
      });

      return {
        id: variant.id.split('/').pop(), // Extract numeric ID
        title: variant.title,
        price: parseFloat(variant.price) * 100, // Convert to cents
        ...options,
        // Include individual metafield values directly on variant for easy access
        metalWeight: variant.metalWeight,
        accentCaratWeight: variant.accentCaratWeight,
        accentStoneSize: variant.accentStoneSize,
        accentStoneCount: variant.accentStoneCount,
        maxStoneSize: variant.maxStoneSize,
        minStoneSize: variant.minStoneSize,
        accentStoneType: variant.accentStoneType,
        accentStoneQuality: variant.accentStoneQuality,
        accentStoneShape: variant.accentStoneShape,
        metalType: variant.metalType,
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