import { authenticate } from "../shopify.server";

// Constants - Updated for diamonds (loose stones only)
const DIAMOND_TYPES = ['precious stone', 'loose stone'];
const SETTING_TYPES = ['ring', 'pendant', 'ring setting', 'pendant setting'];
const DIAMOND_TAGS = ['gemstone', 'loose stone'];  // Only match loose stones, not finished jewelry
const SETTING_TAGS = ['setting_ring', 'setting_pendant', 'ring setting', 'pendant setting'];
// Legacy aliases
const GEMSTONE_TYPES = DIAMOND_TYPES;
const GEMSTONE_TAGS = DIAMOND_TAGS;
const PREVIEW_HANDLE = 'custom-ring-preview';

// Main loader function
export const loader = async ({ request }) => {
  try {
    // Authenticate the request
    const { admin, session } = await authenticate.public.appProxy(request);
    
    // Parse request parameters
    const url = new URL(request.url);
    const handle = url.searchParams.get('handle') || '';
    const productHandle = url.searchParams.get('product_handle') || handle;
    
    if (!productHandle) {
      return createErrorResponse('Product handle is required');
    }
    
    // Fetch product details
    const product = await fetchProductDetails(admin, productHandle);
    if (!product) {
      return createErrorResponse('Product not found');
    }
    
    // Process product data
    const productData = processProductData(product);
    
    // Get settings from request
    const settings = {
      show_info_table: url.searchParams.get('show_info_table') !== 'false',
      gemstone_button_text: url.searchParams.get('gemstone_button_text') || 'Select a Setting →',
      setting_button_text: url.searchParams.get('setting_button_text') || 'Select a Gemstone →',
      add_both_text: url.searchParams.get('add_both_text') || 'Add Both to Cart',
      gemstone_collection: url.searchParams.get('gemstone_collection') || 'gemstones',
      settings_collection: url.searchParams.get('settings_collection') || 'settings'
    };
    
    // URL parameters
    const urlParams = {
      gemstone: url.searchParams.get('gemstone') || '',
      setting: url.searchParams.get('setting') || '',
      variant: url.searchParams.get('variant') || '',
      setting_variant: url.searchParams.get('setting_variant') || ''
    };
    
    // Determine product classification
    const classification = classifyProduct(productData);
    
    // Handle preview page
    if (classification.isPreview) {
      const html = await generatePreviewHTML({
        settings,
        urlParams,
        admin,
        session
      });
      return createSuccessResponse(html);
    }
    
    // Check if we should show the ring builder
    if (!classification.isGemstone && !classification.isSetting) {
      return createSuccessResponse('');
    }
    
    // Generate HTML for regular product
    const html = generateProductHTML({
      product: productData,
      classification,
      settings,
      urlParams,
      session
    });
    
    return createSuccessResponse(html);
    
  } catch (error) {
    console.error('Product page builder error:', error);
    return createErrorResponse('Unable to load product builder');
  }
};

// Helper Functions

function classifyProduct(product) {
  const type = (product.type || '').toLowerCase();
  const tags = product.tags || [];
  const handle = product.handle || '';

  // Convert all tags to lowercase for comparison
  const tagsLower = tags.map(t => t.toLowerCase());

  return {
    isPreview: handle === PREVIEW_HANDLE,
    isGemstone: GEMSTONE_TYPES.includes(type) ||
                tagsLower.some(tag => GEMSTONE_TAGS.includes(tag)),
    isSetting: SETTING_TYPES.includes(type) ||
               tagsLower.some(tag => SETTING_TAGS.includes(tag))
  };
}

