// app/routes/apps.nanogem-builder.instore.gemstone-detail.tsx
import type { LoaderFunction } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export const loader: LoaderFunction = async ({ request }) => {
  const { admin } = await authenticate.public.appProxy(request);
  
  try {
    const url = new URL(request.url);
    const handle = url.searchParams.get('handle');
    const returnUrl = url.searchParams.get('return') || '/apps/nanogem-builder/instore/select-gemstone';
    
    if (!handle) {
      return new Response("Product handle required", { status: 400 });
    }
    
    // Fetch detailed product information
    const response = await admin.graphql(
      `#graphql
        query getGemstoneDetails($handle: String!) {
          productByHandle(handle: $handle) {
            id
            title
            handle
            description
            vendor
            productType
            tags
            images(first: 10) {
              edges {
                node {
                  url
                  altText
                  width
                  height
                }
              }
            }
            priceRangeV2 {
              minVariantPrice {
                amount
                currencyCode
              }
            }
            variants(first: 10) {
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
                }
              }
            }
            # Diamond metafields
            labDiamondType: metafield(namespace: "custom", key: "lab_diamond_type") { value }
            stoneShape: metafield(namespace: "custom", key: "stone_shape") { value }
            stoneWeight: metafield(namespace: "custom", key: "stone_weight") { value }
            stoneColor: metafield(namespace: "custom", key: "stone_color") { value }
            stoneDimensions: metafield(namespace: "custom", key: "stone_dimensions") { value }
            stoneClarity: metafield(namespace: "custom", key: "stone_clarity") { value }
            treatment: metafield(namespace: "custom", key: "treatment") { value }
            certificate: metafield(namespace: "custom", key: "certificate") { value }
            # Cut details
            cutGrade: metafield(namespace: "custom", key: "cut_grade") { value }
            polishGrade: metafield(namespace: "custom", key: "polish_grade") { value }
            symmetryGrade: metafield(namespace: "custom", key: "symmetry_grade") { value }
            fluorescence: metafield(namespace: "custom", key: "fluorescence") { value }
          }
        }
      `,
      { variables: { handle } }
    );
    
    const { data } = await response.json();
    const product = data?.productByHandle;
    
    if (!product) {
      return new Response("Product not found", { status: 404 });
    }
    
    // Extract product data
    const productId = product.id.split('/').pop();
    const images = product.images.edges.map(edge => edge.node);
    const price = parseFloat(product.priceRangeV2.minVariantPrice.amount);
    const currency = product.priceRangeV2.minVariantPrice.currencyCode;
    const firstVariant = product.variants.edges[0]?.node;
    
    // Parse shape from metaobject reference (format: "center_stone_shape.round" -> "Round")
    const parseShape = (shapeValue: string | undefined) => {
      if (!shapeValue) return '';
      if (shapeValue.includes('.')) {
        const shapePart = shapeValue.split('.').pop() || '';
        return shapePart.charAt(0).toUpperCase() + shapePart.slice(1);
      }
      return shapeValue;
    };

    // Parse diamond type from metaobject reference
    const parseDiamondType = (typeValue: string | undefined) => {
      if (!typeValue) return product.productType || 'Lab Diamond';
      if (typeValue.includes('.')) {
        const typePart = typeValue.split('.').pop() || '';
        return typePart.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      }
      return typeValue;
    };

    // Parse certificate (format: "IGI - LG737512445")
    const certificateValue = product.certificate?.value || '';
    const certParts = certificateValue.split(' - ');
    const certLab = certParts[0] || '';
    const certNumber = certParts[1] || '';

    // Collect all metafields - Updated for diamonds
    const metafields = {
      // Basic Info (4 C's)
      type: parseDiamondType(product.labDiamondType?.value),
      shape: parseShape(product.stoneShape?.value),
      weight: product.stoneWeight?.value,
      color: product.stoneColor?.value,
      clarity: product.stoneClarity?.value,
      dimensions: product.stoneDimensions?.value,

      // Treatment (CVD/HPHT for lab diamonds)
      treatment: product.treatment?.value,

      // Cut Details
      cut: product.cutGrade?.value,
      polish: product.polishGrade?.value,
      symmetry: product.symmetryGrade?.value,
      fluorescence: product.fluorescence?.value,

      // Certification
      laboratory: certLab,
      certNumber: certNumber,
      certificateFull: certificateValue,
    };
    
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
      <meta charset="UTF-8">
      <title>${product.title} - Diamond Details</title>
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
          -webkit-touch-callout: none;
          -webkit-user-select: none;
          user-select: none;
        }
        
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', 'Segoe UI', sans-serif;
          background: #f5f5f5;
          color: #000;
          overflow-x: hidden;
        }
        
        /* Header */
        .detail-header {
          background: #fff;
          border-bottom: 1px solid #e0e0e0;
          padding: 15px 20px;
          position: sticky;
          top: 0;
          z-index: 100;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        
        .back-button {
          background: none;
          border: none;
          font-size: 16px;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 0;
          color: #000;
        }
        
        .header-title {
          font-size: 18px;
          font-weight: 300;
          letter-spacing: -0.5px;
          flex: 1;
          text-align: center;
          margin: 0 20px;
        }
        
        .price-badge {
          background: #000;
          color: #fff;
          padding: 6px 16px;
          border-radius: 20px;
          font-size: 16px;
          font-weight: 300;
        }
        
        /* Main content */
        .detail-content {
          max-width: 1200px;
          margin: 0 auto;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 40px;
          padding: 30px;
        }
        
        /* Image section */
        .image-section {
          position: relative;
        }
        
        .main-image {
          width: 100%;
          aspect-ratio: 1;
          background: #fff;
          border-radius: 12px;
          overflow: hidden;
          box-shadow: 0 4px 20px rgba(0,0,0,0.08);
        }
        
        .main-image img {
          width: 100%;
          height: 100%;
          object-fit: contain;
        }
        
        .image-thumbnails {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 10px;
          margin-top: 15px;
        }
        
        .thumbnail {
          aspect-ratio: 1;
          background: #fff;
          border-radius: 8px;
          overflow: hidden;
          cursor: pointer;
          border: 2px solid transparent;
          transition: all 0.2s ease;
        }
        
        .thumbnail:hover {
          border-color: #000;
        }
        
        .thumbnail.active {
          border-color: #000;
        }
        
        .thumbnail img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        
        /* Info section */
        .info-section {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        
        .info-card {
          background: #fff;
          border-radius: 12px;
          overflow: hidden;
          box-shadow: 0 2px 10px rgba(0,0,0,0.05);
        }
        
        .info-header {
          background: #fafafa;
          padding: 15px 20px;
          border-bottom: 1px solid #f0f0f0;
          font-size: 14px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        
        .info-content {
          padding: 0;
        }
        
        .info-row {
          display: grid;
          grid-template-columns: 140px 1fr;
          border-bottom: 1px solid #f0f0f0;
        }
        
        .info-row:last-child {
          border-bottom: none;
        }
        
        .info-label {
          padding: 12px 20px;
          font-size: 13px;
          font-weight: 500;
          color: #666;
          background: #fafafa;
          border-right: 1px solid #f0f0f0;
        }
        
        .info-value {
          padding: 12px 20px;
          font-size: 13px;
          color: #000;
        }
        
        .badge {
          display: inline-block;
          background: #f0f0f0;
          color: #000;
          padding: 3px 12px;
          border-radius: 12px;
          font-size: 11px;
          font-weight: 500;
        }
        
        .natural {
          color: #059669;
          font-weight: 600;
        }
        
        /* Action buttons */
        .action-buttons {
          position: sticky;
          bottom: 0;
          background: #fff;
          border-top: 1px solid #e0e0e0;
          padding: 15px 20px;
          display: flex;
          gap: 10px;
          z-index: 100;
        }
        
        .action-button {
          flex: 1;
          padding: 15px 20px;
          border: none;
          border-radius: 8px;
          font-size: 16px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
          text-align: center;
        }
        
        .select-button {
          background: #000;
          color: #fff;
        }
        
        .select-button:hover {
          background: #333;
        }
        
        .compare-button {
          background: #fff;
          color: #000;
          border: 1px solid #e0e0e0;
        }
        
        .compare-button:hover {
          background: #f5f5f5;
        }
        
        /* Mobile responsive */
        @media (max-width: 768px) {
          .detail-content {
            grid-template-columns: 1fr;
            gap: 20px;
            padding: 20px;
          }
          
          .header-title {
            font-size: 16px;
          }
          
          .price-badge {
            font-size: 14px;
            padding: 5px 12px;
          }
          
          .info-row {
            grid-template-columns: 120px 1fr;
          }
          
          .info-label, .info-value {
            padding: 10px 15px;
            font-size: 12px;
          }
          
          .image-thumbnails {
            grid-template-columns: repeat(5, 1fr);
            gap: 8px;
          }
          
          .action-button {
            font-size: 14px;
            padding: 12px 16px;
          }
        }
        
        /* Loading state */
        .loading {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100vh;
          flex-direction: column;
          gap: 20px;
        }
        
        .spinner {
          width: 40px;
          height: 40px;
          border: 3px solid #f0f0f0;
          border-top-color: #000;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }
        
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      </style>
    </head>
    <body>
      <!-- Header -->
      <div class="detail-header">
        <button class="back-button" onclick="goBack()">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
          Back
        </button>
        <h1 class="header-title">${product.title}</h1>
        <div class="price-badge">${currency}${price.toFixed(2)}</div>
      </div>
      
      <!-- Main Content -->
      <div class="detail-content">
        <!-- Image Section -->
        <div class="image-section">
          <div class="main-image">
            <img id="mainImage" src="${images[0]?.url || ''}" alt="${product.title}">
          </div>
          ${images.length > 1 ? `
            <div class="image-thumbnails">
              ${images.map((img, index) => `
                <div class="thumbnail ${index === 0 ? 'active' : ''}" onclick="changeImage('${img.url}', this)">
                  <img src="${img.url}" alt="View ${index + 1}">
                </div>
              `).join('')}
            </div>
          ` : ''}
        </div>
        
        <!-- Info Section -->
        <div class="info-section">
          <!-- Basic Information -->
          <div class="info-card">
            <div class="info-header">Basic Information</div>
            <div class="info-content">
              ${metafields.type ? `
                <div class="info-row">
                  <div class="info-label">Type</div>
                  <div class="info-value">${metafields.type}</div>
                </div>
              ` : ''}
              ${metafields.shape ? `
                <div class="info-row">
                  <div class="info-label">Shape</div>
                  <div class="info-value">${metafields.shape}</div>
                </div>
              ` : ''}
              ${metafields.weight ? `
                <div class="info-row">
                  <div class="info-label">Weight</div>
                  <div class="info-value">${metafields.weight} ct</div>
                </div>
              ` : ''}
              ${metafields.color ? `
                <div class="info-row">
                  <div class="info-label">Color</div>
                  <div class="info-value">${metafields.color}</div>
                </div>
              ` : ''}
              ${metafields.clarity ? `
                <div class="info-row">
                  <div class="info-label">Clarity</div>
                  <div class="info-value">${metafields.clarity}</div>
                </div>
              ` : ''}
              ${metafields.dimensions ? `
                <div class="info-row">
                  <div class="info-label">Dimensions</div>
                  <div class="info-value">${metafields.dimensions}</div>
                </div>
              ` : ''}
            </div>
          </div>
          
          <!-- Treatment & Origin -->
          ${(metafields.treatment || metafields.origin) ? `
            <div class="info-card">
              <div class="info-header">Treatment & Origin</div>
              <div class="info-content">
                ${metafields.treatment ? `
                  <div class="info-row">
                    <div class="info-label">Treatment</div>
                    <div class="info-value">
                      <span class="${metafields.treatment === 'Natural' || metafields.treatment === 'None' ? 'natural' : ''}">${metafields.treatment}</span>
                    </div>
                  </div>
                ` : ''}
                ${metafields.origin ? `
                  <div class="info-row">
                    <div class="info-label">Origin</div>
                    <div class="info-value">${metafields.origin}</div>
                  </div>
                ` : ''}
              </div>
            </div>
          ` : ''}
          
          <!-- Cut Details -->
          ${(metafields.cut || metafields.polish || metafields.symmetry || metafields.fluorescence || metafields.depth || metafields.table) ? `
            <div class="info-card">
              <div class="info-header">Cut Details</div>
              <div class="info-content">
                ${metafields.cut ? `
                  <div class="info-row">
                    <div class="info-label">Cut</div>
                    <div class="info-value">${metafields.cut}</div>
                  </div>
                ` : ''}
                ${metafields.polish ? `
                  <div class="info-row">
                    <div class="info-label">Polish</div>
                    <div class="info-value">${metafields.polish}</div>
                  </div>
                ` : ''}
                ${metafields.symmetry ? `
                  <div class="info-row">
                    <div class="info-label">Symmetry</div>
                    <div class="info-value">${metafields.symmetry}</div>
                  </div>
                ` : ''}
                ${metafields.fluorescence ? `
                  <div class="info-row">
                    <div class="info-label">Fluorescence</div>
                    <div class="info-value">${metafields.fluorescence}</div>
                  </div>
                ` : ''}
                ${metafields.depth ? `
                  <div class="info-row">
                    <div class="info-label">Depth %</div>
                    <div class="info-value">${metafields.depth}%</div>
                  </div>
                ` : ''}
                ${metafields.table ? `
                  <div class="info-row">
                    <div class="info-label">Table %</div>
                    <div class="info-value">${metafields.table}%</div>
                  </div>
                ` : ''}
              </div>
            </div>
          ` : ''}
          
          <!-- Certification -->
          ${metafields.laboratory ? `
            <div class="info-card">
              <div class="info-header">Certification</div>
              <div class="info-content">
                <div class="info-row">
                  <div class="info-label">Laboratory</div>
                  <div class="info-value">
                    <span class="badge">${metafields.laboratory}</span>
                  </div>
                </div>
                ${metafields.certNumber ? `
                  <div class="info-row">
                    <div class="info-label">Certificate #</div>
                    <div class="info-value">${metafields.certNumber}</div>
                  </div>
                ` : ''}
                ${metafields.certDate ? `
                  <div class="info-row">
                    <div class="info-label">Date</div>
                    <div class="info-value">${metafields.certDate}</div>
                  </div>
                ` : ''}
              </div>
            </div>
          ` : ''}
        </div>
      </div>
      
      <!-- Action Buttons -->
      <div class="action-buttons">
        <button class="action-button select-button" onclick="selectGemstone()">
          Select This Diamond
        </button>
        <button class="action-button compare-button" onclick="compareGemstone()">
          Compare
        </button>
      </div>
      
      <script>
        // Store product data
        const productData = {
          id: '${productId}',
          handle: '${handle}',
          title: '${product.title.replace(/'/g, "\\'")}',
          price: ${price},
          currency: '${currency}',
          image: '${images[0]?.url || ''}',
          type: '${metafields.type || ''}',
          shape: '${metafields.shape || ''}',
          weight: '${metafields.weight || ''}',
          color: '${metafields.color || ''}'
        };
        
        // Change main image when thumbnail clicked
        function changeImage(url, thumbnail) {
          document.getElementById('mainImage').src = url;
          
          // Update active thumbnail
          document.querySelectorAll('.thumbnail').forEach(t => {
            t.classList.remove('active');
          });
          thumbnail.classList.add('active');
        }
        
        // Go back to previous page
        function goBack() {
          const returnUrl = '${returnUrl}';
          // Add returning flag to indicate we're coming back from detail view
          const separator = returnUrl.includes('?') ? '&' : '?';
          window.location.href = returnUrl + separator + 'returning=true';
        }
        
        // Select this gemstone
        function selectGemstone() {
          // Store selection
          sessionStorage.setItem('selectedGemstone', JSON.stringify(productData));
          
          // Navigate to setting selection
          window.location.href = '/apps/nanogem-builder/instore/select-setting';
        }
        
        // Compare gemstones (placeholder)
        function compareGemstone() {
          console.log('Compare functionality to be implemented');
        }
        
        // Prevent double-tap zoom
        let lastTouchEnd = 0;
        document.addEventListener('touchend', function(e) {
          const now = Date.now();
          if (now - lastTouchEnd <= 300) {
            e.preventDefault();
          }
          lastTouchEnd = now;
        }, false);
      </script>
    </body>
    </html>
    `;
    
    return new Response(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html",
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });
    
  } catch (error) {
    console.error("Error in gemstone detail view:", error);
    
    return new Response(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Error</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, sans-serif;
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
            margin: 0;
            background: #f5f5f5;
          }
          .error {
            text-align: center;
            padding: 40px;
          }
          h1 {
            font-size: 48px;
            font-weight: 200;
            margin-bottom: 20px;
          }
          p {
            font-size: 18px;
            color: #666;
            margin-bottom: 30px;
          }
          .button {
            background: #000;
            color: #fff;
            border: none;
            padding: 12px 30px;
            font-size: 16px;
            border-radius: 8px;
            cursor: pointer;
          }
        </style>
      </head>
      <body>
        <div class="error">
          <h1>Unable to Load Details</h1>
          <p>We couldn't load the diamond details.</p>
          <button class="button" onclick="window.history.back()">Go Back</button>
        </div>
      </body>
      </html>
    `, {
      status: 500,
      headers: {
        "Content-Type": "text/html",
      },
    });
  }
};