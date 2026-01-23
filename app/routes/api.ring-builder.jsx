import { authenticate } from "../shopify.server";

// Constants
const PRODUCTS_PER_PAGE = 24;
const MAX_PRODUCTS_FETCH = 100;  // Reduced from 250 to stay under Shopify query cost limit
const MAX_VARIANTS_FETCH = 25;   // Reduced from 100 to stay under query cost limit
const MAX_IMAGES_FETCH = 5;      // Reduced from 15 to stay under query cost limit

const DEFAULT_SETTINGS = {
  gemUrl: '/collections/loose-white-lab-grown-diamonds',
  setUrl: '/collections/ring-settings',
  perPage: 120,
  perRowDesktop: 4,
  perRowMobile: 2,
  showSteps: true,
  showFilters: true,
  autoDetect: true
};

const RING_BUILDER_COLLECTIONS = [
  'gemstones', 'gemstone', 'stones', 'precious-stones', 'precious_stones',
  'sapphires', 'rubies', 'emeralds', 'diamonds', 'setting', 'settings',
  'ring-settings', 'ring_settings', 'mountings', 'rings', 'pendants',
  'loose-stones', 'loose-diamonds', 'white-lab-diamonds', 'lab-diamonds',
  'loose-white-lab-grown-diamonds', 'loose-blue-lab-grown-diamonds',
  'loose-pink-lab-grown-diamonds', 'loose-yellow-lab-grown-diamonds'
];

const GEMSTONE_KEYWORDS = [
  'gemstone', 'sapphire', 'ruby', 'emerald', 'stone',
  'setting', 'mounting', 'ring', 'pendant',
  'diamond', 'loose', 'lab-grown', 'lab-diamond'
];
const GEMSTONE_TYPE_ICON_MAP = {
  'Blue Sapphire': 'Blue Sapphire Icon.png',
  'Ruby': 'Ruby Icon.png',
  'Emerald': 'Emerald Icon.png',
  'Diamond': 'Diamond Icon.png',
  'Pink Sapphire': 'Pink Sapphire Icon.png',
  'Yellow Sapphire': 'Yellow Sapphire Icon.png',
  'Purple Sapphire': 'Purple Sapphire Icon.png',
  'Green Sapphire': 'Green Sapphire Icon.png',
  'Tanzanite': 'Tanzanite Icon.png',
  'Green Tourmaline': 'Green Tourmaline Icon.png',
  'Orange Tourmaline': 'Orange Tourmaline Icon.png',
  'Paraiba Tourmaline': 'Paraiba Tourmaline Icon.png',
  'Black Diamond': 'Black Diamond Icon.png'
};
const SHAPE_TYPES = [
  'Round', 'Oval', 'Pear', 'Emerald', 'Cushion', 
  'Princess', 'Marquise', 'Radiant', 'Asscher', 'Heart'
];
const SETTING_STYLE_ICON_MAP = {
  'Solitaire': 'Solitaire Icon.png',
  'Halo': 'Halo.png',
  'Side Stones': 'Side Stones Icon.png',
  'Trilogy': 'Trilogy Icon.png',
  'Double': 'Double.png'
};
const PRICE_RANGES = [
  { label: 'Under $1,000', min: 0, max: 100000 },
  { label: '$1,000-$2,000', min: 100000, max: 200000 },
  { label: '$2,000-$5,000', min: 200000, max: 500000 },
  { label: '$5,000-$10,000', min: 500000, max: 1000000 },
  { label: 'Over $10,000', min: 1000000, max: Infinity }
];

// Main loader function
export const loader = async ({ request }) => {
  try {
    // Authenticate the request
    const { admin, session } = await authenticate.public.appProxy(request);

    // Check if admin is available (session exists)
    if (!admin) {
      console.error('Ring builder error: No admin session found. App may not be installed on this store.');
      return createErrorResponse('App not properly installed. Please reinstall the app from the Shopify App Store.');
    }

    // Parse request parameters
    const params = parseRequestParams(request.url);
    
    // Get visitor's currency from request
    const url = new URL(request.url);
    const visitorCurrency = url.searchParams.get('currency') || '';
    
    // Validate collection parameter
    if (!params.collection) {
      return createErrorResponse('No collection specified');
    }

    // Check if this is a ring builder collection
    const isRingBuilder = detectRingBuilderCollection(params.collection, params.settings);
    if (!isRingBuilder) {
      return createErrorResponse('Not a ring builder collection');
    }

    // Fetch shop currency information and enabled currencies
    const shopDataResponse = await admin.graphql(`
      query {
        shop {
          currencyCode
          enabledPresentmentCurrencies
          currencyFormats {
            moneyFormat
            moneyWithCurrencyFormat
          }
        }
      }
    `);
    
    const shopData = await shopDataResponse.json();
    const shopInfo = shopData.data?.shop;
    
    // Determine which currency to use
    const enabledCurrencies = shopInfo?.enabledPresentmentCurrencies || [shopInfo?.currencyCode || 'USD'];
    let currencyCode = shopInfo?.currencyCode || 'USD'; // Default to shop currency
    
    // If visitor currency is provided and enabled, use it
    if (visitorCurrency && enabledCurrencies.includes(visitorCurrency)) {
      currencyCode = visitorCurrency;
    }
    
    // Currency format mapping for common currencies
    const currencyFormats = {
      'USD': '${{amount}}',
      'EUR': '€{{amount}}',
      'GBP': '£{{amount}}',
      'AED': 'AED {{amount}}',
      'SAR': 'SAR {{amount}}',
      'CAD': 'CA${{amount}}',
      'AUD': 'AU${{amount}}',
      'NZD': 'NZ${{amount}}',
      'SGD': 'S${{amount}}',
      'HKD': 'HK${{amount}}',
      'JPY': '¥{{amount}}',
      'CNY': '¥{{amount}}',
      'INR': '₹{{amount}}',
      'KWD': 'KWD {{amount}}',
      'OMR': 'OMR {{amount}}',
      'BHD': 'BHD {{amount}}',
      'QAR': 'QAR {{amount}}'
    };
    
    // Use the mapped format or default to currency code + amount
    const moneyFormat = currencyFormats[currencyCode] || `${currencyCode} {{amount}}`;

    // Debug logging
    console.log('=== CURRENCY DEBUG ===');
    console.log('Visitor Currency:', visitorCurrency);
    console.log('Enabled Currencies:', enabledCurrencies);
    console.log('Selected Currency:', currencyCode);
    console.log('Money Format:', moneyFormat);
    console.log('=== END CURRENCY DEBUG ===');

    // Fetch products from Shopify (you may need to update this to pass currency)
    const productData = await fetchCollectionProducts(admin, params.collection, currencyCode);
    
    // Generate HTML response with currency info
    const html = generateRingBuilderHTML({
      ...productData,
      ...params,
      shop: session.shop,
      currencyCode,
      moneyFormat
    });

    return createSuccessResponse(html);
    
  } catch (error) {
    console.error('Ring builder error:', error);
    return createFallbackResponse();
  }
};
// Helper Functions

function parseRequestParams(url) {
  const urlObj = new URL(url);
  const searchParams = urlObj.searchParams;
  
  let settings = {};
  try {
    settings = JSON.parse(searchParams.get('settings') || '{}');
  } catch (e) {
    console.warn('Invalid settings JSON:', e);
  }
  
  return {
    collection: searchParams.get('collection') || '',
    settings: { ...DEFAULT_SETTINGS, ...settings },
    gemstone: searchParams.get('gemstone') || '',
    setting: searchParams.get('setting') || '',
    setting_variant: searchParams.get('setting_variant') || ''
  };
}

function detectRingBuilderCollection(collectionHandle, settings) {
  const handle = collectionHandle.toLowerCase();
  
  // Check specific handles from settings
  if (settings.collectionHandles) {
    const handles = settings.collectionHandles.split(',').map(h => h.trim().toLowerCase());
    if (handles.includes(handle)) {
      return true;
    }
  }
  
  // Auto-detect logic
  if (settings.autoDetect !== false) {
    // Check exact matches
    if (RING_BUILDER_COLLECTIONS.includes(handle)) {
      return true;
    }
    
    // Check keyword matches
    if (GEMSTONE_KEYWORDS.some(keyword => handle.includes(keyword))) {
      return true;
    }
    
    // Check for "precious" keyword
    if (handle.includes('precious')) {
      return true;
    }
  }
  
  return false;
}

async function fetchCollectionProducts(admin, collectionHandle) {
  console.log('Fetching products for collection:', collectionHandle);
  
  try {
    const response = await admin.graphql(
      COLLECTION_PRODUCTS_QUERY,
      { variables: { handle: collectionHandle } }
    );

    const responseData = await response.json();
    console.log('GraphQL response:', responseData);
    
    const { data, errors } = responseData;
    
    if (errors) {
      console.error('GraphQL errors:', errors);
      return { products: [], hasGems: false, hasSets: false };
    }
    
    const collection = data?.collectionByHandle;
    console.log('Collection found:', collection ? 'Yes' : 'No');
    
    if (!collection) {
      console.log('No collection found for handle:', collectionHandle);
      return { products: [], hasGems: false, hasSets: false };
    }
    
    console.log('Products in collection:', collection.products?.edges?.length || 0);
    
    const result = await processCollectionProducts(collection, admin);
    console.log('Processed result:', {
      productCount: result.products.length,
      hasGems: result.hasGems,
      hasSets: result.hasSets,
      firstProduct: result.products[0] || 'No products'
    });

    return result;
    
  } catch (error) {
    console.error('Error fetching collection products:', error);
    console.error('Error stack:', error.stack);
    return { products: [], hasGems: false, hasSets: false };
  }
}

async function processCollectionProducts(collection, admin) {
  let hasGems = false;
  let hasSets = false;
  let gemCount = 0;
  let setCount = 0;
  let otherCount = 0;

  console.log('=== PRODUCT CLASSIFICATION DEBUG ===');
  console.log('Total products in collection:', collection.products.edges.length);

  // Helper to extract GIDs from a value
  const extractGids = (value) => {
    if (!value) return [];
    const gids = [];
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
    } else if (value.includes('gid://shopify/Metaobject')) {
      gids.push(value);
    }
    return gids;
  };

  // Collect all unresolved GIDs from all products
  const unresolvedGids = new Set();
  collection.products.edges.forEach(edge => {
    const product = edge.node;
    const metafieldsToCheck = [
      product.labDiamondType,
      product.stoneShape,
      product.stoneColor,
      product.stoneClarity,
      product.cutGrade,
      product.centerStoneShape,
      product.ringStyle,
      product.metalType
    ];

    metafieldsToCheck.forEach(mf => {
      if (!mf) return;
      const hasResolvedRef = mf.reference?.displayName || mf.reference?.handle;
      const hasResolvedRefs = mf.references?.nodes?.length > 0;
      if (!hasResolvedRef && !hasResolvedRefs && mf.value) {
        extractGids(mf.value).forEach(gid => unresolvedGids.add(gid));
      }
    });
  });

  // Fetch unresolved metaobjects in batch
  const metaobjectMap = new Map();
  console.log('Ring Builder - Unresolved GIDs:', Array.from(unresolvedGids));

  if (unresolvedGids.size > 0 && admin) {
    const gidArray = Array.from(unresolvedGids);
    console.log('Ring Builder - Fetching metaobjects for GIDs:', gidArray.length);
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
        { variables: { ids: gidArray } }
      );
      const metaobjectData = await metaobjectResponse.json();
      console.log('Ring Builder - Metaobject response nodes:', metaobjectData.data?.nodes?.length || 0);

      if (metaobjectData.data?.nodes) {
        metaobjectData.data.nodes.forEach(node => {
          if (node && node.id) {
            console.log('Ring Builder - Resolved:', node.id, '->', node.displayName || node.handle);
            metaobjectMap.set(node.id, node.displayName || node.handle || '');
          }
        });
      }
    } catch (e) {
      console.error('Ring Builder - Error fetching metaobjects:', e);
    }
  }

  const products = collection.products.edges.map((edge, index) => {
    const product = edge.node;
    const processedProduct = processProduct(product, metaobjectMap);

    // Debug logging for first 5 products
    if (index < 5) {
      console.log(`Product ${index + 1}:`, {
        title: product.title,
        productType: product.productType,
        tags: product.tags,
        isGem: processedProduct.isGem,
        isSet: processedProduct.isSet
      });
    }

    if (processedProduct.isGem) {
      hasGems = true;
      gemCount++;
    } else if (processedProduct.isSet) {
      hasSets = true;
      setCount++;
    } else {
      otherCount++;
    }

    return processedProduct;
  });

  console.log('=== CLASSIFICATION SUMMARY ===');
  console.log('Gems:', gemCount, '| Settings:', setCount, '| Other:', otherCount);
  console.log('=== END DEBUG ===');

  return { products, hasGems, hasSets };
}

function processProduct(product, metaobjectMap = new Map()) {
  // Determine product type
  const isGem = isGemstoneProduct(product);
  const isSet = isSettingProduct(product);

  // Process basic product data
  const processedProduct = {
    id: extractId(product.id),
    handle: product.handle,
    title: product.title,
    productType: product.productType,
    vendor: product.vendor,
    tags: product.tags,
    price: Math.round(parseFloat(product.priceRangeV2.minVariantPrice.amount) * 100),
    featuredImage: product.featuredImage?.url,
    images: product.images?.edges?.map(edge => edge.node.url) || [],
    variants: processVariants(product.variants),
    metafields: processMetafields(product, metaobjectMap),
    isGem,
    isSet
  };
  
  // Process setting-specific data
  if (isSet) {
    const settingData = processSettingData(product);
    Object.assign(processedProduct, settingData);
    
    // Ensure metalType is available in metafields for data attributes
    if (settingData.metalType) {
      processedProduct.metafields.metal_type = settingData.metalType;
    }
  }
  
  return processedProduct;
}

function isGemstoneProduct(product) {
  // Check product type
  const productType = (product.productType || '').toLowerCase();
  const isGemType = productType === 'precious stone' ||
                    productType === 'diamond' ||
                    productType === 'loose diamond' ||
                    productType === 'lab diamond' ||
                    productType === 'lab-grown diamond' ||
                    productType.includes('diamond') ||
                    productType.includes('stone');

  // Check tags
  const hasGemTag = product.tags.some(tag => {
    const lowerTag = tag.toLowerCase();
    return lowerTag === 'gemstone' ||
           lowerTag === 'diamond' ||
           lowerTag === 'loose-diamond' ||
           lowerTag === 'loose diamond' ||
           lowerTag === 'lab-grown' ||
           lowerTag.includes('diamond');
  });

  return isGemType || hasGemTag;
}

function isSettingProduct(product) {
  // Check product type
  const productType = (product.productType || '').toLowerCase();
  const isSettingType = productType === 'ring' ||
                        productType === 'pendant' ||
                        productType === 'setting' ||
                        productType === 'settings' ||
                        productType === 'mounting' ||
                        productType === 'ring setting' ||
                        productType === 'engagement ring' ||
                        productType.includes('setting') ||
                        productType.includes('mounting');

  // Check tags for setting-related keywords
  const hasSettingTag = product.tags.some(tag => {
    const lowerTag = tag.toLowerCase();
    return lowerTag === 'setting' ||
           lowerTag === 'settings' ||
           lowerTag === 'ring' ||
           lowerTag === 'pendant' ||
           lowerTag === 'mounting' ||
           lowerTag === 'engagement' ||
           lowerTag === 'setting_ring' ||
           lowerTag === 'setting_pendant' ||
           lowerTag.includes('setting') ||
           lowerTag.includes('mounting');
  });

  return isSettingType || hasSettingTag;
}

function extractId(shopifyId) {
  return shopifyId.split('/').pop();
}

function processVariants(variants) {
  return variants.edges.map(vEdge => {
    const variant = vEdge.node;
    return {
      id: extractId(variant.id),
      title: variant.title,
      price: Math.round(parseFloat(variant.price) * 100),
      options: variant.selectedOptions.reduce((acc, opt, index) => {
        acc[`option${index + 1}`] = opt.value;
        return acc;
      }, {})
    };
  });
}

function processMetafields(product, metaobjectMap = new Map()) {
  // DEBUG: Log raw metafield data for first few products
  if (product.title) {
    console.log('=== METAFIELD DEBUG for:', product.title.substring(0, 50), '===');
    console.log('stoneShape raw:', JSON.stringify(product.stoneShape));
    console.log('stoneColor raw:', JSON.stringify(product.stoneColor));
    console.log('stoneClarity raw:', JSON.stringify(product.stoneClarity));
    console.log('stoneWeight raw:', JSON.stringify(product.stoneWeight));
    console.log('labDiamondType raw:', JSON.stringify(product.labDiamondType));
  }

  // Parse certificate field (format: "IGI - LG737512445" -> lab: "IGI", number: "LG737512445")
  const certificateValue = product.certificate?.value || '';
  const certParts = certificateValue.split(' - ');
  const certLab = certParts[0] || '';
  const certNumber = certParts[1] || '';

  // Helper to extract GIDs from a value
  const extractGids = (value) => {
    if (!value) return [];
    const gids = [];
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
    } else if (value.includes('gid://shopify/Metaobject')) {
      gids.push(value);
    }
    return gids;
  };

  // Extract value from metafield - handles both plain values and metaobject references
  const getMetafieldValue = (metafield) => {
    if (!metafield) return '';

    // First check if there's a resolved metaobject reference (single)
    if (metafield.reference) {
      const ref = metafield.reference;
      if (ref.displayName) return ref.displayName;
      if (ref.handle) {
        return ref.handle.charAt(0).toUpperCase() + ref.handle.slice(1).replace(/-/g, ' ');
      }
    }

    // Check for list-type metaobject references (plural)
    if (metafield.references?.nodes?.length > 0) {
      const ref = metafield.references.nodes[0];
      if (ref.displayName) return ref.displayName;
      if (ref.handle) {
        return ref.handle.charAt(0).toUpperCase() + ref.handle.slice(1).replace(/-/g, ' ');
      }
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

    // Fall back to raw value
    const value = metafield.value;
    if (!value) return '';

    let strValue = String(value);

    // Handle JSON array (list-type metafields) like ["center_stone_shape.round"]
    if (strValue.startsWith('[')) {
      try {
        const parsed = JSON.parse(strValue);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Take first value from array
          strValue = String(parsed[0]);
        }
      } catch (e) {
        // Not valid JSON, continue with raw value
      }
    }

    // Skip metaobject GIDs that weren't resolved
    if (strValue.includes('gid://shopify')) {
      return '';
    }

    // Handle format like "center_stone_shape.round" -> "Round"
    // Only apply if it looks like a metaobject reference (contains underscore before dot)
    // Don't apply to values like "7.5 ct" or "12.34 mm"
    if (strValue.includes('.') && !strValue.includes('://') && strValue.includes('_')) {
      const parts = strValue.split('.');
      const lastPart = parts.pop();
      return lastPart.charAt(0).toUpperCase() + lastPart.slice(1).replace(/-/g, ' ');
    }

    return strValue;
  };

  const result = {
    // Diamond fields - use getMetafieldValue to resolve metaobject references
    diamond_type: getMetafieldValue(product.labDiamondType),
    stone_weight: getMetafieldValue(product.stoneWeight),
    stone_shape: getMetafieldValue(product.stoneShape),
    stone_color: getMetafieldValue(product.stoneColor),
    stone_clarity: getMetafieldValue(product.stoneClarity),
    stone_dimensions: getMetafieldValue(product.stoneDimensions),
    cut_grade: getMetafieldValue(product.cutGrade),
    polish_grade: getMetafieldValue(product.polishGrade),
    symmetry_grade: getMetafieldValue(product.symmetryGrade),
    treatment: getMetafieldValue(product.treatment),
    fluorescence: getMetafieldValue(product.fluorescence),
    certification_laboratory: certLab,
    certification_number: certNumber,
    certificate_full: certificateValue,
    // Setting fields
    center_stone_shape: getMetafieldValue(product.centerStoneShape),
    ring_style: getMetafieldValue(product.ringStyle),
    metal_type: getMetafieldValue(product.metalType),
    // Legacy mappings for backward compatibility
    gemstone_type: getMetafieldValue(product.labDiamondType),
    gemstone_weight: getMetafieldValue(product.stoneWeight),
    gemstone_shape: getMetafieldValue(product.stoneShape),
    gemstone_color: getMetafieldValue(product.stoneColor),
    gemstone_treatment: getMetafieldValue(product.treatment),
    gemstone_dimensions: getMetafieldValue(product.stoneDimensions)
  };

  // DEBUG: Log processed values
  if (product.title) {
    console.log('PROCESSED values:', {
      shape: result.stone_shape,
      color: result.stone_color,
      clarity: result.stone_clarity,
      weight: result.stone_weight,
      type: result.diamond_type
    });
  }

  return result;
}
function processSettingData(product) {
  let minSize = 999.0;
  let maxSize = 0.0;
  const variantArray = [];
  const metalTypes = new Set();
  const sideStoneInfo = {};

  product.variants.edges.forEach(vEdge => {
    const variant = vEdge.node;

    // Extract metal type from variant metafield or selectedOptions
    const metalValue = variant.variantMetalType?.value;
    if (metalValue) {
      const metalMatch = metalValue.match(/(White Gold|Yellow Gold|Rose Gold|White & Yellow Gold|White & Rose Gold|Platinum)/i);
      if (metalMatch) {
        metalTypes.add(metalMatch[0]);
      }
    } else {
      // Fallback to selectedOptions
      const metalOption = variant.selectedOptions.find(opt => opt.name === 'Metal Type');
      if (metalOption && metalOption.value) {
        const metalMatch = metalOption.value.match(/(White Gold|Yellow Gold|Rose Gold|White & Yellow Gold|White & Rose Gold|Platinum)/i);
        if (metalMatch) {
          metalTypes.add(metalMatch[0]);
        }
      }
    }

    // Get carat weight range from variant metafield (e.g., "From 5 to 7.99 ct")
    const caratWeight = variant.centerStoneCaratWeight?.value;
    let sizeRange = null;

    if (caratWeight) {
      sizeRange = parseCaratWeightRange(caratWeight);
    } else {
      // Fallback to Size option
      const sizeOption = variant.selectedOptions.find(opt => opt.name === 'Size');
      if (sizeOption && sizeOption.value.includes('ct')) {
        sizeRange = parseSizeRange(sizeOption.value);
      }
    }

    if (sizeRange) {
      if (sizeRange.min < minSize) minSize = sizeRange.min;
      if (sizeRange.max > maxSize) maxSize = sizeRange.max;

      variantArray.push({
        id: extractId(variant.id),
        min: sizeRange.min,
        max: sizeRange.max,
        metalType: variant.variantMetalType?.value || '',
        metalWeight: variant.metalWeight?.value || '',
        centerStoneShape: variant.variantCenterStoneShape?.value || ''
      });
    }

    // Collect side stone info (same across variants typically)
    if (variant.sideStoneType?.value && !sideStoneInfo.type) {
      sideStoneInfo.type = variant.sideStoneType.value;
      sideStoneInfo.shape = variant.sideStoneShape?.value || '';
      sideStoneInfo.quality = variant.sideStoneQuality?.value || '';
      sideStoneInfo.totalWeight = variant.sideStoneTotalWeight?.value || '';
    }
  });

  const metalType = Array.from(metalTypes).join(', ');

  // DEBUG: Log setting size processing
  if (product.title) {
    console.log('=== SETTING SIZE DEBUG for:', product.title.substring(0, 40), '===');
    console.log('Min size:', minSize, 'Max size:', maxSize);
    console.log('Variant count:', product.variants.edges.length);
    console.log('First variant centerStoneCaratWeight:', product.variants.edges[0]?.node?.centerStoneCaratWeight);
  }

  return {
    settingMinSize: minSize !== 999.0 ? minSize.toString() : '',
    settingMaxSize: maxSize > 0 ? maxSize.toString() : '',
    variantData: variantArray.length > 0 ? JSON.stringify(variantArray) : '',
    metalType: metalType,
    sideStoneInfo: Object.keys(sideStoneInfo).length > 0 ? sideStoneInfo : null
  };
}