async function fetchProductDetails(admin, handle) {
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
          priceRange {
            minVariantPrice {
              amount
              currencyCode
            }
          }
          variants(first: 100) {
            edges {
              node {
                id
                title
                price
                availableForSale
                selectedOptions {
                  name
                  value
                }
                metafields(first: 20) {
                  edges {
                    node {
                      namespace
                      key
                      value
                    }
                  }
                }
              }
            }
          }
          metafields(first: 50, namespace: "custom") {
            edges {
              node {
                key
                value
                type
              }
            }
          }
        }
      }`,
      { variables: { handle } }
    );
    
    const { data } = await response.json();
    return data?.productByHandle;
    
  } catch (error) {
    console.error('Error fetching product:', error);
    return null;
  }
}

function processProductData(product) {
  if (!product) return null;
  
  const metafields = {};
  product.metafields?.edges?.forEach(edge => {
    const { key, value } = edge.node;
    metafields[key] = value;
  });
  
  const variants = product.variants.edges.map(edge => {
    const variant = edge.node;
    const gid = variant.id.split('/').pop();
    
    // Process variant metafields
    const variantMetafields = {};
    console.log('Raw variant metafields edges:', variant.metafields?.edges);
    variant.metafields?.edges?.forEach(mfEdge => {
      variantMetafields[mfEdge.node.key] = mfEdge.node.value;
      console.log('Adding metafield:', mfEdge.node.key, '=', mfEdge.node.value);
    });
    
    return {
      id: gid,
      gid: variant.id,
      title: variant.title,
      price: variant.price,
      available: variant.availableForSale,
      option1: variant.selectedOptions[0]?.value,
      option2: variant.selectedOptions[1]?.value,
      option3: variant.selectedOptions[2]?.value,
      metafields: variantMetafields
    };
  });
  
  // Find first available variant
  const firstAvailable = variants.find(v => v.available) || variants[0];
  
  return {
    id: product.id.split('/').pop(),
    gid: product.id,
    handle: product.handle,
    title: product.title,
    type: product.productType,
    vendor: product.vendor,
    tags: product.tags,
    price: product.priceRange.minVariantPrice.amount,
    currency: product.priceRange.minVariantPrice.currencyCode,
    metafields,
    variants,
    selected_or_first_available_variant: firstAvailable
  };
}

// In api.product-builder.jsx, update the generatePreviewHTML function
// This controls what shows on the dynamic preview page ONLY

async function generatePreviewHTML({ settings, urlParams, admin, session }) {
  if (!urlParams.gemstone || !urlParams.setting) {
    return '';
  }
  
  if (!settings.show_info_table) {
    return '<div class="rb-wrap"></div>';
  }
  
  return `
<style>${getStyles()}</style>
<div class="rb-wrap">
  <div class="rb-single-container" id="rb-combined-details">
    <div class="rb-loading">
      <div class="loading-spinner"></div>
      <p style="margin-top:10px;color:#6b7280;">Loading ring details...</p>
    </div>
  </div>
</div>
<script>
(function(){
  const u = new URLSearchParams(location.search);
  const gh = u.get('gemstone');
  const sh = u.get('setting');
  const sv = u.get('setting_variant');
  if (!gh || !sh) return;
  
  async function load() {
    const c = document.getElementById('rb-combined-details');
    try {
      const [g, s] = await Promise.all([
        fp(gh, 'gemstone'),
        fp(sh, 'setting')
      ]);
      c.innerHTML = '';
      c.appendChild(createCombinedTable(g, s));
    } catch(e) {
      c.innerHTML = '<p style="text-align:center;color:#ef4444;">Error loading ring details</p>';
    }
  }
  async function fp(handle, type) {
    const r = await fetch('/apps/nanogem-builder/product-details?handle=' + handle);
    if (!r.ok) throw new Error('Failed to load ' + type);
    return await r.json();
  }
  
  function createCombinedTable(diamond, setting) {
    const d = document.createElement('div');
    d.className = 'rb-info';

    const h3 = document.createElement('h3');
    h3.textContent = 'Ring Details';
    d.appendChild(h3);

    const dl = document.createElement('dl');

    // Combined fields from both diamond and setting
    if (diamond.metafields) {
      const dm = diamond.metafields;

      // Diamond Shape
      if (dm.stone_shape) {
        ar(dl, 'Shape', dm.stone_shape);
      }

      // Weight (Carat)
      if (dm.stone_weight) {
        ar(dl, 'Carat', dm.stone_weight);
      }

      // Color
      if (dm.stone_color) {
        ar(dl, 'Color', dm.stone_color);
      }

      // Clarity
      if (dm.stone_clarity) {
        ar(dl, 'Clarity', dm.stone_clarity);
      }

      // Cut Grade
      if (dm.cut_grade) {
        ar(dl, 'Cut', dm.cut_grade);
      }

      // Certificate
      if (dm.certification_laboratory) {
        ar(dl, 'Certificate', dm.certification_laboratory);
      }
    }
    
    // Setting Metal - from variant or default
    const sv = u.get('setting_variant');
    let metalType = 'Not specified';
    
    if (sv && setting.variants && setting.variants.length > 0) {
      const variant = setting.variants.find(v => 
        v.id == sv || v.id.toString() === sv || v.id.includes(sv)
      );
      if (variant && variant.option1) {
        metalType = variant.option1;
      }
    } else if (setting.variants && setting.variants.length > 0 && setting.variants[0].option1) {
      metalType = setting.variants[0].option1;
    } else if (setting.metafields && setting.metafields.metal_type) {
      metalType = setting.metafields.metal_type;
    }
    
    ar(dl, 'Metal', metalType);
    // Metal Weight - from variant metafields
    // Metal Weight - from variant metafields
    if (sv && setting.variants && setting.variants.length > 0) {
      const variant = setting.variants.find(v => 
        v.id == sv || v.id.toString() === sv || v.id.includes(sv)
      );
      console.log('Found variant:', variant);
      console.log('Variant metafields:', variant?.metafields);
      if (variant && variant.metafields && variant.metafields.metal_weight) {
        ar(dl, 'Metal Weight', variant.metafields.metal_weight);
      }
    } else if (setting.selected_or_first_available_variant && 
              setting.selected_or_first_available_variant.metafields && 
              setting.selected_or_first_available_variant.metafields.metal_weight) {
      console.log('Using selected variant:', setting.selected_or_first_available_variant);
      console.log('Selected variant metafields:', setting.selected_or_first_available_variant.metafields);
      ar(dl, 'Metal Weight', setting.selected_or_first_available_variant.metafields.metal_weight);
    }
    console.log('Full setting object:', setting);
    
    d.appendChild(dl);
    return d;
  }
  
  function ar(dl, l, v, c) {
    if (!v) return;
    const r = document.createElement('div');
    r.className = 'rb-info-row';
    r.setAttribute('data-label', l);
    const dt = document.createElement('dt');
    dt.textContent = l;
    const dd = document.createElement('dd');
    if (c) dd.className = c;
    dd.innerHTML = v;
    r.appendChild(dt);
    r.appendChild(dd);
    dl.appendChild(r);
  }
  
  function fm(c) {
    return window.Shopify?.formatMoney ? 
      window.Shopify.formatMoney(c, ${JSON.stringify(session.shop.moneyFormat || '${{amount}}')}) : 
      '${session.shop.currency || 'USD'}' + (c / 100).toFixed(2);
  }
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', load);
  } else {
    load();
  }
})();
</script>`;
}


function generateProductHTML({ product, classification, settings, urlParams, session }) {
  const { isGemstone, isSetting, isPreview } = classification;
  
  let html = `<style>${getStyles()}</style>\n<div class="rb-wrap">`;
  
  // Add product info table if enabled
  if (settings.show_info_table && !isPreview) {
    html += generateInfoTable(product, isGemstone ? 'gem' : 'set', session);
  }
  
  // Generate button section
  const currentVariantId = product.selected_or_first_available_variant.id;
  const hasBothSelected = (isGemstone && urlParams.setting) || (isSetting && urlParams.gemstone);
  
  html += `
<div class="rb-btn-wrap" 
     data-type="${isGemstone ? 'gem' : 'set'}" 
     data-handle="${product.handle}" 
     data-gcol="${settings.gemstone_collection}" 
     data-scol="${settings.settings_collection}" 
     data-current-variant="${currentVariantId}">
  <noscript>JavaScript required for product builder.</noscript>