// Parse carat weight range from metafield (format: "From 5 to 7.99 ct" or "From 3 to 4.99 ct")
function parseCaratWeightRange(weightString) {
  if (!weightString) return null;

  // Match "From X to Y ct" or "From X to Y carats"
  const match = weightString.match(/from\s+([\d.]+)\s+to\s+([\d.]+)/i);
  if (match) {
    const min = parseFloat(match[1]);
    const max = parseFloat(match[2]);
    if (min > 0 && max > 0) {
      return { min, max };
    }
  }

  // Fallback to simple range format "X-Y ct"
  return parseSizeRange(weightString);
}
function parseSizeRange(sizeString) {
  const sizeParts = sizeString.replace(' ct', '').split('-');
  if (sizeParts.length < 2) return null;
  
  const min = parseFloat(sizeParts[0]);
  const max = parseFloat(sizeParts[1]);
  
  if (min > 0 && max > 0) {
    return { min, max };
  }
  
  return null;
}

// Response Helpers

function createErrorResponse(message) {  
  return new Response(
    '\
    <style>\
      .ge-grid{display:grid;gap:20px;margin-top:2rem}\
      .ge-grid-d4{grid-template-columns:repeat(4,1fr)}\
      .error-message{text-align:center;grid-column:1/-1;padding:20px;color:#666;}\
      @media(max-width:768px){.ge-grid-m2{grid-template-columns:repeat(2,1fr);gap:12px}}\
    </style>\
    <div class="ge-grid ge-grid-d4 ge-grid-m2">\
      <div class="error-message">' + message + '</div>\
    </div>\
    ',
    { headers: { 'Content-Type': 'text/html' } }
  );
}

function createSuccessResponse(html) {
  return new Response(html, {
    headers: { 
      'Content-Type': 'text/html',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    }
  });
}
function createFallbackResponse() {
  const fallbackHTML = '\
    <style>\
      .ge-grid{display:grid;gap:20px;margin-top:2rem}\
      .ge-grid-d4{grid-template-columns:repeat(4,1fr)}\
      .error-message{text-align:center;grid-column:1/-1;padding:40px 20px;color:#666;}\
      @media(max-width:768px){.ge-grid-m2{grid-template-columns:repeat(2,1fr);gap:12px}}\
    </style>\
    <div id="ring-builder-app">\
      <div class="ge-grid ge-grid-d4 ge-grid-m2">\
        <div class="error-message">Loading products...</div>\
      </div>\
    </div>\
  ';
  
  return new Response(fallbackHTML, {
    status: 200,
    headers: { 
      'Content-Type': 'text/html',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

// HTML Generation

function generateRingBuilderHTML(params) {
  const {
    products,
    hasGems,
    hasSets,
    settings,
    gemstone,
    setting,
    setting_variant,
    collection,
    shop,
    currencyCode,  // ADD THIS
    moneyFormat    // ADD THIS
  } = params;
  
  const urlParams = { gemstone, setting, setting_variant };
  const gemUrl = settings.gemUrl || DEFAULT_SETTINGS.gemUrl;
  const setUrl = settings.setUrl || DEFAULT_SETTINGS.setUrl;
  
  const productsHTML = generateProductsHTML(products, urlParams, currencyCode, moneyFormat);
  // REMOVED HIIDEN STEPS BANNER DONT FORGET
  return `
    <style>
      ${getRingBuilderCSS()}
    </style>
    
    <div id="ring-builder-app">
      ${''}
      ${settings.showFilters !== false ? generateFiltersHTML(hasGems, hasSets, gemstone, setting) : ''}
      ${generateFilterModal(hasGems, hasSets, gemstone, setting)}
      
      <div class="ge-grid ge-grid-d${settings.perRowDesktop} ge-grid-m${settings.perRowMobile}">
        ${products.length === 0 ? generateEmptyState() : productsHTML}
      </div>
    </div>

    <script>
      // Signal that content is loaded
      (function() {
        const container = document.getElementById('ring-builder-container');
        if (container) {
          container.classList.add('rb-loaded');
          
          // Optional: Dispatch event for other scripts to listen to
          window.dispatchEvent(new CustomEvent('ringbuilder:loaded'));
        }
      })();
      
      ${getRingBuilderJS(hasGems, hasSets, shop, currencyCode, moneyFormat)}
    </script>
  `;
}

function generateProductsHTML(products, urlParams, currencyCode, moneyFormat) {
  return products.map(product => {
    const productType = product.isGem ? 'gemstone' : (product.isSet ? 'setting' : 'other');
    
    return `
      <div class="ge-item"
          data-product-id="${product.id}"
          data-product-type="${productType}"
          data-shape="${getProductShape(product)}"
          data-color="${product.metafields.stone_color || ''}"
          data-clarity="${product.metafields.stone_clarity || ''}"
          data-diamond-type="${product.metafields.diamond_type || ''}"
          data-carat="${product.metafields.stone_weight || ''}"
          data-treatment="${product.metafields.treatment || ''}"
          data-cut="${product.metafields.cut_grade || ''}"
          data-polish="${product.metafields.polish_grade || ''}"
          data-symmetry="${product.metafields.symmetry_grade || ''}"
          data-fluorescence="${product.metafields.fluorescence || ''}"
          data-metal="${product.metafields.metal_type || ''}"
          data-style="${product.metafields.ring_style || ''}"
          data-carat-range="${product.settingMinSize && product.settingMaxSize ? product.settingMinSize + '-' + product.settingMaxSize : ''}"
          data-carat-min="${product.settingMinSize || ''}"
          data-carat-max="${product.settingMaxSize || ''}"
          data-price="${product.price}"
          data-certification="${product.metafields.certification_laboratory || ''}"
          ${product.variantData ? `data-variant-map='${product.variantData}'` : ''}>
        
        ${generateProductCard(product, urlParams, currencyCode, moneyFormat)}
      </div>
    `;
  }).join('');
}

function getProductShape(product) {
  // Known diamond shapes
  const KNOWN_SHAPES = ['Round', 'Oval', 'Pear', 'Emerald', 'Cushion', 'Princess', 'Marquise', 'Radiant', 'Asscher', 'Heart'];

  // First try metafield
  let shape = '';
  if (product.isGem) {
    shape = product.metafields.stone_shape || '';
  } else {
    shape = product.metafields.center_stone_shape || '';
  }

  // If metafield is empty, try to extract from product tags
  if (!shape && product.tags && product.tags.length > 0) {
    for (const tag of product.tags) {
      const tagLower = tag.toLowerCase();
      for (const knownShape of KNOWN_SHAPES) {
        if (tagLower === knownShape.toLowerCase()) {
          shape = knownShape;
          break;
        }
      }
      if (shape) break;
    }
  }

  // If still empty, try to extract from product title
  // Find the shape that appears FIRST in the title (usually the center stone shape)
  if (!shape && product.title) {
    const titleLower = product.title.toLowerCase();
    let earliestPosition = Infinity;
    let earliestShape = '';

    for (const knownShape of KNOWN_SHAPES) {
      const position = titleLower.indexOf(knownShape.toLowerCase());
      if (position !== -1 && position < earliestPosition) {
        earliestPosition = position;
        earliestShape = knownShape;
      }
    }

    if (earliestShape) {
      shape = earliestShape;
    }
  }

  return shape;
}

function generateProductCard(product, urlParams, currencyCode, moneyFormat) {
  if (product.isSet) {
    return generateSettingsCard(product, urlParams, currencyCode, moneyFormat);
  }
  if (product.isGem) {
    return generateGemstoneCard(product, urlParams, currencyCode, moneyFormat);
  }
  return generateDefaultCard(product, currencyCode, moneyFormat);
}

function generateEmptyState() {
  return `
    <div style="grid-column:1/-1;text-align:center;padding:60px 20px">
      <h3 style="margin-bottom:10px">No products found</h3>
      <p style="color:#6b7280">Try adjusting your filters or browse our other collections.</p>
    </div>
  `;
}

function generateFiltersHTML(hasGems, hasSets, gemstone, setting) {
  const shouldHideShapeFilter = 
    (hasSets && gemstone) || 
    (hasGems && setting);
  
  const baseUrl = 'https://pub-da29e7d7020a43b19575bf42b3247b0a.r2.dev/';
  const shapes = ['Round', 'Oval', 'Pear', 'Emerald', 'Cushion', 'Princess', 'Marquise', 'Radiant', 'Asscher', 'Heart'];
  
  const SHAPE_ICON_MAP = {
    'Round': 'round-gemstone-icon.png',
    'Oval': 'oval-gemstone-icon.png',
    'Pear': 'pear-gemstone-icon.png',
    'Emerald': 'emerald-cut-gemstone-icon.png',
    'Cushion': 'square-cushion-cut-gemstone-icon.png',
    'Princess': 'princess-cut-gemstone-icon.png',
    'Marquise': 'marquise-gemstone-icon.png',
    'Radiant': 'radiant-cut-gemstone-icon.png',
    'Asscher': 'octagon-cut-gemstone-icon.png',
    'Heart': 'heart-shape-gemstone-icon.png'
  };
  
  const caratRanges = [
    { label: '1-1.99', min: 1, max: 1.99 },
    { label: '2-2.99', min: 2, max: 2.99 },
    { label: '3-4.99', min: 3, max: 4.99 },
    { label: '5ct +', min: 5, max: Infinity }
  ];
  
  let html = '';
  
  if (!shouldHideShapeFilter) {
    // Show the full filter bar with shapes
    html += '<div class="shape-filter-bar">';
    html += '<div class="shape-and-carat-container">';
    html += '<div class="shape-filter-wrapper">';
    html += '<button class="shape-scroll-arrow left" aria-label="Scroll left">';
    html += '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">';
    html += '<path d="M15 18l-6-6 6-6"/>';
    html += '</svg>';
    html += '</button>';
    html += '<div class="shape-filter-container">';
    
    shapes.forEach(shape => {
      html += '<div class="shape-filter-item" data-shape="' + shape + '">';
      html += '<img src="' + baseUrl + SHAPE_ICON_MAP[shape] + '" alt="' + shape + '" class="shape-icon">';
      html += '<span class="shape-label">' + shape + '</span>';
      html += '</div>';
    });
    
    html += '</div>';
    html += '<button class="shape-scroll-arrow right" aria-label="Scroll right">';
    html += '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">';
    html += '<path d="M9 18l6-6-6-6"/>';
    html += '</svg>';
    html += '</button>';
    html += '</div>';
    
    html += '<div class="carat-filter-section desktop-only">';
    html += '<div class="filter-separator"></div>';
    html += '<div class="carat-filter-container">';
    
    caratRanges.forEach(range => {
      html += '<button class="carat-filter-btn" data-carat-min="' + range.min + '" data-carat-max="' + range.max + '">';
      html += range.label;
      html += '</button>';
    });
    
    html += '</div>';
    html += '</div>';
    
    // Desktop filter modal trigger button
    html += '<div class="filter-modal-section desktop-only">';
    html += '<div class="filter-separator"></div>';
    html += '<button class="filter-modal-trigger" aria-label="More Filters">';
    html += '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">';
    html += '<path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z"/>';
    html += '</svg>';
    html += '<span>More Filters</span>';
    html += '</button>';
    html += '</div>';
    
    html += '</div>';
    
    // Mobile more filters button - full width below shapes
    html += '<div class="mobile-more-filters-container">';
    html += '<button class="filter-modal-trigger" aria-label="More Filters">';
    html += '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">';
    html += '<path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z"/>';
    html += '</svg>';
    html += '<span>More Filters</span>';
    html += '</button>';
    html += '</div>';
    
    html += '</div>';
  } else {
    // When shape filter is hidden, still show the More Filters button
    html += '<div class="filter-bar-minimal">';
    html += '<button class="filter-modal-trigger filter-modal-trigger-standalone" aria-label="More Filters">';
    html += '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">';
    html += '<path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z"/>';
    html += '</svg>';
    html += '<span>More Filters</span>';
    html += '</button>';
    html += '</div>';
  }
  
  // ADD SORTING DROPDOWN HERE
  html += '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">';

  // Results count on the left
  html += '<div class="f-cnt" id="rc"></div>';

  // Sort dropdown on the right
  html += '<div class="sort-container">';
  html += '<select class="sort-dropdown" id="product-sort">';
  html += '<option value="">Sort by</option>';
  html += '<option value="price-asc">Price: Low to High</option>';
  html += '<option value="price-desc">Price: High to Low</option>';
  if (hasGems) {
    html += '<option value="carat-asc">Carat: Low to High</option>';
    html += '<option value="carat-desc">Carat: High to Low</option>';
  }
  html += '</select>';
  html += '</div>';

  html += '</div>';
  return html
}
function generateFilterModal(hasGems, hasSets, gemstone, setting) {
  let html = '';
  
  // Check if gemstone or setting is selected from passed parameters
  const shouldHideShapeAndCarat = !!(gemstone || setting);
  
  const baseUrl = 'https://pub-da29e7d7020a43b19575bf42b3247b0a.r2.dev/';
  const SHAPE_ICON_MAP = {
    'Round': 'round-gemstone-icon.png',
    'Oval': 'oval-gemstone-icon.png',
    'Pear': 'pear-gemstone-icon.png',
    'Emerald': 'emerald-cut-gemstone-icon.png',
    'Cushion': 'square-cushion-cut-gemstone-icon.png',
    'Princess': 'princess-cut-gemstone-icon.png',
    'Marquise': 'marquise-gemstone-icon.png',
    'Radiant': 'radiant-cut-gemstone-icon.png',
    'Asscher': 'octagon-cut-gemstone-icon.png',
    'Heart': 'heart-shape-gemstone-icon.png'
  };
  
  // Modal Overlay
  html += '<div class="filter-modal-overlay"></div>';
  
  // Modal Container
  html += '<div class="filter-modal">';
  
  // Modal Header
  html += '<div class="filter-modal-header">';
  html += '<h2>Filters</h2>';
  html += '<button class="filter-modal-close" aria-label="Close filters">';
  html += '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">';
  html += '<path d="M18 6L6 18M6 6l12 12"/>';
  html += '</svg>';
  html += '</button>';
  html += '</div>';
  
  // Modal Body
  html += '<div class="filter-modal-body">';
  
  // 1. SHAPE FILTER (Only show if no gemstone/setting selected)
  if (!shouldHideShapeAndCarat) {
    html += '<div class="filter-section">';
    html += '<h3 class="filter-section-title">Shape</h3>';
    html += '<div class="filter-options filter-shapes-grid">';
    
    const shapes = ['Round', 'Oval', 'Pear', 'Emerald', 'Cushion', 'Princess', 'Marquise', 'Radiant', 'Asscher', 'Heart'];
    shapes.forEach(shape => {
      html += '<label class="filter-shape-image-label shape-option" data-shape="' + shape + '">';
      html += '<input type="checkbox" class="filter-checkbox" value="' + shape + '" data-filter="shape">';
      html += '<div class="filter-shape-image-wrapper">';
      html += '<img src="' + baseUrl + SHAPE_ICON_MAP[shape] + '" alt="' + shape + '" class="filter-shape-icon">';
      html += '<span class="filter-shape-name">' + shape + '</span>';
      html += '</div>';
      html += '</label>';
    });
    
    html += '</div>';
    html += '</div>';
  }
  
  // 2. CARAT WEIGHT FILTER (Only show if no gemstone/setting selected)
  if (!shouldHideShapeAndCarat) {
    html += '<div class="filter-section">';
    html += '<h3 class="filter-section-title">Carat Weight</h3>';
    html += '<div class="filter-options">';
    html += '<div class="carat-range-inputs">';
    html += '<input type="number" class="carat-input" id="carat-min" placeholder="Min" step="0.01" min="0">';
    html += '<span class="carat-separator">to</span>';
    html += '<input type="number" class="carat-input" id="carat-max" placeholder="Max" step="0.01" min="0">';
    html += '</div>';
    html += '<div class="carat-quick-options">';
    
    const caratQuickOptions = [
      { label: '0.5-0.99', min: 0.5, max: 0.99 },
      { label: '1-1.99', min: 1, max: 1.99 },
      { label: '2-2.99', min: 2, max: 2.99 },
      { label: '3-4.99', min: 3, max: 4.99 },
      { label: '5+', min: 5, max: 999 }
    ];
    
    caratQuickOptions.forEach(range => {
      html += '<button class="carat-quick-btn" data-min="' + range.min + '" data-max="' + range.max + '">';
      html += range.label + ' ct';
      html += '</button>';
    });
    
    html += '</div>';
    html += '</div>';
    html += '</div>';
  }
  
  // 3. PRICE RANGE FILTER (Always show)
  html += '<div class="filter-section">';
  html += '<h3 class="filter-section-title">Price Range</h3>';
  html += '<div class="filter-options">';
  html += '<div class="price-range-inputs">';
  html += '<input type="number" class="price-input" id="price-min" placeholder="Min $" min="0">';
  html += '<span class="price-separator">to</span>';
  html += '<input type="number" class="price-input" id="price-max" placeholder="Max $" min="0">';
  html += '</div>';
  html += '</div>';
  html += '</div>';
  
  // 4. SETTINGS-SPECIFIC FILTERS
  if (hasSets) {
    // Metal Type Filter
    html += '<div class="filter-section">';
    html += '<h3 class="filter-section-title">Metal Type</h3>';
    html += '<div class="filter-options" id="metal-options">';
    // Will be populated dynamically
    html += '</div>';
    html += '</div>';
    
  // Style Filter
  html += '<div class="filter-section">';
  html += '<h3 class="filter-section-title">Style</h3>';
  html += '<div class="filter-options filter-style-grid" id="style-options">';  // Added filter-style-grid class
  // Will be populated dynamically
  html += '</div>';
  html += '</div>';
  }
  
  // 5. GEMSTONE-SPECIFIC FILTERS
  if (hasGems) {

    // Diamond Type Filter with Icons
    html += '<div class="filter-section">';
    html += '<h3 class="filter-section-title">Diamond Type</h3>';
    html += '<div class="filter-options filter-gemtype-grid" id="gemstone-type-options">';
    // Will be populated dynamically with icons
    html += '</div>';
    html += '</div>';
    // Color Filter (existing)
    //html += '<div class="filter-section">';
    //html += '<h3 class="filter-section-title">Color</h3>';
    //html += '<div class="filter-options" id="color-options">';
    // Will be populated dynamically
    //html += '</div>';
    //html += '</div>';

    
    // Treatment Filter
    html += '<div class="filter-section">';
    html += '<h3 class="filter-section-title">Treatment</h3>';
    html += '<div class="filter-options" id="treatment-options">';
    // Will be populated dynamically
    html += '</div>';
    html += '</div>';
    
    // Origin Filter
    //html += '<div class="filter-section">';
    //html += '<h3 class="filter-section-title">Origin</h3>';
    //html += '<div class="filter-options" id="origin-options">';
    // Will be populated dynamically
    //html += '</div>';
    //html += '</div>';
    
    // Certification Filter
    //html += '<div class="filter-section">';
    //html += '<h3 class="filter-section-title">Certification</h3>';
    //html += '<div class="filter-options" id="certification-options">';
    // Will be populated dynamically
    //html += '</div>';
    //html += '</div>';
  }
  
  html += '</div>'; // End modal body
  
  // Modal Footer
  html += '<div class="filter-modal-footer">';
  html += '<button class="filter-clear-btn">Clear All</button>';
  html += '<button class="filter-apply-btn">Apply Filters</button>';
  html += '</div>';
  
  html += '</div>'; // End modal
  
  return html;
}
function generateSettingsCard(product, urlParams = {}, currencyCode = 'AED', moneyFormat = '{{amount}}') {
  const { gemstone, setting_variant } = urlParams;
  const productUrl = buildProductUrl(product.handle, { gemstone, setting_variant });
  const cardData = processSettingsCardData(product);
  
  // Create variant data mapping for swatches
  const variantData = {};
  product.variants.forEach((v, index) => {
    const colorMatch = v.options.option1?.match(/(White|Yellow|Rose|Pink)/i);
    if (colorMatch) {
      let color = colorMatch[1].charAt(0).toUpperCase() + colorMatch[1].slice(1).toLowerCase();
      if (color === 'Pink') color = 'Rose';
      
      if (!variantData[color]) variantData[color] = [];
      
      let variantImage = product.featuredImage;
      const variantColor = color.toLowerCase();
      const matchingImageIndex = product.images.findIndex(img => {
        const imgLower = img.toLowerCase();
        if (variantColor === 'rose') {
          return imgLower.includes('rose') || imgLower.includes('pink') || imgLower.includes('18k');
        }
        return imgLower.includes(variantColor + '-gold') || 
               imgLower.includes(variantColor + '_gold') ||
               imgLower.includes(variantColor);
      });
      
      if (matchingImageIndex !== -1) {
        variantImage = product.images[matchingImageIndex];
      } else {
        const colorOrder = ['white', 'yellow', 'rose'];
        const colorIndex = colorOrder.indexOf(variantColor);
        if (colorIndex !== -1 && product.images[colorIndex]) {
          variantImage = product.images[colorIndex];
        }
      }
      
      variantData[color].push({
        id: v.id,
        price: v.price,
        image: variantImage
      });
    }
  });
  
  return `
    <div class="clean-settings-card" 
         data-product-id="${product.id}" 
         data-variant-colors='${JSON.stringify(variantData)}'
         data-all-images='${JSON.stringify(product.images)}'>
      <div class="clean-settings-card__link" data-product-url="${productUrl}">
        ${generateCardImageSection(product, 'settings')}
        <div class="clean-settings-card__content">
          <h3 class="clean-settings-card__title">${escapeHtml(product.title)}</h3>
          ${cardData.metalColors.length > 0 ? generateMetalSwatches(cardData.metalColors, product.id) : ''} 
          <div class="settings-card-price-container">
            ${generatePriceSection(product, currencyCode, moneyFormat)}
          </div>
          ${generateActionButtons(product, productUrl, 'settings')}
        </div>
      </div>
    </div>
  `;
}
function generateGemstoneCard(product, urlParams = {}, currencyCode = 'AED', moneyFormat = '{{amount}}') {
  const { setting, setting_variant } = urlParams;
  const productUrl = buildProductUrl(product.handle, { setting, setting_variant });
  const cardData = processGemstoneCardData(product);
  
  return `
    <div class="clean-gemstone-card" data-product-id="${product.id}">
      <a href="${productUrl}" class="clean-gemstone-card__link">
        ${generateCardImageSection(product, 'gemstone', cardData.isCertified, cardData.certificationLab)}
        <div class="clean-gemstone-card__content">
          <h3 class="clean-gemstone-card__title">${cardData.title}</h3>
          ${generateGemstoneSpecs(cardData)}
          ${generatePriceSection(product, currencyCode, moneyFormat)}
          ${generateActionButtons(product, productUrl, 'gemstone')}
        </div>
      </a>
    </div>
  `;
}

function generateDefaultCard(product, currencyCode = 'AED', moneyFormat = '{{amount}}') {
  const formatPrice = (cents) => {
    const amount = (cents / 100).toFixed(2);
    if (moneyFormat && moneyFormat !== '{{amount}}') {
      return moneyFormat.replace('{{amount}}', amount);
    }
    return `${currencyCode} ${amount}`;
  };

  // Note: ge-item wrapper is already provided by generateProductsHTML
  return `
    <div class="def-card">
      <a href="/products/${product.handle}">
        ${product.featuredImage ?
          `<img src="${product.featuredImage}?width=300&height=300"
                alt="${escapeHtml(product.title)}"
                loading="lazy"
                width="300"
                height="300">` :
          `<div style="background:#f3f4f6;height:200px;display:flex;align-items:center;justify-content:center;border-radius:0px">
            <span style="color:#9ca3af">No image</span>
          </div>`
        }
        <h3 style="font-size:1rem;margin:.5rem 0">${escapeHtml(product.title)}</h3>
        <p style="font-weight:bold;color:#3b82f6">${formatPrice(product.price)}</p>
      </a>
    </div>
  `;
}

// Card Helper Functions
function generateMetalSwatches(metalColors, productId) {
  const imageMap = {
    'White': 'https://pub-da29e7d7020a43b19575bf42b3247b0a.r2.dev/white-gold.png',
    'Yellow': 'https://pub-da29e7d7020a43b19575bf42b3247b0a.r2.dev/yellow-gold.png',
    'Rose': 'https://pub-da29e7d7020a43b19575bf42b3247b0a.r2.dev/18-rose-gold-icon.png'
  };
  
  return `
    <div class="metal-swatches" data-product-id="${productId}">
      ${metalColors.map((color, index) => `
        <div class="metal-swatch ${index === 0 ? 'active' : ''}" 
             data-metal-color="${color}" 
             title="${color} Gold">
          <img src="${imageMap[color]}" alt="${color} Gold" class="metal-swatch__image">
        </div>
      `).join('')}
    </div>
  `;
}
function processSettingsCardData(product) {
  const centerStoneShape = product.metafields.center_stone_shape || 'Various';
  const ringStyle = product.metafields.ring_style || 'Classic';
  const metalKarat = extractMetalKarat(product.variants);
  const sizeRange = extractSizeRange(product.variants);
  const hasAccents = checkForAccents(product, ringStyle);
  const metalColors = extractMetalColors(product.variants); // NEW
  
  return {
    centerStoneShape,
    ringStyle,
    metalKarat,
    sizeRange,
    hasAccents,
    metalWeightRange: 'N/A',
    metalColors // NEW
  };
}
function processDiamondCardData(product) {
  const metafields = product.metafields;
  const certificationLab = metafields.certification_laboratory || '';
  const certificationNumber = metafields.certification_number || '';

  // Get shape using getProductShape which includes tag/title fallback
  const stoneShape = getProductShape(product);
  const diamondType = metafields.diamond_type || 'Lab Diamond';

  return {
    diamondType,
    stoneColor: metafields.stone_color || '',
    stoneClarity: metafields.stone_clarity || '',
    stoneShape,
    stoneWeight: metafields.stone_weight || '',
    stoneDimensions: metafields.stone_dimensions || '',
    cutGrade: metafields.cut_grade || '',
    polishGrade: metafields.polish_grade || '',
    symmetryGrade: metafields.symmetry_grade || '',
    fluorescence: metafields.fluorescence || '',
    treatment: metafields.treatment || '',
    certificationLab,
    certificationNumber,
    isCertified: !!(certificationLab && certificationNumber),
    weightDisplay: metafields.stone_weight || '',
    // Generate title like "1.03ct D VS1 Round"
    title: `${metafields.stone_weight || ''} ${metafields.stone_color || ''} ${metafields.stone_clarity || ''} ${stoneShape}`.trim()
  };
}

// Keep legacy function name as alias for backward compatibility
function processGemstoneCardData(product) {
  return processDiamondCardData(product);
}

function extractMetalKarat(variants) {
  const metalTypes = ['18k', '14k', '10k', '22k', '24k'];
  const metals = [...new Set(variants.map(v => v.options.option1).filter(Boolean))];
  
  for (const metal of metals) {
    const metalLower = metal.toLowerCase();
    for (const type of metalTypes) {
      if (metalLower.includes(type)) {
        return type;
      }
    }
  }
  
  return 'N/A';
}
function extractMetalColors(variants) {
  const metalColors = new Set();
  
  variants.forEach(v => {
    const metal = v.options.option1;
    if (metal) {
      // Extract color from strings like "14k White Gold", "18k Rose Gold"
      const colorMatch = metal.match(/(White|Yellow|Rose)/i);
      if (colorMatch) {
        metalColors.add(colorMatch[1].charAt(0).toUpperCase() + colorMatch[1].slice(1).toLowerCase());
      }
    }
  });
  
  return Array.from(metalColors);
}
function extractSizeRange(variants) {
  let minSize = 999.0;
  let maxSize = 0.0;
  
  const sizes = [...new Set(variants.map(v => v.options.option2).filter(Boolean))];
  
  for (const size of sizes) {
    const sizeRange = parseSizeString(size);
    if (sizeRange) {
      if (sizeRange.min < minSize) minSize = sizeRange.min;
      if (sizeRange.max > maxSize) maxSize = sizeRange.max;
    }
  }
  
  if (minSize !== 999.0 && maxSize > 0) {
    return `${Math.round(minSize)}-${Math.ceil(maxSize)}ct`;
  }
  
  return 'Various';
}

function parseSizeString(sizeString) {
  const parts = sizeString.split('-');
  if (parts.length < 1) return null;
  
  const min = parseFloat(parts[0].trim());
  let max = 0;
  
  if (parts.length > 1) {
    const maxPart = parts[1].trim().split(' ')[0];
    max = parseFloat(maxPart);
  }
  
  if (min > 0 && max > 0) {
    return { min, max };
  }
  
  return null;
}

function checkForAccents(product, ringStyle) {
  return product.tags.includes('Side Stones') || 
         ringStyle.includes('Side') || 
         ringStyle.includes('Halo');
}

function buildProductUrl(handle, params) {
  let url = `/products/${handle}`;
  const queryParams = [];
  
  if (params.gemstone) queryParams.push(`gemstone=${params.gemstone}`);
  if (params.setting) queryParams.push(`setting=${params.setting}`);
  if (params.setting_variant) queryParams.push(`setting_variant=${params.setting_variant}`);
  
  if (queryParams.length > 0) {
    url += '?' + queryParams.join('&');
  }
  
  return url;
}

function generateCardImageSection(product, type, isCertified = false, certificationLab = '') {
  const hasMultipleImages = product.images && product.images.length > 1;
  
  // For settings cards with multiple images, show hover image effect
  if (type === 'settings' && hasMultipleImages) {
    return `
      <div class="clean-settings-card__image-section">
        <div class="clean-settings-card__image-container">
          <img
            src="${product.images[0]}?width=400"
            alt="${escapeHtml(product.title)}"
            class="clean-settings-card__image clean-settings-card__image--primary"
            width="400"
            height="400"
          >
          <img
            src="${product.images[1]}?width=400"
            alt="${escapeHtml(product.title)}"
            class="clean-settings-card__image clean-settings-card__image--secondary"
            loading="lazy"
            width="400"
            height="400"
          >
        </div>
      </div>
    `;
  }
  
  // Keep existing gallery behavior for gemstones and settings with single image
  const galleryHTML = generateGalleryHTML(product, type);
  
  const certBadge = isCertified && type === 'gemstone' ? 
    `<div class="clean-gemstone-card__cert-badge">${certificationLab}</div>` : '';
  
  return `
    <div class="clean-${type}-card__image-section">
      ${certBadge}
      <div class="clean-${type}-card__image-container" data-gallery-container>
        <div class="gallery-track">
          ${galleryHTML}
        </div>
        ${type === 'gemstone' && hasMultipleImages ? generateGalleryNavigation() : ''}
      </div>
    </div>
  `;
}
function generateGalleryHTML(product, type) {
  if (!product.images || product.images.length === 0) {
    return `<div class="gallery-slide"><div class="clean-${type}-card__placeholder">NO IMAGE</div></div>`;
  }
  
  return product.images.slice(0, 5).map((imageUrl, index) => `
    <div class="gallery-slide" data-slide-index="${index}">
      <img
        src="${imageUrl}?width=400"
        alt="${escapeHtml(product.title)}"
        class="clean-${type}-card__image"
        ${index > 0 ? 'loading="lazy"' : ''}
        width="400"
        height="400"
      >
    </div>
  `).join('');
}

function generateGalleryNavigation() {
  return `
    <button type="button" class="gallery-nav gallery-nav--prev" data-direction="prev" aria-label="Previous image">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor">
        <path d="M10 12L6 8l4-4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </button>
    <button type="button" class="gallery-nav gallery-nav--next" data-direction="next" aria-label="Next image">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor">
        <path d="M6 12l4-4-4-4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </button>
  `;
}

function generateDiamondSpecs(data) {
  // Always show all specs, use N/A for missing values
  const specs = [
    { label: 'Shape', value: data.stoneShape || 'N/A' },
    { label: 'Carat', value: data.weightDisplay || 'N/A' },
    { label: 'Color', value: data.stoneColor || 'N/A' },
    { label: 'Clarity', value: data.stoneClarity || 'N/A' },
    { label: 'Cut', value: data.cutGrade || 'N/A' },
    { label: 'Certificate', value: data.isCertified ? data.certificationLab : 'N/A' }
  ];

  return generateSpecsHTML(specs);
}

// Legacy alias
function generateGemstoneSpecs(data) {
  return generateDiamondSpecs(data);
}

function generateSpecsHTML(specs) {
  return `
    <div class="clean-${specs.length > 4 ? 'settings' : 'gemstone'}-card__specs">
      ${specs.map(spec => `
        <div class="spec-row">
          <span class="spec-label">${spec.label}</span>
          <span class="spec-value">${spec.value}</span>
        </div>
      `).join('')}
    </div>
  `;
}

function generatePriceSection(product, currencyCode = 'AED', moneyFormat = '{{amount}}') {
  const formatPrice = (cents) => {
    const amount = (cents / 100).toFixed(2);
    if (moneyFormat && moneyFormat !== '{{amount}}') {
      return moneyFormat.replace('{{amount}}', amount);
    }
    return `${currencyCode} ${amount}`;
  };
  
  const currentPrice = `<span class="price-current">${formatPrice(product.price)}</span>`;
  const comparePrice = product.compareAtPrice && product.compareAtPrice > product.price ? 
    `<span class="price-compare">${formatPrice(product.compareAtPrice)}</span>` : '';
  
  return `
    <div class="clean-${product.isGem ? 'gemstone' : 'settings'}-card__price">
      ${currentPrice}
      ${comparePrice}
    </div>
  `;
}
function generateActionButtons(product, productUrl, type) {
  return `
    <div class="clean-${type}-card__actions">
      <button type="button" 
              class="btn-view ${type}-card__quick-view" 
              data-product-handle="${product.handle}" 
              data-product-url="${productUrl}">
        View
      </button>
      <button type="button" 
              class="btn-select ${type}-card__select" 
              data-product-url="${productUrl}">
        Select
      </button>
    </div>
  `;
}

function escapeHtml(text) {
  if (!text) return '';
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

// GraphQL Query
const COLLECTION_PRODUCTS_QUERY = `
  query getCollectionProducts($handle: String!) {
    collectionByHandle(handle: $handle) {
      products(first: ${MAX_PRODUCTS_FETCH}) {
        edges {
          node {
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
            }
            featuredImage {
              url
            }
            images(first: ${MAX_IMAGES_FETCH}) {
              edges {
                node {
                  url
                  altText
                }
              }
            }
            variants(first: ${MAX_VARIANTS_FETCH}) {
              edges {
                node {
                  id
                  title
                  price
                  selectedOptions {
                    name
                    value
                  }
                  # Variant-level metafields for settings
                  centerStoneCaratWeight: metafield(namespace: "custom", key: "center_stone_carat_weight") { value }
                  variantMetalType: metafield(namespace: "custom", key: "metal_type") { value }
                  metalWeight: metafield(namespace: "custom", key: "metal_weight") { value }
                  sideStoneType: metafield(namespace: "custom", key: "side_stones_type") { value }
                  sideStoneShape: metafield(namespace: "custom", key: "side_stones_shape") { value }
                  sideStoneQuality: metafield(namespace: "custom", key: "side_stones_quality") { value }
                  sideStoneTotalWeight: metafield(namespace: "custom", key: "side_stones_total_carat_weight") { value }
                  variantCenterStoneShape: metafield(namespace: "custom", key: "center_stone_shape") { value }
                }
              }
            }
            # Diamond metafields - values only, GIDs resolved via fallback query
            labDiamondType: metafield(namespace: "custom", key: "lab_diamond_type") { value }
            stoneWeight: metafield(namespace: "custom", key: "stone_weight") { value }
            stoneShape: metafield(namespace: "custom", key: "stone_shape") { value }
            stoneColor: metafield(namespace: "custom", key: "stone_color") { value }
            stoneClarity: metafield(namespace: "custom", key: "stone_clarity") { value }
            stoneDimensions: metafield(namespace: "custom", key: "stone_dimensions") { value }
            cutGrade: metafield(namespace: "custom", key: "cut_grade") { value }
            polishGrade: metafield(namespace: "custom", key: "polish_grade") { value }
            symmetryGrade: metafield(namespace: "custom", key: "symmetry_grade") { value }
            treatment: metafield(namespace: "custom", key: "treatment") { value }
            certificate: metafield(namespace: "custom", key: "certificate") { value }
            fluorescence: metafield(namespace: "custom", key: "fluorescence") { value }
            # Setting metafields
            centerStoneShape: metafield(namespace: "custom", key: "center_stone_shape") { value }
            ringStyle: metafield(namespace: "custom", key: "ring_style") { value }
            metalType: metafield(namespace: "custom", key: "metal_type") { value }
          }
        }
      }
    }
  }
`;
// CSS Generation
// CSS Generation
function getRingBuilderCSS() {
  return `
    /* ============================================
       1. GLOBAL STYLES & RESETS
    ============================================ */
    
    /* Global overflow fix */
    html, body {
      overflow-x: hidden;
    }
    
    #ring-builder-app * {
      box-sizing: border-box;
    }
    
    #ring-builder-app {
      width: 100%;
      max-width: 100%;
      overflow-x: hidden;
    }
    
    /* Helper classes for mobile/desktop visibility */
    .mobile-hide{display:inline}
    .mobile-show{display:none}
    .mobile-hide-block{display:block}
    .mobile-show-block{display:none}
    
    /* Context Banner - shown when gemstone/setting context exists */
    .rb-ctx{display:block}
    
    /* ============================================
       2. GRID & LAYOUT SYSTEM
    ============================================ */
    
    /* Grid Styles */
    .ge-grid{display:grid;gap:20px;margin-top:2rem}
    .ge-grid-d2{grid-template-columns:repeat(2,1fr)}
    .ge-grid-d3{grid-template-columns:repeat(3,1fr)}
    .ge-grid-d4{grid-template-columns:repeat(4,1fr)}
    .ge-grid-d5{grid-template-columns:repeat(5,1fr)}
    .ge-item{display:block;position:relative;min-height:400px;transition:opacity .3s}
    .ge-item.hidden{display:none!important;opacity:0!important}
    
    /* ============================================
       3. FILTER COMPONENTS
    ============================================ */
    
    /* Filter Bar */
    .gf-bar{background:#fff;border-radius:0px;padding:1rem;margin-bottom:2rem;box-shadow:0 1px 3px rgba(0,0,0,.1)}
    .gf-bar-i{display:flex;gap:1rem;flex-wrap:wrap;align-items:center}
    .gf-dd{position:relative}
    
    /* Filter Buttons */
    .gf-btn{padding:.5rem 1rem;border:1px solid #e0e0e0;border-radius:0px;background:#fff;font-size:14px;cursor:pointer;transition:all .2s;display:flex;align-items:center;gap:.5rem;min-width:120px;justify-content:space-between}
    .gf-btn:hover{border-color:#666666;background:#666666;color:#ffffff}
    .gf-btn.active{background:#000000;color:#fff;border-color:#000000}
    .gf-btn svg{width:16px;height:16px;transition:transform .2s}
    .gf-btn.open svg{transform:rotate(180deg)}
    
    /* Filter Menu */
    .gf-menu{position:absolute;top:100%;left:0;margin-top:8px;background:#fff;border:1px solid #e0e0e0;border-radius:0px;box-shadow:0 10px 25px rgba(0,0,0,.1);min-width:200px;max-height:300px;overflow-y:auto;z-index:100;display:none}
    .gf-menu.open{display:block}
    .gf-opt{padding:.75rem 1rem;cursor:pointer;transition:background .2s;display:flex;align-items:center;justify-content:space-between;font-size:14px}
    .gf-opt:hover{background:#666666;color:#ffffff}
    .gf-opt input{margin-right:.5rem}
    .gf-opt .cnt{color:#000000;font-size:12px;margin-left:auto;opacity:0.6}
    
    /* Active Filters */
    .gf-active{display:flex;gap:.5rem;flex-wrap:wrap;align-items:center;margin-left:auto}
    .gf-active.empty{display:none}
    .af-tag{background:#ffffff;color:#000000;padding:.25rem .75rem;border-radius:0px;font-size:13px;display:flex;align-items:center;gap:.5rem;border:1px solid #e0e0e0}
    .af-tag button{background:none;border:none;color:#000000;cursor:pointer;padding:0;font-size:16px;line-height:1;opacity:.7;transition:opacity .2s}
    .af-tag button:hover{opacity:1}
    .clr-all{background:none;border:none;color:#000000;font-size:13px;cursor:pointer;text-decoration:underline;padding:.25rem .5rem;opacity:0.6}
    .clr-all:hover{color:#000000;opacity:1}
    
    /* Filter Count */
    .f-cnt {
      display: none !important;
    }
    
    /* Context Banner */
    .rb-ctx{background:#000000;border:1px solid #e0e0e0;border-radius:0px;padding:12px 20px;margin-bottom:20px;text-align:center}
    .rb-ctx p{margin:0;font-size:14px;color:#ffffff}
    .rb-ctx strong{font-weight:600;color:#ffffff;text-transform:capitalize}
    
    /* Shape Filter Bar */
    .shape-filter-bar{background:#fff;padding:10px 20px 20px 20px;margin-bottom:24px;border-radius:0px;box-shadow:0 2px 4px rgba(0,0,0,0.1);width:100%;max-width:100%;overflow:hidden;box-sizing:border-box}
    .shape-and-carat-container{display:flex;align-items:center;justify-content:center;gap:0;max-width:1400px;margin:0 auto;width:100%;overflow:hidden}
    .shape-filter-wrapper{position:relative;flex:1;overflow:hidden;width:100%;max-width:100%}
    .shape-filter-container{display:flex;gap:16px;justify-content:flex-start;flex-wrap:nowrap;overflow-x:auto;overflow-y:hidden;scrollbar-width:none;-ms-overflow-style:none;scroll-behavior:smooth;padding:0 20px}
    .shape-filter-container::-webkit-scrollbar{display:none}
    
    /* Shape Filter Items */
    .shape-filter-item{display:flex;flex-direction:column;align-items:center;gap:8px;padding:12px;cursor:pointer;border:2px solid transparent;border-radius:0px;transition:all 0.2s ease;min-width:80px;flex-shrink:0}
    .shape-filter-item:hover{background:#f5f5f5;border-color:#e0e0e0}
    .shape-filter-item.active{background:#f0f0f0;border-color:#000}
    .shape-icon{width:48px;height:48px;object-fit:contain}
    .shape-label{font-size:12px;color:#333;text-align:center}
    
    /* Shape Scroll Arrows */
    .shape-scroll-arrow{position:absolute;top:50%;transform:translateY(-50%);width:32px;height:32px;background:rgba(255,255,255,0.95);border:1px solid #e0e0e0;border-radius:0%;display:flex;align-items:center;justify-content:center;cursor:pointer;z-index:10;transition:all 0.2s ease;opacity:0;pointer-events:none}
    .shape-scroll-arrow.show{opacity:1;pointer-events:auto}
    .shape-scroll-arrow:hover{background:#f5f5f5;border-color:#000}
    .shape-scroll-arrow.left{left:10px}
    .shape-scroll-arrow.right{right:10px}
    .shape-scroll-arrow svg{width:16px;height:16px;color:#000}
    
    /* Desktop Filter Elements */
    .desktop-only{display:flex;align-items:center;gap:20px;flex-shrink:0}
    .filter-separator{width:1px;height:60px;background:#e0e0e0;margin:0 20px}
    
    /* Carat Filter */
    .carat-filter-container{display:flex;gap:12px;align-items:center}
    .carat-filter-btn{padding:8px 16px;border:1px solid #000;background:transparent;color:#000;font-size:13px;font-weight:400;cursor:pointer;transition:all 0.2s ease;border-radius:0;white-space:nowrap;min-width:70px}
    .carat-filter-btn:hover{background:#f5f5f5}
    .carat-filter-btn.active{background:#000;color:#fff}
    
    /* Filter Modal Trigger */
    .filter-modal-trigger{display:flex;align-items:center;gap:8px;padding:10px 20px;background:#fff;border:1px solid #000;color:#000;cursor:pointer;font-size:14px;font-weight:500;transition:all 0.2s ease;white-space:nowrap}
    .filter-modal-trigger:hover{background:#000;color:#fff}
    .filter-modal-trigger:hover svg{stroke:#fff}
    .filter-modal-section{display:flex;align-items:center;gap:20px;margin-left:20px}
    
    /* Mobile More Filters Container */
    .mobile-more-filters-container{display:none;width:100%;padding:12px 0 0 0;max-width:100%;box-sizing:border-box}
    
    /* Minimal Filter Bar */
    .filter-bar-minimal{margin-bottom:24px}
    .filter-modal-trigger-standalone{display:inline-flex;align-items:center;gap:8px;padding:10px 20px;background:#fff;border:1px solid #000;color:#000;cursor:pointer;font-size:14px;font-weight:500;transition:all 0.2s ease;margin:0}
    .filter-modal-trigger-standalone:hover{background:#000;color:#fff}
    .filter-modal-trigger-standalone:hover svg{stroke:#fff}
    
    /* Sort Dropdown */
    .sort-container{margin-bottom:0}
    .sort-dropdown{padding:.5rem 1rem;border:1px solid #e0e0e0;border-radius:0px;background:#fff;font-size:14px;cursor:pointer;transition:all .2s;min-width:180px}
    .sort-dropdown:hover{border-color:#666666}
    .sort-dropdown:focus{outline:none;border-color:#000}
    
    /* ============================================
       4. FILTER MODAL
    ============================================ */
    
    /* Modal Overlay */
    .filter-modal-overlay{position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:999;opacity:0;visibility:hidden;transition:all 0.3s ease}
    .filter-modal-overlay.active{opacity:1;visibility:visible}
    
    /* Modal Container */
    .filter-modal{position:fixed;top:0;right:-500px;width:500px;height:100%;background:#fff;box-shadow:-2px 0 10px rgba(0,0,0,0.1);z-index:1000;transition:right 0.3s ease;display:flex;flex-direction:column}
    .filter-modal.active{right:0}
    
    /* Modal Header */
    .filter-modal-header{display:flex;justify-content:space-between;align-items:center;padding:20px;border-bottom:1px solid #e0e0e0;height:auto!important;max-height:50px!important;min-height:unset!important;flex-shrink:0!important;flex-grow:0!important;flex-basis:auto!important}
    .filter-modal-header h2{margin:0;font-size:20px;font-weight:600}
    .filter-modal-close{background:none;border:none;cursor:pointer;padding:8px;display:flex;align-items:center;justify-content:center;transition:opacity 0.2s}
    .filter-modal-close:hover{opacity:0.6}
    
    /* Modal Body */
    .filter-modal-body{flex:1;overflow-y:auto;padding:20px}
    .filter-section{margin-bottom:30px;padding-bottom:20px;border-bottom:1px solid #f0f0f0}
    .filter-section:last-child{border-bottom:none}
    .filter-section-title{font-size:16px;font-weight:600;margin:0 0 15px 0;color:#000}
    .filter-options{display:flex;flex-direction:column;gap:10px}
    
    /* Modal Footer */
    .filter-modal-footer{padding:20px;border-top:1px solid #e0e0e0;display:flex;gap:10px}
    .filter-clear-btn,.filter-apply-btn{flex:1;padding:12px;font-size:14px;font-weight:500;cursor:pointer;transition:all 0.2s ease;border:1px solid #000}
    .filter-clear-btn{background:#fff;color:#000}
    .filter-clear-btn:hover{background:#f5f5f5}
    .filter-apply-btn{background:#000;color:#fff}
    .filter-apply-btn:hover{background:#333}
    
    /* Shape Filter Grid in Modal */
    .filter-shapes{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}
    .filter-shapes-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}
    .filter-shape-image-label{display:block;cursor:pointer;border:2px solid #e0e0e0;border-radius:0px;padding:12px;transition:all 0.2s ease;text-align:center}
    .filter-shape-image-label:hover{background:#f5f5f5;border-color:#000}
    .filter-shape-image-label input[type="checkbox"]{display:none}
    .filter-shape-image-wrapper{display:flex;flex-direction:column;align-items:center;gap:8px}
    .filter-shape-icon{width:40px;height:40px;object-fit:contain}
    .filter-shape-name{font-size:13px;color:#333;font-weight:500}
    .filter-shape-image-label input[type="checkbox"]:checked + .filter-shape-image-wrapper::after{content:'✓';position:absolute;top:-8px;right:-8px;width:20px;height:20px;background:#000;color:white;border-radius:0%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:bold}
    .filter-shape-image-label:has(input[type="checkbox"]:checked){background:#f0f0f0;border-color:#000}
    
    /* Checkbox Styles */
    .filter-checkbox-label{display:flex;align-items:center;gap:10px;cursor:pointer;padding:8px 12px;border:1px solid #e0e0e0;border-radius:0px;transition:all 0.2s ease}
    .filter-checkbox-label:hover{background:#f5f5f5;border-color:#000}
    .filter-checkbox{display:none}
    .filter-checkbox-custom{width:18px;height:18px;border:2px solid #d0d0d0;border-radius:0px;position:relative;transition:all 0.2s ease}
    .filter-checkbox:checked + .filter-checkbox-custom{background:#000;border-color:#000}
    .filter-checkbox:checked + .filter-checkbox-custom::after{content:'';position:absolute;top:2px;left:5px;width:5px;height:9px;border:solid white;border-width:0 2px 2px 0;transform:rotate(45deg)}
    
    /* Range Inputs */
    .carat-range-inputs,.price-range-inputs{display:flex;align-items:center;gap:10px;margin-bottom:15px}
    .carat-input,.price-input{flex:1;padding:10px;border:1px solid #e0e0e0;border-radius:0px;font-size:14px}
    .carat-separator,.price-separator{color:#666;font-size:14px}
    .carat-quick-options{display:flex;flex-wrap:wrap;gap:8px}
    .carat-quick-btn{padding:6px 12px;border:1px solid #e0e0e0;background:#fff;border-radius:0px;font-size:13px;cursor:pointer;transition:all 0.2s ease}
    .carat-quick-btn:hover{border-color:#000}
    .carat-quick-btn.active{background:#000;color:#fff;border-color:#000}
    
    /* Metal Filter Swatches */
    .metal-filter-swatches{display:flex;gap:16px;align-items:center}
    .metal-filter-swatch{cursor:pointer;text-align:center;transition:all 0.2s ease}
    .metal-filter-swatch input[type="radio"]{display:none}
    .metal-filter-image{width:40px;height:40px;border-radius:0%;border:2px solid #e0e0e0;overflow:hidden;display:flex;align-items:center;justify-content:center;background:#fff;transition:all 0.2s ease;margin:0 auto 8px}
    .metal-filter-image img{width:100%;height:100%;object-fit:cover}
    .metal-filter-label{font-size:12px;color:#666;display:block;transition:color 0.2s ease}
    .metal-filter-swatch:hover .metal-filter-image{border-color:#000;transform:scale(1.1)}
    .metal-filter-swatch:hover .metal-filter-label{color:#000}
    .metal-filter-swatch input[type="radio"]:checked + .metal-filter-image{border-color:#000;box-shadow:0 0 0 3px rgba(0,0,0,0.1)}
    .metal-filter-swatch input[type="radio"]:checked ~ .metal-filter-label{color:#000;font-weight:600}
    
    /* Gemstone Type Filter Grid */
    .filter-gemtype-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}
    .filter-gemtype-image-label{display:block;cursor:pointer;border:2px solid #e0e0e0;border-radius:0px;padding:12px;transition:all 0.2s ease;text-align:center}
    .filter-gemtype-image-label:hover{background:#f5f5f5;border-color:#000}
    .filter-gemtype-image-label input[type="checkbox"]{display:none}
    .filter-gemtype-image-wrapper{display:flex;flex-direction:column;align-items:center;gap:8px}
    .filter-gemtype-icon{width:50px;height:50px;object-fit:contain}
    .filter-gemtype-name{font-size:12px;color:#333;font-weight:500}
    .filter-gemtype-image-label:has(input[type="checkbox"]:checked){background:#f0f0f0;border-color:#000}
    
    /* Style Filter Grid */
    .filter-style-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}
    .filter-style-image-label{display:block;cursor:pointer;border:2px solid #e0e0e0;border-radius:0px;padding:12px;transition:all 0.2s ease;text-align:center}
    .filter-style-image-label:hover{background:#f5f5f5;border-color:#000}
    .filter-style-image-label input[type="checkbox"]{display:none}
    .filter-style-image-wrapper{display:flex;flex-direction:column;align-items:center;gap:8px}
    .filter-style-icon{width:80px;height:80px;object-fit:contain}
    .filter-style-name{font-size:13px;color:#333;font-weight:500}
    .filter-style-image-label:has(input[type="checkbox"]:checked){background:#f0f0f0;border-color:#000}
    
    /* ============================================
       5. PRODUCT CARDS
    ============================================ */
    
    /* Default Card */
    .def-card{background:#fff;border:1px solid #e0e0e0;border-radius:0px;padding:1rem;height:100%;display:flex;flex-direction:column}
    .def-card a{flex:1;display:flex;flex-direction:column;text-decoration:none;color:inherit}
    .def-card img{border-radius:0px;margin-bottom:1rem;width:100%;height:auto}
    
    /* Settings Card */
    .clean-settings-card{background:#ffffff;border:1px solid transparent;overflow:hidden;transition:border-color 0.15s ease;height:100%;display:flex;flex-direction:column;width:100%;max-width:100%}
    .clean-settings-card:hover{box-shadow:0 4px 20px rgba(0,0,0,0.08),0 2px 10px rgba(0,0,0,0.04)}
    .clean-settings-card__link{color:inherit;display:flex;flex-direction:column;height:100%;cursor:pointer}
    .clean-settings-card__image-section{background:#ffffff;position:relative;height:auto}
    .clean-settings-card__image-container{width:100%;aspect-ratio:1/1;display:flex;align-items:center;justify-content:center;background:#ffffff;overflow:hidden;position:relative}
    .clean-settings-card__image{width:100%;height:100%;object-fit:cover;max-width:100%;height:auto}
    .clean-settings-card__content{padding:0px;flex:1;display:flex;flex-direction:column;gap:4px;text-align:center;width:100%;overflow:hidden}
    .clean-settings-card__price{display:flex;align-items:baseline;gap:0px;margin-top:0;padding-top:0px;justify-content:center}
    .clean-settings-card__actions{display:none!important}
    .clean-settings-card__image--secondary{position:absolute;top:0;left:0;width:100%;height:100%;opacity:0;transition:opacity 0.3s ease}
    .clean-settings-card:hover .clean-settings-card__image--secondary{opacity:1}
    .clean-settings-card.no-hover .clean-settings-card__image--secondary{opacity:0!important}
    
    /* Metal Swatches */
    .metal-swatches{display:flex;gap:4px;margin:2px 0;justify-content:center}
    .metal-swatch{position:relative;cursor:pointer;width:20px;height:20px;border-radius:0%;overflow:hidden;border:1px solid #e0e0e0;transition:all 0.2s ease}
    .metal-swatch__image{width:100%;height:100%;object-fit:cover}
    .metal-swatch:hover{transform:scale(1.15);border-color:#000}
    
    /* Gemstone Card */
    .clean-gemstone-card{background:#ffffff;border:1px solid transparent;overflow:hidden;transition:border-color 0.15s ease;height:100%;display:flex;flex-direction:column;width:100%;max-width:100%}
    .clean-gemstone-card:hover{box-shadow:0 4px 20px rgba(0,0,0,0.08),0 2px 10px rgba(0,0,0,0.04)}
    .clean-gemstone-card__link{text-decoration:none;color:inherit;display:flex;flex-direction:column;height:100%}
    .clean-gemstone-card__image-section{position:relative;background:#ffffff}
    .clean-gemstone-card__cert-badge{position:absolute;top:8px;right:8px;background:#000000;color:white;padding:4px 8px;font-size:11px;font-weight:500;z-index:2}
    .clean-gemstone-card__image-container{width:100%;aspect-ratio:1/1;display:flex;align-items:center;justify-content:center;background:#ffffff;overflow:hidden;position:relative}
    .clean-gemstone-card__image{width:100%;height:100%;object-fit:cover;max-width:100%;height:auto}
    .clean-gemstone-card__placeholder{font-size:12px;color:#000000;letter-spacing:0.5px;opacity:0.3}
    .clean-gemstone-card__content{padding:4px;flex:1;display:flex;flex-direction:column;gap:8px;width:100%;overflow:hidden}
    .clean-gemstone-card__title{font-size:18px;font-weight:700;color:#000000;margin:0;line-height:1.3}
    .clean-gemstone-card__specs{display:flex;flex-direction:column;gap:0;margin:0 -20px;padding:0 20px}
    .clean-gemstone-card__price{display:flex;align-items:baseline;gap:8px;margin-top:4px;padding-top:0}
    .clean-gemstone-card__actions{display:grid;grid-template-columns:1fr;gap:8px;width:100%;max-width:100%}
    .clean-gemstone-card__actions .btn-select{display:none!important}
    
    /* Spec Rows */
    .spec-row{display:flex;justify-content:space-between;align-items:center;font-size:13px;padding:10px 20px;margin:0 -20px}
    .spec-row:nth-child(odd){background:#f5f5f5}
    .spec-row:nth-child(even){background:#ffffff}
    .spec-label{color:#000000;flex:0 0 100px;font-weight:600}
    .spec-value{color:#000000;text-align:right;flex:1}
    
    /* Price Styles */
    .price-current{font-size:16px;font-weight:700;color:#000000}
    .price-compare{font-size:13px;color:#000000;text-decoration:line-through;opacity:0.5}
    
    /* Buttons */
    .btn-view,.btn-select{padding:10px 16px;font-size:13px;font-weight:400;cursor:pointer;transition:all 0.15s;border:1px solid #e0e0e0;background:#ffffff;color:#000000;text-align:center}
    .btn-select{background:#000000;color:white;border-color:#000000}
    .btn-view:hover{background:#666666;color:#ffffff}
    .btn-select:hover{background:#ffffff;color:#666666}
    .btn-view{display:none}
    
    /* Gallery */
    .gallery-track{display:flex;transition:transform 0.3s ease;height:100%}
    .gallery-slide{min-width:100%;height:100%;display:flex;align-items:center;justify-content:center}
    .gallery-nav{position:absolute;top:50%;transform:translateY(-50%);background:rgba(255,255,255,0.9);border:1px solid #e0e0e0;width:32px;height:32px;display:flex;align-items:center;justify-content:center;cursor:pointer;opacity:0;transition:opacity 0.2s ease;z-index:1}
    .clean-settings-card__image-container:hover .gallery-nav,
    .clean-gemstone-card__image-container:hover .gallery-nav{opacity:1}
    .gallery-nav:hover{background:#666666;border-color:#666666}
    .gallery-nav:hover svg{color:#ffffff}
    .gallery-nav--prev{left:8px}
    .gallery-nav--next{right:8px}
    .gallery-nav svg{color:#000000}
    
    /* ============================================
       6. PAGINATION
    ============================================ */
    
    .rb-pag{margin-top:2rem;text-align:center;padding:1rem 0;position:relative;z-index:10}
    .rb-pag a,.rb-pag span{padding:.5rem 1rem;margin:0 .25rem;text-decoration:none;color:#000000;border:1px solid #e0e0e0;border-radius:4px;display:inline-block;transition:all .2s}
    .rb-pag .current{background:#000000;color:#fff;border-color:#000000}
    .rb-pag a:hover{border-color:#666666;background:#666666;color:#ffffff}
    
   /* ============================================
   7. MOBILE STYLES
============================================ */

@media (max-width:768px) {
  /* Mobile visibility helpers */
  .mobile-hide{display:none!important}
  .mobile-show{display:inline!important}
  .mobile-hide-block{display:none!important}
  .mobile-show-block{display:block!important}
  
  /* Base mobile resets */
  html, body {
    overflow-x: hidden !important;
    width: 100% !important;
    max-width: 100% !important;
  }
  
  #ring-builder-app {
    width: 100% !important;
    max-width: 100% !important;
    overflow-x: hidden !important;
    padding: 0 !important;
    margin: 0 !important;
    box-sizing: border-box !important;
  }
  
  /* Grid system - properly handle Shopify's 10px padding */
  .ge-grid {
    width: 100% !important;
    max-width: 100% !important;
    margin: 0 !important;
    padding: 0 !important;
    box-sizing: border-box !important;
    overflow: hidden !important;
  }
  
  .ge-grid-m2 {
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
  }
  
  .ge-item {
    width: 100% !important;
    max-width: 100% !important;
    min-width: 0 !important;
    box-sizing: border-box !important;
    overflow: hidden !important; /* Only hide horizontal */
  }
  
  /* Filter bar */
  .desktop-only{display:none!important}
  .shape-and-carat-container{display:block;width:100%;max-width:100%}
  
  /* Shape filter bar */
  .shape-filter-bar {
    width: 100% !important;
    max-width: 100% !important;
    margin: 0 0 16px 0 !important;
    padding: 10px 0 !important;
    box-sizing: border-box !important;
    overflow: hidden;
    background: #fff;
    box-shadow: 0 1px 3px rgba(0,0,0,.1);
  }
  
  .shape-filter-wrapper {
    width: 100% !important;
    position: relative;
    overflow: hidden !important;
    margin: 0 !important
  }
  
  .shape-filter-container {
    display: flex;
    gap: 6px;
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: none;
    -ms-overflow-style: none;
    -webkit-overflow-scrolling: touch;
    padding: 0 0px; /* Match Shopify padding */
    margin:0 !important
  }
  
  .shape-filter-container::-webkit-scrollbar{display:none}
  .shape-scroll-arrow{display:none}
  
  .shape-filter-item{
    min-width: 52px;
    padding: 6px 2px;
    flex-shrink: 0;
    margin:0 !important;
  }
  
  .shape-icon{width:32px;height:32px}
  .shape-label{font-size:9px;line-height:1.2}
  
  /* Mobile more filters button */
  .mobile-more-filters-container {
    display: block;
    width: 100% !important;
    padding: 8px 0 16px 0 !important;
    margin: 0 !important;
  }
  
  .mobile-more-filters-container .filter-modal-trigger {
    width: 100% !important;
    margin: 0 !important;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 10px 16px;
    background: #fff;
    border: 1px solid #000;
    color: #000;
    font-size: 12px;
    font-weight: 500;
    transition: all 0.2s ease;
  }
  
  .mobile-more-filters-container .filter-modal-trigger svg{
    width: 16px;
    height: 16px;
    stroke: #000;
    flex-shrink: 0;
  }
  
  .mobile-more-filters-container .filter-modal-trigger span{
    font-size: 12px !important;
    font-weight: 500 !important;
  }
  
  /* Results/sort container */
  .shape-filter-bar + div {
    width: 100% !important;
    margin: 0 0 12px 0 !important;
    padding: 0 !important;
  }
  
  /* Result count and sort dropdown */
  .f-cnt {
    font-size: 11px !important;
  }
  
  .sort-container {
    max-width: 45%;
  }
  
  .sort-dropdown {
    width: 100%;
    max-width: 100%;
    min-width: 120px;
    font-size: 11px;
    padding: 6px 8px;
  }
  
  /* Product cards */
  .clean-settings-card,
  .clean-gemstone-card {
    width: 100% !important;
    max-width: 100% !important;
    box-sizing: border-box !important;
    overflow-x: hidden !important; /* Only hide horizontal overflow */
    overflow-y: visible !important; /* Allow vertical expansion */
    border: 0px solid #e0e0e0;
  }
  
  .clean-gemstone-card__image-section {
    display: block !important;
    position: relative !important;
    height: 0 !important;
    padding: 0 !important; /* Reset all padding first */
    padding-bottom: 100% !important; /* Then set padding-bottom */
    min-height: 0 !important;
    max-height: none !important;
    margin: 0 !important;
    line-height: 0 !important;
    font-size: 0 !important;
    overflow: hidden !important;
  }
  .clean-gemstone-card__image-section .clean-gemstone-card__image-container {
    position: absolute !important;
    top: 0 !important;
    left: 0 !important;
    right: 0 !important;
    bottom: 0 !important;
  }
  /* Image container */
  .clean-settings-card__image-container,
  .clean-gemstone-card__image-container {
    aspect-ratio: 1/1;
    width: 100%;
    overflow-x: auto;
    overflow-y: hidden;
    -webkit-overflow-scrolling: touch;
    scroll-snap-type: x mandatory;
    scrollbar-width: none;
    -ms-overflow-style: none;
  }
  
  .clean-settings-card__image-container::-webkit-scrollbar,
  .clean-gemstone-card__image-container::-webkit-scrollbar{display:none}
  
  /* Gallery track and slide */
  .gallery-track {
    display: flex;
    height: 100%;
    scroll-snap-type: x mandatory;
  }
  
  .gallery-slide {
    min-width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    scroll-snap-align: start;
  }
  
  /* The actual images */
  .clean-settings-card__image,
  .clean-gemstone-card__image {
    width: 100% !important;
    height: 100% !important;
    object-fit: cover !important;
    display: block !important;
  }
  
  /* Settings card content */
  .clean-settings-card__content {
    padding: 8px;
    gap: 2px;
  }
  
  .clean-settings-card__title {
    font-size: 12px !important;
    line-height: 1.3 !important;
    margin: 0 0 4px 0 !important;
  }
  
  .clean-settings-card__price {
    font-size: 13px !important;
    margin-top: 0px !important;
  }
  
  /* Gemstone card content */
  .clean-gemstone-card__content {
    padding: 0px 0 0px 0;
    gap: 2px;
    flex: 1;
    min-height: auto !important; /* Allow natural height */
    overflow: visible !important; /* Don't clip content */
  }
  
  .clean-gemstone-card__title {
    font-size: 14px !important;
    font-weight: 600 !important;
    line-height: 1.3 !important;
    padding: 0 12px;
    margin: 0 0 8px 0 !important;
  }
  
  .clean-gemstone-card__cert-badge {
    position: absolute !important;
    z-index: 10 !important; /* ADD THIS - ensure it's above the image */
    font-size: 10px !important; /* Increase slightly */
    padding: 4px 8px !important; /* More padding */
    top: 8px !important;
    right: 8px !important;
    white-space: nowrap !important; /* ADD THIS - prevent text wrapping */
    line-height: 1.2 !important; /* ADD THIS - proper line height */
    border-radius: 2px; /* Optional - slight rounding */
  }
  /* Gemstone specs */
  .clean-gemstone-card__specs {
    display: flex;
    flex-direction: column;
    gap: 0;
    margin: 0;
    padding: 0;
  }
  .spec-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 11px;
    padding: 0 12px !important; /* No vertical padding */
    margin: 0 !important;
    min-height: 32px; /* Set a fixed height instead */
  }
  .spec-row:nth-child(odd) {
    background: #f5f5f5;
  }
  
  .spec-row:nth-child(even) {
    background: #ffffff;
  }
  
  .spec-label {
    font-weight: 600;
    font-size: 11px;
  }
  
  .spec-value {
    font-size: 11px;
  }
  
  /* Gemstone card price */
  .clean-gemstone-card__price {
    padding: 0 0px;
    margin: 0px !important;
  }
  
  .price-current {
    font-size: 14px !important;
    font-weight: 600 !important;
  }
  
  .price-compare {
    font-size: 11px !important;
  }
    
  .metal-swatch {
    width: 16px !important;
    height: 16px !important;
    min-width: 16px !important;
    max-width: 16px !important;  /* Add this */
    max-height: 16px !important; /* Add this */
    flex: 0 0 16px;
    border-radius: 0;
    overflow: hidden;
    transition: all 0.2s ease;
    position: relative;  /* Add this */
  }
  .metal-swatches {
    flex: 0 0 auto !important;  /* Override the flex: 1 1 100% */
    height: auto !important;     /* Let height be determined by content */
    margin:0 !important
  }
  .metal-swatch__image {
    position: absolute;  /* Add this */
    top: 50%;           /* Center vertically */
    left: 50%;          /* Center horizontally */
    transform: translate(-50%, -50%);  /* Perfect center */
    width: auto !important;   /* Let it scale */
    height: 100% !important;  /* Fill height */
    max-width: none !important;  /* Allow width to extend */
    object-fit: cover;
  }
  /* Gallery navigation */
  .gallery-nav{display:none}
  
  /* Filter modal */
  .filter-modal {
    width: 100vw !important;
    max-width: 100vw !important;
    height: 100%;
    right: -100vw !important;
    display: flex;
    flex-direction: column;
    top: 0 !important;
    padding: 0 !important;
  }
  
  .filter-modal.active{right:0!important}
  
  .filter-modal-trigger {
    padding: 8px 12px;
    font-size: 11px;
  }
  
  .filter-modal-trigger span{display:inline-block}
  
  /* Modal header */
  .filter-modal-header {
    height: 40px !important;
    max-height: 40px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: space-between !important;
    padding: 8px 12px !important;
    border-bottom: 1px solid #e0e0e0;
    flex-shrink: 0;
  }
  
  .filter-modal-header h2 {
    font-size: 14px;
    font-weight: 600;
    margin: 0;
  }
  
  .filter-modal-close {
    padding: 4px;
    width: 24px;
    height: 24px;
  }
  
  .filter-modal-close svg{width:16px;height:16px}
  
  /* Modal body */
  .filter-modal-body {
    flex: 1 1 auto !important;
    overflow-y: auto !important;
    padding: 12px;
    height: calc(100vh - 88px);
  }
  
  .filter-section {
    margin-bottom: 16px;
    padding-bottom: 12px;
    border-bottom: 1px solid #f0f0f0;
  }
  
  .filter-section:last-child{border-bottom:none}
  
  .filter-section-title {
    font-size: 12px;
    font-weight: 600;
    margin: 0 0 8px 0;
  }
  
  /* Modal footer */
  .filter-modal-footer {
    padding: 8px;
    gap: 6px;
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    background: #fff;
    border-top: 1px solid #e0e0e0;
    z-index: 10;
    display: flex;
  }
  
  .filter-clear-btn,
  .filter-apply-btn {
    padding: 8px 12px;
    font-size: 11px;
    font-weight: 500;
    flex: 1;
  }
  
  /* Filter elements in modal */
  .filter-shapes-grid {
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
  }
  
  .filter-shape-image-label {
    padding: 6px 4px;
    border: 1px solid #e0e0e0;
  }
  
  .filter-shape-icon{width:24px;height:24px}
  .filter-shape-name{font-size:8px;margin-top:2px}
  
  .filter-checkbox-label {
    padding: 6px 8px;
    font-size: 11px;
    gap: 6px;
  }
  
  .filter-checkbox-custom {
    width: 14px;
    height: 14px;
    border-width: 1.5px;
  }
  
  .carat-input,
  .price-input {
    padding: 6px 8px;
    font-size: 11px;
  }
  
  .carat-quick-btn {
    padding: 4px 6px;
    font-size: 10px;
  }
  
  .filter-options{gap:6px}
  .filter-shape-image-wrapper{gap:2px}
  .carat-range-inputs,.price-range-inputs{gap:6px;margin-bottom:8px}
  .carat-separator,.price-separator{font-size:11px}
  .carat-quick-options{gap:4px}
  
  /* Metal filter */
  .metal-filter-swatches{gap:10px}
  .metal-filter-image{width:28px;height:28px;margin-bottom:4px}
  .metal-filter-label{font-size:9px}
  
  /* Gemstone type filter */
  .filter-gemtype-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 6px;
  }
  
  .filter-gemtype-image-label{padding:6px}
  .filter-gemtype-icon{width:30px;height:30px}
  .filter-gemtype-name{font-size:9px}
  
  /* Style filter */
  .filter-style-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 6px;
  }
  
  .filter-style-image-label{padding:6px}
  .filter-style-icon{width:26px;height:26px}
  .filter-style-name{font-size:10px}
  
  /* Buttons */
  .btn-view,
  .btn-select {
    font-size: 11px !important;
    padding: 8px 12px !important;
  }
  
  /* Pagination */
  .rb-pag {
    margin-top: 16px !important;
    padding: 8px 0 !important;
  }
  
  .rb-pag a,
  .rb-pag span {
    padding: 6px 10px !important;
    font-size: 11px !important;
    margin: 0 2px !important;
  }
  
  /* Filter count - hide on mobile */
  .f-cnt {
    display: none !important;
  }
  
  /* Standalone filter button */
  .filter-bar-minimal {
    margin-bottom: 16px;
  }
  
  .filter-modal-trigger-standalone {
    font-size: 12px;
    padding: 10px 16px;
  }
}

@media(max-width:749px){
  .ge-grid-m1{grid-template-columns:1fr}
  .ge-grid-m2{grid-template-columns:repeat(2,1fr);gap:10px}
  
  /* Steps table adjustments */
  .rb-steps-table{flex-direction:column;gap:8px;padding:8px}
  .rb-step-col:not(:last-child)::after{display:none}
  .rb-step-col{border-bottom:1px solid #e0e0e0;padding-bottom:6px}
  .rb-step-col:last-child{border:none;padding-bottom:0}
  .rb-step-product{min-height:36px}
  .rb-step-empty{padding:6px}
  .rb-step-empty span{font-size:10px}
  .rb-step-label{margin-bottom:4px;font-size:10px}
  .rb-step-img{width:40px;height:40px;margin-bottom:0}
  .rb-step-filled{display:flex;align-items:center;gap:6px;flex-direction:row}
  .rb-step-details{text-align:left;flex:1}
  .rb-step-name{-webkit-line-clamp:1;font-size:11px}
  .rb-step-price{margin-bottom:0;font-size:11px}
  .rb-step-btn{padding:4px 8px;font-size:9px}
  .rb-step-actions{margin-top:0;margin-left:auto;flex-shrink:0;justify-content:flex-end;gap:4px}
  .rb-preview-btn{width:100%;margin-top:0;padding:8px 16px;font-size:11px}
}

@media(min-width:769px){
  .mobile-more-filters-container{display:none!important}
}
      `;
    }

// JavaScript Generation
function getRingBuilderJS(hasGems, hasSets, shop, currencyCode = 'AED', moneyFormat = '{{amount}}') {
  return `
    (function() {
      'use strict';
      
      // Ring Builder Application
      window.RBA = {
        // State management
        st: {
          sg: '',
          ss: '',
          sv: '',
          pp: '',
          cs: 1,
          ct: '${hasGems}' === 'true' ? 'g' : 's',
          ig: '${hasGems}' === 'true',
          is: '${hasSets}' === 'true',
          af: {},
          fo: {},
          pc: 0,
          vc: 0,
          cp: 1,
          ppp: ${PRODUCTS_PER_PAGE},
          tp: 1,
          gc: null,
          gsh: null, // gemstone shape (for filtering settings)
          ssh: null, // setting compatible shape (for filtering diamonds)
          sr: null,
          vi: {},
          currency: '${currencyCode}',
          moneyFormat: '${moneyFormat}',
          sortBy: '', // ADD THIS LINE
        },
        
        // Initialize the application
        // Add this at the beginning of the init() function
        init() {
          console.log('RBA.init() called');
          console.log('Products in DOM:', document.querySelectorAll('.ge-item').length);

          // DEBUG: Log all product metafield data
          console.log('=== PRODUCT METAFIELD DEBUG ===');
          document.querySelectorAll('.ge-item').forEach((el, i) => {
            if (i < 5) { // Only log first 5 products
              console.log('Product ' + (i+1) + ':', {
                id: el.dataset.productId,
                type: el.dataset.productType,
                shape: el.dataset.shape,
                color: el.dataset.color,
                clarity: el.dataset.clarity,
                diamondType: el.dataset.diamondType,
                carat: el.dataset.carat,
                cut: el.dataset.cut,
                polish: el.dataset.polish,
                symmetry: el.dataset.symmetry,
                fluorescence: el.dataset.fluorescence,
                metal: el.dataset.metal
              });
            }
          });
          console.log('=== END METAFIELD DEBUG ===');

          this.parseUrlParams();
          console.log('URL params parsed:', this.st);

          this.setupState();
          console.log('State setup complete');

          this.initializeUI();
          console.log('UI initialized');

          this.bindEvents();
          console.log('Events bound');

          console.log('Init complete - visible products:', document.querySelectorAll('.ge-item:not(.hidden)').length);
        },
                
        // Parse URL parameters
        parseUrlParams() {
          const u = new URLSearchParams(location.search);
          this.st.sg = u.get('gemstone') || '';
          this.st.ss = u.get('setting') || '';
          this.st.sv = u.get('setting_variant') || '';
          this.st.cp = parseInt(u.get('page')) || 1;
          
          // ADD THIS LINE
          this.st.sortBy = u.get('sort') || '';
          
          // Extract carat weight and shape from gemstone parameter
          if (this.st.sg) {
            // Handle formats like "8-02ct" or "8-02-ct" or "8_02ct"
            console.log('Attempting carat extraction from:', this.st.sg);
            const caratMatch = this.st.sg.match(/(\\d+)[-_](\\d+)[-_]?ct/i);
            console.log('Carat regex match result:', caratMatch);
            if (caratMatch) {
              const caratValue = parseFloat(caratMatch[1] + '.' + caratMatch[2]);
              console.log('Parsed carat value:', caratValue);
              if (caratValue > 0) {
                this.st.gc = caratValue;
                console.log('Extracted gemstone carat from handle:', this.st.gc);
              }
            } else {
              console.log('Carat regex did NOT match');
            }

            // Extract shape from gemstone handle
            const knownShapes = ['round', 'oval', 'pear', 'emerald', 'cushion', 'princess', 'marquise', 'radiant', 'asscher', 'heart'];
            const handleLower = this.st.sg.toLowerCase();
            for (const shape of knownShapes) {
              if (handleLower.includes(shape)) {
                this.st.gsh = shape.charAt(0).toUpperCase() + shape.slice(1);
                console.log('Extracted gemstone shape from handle:', this.st.gsh);
                break;
              }
            }
          }
          
          // Extract shape from setting handle (for filtering diamonds by compatible shape)
          if (this.st.ss) {
            const knownShapes = ['round', 'oval', 'pear', 'emerald', 'cushion', 'princess', 'marquise', 'radiant', 'asscher', 'heart'];
            const settingHandleLower = this.st.ss.toLowerCase();
            for (const shape of knownShapes) {
              if (settingHandleLower.includes(shape)) {
                this.st.ssh = shape.charAt(0).toUpperCase() + shape.slice(1);
                console.log('Extracted setting compatible shape from handle:', this.st.ssh);
                break;
              }
            }
          }

          // Load setting variant info
          if (this.st.sv && this.st.ss) {
            this.loadSettingVariantInfo();
          }
          
          // Parse filter parameters
          u.forEach((value, key) => {
            if (key.startsWith('filter_')) {
              this.st.af[key.replace('filter_', '')] = value.split(',');
            }
          });
          
          // ADD THIS - Set the dropdown value if sort parameter exists
          setTimeout(() => {
            const sortDropdown = document.getElementById('product-sort');
            if (sortDropdown && this.st.sortBy) {
              sortDropdown.value = this.st.sortBy;
            }
          }, 100);
        },
        
        // Setup initial state
        setupState() {
          // Determine current step
          if (this.st.sg && this.st.ss) {
            this.st.cs = 3;
          } else if ((this.st.ig && !this.st.sg) || (this.st.is && !this.st.ss)) {
            this.st.cs = 1;
          } else {
            this.st.cs = 2;
          }
          
          // Build URL parameters
          this.buildUrlParams();
          
          // Add active class to body
          document.body.classList.add('rb-active');
        },
        
        // Initialize UI components
        initializeUI() {
          const isSettingsPage = location.pathname.includes('setting');

          // Always initialize filters immediately
          this.checkPendingAutoFilter();
          this.initializeFilters();

          // Load variant data in parallel for settings pages
          if (isSettingsPage) {
            this.smartLoadVariantData();
          }
          this.updateContextBanner();
          this.updateShapeFilterStates();

          // Apply initial filters/sorting if needed
          const needsFiltering = Object.keys(this.st.af).length || this.st.gc || this.st.gsh || this.st.ssh || this.st.sr || this.st.sortBy;
          if (needsFiltering) {
            setTimeout(() => {
              this.applyFilters();
            }, 200);
          }

          // Watch for DOM changes
          this.setupMutationObserver();
        },
        // Bind event handlers
        // Bind event handlers
        bindEvents() {
          // Filter menu clicks
          document.addEventListener('click', this.handleDocumentClick.bind(this));
          document.addEventListener('change', this.handleFilterChange.bind(this));
          
          // Product card interactions
          this.bindProductCardEvents();
          
          // Gallery interactions
          this.bindGalleryEvents();
          
          // Add this line to bind swatch events
          this.bindSwatchEvents();
          
          // Shape filter clicks
          document.addEventListener('click', (e) => {
            const shapeItem = e.target.closest('.shape-filter-item');
            if (!shapeItem) return;
            
            const shape = shapeItem.dataset.shape;
            
            // Toggle active state
            shapeItem.classList.toggle('active');
            
            // Update filter state
            if (!this.st.af.shape) {
              this.st.af.shape = [];
            }
            
            if (shapeItem.classList.contains('active')) {
              if (!this.st.af.shape.includes(shape)) {
                this.st.af.shape.push(shape);
              }
            } else {
              this.st.af.shape = this.st.af.shape.filter(s => s !== shape);
              if (this.st.af.shape.length === 0) {
                delete this.st.af.shape;
              }
            }
            
            // Apply filters
            this.st.cp = 1;
            this.applyFilters();
            this.updateUrl();
          });
          
          // Carat filter clicks
          document.addEventListener('click', (e) => {
            const caratBtn = e.target.closest('.carat-filter-btn');
            if (!caratBtn) return;
            
            const min = parseFloat(caratBtn.dataset.caratMin);
            const max = parseFloat(caratBtn.dataset.caratMax);
            
            // Toggle active state
            caratBtn.classList.toggle('active');
            
            // Update filter state
            if (!this.st.af['carat-range']) {
              this.st.af['carat-range'] = [];
            }
            
            const rangeStr = min + '-' + (max === Infinity ? '999' : max);
            
            if (caratBtn.classList.contains('active')) {
              if (!this.st.af['carat-range'].includes(rangeStr)) {
                this.st.af['carat-range'].push(rangeStr);
              }
            } else {
              this.st.af['carat-range'] = this.st.af['carat-range'].filter(r => r !== rangeStr);
              if (this.st.af['carat-range'].length === 0) {
                delete this.st.af['carat-range'];
              }
            }
            
            // Apply filters
            this.st.cp = 1;
            this.applyFilters();
            this.updateUrl();
          });
          
          // Initialize shape scroll arrows
          this.initializeShapeScrollArrows();
          
          // Steps banner initialization
          this.bindFilterModalEvents();
          const sortDropdown = document.getElementById('product-sort');
          if (sortDropdown) {
            sortDropdown.addEventListener('change', (e) => {
              this.st.sortBy = e.target.value;
              this.st.cp = 1; // Reset to first page
              this.applyFilters();
              this.updateUrl();
            });
          }
        },
        // Add these methods to your RBA object
        // Replace the bindFilterModalEvents() method with this corrected version:

        bindFilterModalEvents() {
          const triggers = document.querySelectorAll('.filter-modal-trigger'); // Changed from querySelector to querySelectorAll
          const overlay = document.querySelector('.filter-modal-overlay');
          const modal = document.querySelector('.filter-modal');
          const closeBtn = document.querySelector('.filter-modal-close');
          const clearBtn = document.querySelector('.filter-clear-btn');
          const applyBtn = document.querySelector('.filter-apply-btn');
          
          if (!triggers.length || !modal) return; // Changed to check triggers.length
          
          // Open modal - bind to ALL trigger buttons
          triggers.forEach(trigger => {
            trigger.addEventListener('click', () => {
              this.openFilterModal();
            });
          });
          
          // Close modal
          if (overlay) {
            overlay.addEventListener('click', () => {
              this.closeFilterModal();
            });
          }
          
          if (closeBtn) {
            closeBtn.addEventListener('click', () => {
              this.closeFilterModal();
            });
          }
          
          // Clear filters
          if (clearBtn) {
            clearBtn.addEventListener('click', () => {
              this.clearModalFilters();
            });
          }
          
          // Apply filters
          if (applyBtn) {
            applyBtn.addEventListener('click', () => {
              this.applyModalFilters();
            });
          }
          
          // Initialize filter options
          this.populateFilterOptions();
          this.bindFilterInputs();
        },

        openFilterModal() {
          const overlay = document.querySelector('.filter-modal-overlay');
          const modal = document.querySelector('.filter-modal');
          
          overlay.classList.add('active');
          modal.classList.add('active');
          document.body.style.overflow = 'hidden';
          
          // Sync current filters to modal
          this.syncFiltersToModal();
        },

        closeFilterModal() {
          const overlay = document.querySelector('.filter-modal-overlay');
          const modal = document.querySelector('.filter-modal');
          
          overlay.classList.remove('active');
          modal.classList.remove('active');
          document.body.style.overflow = '';
        },

        populateFilterOptions() {
          const products = document.querySelectorAll('.ge-item');
          const filters = {
            color: new Set(),
            origin: new Set(),
            certification: new Set(),
            treatment: new Set(),
            metal: new Set(),
            style: new Set(),
            'gemstone-type': new Set()
          };
          
          // Helper to normalize metal type (extract metal name without karat prefix)
          function normalizeMetal(metal) {
            if (!metal) return '';
            // Match metal types with optional karat prefix
            const match = metal.match(/(White Gold|Yellow Gold|Rose Gold|White & Yellow Gold|White & Rose Gold|Yellow & Rose Gold|Platinum)/i);
            console.log('METAL DEBUG - Raw:', metal, '| Normalized:', match ? match[0] : metal);
            return match ? match[0] : metal;
          }

          console.log('=== METAL FILTER DEBUG ===');
          console.log('Total products:', products.length);

          products.forEach(product => {
            if (product.dataset.color) filters.color.add(product.dataset.color);
            if (product.dataset.origin) filters.origin.add(product.dataset.origin);
            if (product.dataset.certification) filters.certification.add(product.dataset.certification);
            if (product.dataset.treatment) filters.treatment.add(product.dataset.treatment);
            if (product.dataset.metal) {
              console.log('Product metal attr:', product.dataset.metal, '| Product:', product.dataset.productId);
              const normalizedMetal = normalizeMetal(product.dataset.metal);
              if (normalizedMetal) filters.metal.add(normalizedMetal);
            }
            if (product.dataset.style) filters.style.add(product.dataset.style);
            if (product.dataset.gemstoneType) filters['gemstone-type'].add(product.dataset.gemstoneType);
          });

          console.log('Collected metal types:', Array.from(filters.metal));
          console.log('=== END METAL DEBUG ===');
          
          // Render filter options
          // In populateFilterOptions(), add special handling for metal:
          // In populateFilterOptions(), update the metal filter section:
          Object.entries(filters).forEach(([filterType, values]) => {
            const container = document.getElementById(filterType + '-options');
            if (container) {
              // Special handling for gemstone type - show as icons
              if (filterType === 'gemstone-type' && ${hasGems}) {
                const gemstoneTypeIcons = {
                  'Blue Sapphire': 'Blue Sapphire Icon.png',
                  'Ruby': 'Ruby Icon.png',
                  'Emerald': 'Emerald Icon.png',
                  'Diamond': 'Diamond Icon.png',
                  'Pink Sapphire': 'Pink Sapphire Icon.png',
                  'Yellow Sapphire': 'Yellow Sapphire Icon.png',
                  'Purple Sapphire': 'Purple Sapphire Icon.png',
                  'Green Sapphire': 'Green Sapphire Icon.png',
                  'Tanzanite': 'Tanzanite Icon.png',
                  'Green Tourmaline': 'Green Tourmaline Icon.png',
                  'Orange Tourmaline': 'Orange Tourmaline Icon.png',
                  'Paraiba Tourmaline': 'Paraiba Tourmaline Icon.png',
                  'Black Diamond': 'Black Diamond Icon.png'
                };
                
                container.innerHTML = Array.from(values).sort().map(gemType => {
                  const iconFile = gemstoneTypeIcons[gemType];
                  if (iconFile) {
                    return '<label class=\\"filter-gemtype-image-label gemtype-option\\" data-gemtype=\\"' + gemType + '\\">' +
                      '<input type=\\"checkbox\\" class=\\"filter-checkbox\\" value=\\"' + gemType + '\\" data-filter=\\"gemstone-type\\">' +
                      '<div class=\\"filter-gemtype-image-wrapper\\">' +
                        '<img src=\\"https://pub-da29e7d7020a43b19575bf42b3247b0a.r2.dev/' + iconFile + '\\" alt=\\"' + gemType + '\\" class=\\"filter-gemtype-icon\\">' +
                        '<span class=\\"filter-gemtype-name\\">' + gemType + '</span>' +
                      '</div>' +
                    '</label>';
                  } else {
                    return '<label class=\\"filter-checkbox-label\\">' +
                      '<input type=\\"checkbox\\" class=\\"filter-checkbox\\" value=\\"' + gemType + '\\" data-filter=\\"gemstone-type\\">' +
                      '<span class=\\"filter-checkbox-custom\\"></span>' +
                      '<span>' + gemType + '</span>' +
                    '</label>';
                  }
                }).join('');
              }
              // Special handling for style filter - show as icons
              else if (filterType === 'style' && ${hasSets}) {
                const styleIcons = {
                  'Solitaire': 'Solitaire Icon.png',
                  'Halo': 'Halo.png',
                  'Side Stones': 'Side Stones Icon.png',
                  'Trilogy': 'Trilogy Icon.png',
                  'Double': 'Double.png'
                };
                
                container.innerHTML = Array.from(values).sort().map(style => {
                  const iconFile = styleIcons[style];
                  if (iconFile) {
                    return '<label class=\\"filter-style-image-label style-option\\" data-style=\\"' + style + '\\">' +
                      '<input type=\\"checkbox\\" class=\\"filter-checkbox\\" value=\\"' + style + '\\" data-filter=\\"style\\">' +
                      '<div class=\\"filter-style-image-wrapper\\">' +
                        '<img src=\\"https://pub-da29e7d7020a43b19575bf42b3247b0a.r2.dev/' + iconFile + '\\" alt=\\"' + style + '\\" class=\\"filter-style-icon\\">' +
                        '<span class=\\"filter-style-name\\">' + style + '</span>' +
                      '</div>' +
                    '</label>';
                  } else {
                    return '<label class=\\"filter-checkbox-label\\">' +
                      '<input type=\\"checkbox\\" class=\\"filter-checkbox\\" value=\\"' + style + '\\" data-filter=\\"style\\">' +
                      '<span class=\\"filter-checkbox-custom\\"></span>' +
                      '<span>' + style + '</span>' +
                    '</label>';
                  }
                }).join('');
              }
              // Special handling for metal type - show as image swatches (dynamic based on collection)
              else if (filterType === 'metal' && ${hasSets}) {
                const metalImages = {
                  'White Gold': 'https://pub-da29e7d7020a43b19575bf42b3247b0a.r2.dev/white-gold.png',
                  'Yellow Gold': 'https://pub-da29e7d7020a43b19575bf42b3247b0a.r2.dev/yellow-gold.png',
                  'Rose Gold': 'https://pub-da29e7d7020a43b19575bf42b3247b0a.r2.dev/18-rose-gold-icon.png',
                  'Platinum': 'https://pub-da29e7d7020a43b19575bf42b3247b0a.r2.dev/platinum.png',
                  'White & Yellow Gold': 'https://pub-da29e7d7020a43b19575bf42b3247b0a.r2.dev/white-yellow-gold.png',
                  'White & Rose Gold': 'https://pub-da29e7d7020a43b19575bf42b3247b0a.r2.dev/white-rose-gold.png'
                };

                container.innerHTML =
                  '<div class=\\"metal-filter-swatches\\">' +
                    Array.from(values).sort().map(metal => {
                      const image = metalImages[metal];
                      if (image) {
                        return '<label class=\\"metal-filter-swatch\\">' +
                          '<input type=\\"radio\\" name=\\"metal-filter\\" class=\\"filter-checkbox\\" value=\\"' + metal + '\\" data-filter=\\"metal\\">' +
                          '<div class=\\"metal-filter-image\\">' +
                            '<img src=\\"' + image + '\\" alt=\\"' + metal + '\\">' +
                          '</div>' +
                          '<span class=\\"metal-filter-label\\">' + metal + '</span>' +
                        '</label>';
                      } else {
                        return '<label class=\\"metal-filter-swatch\\">' +
                          '<input type=\\"radio\\" name=\\"metal-filter\\" class=\\"filter-checkbox\\" value=\\"' + metal + '\\" data-filter=\\"metal\\">' +
                          '<div class=\\"metal-filter-image metal-filter-text\\">' +
                            '<span>' + metal + '</span>' +
                          '</div>' +
                          '<span class=\\"metal-filter-label\\">' + metal + '</span>' +
                        '</label>';
                      }
                    }).join('') +
                  '</div>';
              } else if (values.size > 0) {
                // Regular population for other filters
                container.innerHTML = Array.from(values).sort().map(value => 
                  '<label class=\\"filter-checkbox-label\\">' +
                    '<input type=\\"checkbox\\" class=\\"filter-checkbox\\" value=\\"' + value + '\\" data-filter=\\"' + filterType + '\\">' +
                    '<span class=\\"filter-checkbox-custom\\"></span>' +
                    '<span>' + value + '</span>' +
                '</label>'
                ).join('');
              }
            }
          });
          },
        bindFilterInputs() {
          // Carat quick buttons - allow multiple selections like checkboxes
          document.querySelectorAll('.carat-quick-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
              const min = parseFloat(e.target.dataset.min);
              const max = parseFloat(e.target.dataset.max);
              
              // Toggle active state
              e.target.classList.toggle('active');
              
              // Update the input fields to show the range if only one is selected
              const activeButtons = document.querySelectorAll('.carat-quick-btn.active');
              if (activeButtons.length === 1) {
                document.getElementById('carat-min').value = min;
                document.getElementById('carat-max').value = max === 999 ? '' : max;
              } else if (activeButtons.length === 0) {
                document.getElementById('carat-min').value = '';
                document.getElementById('carat-max').value = '';
              }
            });
          });
          
          // When manual input changes, deselect quick buttons
          ['carat-min', 'carat-max'].forEach(id => {
            const input = document.getElementById(id);
            if (input) {
              input.addEventListener('input', () => {
                document.querySelectorAll('.carat-quick-btn').forEach(btn => {
                  btn.classList.remove('active');
                });
              });
            }
          });
        },

        syncFiltersToModal() {
          // Sync shape filters
          document.querySelectorAll('.filter-modal .shape-option').forEach(label => {
            const shape = label.dataset.shape;
            const checkbox = label.querySelector('input');
            if (this.st.af.shape && this.st.af.shape.includes(shape)) {
              checkbox.checked = true;
            }
          });
          
          // Sync gemstone type filters
          document.querySelectorAll('.filter-modal .gemtype-option').forEach(label => {
            const gemtype = label.dataset.gemtype;
            const checkbox = label.querySelector('input');
            if (this.st.af['gemstone-type'] && this.st.af['gemstone-type'].includes(gemtype)) {
              checkbox.checked = true;
            }
          });
          
          // Sync other filters
          Object.entries(this.st.af).forEach(([filterType, values]) => {
            values.forEach(value => {
              if (filterType === 'metal') {
                // For radio buttons
                const radio = document.querySelector('input[name="metal-filter"][value="' + value + '"]');
                if (radio) radio.checked = true;
              } else if (filterType !== 'shape' && filterType !== 'gemstone-type') {
                // For checkboxes (excluding shape and gemstone-type which are handled separately)
                const checkbox = document.querySelector('input[data-filter="' + filterType + '"][value="' + value + '"]');
                if (checkbox) checkbox.checked = true;
              }
            });
          });
          
          // Sync carat range
          if (this.st.af['carat-range'] && this.st.af['carat-range'].length > 0) {
            // If multiple ranges selected, find the overall min/max
            let overallMin = 999;
            let overallMax = 0;
            
            this.st.af['carat-range'].forEach(range => {
              const parts = range.split('-');
              const min = parseFloat(parts[0]);
              const max = parseFloat(parts[1]);
              
              if (min < overallMin) overallMin = min;
              if (max > overallMax) overallMax = max;
            });
            
            // Set the input values
            if (overallMin < 999) {
              document.getElementById('carat-min').value = overallMin;
            }
            if (overallMax > 0) {
              document.getElementById('carat-max').value = overallMax === 999 ? '' : overallMax;
            }
            
            // Highlight matching quick buttons
            document.querySelectorAll('.carat-quick-btn').forEach(btn => {
              const btnMin = parseFloat(btn.dataset.min);
              const btnMax = parseFloat(btn.dataset.max);
              const rangeStr = btnMin + '-' + (btnMax === 999 ? '999' : btnMax);
              if (this.st.af['carat-range'].includes(rangeStr)) {
                btn.classList.add('active');
              }
            });
          }
          
          // Sync price range  
          if (this.st.af['price-range'] && this.st.af['price-range'].length > 0) {
            const priceRange = this.st.af['price-range'][0].split('-');
            const min = priceRange[0];
            const max = priceRange[1];
            document.getElementById('price-min').value = min;
            document.getElementById('price-max').value = max === '999999' ? '' : max;
          }
        },
        clearModalFilters() {
          // Clear all checkboxes
          document.querySelectorAll('.filter-modal .filter-checkbox').forEach(cb => {
            cb.checked = false;
          });
          
          // Clear radio buttons
          document.querySelectorAll('.filter-modal input[type="radio"]').forEach(radio => {
            radio.checked = false;
          });
          
          // Clear input fields
          document.querySelectorAll('.carat-input, .price-input').forEach(input => {
            input.value = '';
          });
          
          // Remove active states from carat quick buttons
          document.querySelectorAll('.carat-quick-btn').forEach(btn => {
            btn.classList.remove('active');
          });
        },
        applyModalFilters() {
            try {
                // Start with existing filters to preserve everything
                const newFilters = { ...this.st.af };
                
                // Clear filters that the modal controls
                delete newFilters.shape;
                delete newFilters.color;
                delete newFilters.origin;
                delete newFilters.certification;
                delete newFilters.treatment;
                delete newFilters.metal;
                delete newFilters.style;
                delete newFilters['carat-range'];
                delete newFilters['price-range'];
                
                // Shape filters
                document.querySelectorAll('.filter-modal .shape-option input:checked').forEach(cb => {
                    if (!newFilters.shape) newFilters.shape = [];
                    newFilters.shape.push(cb.value);
                });
                
                // Other checkbox filters
                document.querySelectorAll('.filter-modal .filter-checkbox:checked').forEach(cb => {
                    const filterType = cb.dataset.filter;
                    const value = cb.value;
                    
                    if (filterType && filterType !== 'shape') {
                        if (!newFilters[filterType]) newFilters[filterType] = [];
                        newFilters[filterType].push(value);
                    }
                });
                
                // Carat range - check for active quick buttons first
                const activeCaratButtons = document.querySelectorAll('.carat-quick-btn.active');
                if (activeCaratButtons.length > 0) {
                    newFilters['carat-range'] = [];
                    activeCaratButtons.forEach(btn => {
                        const min = parseFloat(btn.dataset.min);
                        const max = parseFloat(btn.dataset.max);
                        const rangeStr = min + '-' + (max === 999 ? '999' : max);
                        newFilters['carat-range'].push(rangeStr);
                    });
                }

                // Also check manual input if no quick buttons are active
                if (!newFilters['carat-range'] || newFilters['carat-range'].length === 0) {
                    const caratMinInput = document.getElementById('carat-min');
                    const caratMaxInput = document.getElementById('carat-max');
                    if (caratMinInput && caratMaxInput) {
                        const caratMin = caratMinInput.value;
                        const caratMax = caratMaxInput.value;
                        if (caratMin || caratMax) {
                            const minValue = caratMin || '0';
                            const maxValue = caratMax || '999';
                            newFilters['carat-range'] = [minValue + '-' + maxValue];
                        }
                    }
                }

                // Price range
                const priceMin = document.getElementById('price-min').value;
                const priceMax = document.getElementById('price-max').value;
                if (priceMin || priceMax) {
                    newFilters['price-range'] = [(priceMin || '0') + '-' + (priceMax || '999999')];
                }
                
                // Apply filters
                this.st.af = newFilters;
                this.st.cp = 1;
                this.applyFilters();
                this.updateUrl();
                
                // Close modal
                this.closeFilterModal();
                
            } catch (error) {
                console.error('Error in applyModalFilters:', error);
                console.error('Error message:', error.message);
                console.error('Error stack:', error.stack);
                console.error('Current state:', this.st);
                console.error('New filters object:', typeof newFilters !== 'undefined' ? newFilters : 'undefined');
                
                // Try to close modal even if there was an error
                try {
                    this.closeFilterModal();
                } catch (closeError) {
                    console.error('Error closing modal:', closeError);
                }
            }
        },
        // Add this method after bindEvents()
        initializeShapeScrollArrows() {
          const container = document.querySelector('.shape-filter-container');
          const leftArrow = document.querySelector('.shape-scroll-arrow.left');
          const rightArrow = document.querySelector('.shape-scroll-arrow.right');
          
          if (!container || !leftArrow || !rightArrow) return;
          
          const checkScroll = () => {
            const scrollLeft = container.scrollLeft;
            const scrollWidth = container.scrollWidth;
            const clientWidth = container.clientWidth;
            
            // Add a threshold to prevent arrows showing for tiny amounts of scroll
            const threshold = 5; // pixels
            
            // Show/hide left arrow
            if (scrollLeft > threshold) {
              leftArrow.classList.add('show');
            } else {
              leftArrow.classList.remove('show');
            }
            
            // Show/hide right arrow - check if there's meaningful content to scroll to
            if (scrollLeft < scrollWidth - clientWidth - threshold) {
              rightArrow.classList.add('show');
            } else {
              rightArrow.classList.remove('show');
            }
            
            // Hide both arrows if total scrollable distance is negligible
            if (scrollWidth - clientWidth <= threshold * 2) {
              leftArrow.classList.remove('show');
              rightArrow.classList.remove('show');
            }
          };
          
          // Check on load
          setTimeout(checkScroll, 100);
          
          // Check on scroll
          container.addEventListener('scroll', checkScroll);
          
          // Check on resize
          window.addEventListener('resize', checkScroll);
          
          // Arrow click handlers with larger scroll amount
          leftArrow.addEventListener('click', () => {
            container.scrollBy({ left: -300, behavior: 'smooth' });
          });
          
          rightArrow.addEventListener('click', () => {
            container.scrollBy({ left: 300, behavior: 'smooth' });
          });
        },
        // Add this method after bindEvents
        updateShapeFilterStates() {
          document.querySelectorAll('.shape-filter-item').forEach(item => {
            const shape = item.dataset.shape;
            if (this.st.af.shape && this.st.af.shape.includes(shape)) {
              item.classList.add('active');
            } else {
              item.classList.remove('active');
            }
          });
        },
        // Load setting variant information
        loadSettingVariantInfo() {
          if (!this.st.sv || !this.st.ss) return;
          
          const settingHandle = this.st.ss.toLowerCase();
          fetch(\`/products/\${settingHandle}.js\`)
            .then(r => {
              if (!r.ok) throw new Error('Product not found');
              return r.json();
            })
            .then(product => {
              const variant = product.variants.find(v => v.id == this.st.sv);
              if (variant && variant.option2 && variant.option2.includes('ct')) {
                const match = variant.option2.match(/(\\d+(?:\\.\\d+)?)[\\s]*[-–—][\\s]*(\\d+(?:\\.\\d+)?)\\s*ct/i);
                if (match) {
                  this.st.sr = { 
                    min: parseFloat(match[1]), 
                    max: parseFloat(match[2]) 
                  };
                  this.applyFilters();
                  this.updateUrl();
                }
              }
            })
            .catch(err => console.error('Error loading variant info:', err));
        },
        // Update carat filter button states
        updateCaratFilterStates() {
          document.querySelectorAll('.carat-filter-btn').forEach(btn => {
            const min = parseFloat(btn.dataset.caratMin);
            const max = parseFloat(btn.dataset.caratMax);
            const rangeStr = min + '-' + (max === Infinity ? '999' : max);
            
            if (this.st.af['carat-range'] && this.st.af['carat-range'].includes(rangeStr)) {
              btn.classList.add('active');
            } else {
              btn.classList.remove('active');
            }
          });
        },
        // Smart load variant data with retry
        smartLoadVariantData() {
          let attempts = 0;
          const maxAttempts = 20;
          
          const tryLoad = () => {
            const variantElements = document.querySelectorAll('[data-variant-map]');
            const settingCards = document.querySelectorAll('.settings-card__link,.settings-card__select,.def-card a');
            
            if (variantElements.length > 0 && settingCards.length > 0) {
              this.loadVariantData();
              this.checkPendingAutoFilter();
              this.updateProductLinks();
              this.initializeFilters();
              return true;
            }
            
            attempts++;
            if (attempts < maxAttempts) {
              setTimeout(tryLoad, 200);
            } else {
              this.loadVariantData();
              this.checkPendingAutoFilter();
              this.updateProductLinks();
              this.initializeFilters();
            }
            return false;
          };
          
          tryLoad();
        },
        
        // Load variant data from DOM
        loadVariantData() {
          document.querySelectorAll('[data-variant-map]').forEach(el => {
            const productId = el.dataset.productId;
            const variantData = el.dataset.variantMap;
            if (productId && variantData) {
              try {
                this.st.vi[productId] = JSON.parse(variantData);
              } catch (e) {
                console.error('Error parsing variant data:', e);
              }
            }
          });
        },
        
        // Find variant for carat weight
        findVariantForCarat(productId, caratWeight) {
          const variants = this.st.vi[productId];
          if (!variants || !caratWeight) return null;
          
          for (const variant of variants) {
            if (variant.min <= caratWeight && variant.max >= caratWeight) {
              return variant.id;
            }
          }
          
          return null;
        },
        
        // Check and apply pending auto filter
        checkPendingAutoFilter() {
          const u = new URLSearchParams(location.search);
          if (!u.has('filter_shape')) {
            if (this.st.sg && location.pathname.includes('setting')) {
              this.autoFilter(this.st.sg, 'g');
            } else if (this.st.ss && location.pathname.includes('gemstone')) {
              this.autoFilter(this.st.ss, 's');
            }
          }
        },
        
        // Auto filter based on product
        autoFilter(productParam, productType) {
          const parts = productParam.toLowerCase().split('-');
          const shapes = ${JSON.stringify(SHAPE_TYPES.map(s => s.toLowerCase()))};
          let shapeFound = false;
          
          // Check for shape in product parameter
          for (const part of parts) {
            if (shapes.includes(part)) {
              this.st.af.shape = [part.charAt(0).toUpperCase() + part.slice(1)];
              shapeFound = true;
              break;
            }
          }
          
          // Extract carat weight
          const caratMatch = productParam.match(/(\\d+)[-_](\\d+)[-_]ct/i);
          if (caratMatch) {
            const caratValue = parseFloat(caratMatch[1] + '.' + caratMatch[2] + (caratMatch[2].length === 1 ? '0' : ''));
            if (caratValue > 0) this.st.gc = caratValue;
          }
          
          // Apply filters or fetch product
          if (!shapeFound || productType === 's') {
            if (this.st.sv && productType === 's') {
              this.applyFilters();
              this.updateUrl();
            } else {
              this.fetchProductForFilter(productParam, productType);
            }
          } else {
            this.applyFilters();
            this.updateUrl();
          }
        },
        
        // Initialize filter system
        // Initialize filter system
        initializeFilters() {
          this.extractFilterOptions();
          this.buildFilterMenus();
          this.setupFilterHandlers();
          
          // Always use applyFilters for consistency
          this.applyFilters();
        },
        
        // Show products for current page (DEPRECATED - use applyFilters instead)
        showPage() {
          // Just call applyFilters for consistency
          this.applyFilters();
        },
        extractFilterOptions() {
          const products = document.querySelectorAll('.ge-item');
          this.st.pc = products.length;
          
          // Add origin and certification to the filter types
          const filterTypes = ['shape', 'color', 'gemstone-type', 'carat', 'treatment', 'metal', 'style', 'price', 'origin', 'certification'];
          filterTypes.forEach(filter => this.st.fo[filter] = {});
          
          products.forEach(product => {
            filterTypes.forEach(filter => {
              let value = product.dataset[filter.replace('-', '')];
              
              if (filter === 'price') {
                const price = parseInt(product.dataset.price);
                if (price) {
                  value = this.getPriceRange(price);
                }
              } else if (filter === 'carat' && value && value.includes('-')) {
                // For settings with ranges, add them to filter options
                const [min, max] = value.split('-').map(parseFloat);
                
                // Categorize into standard filter ranges
                if (min <= 1 && max >= 1) {
                  const rangeValue = '1-1.99';
                  if (!this.st.fo[filter][rangeValue]) {
                    this.st.fo[filter][rangeValue] = 0;
                  }
                  this.st.fo[filter][rangeValue]++;
                }
                if (min <= 2 && max >= 2) {
                  const rangeValue = '2-2.99';
                  if (!this.st.fo[filter][rangeValue]) {
                    this.st.fo[filter][rangeValue] = 0;
                  }
                  this.st.fo[filter][rangeValue]++;
                }
                if (min <= 3 && max >= 3) {
                  const rangeValue = '3-4.99';
                  if (!this.st.fo[filter][rangeValue]) {
                    this.st.fo[filter][rangeValue] = 0;
                  }
                  this.st.fo[filter][rangeValue]++;
                }
                if (max >= 5) {
                  const rangeValue = '5ct +';
                  if (!this.st.fo[filter][rangeValue]) {
                    this.st.fo[filter][rangeValue] = 0;
                  }
                  this.st.fo[filter][rangeValue]++;
                }
                return; // Skip the normal value assignment
              }
              
              if (value) {
                if (!this.st.fo[filter][value]) {
                  this.st.fo[filter][value] = 0;
                }
                this.st.fo[filter][value]++;
              }
            });
          });
        },  // <-- This properly closes extractFilterOptions

        // Get price range label
        getPriceRange(price) {
          const ranges = ${JSON.stringify(PRICE_RANGES)};
          for (const range of ranges) {
            if (price >= range.min && price < range.max) {
              return range.label;
            }
          }
          return 'Over $10,000';
        },
        
        // Build filter menus
        buildFilterMenus() {
          Object.entries(this.st.fo).forEach(([filter, options]) => {
            const menu = document.querySelector(\`[data-filter-menu="\${filter}"]\`);
            if (!menu) return;
            
            menu.innerHTML = '';
            
            const entries = Object.entries(options).sort((a, b) => {
              if (filter === 'carat' || filter === 'carat-range') {
                return parseFloat(a[0]) - parseFloat(b[0]);
              }
              if (filter === 'price') {
                const priceOrder = ${JSON.stringify(PRICE_RANGES.map(r => r.label))};
                return priceOrder.indexOf(a[0]) - priceOrder.indexOf(b[0]);
              }
              return a[0].localeCompare(b[0]);
            });
            
            entries.forEach(([value, count]) => {
              const isActive = this.st.af[filter]?.includes(value);
              menu.innerHTML += \`
                <div class="gf-opt">
                  <label style="display:flex;align-items:center;cursor:pointer;width:100%">
                    <input type="checkbox" \${isActive ? 'checked' : ''} value="\${value}">
                    <span style="flex:1">\${value}</span>
                    <span class="cnt">(\${count})</span>
                  </label>
                </div>
              \`;
            });
          });
        },
        
        // Setup filter handlers
        setupFilterHandlers() {
          document.querySelectorAll('.gf-dd').forEach(dropdown => {
            const button = dropdown.querySelector('.gf-btn');
            const menu = dropdown.querySelector('.gf-menu');
            
            if (button && menu) {
              button.addEventListener('click', e => {
                e.stopPropagation();
                this.toggleFilterMenu(button, menu);
              });
            }
          });
        },
        
        // Toggle filter menu
        toggleFilterMenu(button, menu) {
          // Close other menus
          document.querySelectorAll('.gf-menu.open').forEach(openMenu => {
            if (openMenu !== menu) openMenu.classList.remove('open');
          });
          document.querySelectorAll('.gf-btn.open').forEach(openBtn => {
            if (openBtn !== button) openBtn.classList.remove('open');
          });
          
          // Toggle current menu
          menu.classList.toggle('open');
          button.classList.toggle('open');
        },
        
        // Handle document click
        handleDocumentClick() {
          document.querySelectorAll('.gf-menu.open,.gf-btn.open').forEach(el => {
            el.classList.remove('open');
          });
        },
        
        // Handle filter change
        // In handleFilterChange(), add special handling for radio buttons:
        handleFilterChange(e) {
          if (!e.target.matches('.gf-opt input, .filter-checkbox')) return;
          
          const filterMenu = e.target.closest('[data-filter-menu]') || e.target.closest('[id$="-options"]');
          if (!filterMenu) return;
          
          const filterType = e.target.dataset.filter || filterMenu.dataset.filterMenu || filterMenu.id.replace('-options', '');
          const value = e.target.value;
          
          // Special handling for radio buttons (metal filter)
          if (e.target.type === 'radio') {
            if (e.target.checked) {
              this.st.af[filterType] = [value];
            }
          } else {
            // Regular checkbox handling
            if (e.target.checked) {
              if (!this.st.af[filterType]) this.st.af[filterType] = [];
              this.st.af[filterType].push(value);
            } else if (this.st.af[filterType]) {
              this.st.af[filterType] = this.st.af[filterType].filter(v => v !== value);
              if (!this.st.af[filterType].length) delete this.st.af[filterType];
            }
          }
          
          this.st.cp = 1;
          this.applyFilters();
          this.updateUrl();
        },
        
        // Apply active filters
        applyFilters() {
          console.log('=== APPLY FILTERS DEBUG ===');
          console.log('State:', {
            selectedGemstone: this.st.sg,
            selectedSetting: this.st.ss,
            gemstoneShape: this.st.gsh,
            settingCompatibleShape: this.st.ssh,
            gemstoneCarat: this.st.gc,
            activeFilters: this.st.af
          });

          const products = document.querySelectorAll('.ge-item');
          const filteredProducts = [];
          let shownCount = 0;
          let hiddenByShape = 0;
          let hiddenByCarat = 0;
          let settingsWithCaratData = 0;
          let settingsWithoutCaratData = 0;

          products.forEach(product => {
            let shouldShow = true;
            const productShape = product.dataset.shape || '';
            const productType = product.dataset.productType;

            // Check shape compatibility for settings when a gemstone is selected
            if (this.st.gsh && productType === 'setting') {
              const settingShape = productShape.toLowerCase();
              const gemShape = this.st.gsh.toLowerCase();
              if (settingShape && settingShape !== gemShape) {
                shouldShow = false;
                hiddenByShape++;
                console.log('Setting HIDDEN - shape mismatch:', settingShape, 'vs gemstone:', gemShape, '| Product:', product.dataset.productId);
              }
            }

            // Check shape compatibility for diamonds when a setting is selected
            if (this.st.ssh && productType === 'gemstone') {
              const diamondShape = productShape.toLowerCase();
              const settingCompatibleShape = this.st.ssh.toLowerCase();
              if (diamondShape && diamondShape !== settingCompatibleShape) {
                shouldShow = false;
                hiddenByShape++;
                console.log('Diamond HIDDEN - shape mismatch:', diamondShape, 'vs setting compatible:', settingCompatibleShape, '| Product:', product.dataset.productId);
              } else {
                console.log('Diamond SHOWN - shape match:', diamondShape, '| Product:', product.dataset.productId);
              }
            }

            // Check carat weight filter for settings
            if (productType === 'setting') {
              const minCarat = parseFloat(product.dataset.caratMin);
              const maxCarat = parseFloat(product.dataset.caratMax);
              const hasValidCaratData = !isNaN(minCarat) && !isNaN(maxCarat) && minCarat > 0 && maxCarat > 0;

              // Track how many settings have valid carat data
              if (hasValidCaratData) {
                settingsWithCaratData++;
              } else {
                settingsWithoutCaratData++;
              }

              // Always log setting carat data for debugging
              console.log('Setting carat attrs:', {
                productId: product.dataset.productId,
                caratMinAttr: product.dataset.caratMin,
                caratMaxAttr: product.dataset.caratMax,
                parsedMin: minCarat,
                parsedMax: maxCarat,
                hasValidData: hasValidCaratData,
                gemstoneCarat: this.st.gc
              });

              if (this.st.gc && shouldShow && hasValidCaratData) {
                if (!(this.st.gc >= minCarat && this.st.gc <= maxCarat)) {
                  shouldShow = false;
                  hiddenByCarat++;
                  console.log('Setting HIDDEN - carat mismatch:', minCarat, '-', maxCarat, 'vs gemstone:', this.st.gc, '| Product:', product.dataset.productId);
                } else {
                  console.log('Setting SHOWN - carat match:', minCarat, '-', maxCarat, 'includes gemstone:', this.st.gc, '| Product:', product.dataset.productId);
                }
              }
            }
            
            // Check size range filter for gemstones
            if (this.st.sr && product.dataset.productType === 'gemstone') {
              const gemWeight = parseFloat(product.dataset.carat);
              if (!(gemWeight && gemWeight >= this.st.sr.min && gemWeight <= this.st.sr.max)) {
                shouldShow = false;
              }
            }
            
            // Check carat-range filter (from the carat buttons)
            if (this.st.af['carat-range'] && this.st.af['carat-range'].length > 0) {
              console.log('=== CARAT FILTER DEBUG ===');
              console.log('Active carat filters:', this.st.af['carat-range']);
              console.log('Product:', product.dataset.productId, 'Type:', product.dataset.productType);
              
              let matchesCaratRange = false;
              
              if (product.dataset.productType === 'setting') {
                // For settings, use caratMin and caratMax
                const productMin = parseFloat(product.dataset.caratMin);
                const productMax = parseFloat(product.dataset.caratMax);
                
                console.log('Setting carat data:', {
                  caratMin: product.dataset.caratMin,
                  caratMax: product.dataset.caratMax,
                  parsedMin: productMin,
                  parsedMax: productMax
                });
                
                if (!isNaN(productMin) && !isNaN(productMax)) {
                  // Check if any filter range overlaps with product range
                  for (const range of this.st.af['carat-range']) {
                    const [filterMin, filterMax] = range.split('-').map(parseFloat);
                    const fMax = filterMax || 999;
                    
                    console.log('Checking filter range:', filterMin, '-', fMax, 'against product:', productMin, '-', productMax);
                    
                    // Check for overlap
                    if (productMax >= filterMin && productMin <= fMax) {
                      matchesCaratRange = true;
                      console.log('MATCH!');
                      break;
                    }
                  }
                } else {
                  console.log('Invalid carat values for setting!');
                }
                
                // Only hide if it doesn't match
                if (!matchesCaratRange) {
                  shouldShow = false;
                  console.log('Setting hidden due to carat filter');
                }
              } else if (product.dataset.productType === 'gemstone' && product.dataset.carat) {
                // For gemstones, use the carat value
                const productCarat = parseFloat(product.dataset.carat);
                
                console.log('Gemstone carat:', product.dataset.carat, 'parsed:', productCarat);
                
                for (const range of this.st.af['carat-range']) {
                  const [min, max] = range.split('-').map(parseFloat);
                  if (productCarat >= min && productCarat <= (max || 999)) {
                    matchesCaratRange = true;
                    break;
                  }
                }
                
                // Only hide if it doesn't match
                if (!matchesCaratRange) {
                  shouldShow = false;
                  console.log('Gemstone hidden due to carat filter');
                }
              }
            }
            
            // Check other filters
            Object.entries(this.st.af).forEach(([filterType, values]) => {
              if (!shouldShow) return;

              // Skip carat-range as we handled it above
              if (filterType === 'carat-range') return;

              // Skip metal filter for settings - we'll handle it differently
              if (filterType === 'metal' && product.dataset.productType === 'setting') return;

              let productValue = product.dataset[filterType.replace('-', '')];

              // ADD THIS FIX HERE
              if (filterType === 'gemstone-type') {
                productValue = product.dataset.gemstoneType; // Use camelCase
              }

              // Normalize metal type for comparison (strip karat prefix)
              if (filterType === 'metal' && productValue) {
                const metalMatch = productValue.match(/(White Gold|Yellow Gold|Rose Gold|White & Yellow Gold|White & Rose Gold|Yellow & Rose Gold|Platinum)/i);
                if (metalMatch) productValue = metalMatch[0];
              }

              if (filterType === 'price') {
                const price = parseInt(product.dataset.price);
                productValue = this.getPriceRange(price);
              }

              if (!values.includes(productValue)) {
                shouldShow = false;
              }
            });
            
            if (shouldShow) {
              filteredProducts.push(product);
            }
          });
          
          console.log('=== FILTER RESULTS ===');
          console.log('Total products:', products.length);
          console.log('Shown:', filteredProducts.length);
          console.log('Hidden by shape:', hiddenByShape);
          console.log('Hidden by carat:', hiddenByCarat);
          console.log('Settings WITH carat data:', settingsWithCaratData);
          console.log('Settings WITHOUT carat data:', settingsWithoutCaratData);
          console.log('======================');
          
          // ADDED: Sort the filtered products
          const sortedProducts = this.sortProducts(filteredProducts);
          
          // Update visibility with animations
          this.st.vc = sortedProducts.length;
          this.st.tp = Math.ceil(this.st.vc / this.st.ppp);
          
          if (this.st.cp > this.st.tp) {
            this.st.cp = 1;
          }
          
          // Hide all products first
          products.forEach(product => {
            product.classList.add('hidden');
          });
          
          // Update metal variants BEFORE showing products
          this.updateSettingsForMetal();
          
          // MODIFIED: Show sorted and filtered products with pagination
          // MODIFIED: Show sorted and filtered products with pagination
          // Get the grid container
          const grid = document.querySelector('.ge-grid');
          if (grid) {
            // First, hide all products
            products.forEach(product => {
              product.classList.add('hidden');
            });
            
            // Reorder ALL sorted products in the DOM (not just current page)
            sortedProducts.forEach(product => {
              grid.appendChild(product);
            });
            
            // Now show only the products for the current page
            const startIndex = (this.st.cp - 1) * this.st.ppp;
            sortedProducts.slice(startIndex, startIndex + this.st.ppp).forEach(product => {
              product.classList.remove('hidden');
            });
          }
          
          this.updateResultsCount();
          this.updateActiveFilterTags();
          this.updateFilterCounts();
          this.renderPagination();
          this.updateShapeFilterStates();
          this.updateCaratFilterStates();
        },
        // Add this new function after applyFilters:
        updateSettingsForMetal() {
          const selectedMetal = this.st.af.metal?.[0]; // Get first selected metal
          if (!selectedMetal) return;
          
          document.querySelectorAll('.ge-item[data-product-type="setting"]').forEach(product => {
            const card = product.querySelector('.clean-settings-card');
            if (!card) return;
            
            const variantData = JSON.parse(card.dataset.variantColors || '{}');
            
            // Find the color that matches the selected metal
            let targetColor = '';
            if (selectedMetal.includes('White')) targetColor = 'White';
            else if (selectedMetal.includes('Yellow')) targetColor = 'Yellow';
            else if (selectedMetal.includes('Rose')) targetColor = 'Rose';
            
            if (!targetColor || !variantData[targetColor]) return;
            
            const variant = variantData[targetColor][0];
            if (!variant) return;
            
            // Update the primary image
            const primaryImage = card.querySelector('.clean-settings-card__image--primary');
            if (primaryImage && variant.image) {
              primaryImage.src = variant.image + '?width=400';
            }
            
            // Update the select button URL
            const selectButton = card.querySelector('.btn-select');
            if (selectButton) {
              const baseUrl = selectButton.dataset.productUrl;
              const url = new URL(baseUrl, window.location.origin);
              url.searchParams.set('variant', variant.id);
              selectButton.dataset.productUrl = url.pathname + url.search;
            }
            
            // Update the link URL
            const cardLink = card.querySelector('.clean-settings-card__link');
            if (cardLink) {
              const baseUrl = cardLink.dataset.productUrl;
              const url = new URL(baseUrl, window.location.origin);
              url.searchParams.set('variant', variant.id);
              cardLink.dataset.productUrl = url.pathname + url.search;
            }
            
            // Update the active swatch
            card.querySelectorAll('.metal-swatch').forEach(swatch => {
              swatch.classList.toggle('active', swatch.dataset.metalColor === targetColor);
            });
          });
        },
        // Update URL with current state
        updateUrl() {
          const params = new URLSearchParams(location.search);
          
          // Remove existing filter and page params
          // Remove existing filter, sort, and page params
          [...params.keys()].forEach(key => {
            if (key.startsWith('filter_') || key === 'page' || key === 'sort') {
              params.delete(key);
            }
          });
          
          // Add active filters
          Object.entries(this.st.af).forEach(([filter, values]) => {
            params.set(\`filter_\${filter}\`, values.join(','));
          });
          if (this.st.sortBy) {
            params.set('sort', this.st.sortBy);
          }
          // Add page if not first
          if (this.st.cp > 1) {
            params.set('page', this.st.cp);
          }
          
          const newUrl = location.pathname + (params.toString() ? '?' + params.toString() : '');
          history.replaceState({}, '', newUrl);
          
          this.st.pp = params.toString() ? '?' + params.toString() : '';
          this.updateProductLinks();
        },

        // Update product links with current parameters
        updateProductLinks() {
          const isSettingsPage = location.pathname.includes('setting');
          
          const selectors = [
            '.clean-gemstone-card__link',
            '.clean-settings-card__link',
            '.gemstone-card__link',
            '.settings-card__link',
            '.gemstone-card__select',
            '.settings-card__select',
            '.def-card a'
          ];
          
          document.querySelectorAll(selectors.join(',')).forEach(link => {
            if (!this.st.pp) return;
            
            const originalHref = link.href || link.dataset.productUrl;
            if (!originalHref || originalHref.includes(this.st.pp)) return;
            
            const hasParams = originalHref.includes('?');
            let newHref = hasParams ? 
              originalHref + '&' + this.st.pp.substring(1) : 
              originalHref + this.st.pp;
            
            // Add variant parameter for settings with carat weight
            if (isSettingsPage && this.st.gc) {
              const productElement = link.closest('.ge-item');
              if (productElement && productElement.dataset.productType === 'setting') {
                const productId = productElement.dataset.productId;
                const variantId = this.findVariantForCarat(productId, this.st.gc);
                if (variantId) {
                  newHref += (newHref.includes('?') ? '&' : '?') + 'variant=' + variantId;
                }
              }
            }
            
            if (link.href) link.href = newHref;
            if (link.dataset.productUrl) link.dataset.productUrl = newHref;
          });
        },
        // Render pagination
        renderPagination() {
          let paginationEl = document.querySelector('.rb-pag');
          if (paginationEl) paginationEl.remove();
          
          if (this.st.tp <= 1) return;
          
          paginationEl = document.createElement('div');
          paginationEl.className = 'rb-pag';
          
          let paginationHTML = '';
          
          // Previous button
          if (this.st.cp > 1) {
            paginationHTML += \`<a href="#" data-page="\${this.st.cp - 1}">← Previous</a>\`;
          }
          
          // Page numbers
          const maxVisible = 5;
          const startPage = Math.max(1, this.st.cp - Math.floor(maxVisible / 2));
          const endPage = Math.min(this.st.tp, startPage + maxVisible - 1);
          
          for (let i = Math.max(1, endPage - maxVisible + 1); i <= endPage; i++) {
            if (i === this.st.cp) {
              paginationHTML += \`<span class="current">\${i}</span>\`;
            } else {
              paginationHTML += \`<a href="#" data-page="\${i}">\${i}</a>\`;
            }
          }
          
          // Next button
          if (this.st.cp < this.st.tp) {
            paginationHTML += \`<a href="#" data-page="\${this.st.cp + 1}">Next →</a>\`;
          }
          
          paginationEl.innerHTML = paginationHTML;
          
          // Add click handler
          paginationEl.addEventListener('click', e => {
            e.preventDefault();
            if (e.target.dataset.page) {
              this.st.cp = parseInt(e.target.dataset.page);
              
              if (Object.keys(this.st.af).length || this.st.gc || this.st.sr) {
                this.applyFilters();
              } else {
                this.showPage();
              }
              
              this.updateUrl();
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }
          });
          
          const grid = document.querySelector('.ge-grid');
          if (grid) {
            grid.parentNode.appendChild(paginationEl);
          }
        },
        
        // Update filter counts
        updateFilterCounts() {
          const tempFilters = { ...this.st.af };
          
          Object.keys(this.st.fo).forEach(filterType => {
            const currentFilter = tempFilters[filterType];
            delete tempFilters[filterType];
            
            // Reset counts
            Object.keys(this.st.fo[filterType]).forEach(value => {
              this.st.fo[filterType][value] = 0;
            });
            
            // Count matching products
            document.querySelectorAll('.ge-item').forEach(product => {
              let matches = true;
              
              // Check carat weight
              if (this.st.gc && product.dataset.productType === 'setting') {
                const minCarat = parseFloat(product.dataset.caratMin);
                const maxCarat = parseFloat(product.dataset.caratMax);
                if (!(minCarat && maxCarat && this.st.gc >= minCarat && this.st.gc <= maxCarat)) {
                  matches = false;
                }
              }
              
              // Check size range
              if (this.st.sr && product.dataset.productType === 'gemstone') {
                const gemWeight = parseFloat(product.dataset.carat);
                if (!(gemWeight && gemWeight >= this.st.sr.min && gemWeight <= this.st.sr.max)) {
                  matches = false;
                }
              }
              
              // Check other filters
              Object.entries(tempFilters).forEach(([filter, values]) => {
                if (!matches) return;
                
                let productValue = product.dataset[filter.replace('-', '')];
                
                if (filter === 'price') {
                  const price = parseInt(product.dataset.price);
                  productValue = this.getPriceRange(price);
                }
                
                if (!values.includes(productValue)) {
                  matches = false;
                }
              });
              
              if (matches) {
                let value = product.dataset[filterType.replace('-', '')];
                
                if (filterType === 'price') {
                  const price = parseInt(product.dataset.price);
                  value = this.getPriceRange(price);
                }
                
                if (value && this.st.fo[filterType][value] !== undefined) {
                  this.st.fo[filterType][value]++;
                }
              }
            });
            
            // Restore current filter
            if (currentFilter) {
              tempFilters[filterType] = currentFilter;
            }
          });
          
          this.buildFilterMenus();
        },
        
        // Update active filter tags
        updateActiveFilterTags() {
          const container = document.getElementById('af');
          if (!container) return;
          
          container.innerHTML = '';
          
          if (!Object.keys(this.st.af).length && !this.st.gc && !this.st.sr) {
            container.classList.add('empty');
            return;
          }
          
          container.classList.remove('empty');
          
          // Add carat weight tag
          if (this.st.gc) {
            container.innerHTML += \`
              <div class="af-tag">
                <span>For \${this.st.gc}ct diamond</span>
                <button type="button" data-clear-gc>×</button>
              </div>
            \`;
          }
          
          // Add size range tag
          if (this.st.sr) {
            container.innerHTML += \`
              <div class="af-tag">
                <span>For \${this.st.sr.min}-\${this.st.sr.max}ct setting</span>
                <button type="button" data-clear-sr>×</button>
              </div>
            \`;
          }
          
          // Add filter tags
          Object.entries(this.st.af).forEach(([filterType, values]) => {
            values.forEach(value => {
              container.innerHTML += \`
                <div class="af-tag">
                  <span>\${value}</span>
                  <button type="button" data-rf="\${filterType}" data-rv="\${value}">×</button>
                </div>
              \`;
            });
          });
          
          // Add clear all button
          container.innerHTML += '<button class="clr-all">Clear all</button>';
          
          // Bind tag click handlers
          this.bindFilterTagHandlers(container);
        },
        
        // Bind filter tag handlers
        bindFilterTagHandlers(container) {
          // Clear all
          container.querySelector('.clr-all').addEventListener('click', () => {
            this.st.af = {};
            this.st.gc = null;
            this.st.sr = null;
            this.st.cp = 1;
            this.applyFilters();
            this.updateUrl();
          });
          
          // Remove individual filter
          container.querySelectorAll('[data-rf]').forEach(button => {
            button.addEventListener('click', e => {
              const filterType = e.target.dataset.rf;
              const value = e.target.dataset.rv;
              
              if (this.st.af[filterType]) {
                this.st.af[filterType] = this.st.af[filterType].filter(v => v !== value);
                if (!this.st.af[filterType].length) {
                  delete this.st.af[filterType];
                }
              }
              
              this.st.cp = 1;
              this.applyFilters();
              this.updateUrl();
            });
          });
          
          // Clear carat weight
          container.querySelectorAll('[data-clear-gc]').forEach(button => {
            button.addEventListener('click', () => {
              this.st.gc = null;
              this.st.cp = 1;
              this.applyFilters();
              this.updateUrl();
            });
          });
          
          // Clear size range
          container.querySelectorAll('[data-clear-sr]').forEach(button => {
            button.addEventListener('click', () => {
              this.st.sr = null;
              this.st.cp = 1;
              this.applyFilters();
              this.updateUrl();
            });
          });
        },
        
        // Update results count
        updateResultsCount() {
          const countElement = document.getElementById('rc');
          if (!countElement) return;
          
          const total = Object.keys(this.st.af).length || this.st.gc || this.st.sr ? 
            this.st.vc : 
            this.st.pc || document.querySelectorAll('.ge-item').length;
          
          const start = (this.st.cp - 1) * this.st.ppp + 1;
          const end = Math.min(this.st.cp * this.st.ppp, total);
          const filtered = Object.keys(this.st.af).length || this.st.gc || this.st.sr ? 'filtered ' : '';
          
          countElement.textContent = \`Showing \${start}-\${end} of \${total} \${filtered}products\`;
        },
        // Update context banner
        updateContextBanner() {
          let existingBanner = document.querySelector('.rb-ctx');
          if (existingBanner) existingBanner.remove();

          if (this.st.sg || this.st.ss) {
            const contextBanner = document.createElement('div');
            contextBanner.className = 'rb-ctx';
            let message = '';

            if (this.st.sg && !this.st.ss) {
              // Building context message for selecting a setting
              const parts = [];
              if (this.st.gsh) parts.push('<strong>' + this.st.gsh + '</strong> shape');
              if (this.st.gc) parts.push('<strong>' + this.st.gc + ' ct</strong>');

              if (parts.length > 0) {
                message = 'Showing settings compatible with your ' + parts.join(', ') + ' diamond';
              } else {
                message = 'Selecting a setting for your <strong>' + this.st.sg.replace(/-/g, ' ') + '</strong>';
              }
            } else if (this.st.ss && !this.st.sg) {
              // Building context message for selecting a diamond
              if (this.st.ssh) {
                message = 'Showing <strong>' + this.st.ssh + '</strong> diamonds compatible with your setting';
              } else {
                message = 'Selecting a diamond for your <strong>' + this.st.ss.replace(/-/g, ' ') + '</strong>';
              }
            }

            if (message) {
              contextBanner.innerHTML = '<p>' + message + '</p>';
              const insertBefore = document.querySelector('.gf-bar') || document.querySelector('.ge-grid');
              if (insertBefore) {
                insertBefore.parentNode.insertBefore(contextBanner, insertBefore);
              }
            }
          }
        },
        
        // Build URL parameters
        buildUrlParams() {
          const params = [];
          
          if (this.st.sg) params.push('gemstone=' + this.st.sg);
          if (this.st.ss) params.push('setting=' + this.st.ss);
          
          Object.entries(this.st.af).forEach(([filter, values]) => {
            params.push('filter_' + filter + '=' + values.join(','));
          });
          
          if (this.st.cp > 1) params.push('page=' + this.st.cp);
          
          this.st.pp = params.length ? '?' + params.join('&') : '';
        },
        
        // Setup mutation observer
        setupMutationObserver() {
          const observer = new MutationObserver(() => {
            this.updateProductLinks();
          });
          
          observer.observe(document.body, { 
            childList: true, 
            subtree: true 
          });
        },
        
        // Fetch product for filter
        fetchProductForFilter(productParam, productType) {
          const handle = productParam.toLowerCase();
          const fetchStrategies = [
            () => fetch('/products/' + handle + '.js'),
            () => fetch('/products/' + handle.replace(/^\\d+-/, '') + '.js'),
            () => fetch('/products/' + handle.split('-').slice(-3).join('-') + '.js')
          ];
          
          const tryFetch = (index) => {
            if (index >= fetchStrategies.length) {
              this.parseShapeFromParam(productParam);
              return;
            }
            
            fetchStrategies[index]()
              .then(response => {
                if (!response.ok) throw new Error();
                return response.json();
              })
              .then(product => {
                let shape = null;
                let caratWeight = null;
                let minCarat = null;
                let maxCarat = null;
                
                try {
                  if (productType === 'g' && product.metafields?.custom) {
                    shape = product.metafields.custom.gemstone_shape;
                    caratWeight = product.metafields.custom.gemstone_carat_weight || 
                                product.metafields.custom.gemstone_weight;
                  } else if (productType === 's') {
                    if (product.metafields?.custom) {
                      shape = product.metafields.custom.center_stone_shape;
                    }
                    
                    if (product.variants?.length) {
                      let minSize = 999;
                      let maxSize = 0;
                      
                      product.variants.forEach(variant => {
                        const sizeOption = variant.option2;
                        if (sizeOption?.includes('ct')) {
                          const match = sizeOption.match(/(\\d+(?:\\.\\d+)?)--(\\d+(?:\\.\\d+)?)\\s*ct/i);
                          if (match) {
                            const variantMin = parseFloat(match[1]);
                            const variantMax = parseFloat(match[2]);
                            if (variantMin < minSize) minSize = variantMin;
                            if (variantMax > maxSize) maxSize = variantMax;
                          }
                        }
                      });
                      
                      if (minSize !== 999 && maxSize > 0) {
                        minCarat = minSize;
                        maxCarat = maxSize;
                      }
                    }
                  }
                  
                  if (shape && !this.st.af.shape) {
                    this.st.af.shape = [shape];
                  }
                  
                  if (caratWeight && productType === 'g') {
                    this.st.gc = parseFloat(caratWeight);
                  }
                  
                  if (minCarat && maxCarat && productType === 's') {
                    this.st.sr = { min: minCarat, max: maxCarat };
                  }
                  
                  this.applyFilters();
                  this.updateUrl();
                } catch (error) {
                  console.error('Error processing product data:', error);
                }
              })
              .catch(() => tryFetch(index + 1));
          };
          
          tryFetch(0);
        },
        
        // Parse shape from parameter
        parseShapeFromParam(param) {
          const shapePatterns = [
            /(round|oval|pear|emerald|cushion|princess|marquise|radiant|asscher|heart)/i,
            /(\\w+)-cut/i,
            /(\\w+)-shape/i,
            /(\\w+)-(stone|ring|setting|pendant|sapphire|ruby|emerald|diamond)/i
          ];
          
          for (const pattern of shapePatterns) {
            const match = param.match(pattern);
            if (match) {
              const shape = match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase();
              if (${JSON.stringify(SHAPE_TYPES)}.includes(shape)) {
                this.st.af.shape = [shape];
                this.applyFilters();
                this.updateUrl();
                break;
              }
            }
          }
        },
        
        // Bind product card events
        bindProductCardEvents() {
          // Settings card clicks
          // Settings card clicks
          document.querySelectorAll('.clean-settings-card__link').forEach(card => {
            card.addEventListener('click', function(e) {
              if (e.target.closest('.btn-view, .btn-select, .gallery-nav, .metal-swatch')) {
                return;
              }
              const url = this.dataset.productUrl;
              if (url) {
                window.location.href = url;
              }
            });
          });
          
          // Quick view buttons
          document.querySelectorAll('.settings-card__quick-view, .gemstone-card__quick-view').forEach(button => {
            button.addEventListener('click', function(e) {
              e.preventDefault();
              e.stopPropagation();
              const handle = this.dataset.productHandle;
              const url = this.dataset.productUrl;
              console.log('Quick view:', handle, 'URL:', url);
              
              const event = new CustomEvent('quick-view-requested', {
                detail: { handle: handle, url: url },
                bubbles: true
              });
              this.dispatchEvent(event);
            });
          });
          
          // Select buttons
          document.querySelectorAll('.settings-card__select, .gemstone-card__select').forEach(button => {
            button.addEventListener('click', function(e) {
              e.preventDefault();
              e.stopPropagation();
              const url = this.dataset.productUrl;
              if (url) {
                console.log('Redirecting to:', url);
                window.location.href = url;
              } else {
                console.error('No product URL found on button:', this);
              }
            });
          });
        },
        // Add this new function here:
        // Add this new function here:
        // Add this new function here:
        // Add this new function here:
        // Add this new function here:
        bindSwatchEvents() {
          document.addEventListener('click', (e) => {
            const swatch = e.target.closest('.metal-swatch');
            if (!swatch) return;
            
            e.preventDefault();
            e.stopPropagation();
            
            const swatchContainer = swatch.closest('.metal-swatches');
            const card = swatch.closest('.clean-settings-card');
            const metalColor = swatch.dataset.metalColor;
            const variantData = JSON.parse(card.dataset.variantColors || '{}');
            const colorVariants = variantData[metalColor];
            const allImages = JSON.parse(card.dataset.allImages || '[]');
            
            if (!colorVariants || !colorVariants.length) return;
            
            // Remove active class from all swatches
            swatchContainer.querySelectorAll('.metal-swatch').forEach(s => s.classList.remove('active'));
            swatch.classList.add('active');
            
            // Get the first variant for this color
            const variant = colorVariants[0];
            
            // Add no-hover class to temporarily disable hover effect
            card.classList.add('no-hover');
            
            // Update BOTH primary and secondary images
            const imageContainer = card.querySelector('.clean-settings-card__image-container');
            const primaryImage = imageContainer.querySelector('.clean-settings-card__image--primary');
            const secondaryImage = imageContainer.querySelector('.clean-settings-card__image--secondary');
            
            if (primaryImage && variant.image) {
              // Update primary image
              primaryImage.src = variant.image + '?width=400';
              
              // Update secondary image based on the pattern
              if (secondaryImage && allImages.length > 0) {
                // Find the index of the primary image
                const primaryIndex = allImages.findIndex(img => img === variant.image);
                
                if (primaryIndex !== -1) {
                  // Get the next image in sequence for the secondary/hover image
                  const secondaryIndex = primaryIndex + 1;
                  
                  if (allImages[secondaryIndex]) {
                    secondaryImage.src = allImages[secondaryIndex] + '?width=400';
                  } else {
                    // If there's no next image, use the same as primary
                    secondaryImage.src = variant.image + '?width=400';
                  }
                }
              }
            }
            
            // Remove no-hover class after a short delay
            setTimeout(() => {
              card.classList.remove('no-hover');
            }, 300);
            
            // Update price with proper currency formatting
            const priceContainer = card.querySelector('.price-current');
            if (priceContainer) {
              priceContainer.textContent = this.formatMoney(variant.price);
            }
            
            // Update select button URL
            const selectButton = card.querySelector('.btn-select');
            if (selectButton) {
              const baseUrl = selectButton.dataset.productUrl;
              const url = new URL(baseUrl, window.location.origin);
              url.searchParams.set('variant', variant.id);
              selectButton.dataset.productUrl = url.pathname + url.search;
            }
            
            // Update the link URL as well
            const cardLink = card.querySelector('.clean-settings-card__link');
            if (cardLink) {
              const baseUrl = cardLink.dataset.productUrl;
              const url = new URL(baseUrl, window.location.origin);
              url.searchParams.set('variant', variant.id);
              cardLink.dataset.productUrl = url.pathname + url.search;
            }
          });
        },
        // Bind gallery events
        bindGalleryEvents() {
          document.querySelectorAll('[data-gallery-container]').forEach(container => {
            const track = container.querySelector('.gallery-track');
            const slides = container.querySelectorAll('.gallery-slide');
            const prevBtn = container.querySelector('[data-direction="prev"]');
            const nextBtn = container.querySelector('[data-direction="next"]');
            
            if (slides.length > 1 && track) {
              let currentIndex = 0;
              let startX = 0;
              let currentX = 0;
              let isDragging = false;
              
              function updateGallery() {
                track.style.transform = 'translateX(-' + (currentIndex * 100) + '%)';
              }
              
              if (prevBtn && nextBtn) {
                prevBtn.addEventListener('click', (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  currentIndex = currentIndex > 0 ? currentIndex - 1 : slides.length - 1;
                  updateGallery();
                });
                
                nextBtn.addEventListener('click', (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  currentIndex = currentIndex < slides.length - 1 ? currentIndex + 1 : 0;
                  updateGallery();
                });
              }
              
              // Touch support for mobile
              const isMobile = window.matchMedia('(max-width:768px)').matches;
              if (isMobile) {
                container.addEventListener('touchstart', (e) => {
                  startX = e.touches[0].clientX;
                  isDragging = true;
                });
                
                container.addEventListener('touchmove', (e) => {
                  if (!isDragging) return;
                  e.preventDefault();
                  currentX = e.touches[0].clientX;
                });
                
                container.addEventListener('touchend', (e) => {
                  if (!isDragging) return;
                  isDragging = false;
                  const diffX = startX - currentX;
                  const threshold = container.offsetWidth / 4;
                  
                  if (Math.abs(diffX) > threshold) {
                    if (diffX > 0 && currentIndex < slides.length - 1) {
                      currentIndex++;
                    } else if (diffX < 0 && currentIndex > 0) {
                      currentIndex--;
                    }
                    updateGallery();
                  }
                });
              }
            }
          });
        },
        sortProducts(products) {
          if (!this.st.sortBy) return products;
          
          return [...products].sort((a, b) => {
            switch(this.st.sortBy) {
              case 'price-asc':
                return parseInt(a.dataset.price) - parseInt(b.dataset.price);
              
              case 'price-desc':
                return parseInt(b.dataset.price) - parseInt(a.dataset.price);
              
              case 'carat-asc':
                // Handle both gemstones (single carat) and settings (carat range)
                let aCaratAsc = parseFloat(a.dataset.carat) || 0;
                let bCaratAsc = parseFloat(b.dataset.carat) || 0;
                
                // For settings, use the minimum carat value
                if (a.dataset.productType === 'setting' && a.dataset.caratMin) {
                  aCaratAsc = parseFloat(a.dataset.caratMin) || 0;
                }
                if (b.dataset.productType === 'setting' && b.dataset.caratMin) {
                  bCaratAsc = parseFloat(b.dataset.caratMin) || 0;
                }
                
                return aCaratAsc - bCaratAsc;
              
              case 'carat-desc':
                // Handle both gemstones (single carat) and settings (carat range)
                let aCaratDesc = parseFloat(a.dataset.carat) || 0;
                let bCaratDesc = parseFloat(b.dataset.carat) || 0;
                
                // For settings, use the maximum carat value
                if (a.dataset.productType === 'setting' && a.dataset.caratMax) {
                  aCaratDesc = parseFloat(a.dataset.caratMax) || 0;
                }
                if (b.dataset.productType === 'setting' && b.dataset.caratMax) {
                  bCaratDesc = parseFloat(b.dataset.caratMax) || 0;
                }
                
                return bCaratDesc - aCaratDesc;
              
              default:
                return 0;
            }
          });
        }
      };
      
      // Initialize the Ring Builder Application
      document.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => window.RBA.init(), 300);
      });
    })();
  `;
}