</div>
</div>`;

  // Add inline script
  html += `
  <script>
  (function() {
    // Function to initialize the button
    const initButton = function() {
      const w = document.querySelector('.rb-btn-wrap');
      if (!w) return;
      
      const t = w.dataset.type;
      const h = w.dataset.handle;
      const gc = w.dataset.gcol;
      const sc = w.dataset.scol;
      const cv = w.dataset.currentVariant;
      
      // Read initial params for display purposes only
      const p = new URLSearchParams(location.search);
      const sg = p.get('gemstone');
      const ss = p.get('setting');
      const both = (t == 'gem' && ss) || (t == 'set' && sg);
      
    // Create button container
    // Create button container
    w.innerHTML = '';

    // Create grid container for first row
    const firstRow = document.createElement('div');
    firstRow.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px';

    // First button - Choose/Add Both (black background, white text)
    const b1 = document.createElement('button');
    b1.type = 'button';
    b1.className = 'button';
    b1.style.cssText = 'background:#000000;color:#ffffff;border:1px solid #000000;border-radius:0;padding:8px 12px;font-size:13px;';
    b1.innerHTML = both ? '${settings.add_both_text}' : 
                  (t == 'gem' ? 'Choose this Stone' : 'Choose this Setting');

    b1.onclick = both ? function() {
      // Existing add both functionality
      const currentP = new URLSearchParams(location.search);
      const currentSg = currentP.get('gemstone');
      const currentSs = currentP.get('setting');
      const currentUv = currentP.get('variant');
      const currentSv = currentP.get('setting_variant');
      const currentAv = currentUv || cv;
      
      location.href = '/products/custom-ring-preview?gemstone=' + (t == 'gem' ? h : currentSg) + 
                      '&setting=' + (t == 'set' ? h : currentSs) + 
                      (t == 'set' && currentAv ? '&setting_variant=' + currentAv : 
                      t == 'gem' && currentSv ? '&setting_variant=' + currentSv : 
                      t == 'gem' && currentUv ? '&setting_variant=' + currentUv : '');
    } : function() {
      // Existing choose functionality
      const currentP = new URLSearchParams(location.search);
      const currentUv = currentP.get('variant');
      const currentAv = currentUv || cv;
      
      location.href = '${session.shop.primaryDomain ? 'https://' + session.shop.primaryDomain : ''}/collections/' + 
                      (t == 'gem' ? sc : gc) + '?' + (t == 'gem' ? 'gemstone' : 'setting') + '=' + h + 
                      (t == 'set' && currentAv ? '&setting_variant=' + currentAv : '');
    };

    // Second button - Add to Cart (white background, black text)
    const b2 = document.createElement('button');
    b2.type = 'button';
    b2.className = 'button';
    b2.style.cssText = 'background:#ffffff;color:#000000;border:1px solid #000000;border-radius:0;padding:8px 12px;font-size:13px;';
    b2.innerHTML = 'Add to Cart';

    b2.onclick = function() {
      // Get current variant from various possible selectors
      const variantRadio = document.querySelector('variant-radios input[type="radio"]:checked');
      const variantSelect = document.querySelector('variant-selects select');
      const variantInput = document.querySelector('[name="id"]');
      const currentV = (variantRadio && variantRadio.value) || 
                      (variantSelect && variantSelect.value) || 
                      (variantInput && variantInput.value) || 
                      cv;
      
      fetch('/cart/add.js', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: currentV,
          quantity: 1
        })
      })
      .then(response => {
        if (!response.ok) throw new Error('Failed to add to cart');
        return response.json();
      })
      .then(data => {
        // Update cart count
        const cartBubbles = document.querySelectorAll('.cart-count-bubble span, .cart-count');
        cartBubbles.forEach(bubble => {
          const currentCount = parseInt(bubble.textContent) || 0;
          bubble.textContent = currentCount + 1;
        });
        
        // Show notification
        const msg = document.createElement('div');
        msg.style.cssText = 'position:fixed;top:20px;right:20px;background:#000;color:#fff;padding:12px 20px;border-radius:4px;z-index:9999;font-size:14px;';
        msg.textContent = 'Added to cart!';
        document.body.appendChild(msg);
        
        // Try to open cart drawer
        if (window.Shopify && window.Shopify.theme && typeof window.Shopify.theme.openCartDrawer === 'function') {
          window.Shopify.theme.openCartDrawer();
        }
        
        setTimeout(() => msg.remove(), 3000);
      })
      .catch(err => {
        console.error('Error adding to cart:', err);
        alert('Failed to add to cart. Please try again.');
      });
    };

    // Add both buttons to first row
    firstRow.appendChild(b1);
    firstRow.appendChild(b2);
    w.appendChild(firstRow);

    // Third button - Request Information (white background, black text)
    const b3 = document.createElement('button');
    b3.type = 'button';
    b3.className = 'button button--full-width';
    b3.style.cssText = 'background:#ffffff;color:#000000;border:1px solid #e0e0e0;border-radius:0;padding:8px 12px;font-size:13px;margin-top:0;';
    b3.innerHTML = 'Request Information';

    b3.onclick = function() {
      // Does nothing for now
      console.log('Request information clicked');
    };

    w.appendChild(b3);
              
      if (both) {
        const pi = document.createElement('div');
        pi.className = 'rb-price';
        pi.textContent = 'Both items will be added to your cart';
        w.appendChild(pi);
      }
    };
    
    // Run immediately
    initButton();
    
    // Also try on DOMContentLoaded in case we're early
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initButton);
    }
  })();
  </script>`;
  return html;
}

function generateInfoTable(product, type, session) {
  const isGem = type === 'gem';
  const title = isGem ? 'Gemstone' : 'Setting';
  
  let html = `
<div class="rb-info">
<dl>`;

  if (isGem) {
    // Gemstone fields
    const gemFields = [
      { key: 'gemstone_type', fallback: 'stone_type', label: 'Type' },
      { key: 'gemstone_shape', label: 'Shape' },
      { key: 'gemstone_weight', label: 'Weight', suffix: ' ct' },
      { key: 'gemstone_color', label: 'Color' },
      { key: 'gemstone_dimensions', label: 'Dimensions' },
      { key: 'gemstone_treatment', label: 'Treatment', special: true },
      { key: 'gemstone_origin', label: 'Origin' },
      { key: 'certification_laboratory', label: 'Certificate', badge: true }
    ];
    gemFields.forEach(field => {
      let value = product.metafields[field.key];
      if (!value && field.fallback) {
        value = product.metafields[field.fallback];
      }
      
      if (value) {
        let displayValue = value;
        let className = '';
        
        if (field.suffix) displayValue += field.suffix;
        if (field.badge) displayValue = `<span class="badge">${value}</span>`;
        if (field.special && (value === 'Natural' || value === 'None')) {
          className = 'natural';
        }
        
        html += `<div class="rb-info-row"><dt>${field.label}</dt><dd${className ? ` class="${className}"` : ''}>${displayValue}</dd></div>`;
      }
    });
  } else {
    // Setting fields
    if (product.type) {
      html += `<div class="rb-info-row"><dt>Type</dt><dd>${product.type}</dd></div>`;
    }
    
    const style = product.metafields.ring_style || product.metafields.product_style;
    if (style) {
      html += `<div class="rb-info-row"><dt>Style</dt><dd>${style}</dd></div>`;
    }
    
    if (product.metafields.center_stone_shape) {
      html += `<div class="rb-info-row"><dt>Fits Shape</dt><dd>${product.metafields.center_stone_shape}</dd></div>`;
    }

    // Check for metal weight in selected variant
    const selectedVariant = product.selected_or_first_available_variant;
    if (selectedVariant.metafields && selectedVariant.metafields.metal_weight) {
      html += `<div class="rb-info-row"><dt>Metal Weight</dt><dd>${selectedVariant.metafields.metal_weight}</dd></div>`;
    }
  }
  
  html += `</dl>
</div>`;
  
  return html;
}

function getStyles() {
  return `.rb-info dl{margin:0;padding:0}.rb-wrap{margin:20px 0}.rb-info{background:#fff;border-radius:0;overflow:hidden;margin-bottom:20px}.rb-info h3{background:#f9fafb;padding:12px 16px;margin:0;font-size:14px;text-transform:uppercase;letter-spacing:.5px;color:#000000;font-weight:600}.rb-info-row{display:grid;grid-template-columns:120px 1fr;margin:0}.rb-info-row:nth-child(odd){background:#f5f5f5}.rb-info-row:nth-child(even){background:#ffffff}.rb-info-row dt{padding:10px 16px;font-size:13px;color:#000000;font-weight:600;text-align:left}.rb-info-row dd{padding:10px 16px;margin:0;font-size:13px;color:#000000;text-align:right}.rb-info-row .badge{display:inline-block;background:#f0f0f0;color:#000000;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:500}.rb-info-row .natural{color:#059669;font-weight:600}.rb-btn-wrap{margin-top:0}.rb-btn-wrap button{width:100%;padding:12px 20px;font-size:14px;font-weight:500;text-align:center;background:#000000;color:#ffffff;border:none;border-radius:0 0 8px 8px;cursor:pointer;transition:all 0.2s;margin:0}.rb-btn-wrap button:hover{background:#666666}.rb-price{text-align:center;margin-top:8px;font-size:13px;color:#6b7280}.rb-dual-container{display:flex;flex-direction:column;gap:20px}.rb-loading{text-align:center;padding:40px}.loading-spinner{display:inline-block;width:40px;height:40px;border:3px solid #f3f4f6;border-top-color:#3b82f6;border-radius:50%;animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}@media(max-width:768px){.rb-info{padding:0!important}.rb-info dl{margin:0!important;padding:0!important}.rb-info-row{grid-template-columns:1fr 1fr;min-height:auto;display:grid;align-items:center;margin:0!important;gap:0!important;border:none!important;padding:0!important}.rb-info-row dt,.rb-info-row dd{padding:8px 10px!important;font-size:12px;display:flex;align-items:center;min-height:auto;margin:0!important;line-height:1.2;border:none!important}.rb-info-row dd{text-align:right;justify-content:flex-end}.rb-info-row:after{display:none!important}}`;
}
// Response helpers
function createErrorResponse(message) {
  return new Response(
    `<div class="rb-wrap"><p style="text-align:center;color:#ef4444;">${message}</p></div>`,
    { 
      status: 400,
      headers: { 
        'Content-Type': 'text/html',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
        'Access-Control-Allow-Headers': 'Content-Type'
      } 
    }
  );
}

function createSuccessResponse(html) {
  return new Response(html, {
    status: 200,
    headers: { 
      'Content-Type': 'text/html',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Cache-Control': 'public, max-age=300'
    }
  });
}

// Export additional endpoint for product details (used by preview)
export const action = async ({ request }) => {
  if (request.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }
  
  try {
    const { admin } = await authenticate.public.appProxy(request);
    const url = new URL(request.url);
    const handle = url.searchParams.get('handle');
    
    if (!handle) {
      return new Response(JSON.stringify({ error: 'Handle required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const product = await fetchProductDetails(admin, handle);
    if (!product) {
      return new Response(JSON.stringify({ error: 'Product not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const productData = processProductData(product);
    
    // Convert to format expected by frontend
    const response = {
      id: productData.id,
      title: productData.title,
      handle: productData.handle,
      type: productData.type,
      price: productData.price,
      metafields: productData.metafields,
      variants: productData.variants.map(v => ({
        id: v.id,
        title: v.title,
        price: v.price,
        option1: v.option1,
        option2: v.option2,
        option3: v.option3,
        metafields: v.metafields
      }))
    };
    
    return new Response(JSON.stringify(response), {
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
    
  } catch (error) {
    console.error('Product details error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};