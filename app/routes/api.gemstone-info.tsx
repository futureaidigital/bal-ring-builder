// app/routes/api.gemstone-info.tsx - CLEAN MINIMAL VERSION WITH CONTAINED BACKGROUND

import { authenticate } from "../shopify.server";
import { prisma } from "../utils/db.server";

export const loader = async ({ request }) => {
  try {
    console.log("🎯 GEMSTONE INFO ROUTE HIT!");
    
    // Authenticate with Shopify
    const { admin, session } = await authenticate.public.appProxy(request);
    
    // Parse parameters
    const url = new URL(request.url);
    const params = url.searchParams;
    
    const shop = session.shop;
    const productHandle = params.get("product_handle");
    const title = params.get("title") || "About This Gemstone";
    const showTitle = params.get("show_title") !== "false";
    const cardsPerRow = params.get("cards_per_row") || "3";
    
    console.log("✅ Shop:", shop);
    console.log("📦 Product:", productHandle);

    if (!productHandle) {
      return new Response(`
        <div style="text-align: center; padding: 40px; color: #666;">
          <p>Product information not available</p>
        </div>
      `, {
        status: 200,
        headers: { 'Content-Type': 'text/html', 'Access-Control-Allow-Origin': '*' }
      });
    }

    // Fetch product metafields
    const response = await admin.graphql(`
      query getProductMetafields($handle: String!) {
        productByHandle(handle: $handle) {
          title
          gemstoneOrigin: metafield(namespace: "custom", key: "gemstone_origin") { value }
          gemstoneTreatment: metafield(namespace: "custom", key: "gemstone_treatment") { value }
          certificationLaboratory: metafield(namespace: "custom", key: "certification_laboratory") { value }
          gemstoneType: metafield(namespace: "custom", key: "gemstone_type") { value }
          gemstoneWeight: metafield(namespace: "custom", key: "gemstone_weight") { value }
          gemstoneColor: metafield(namespace: "custom", key: "gemstone_color") { value }
          certificationNumber: metafield(namespace: "custom", key: "certification_number") { value }
        }
      }
    `, { variables: { handle: productHandle } });

    const data = await response.json();
    const product = data.data?.productByHandle;
    
    if (!product) {
      return new Response(`
        <div style="text-align: center; padding: 40px; color: #666;">
          <p>Product not found</p>
        </div>
      `, {
        status: 200,
        headers: { 'Content-Type': 'text/html', 'Access-Control-Allow-Origin': '*' }
      });
    }

    console.log("✅ Product found:", product.title);

    // Get metafield values
    const origin = product.gemstoneOrigin?.value;
    const treatment = product.gemstoneTreatment?.value;
    const certificate = product.certificationLaboratory?.value;
    
    console.log("📋 Metafields:", { origin, treatment, certificate });

    // Find matching definitions
    const matchingValues = [];
    if (origin) matchingValues.push({ name: origin, category: 'origin' });
    if (treatment) matchingValues.push({ name: treatment, category: 'treatment' });
    if (certificate) matchingValues.push({ name: certificate, category: 'certificate' });
    
    if (matchingValues.length === 0) {
      return new Response(`
        <div style="text-align: center; padding: 40px; color: #666;">
          <h3>About This ${product.gemstoneType?.value || 'Gemstone'}</h3>
          <p>Detailed information is being updated.</p>
        </div>
      `, {
        status: 200,
        headers: { 'Content-Type': 'text/html', 'Access-Control-Allow-Origin': '*' }
      });
    }

    // Query database for matching definitions
    const definitions = [];

    for (const mv of matchingValues) {
      const found = await prisma.originDefinition.findMany({
        where: {
          shop: shop,
          name: mv.name,
          category: mv.category,
          isActive: true
        }
      });
      definitions.push(...found);
    }

    // Sort the results
    definitions.sort((a, b) => {
      if (a.category !== b.category) {
        return a.category.localeCompare(b.category);
      }
      return a.sortOrder - b.sortOrder;
    });

    console.log("🔍 Database query results:");
    console.log("Shop:", shop);
    console.log("Looking for:", matchingValues);
    console.log("Found definitions:", definitions.length);
    console.log("Definitions:", definitions.map(d => ({ name: d.name, category: d.category, title: d.title })));
        
    console.log("📊 Found definitions:", definitions.length);

    if (definitions.length === 0) {
      return new Response(`
        <div style="text-align: center; padding: 40px; color: #666;">
          <h3>About This ${product.gemstoneType?.value || 'Gemstone'}</h3>
          <p>Information is being configured.</p>
        </div>
      `, {
        status: 200,
        headers: { 'Content-Type': 'text/html', 'Access-Control-Allow-Origin': '*' }
      });
    }

    // Generate HTML with clean minimal design - CONTAINED BACKGROUND
    const gridColumns = cardsPerRow || '3';
    
    // Default placeholder images if no image URL exists
    const placeholderImages = {
      origin: 'https://images.unsplash.com/photo-1611273426858-450d8e3c9fce?w=400&h=300&fit=crop',
      treatment: 'https://images.unsplash.com/photo-1532187863486-abf9dbad1b69?w=400&h=300&fit=crop',
      certificate: 'https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=400&h=300&fit=crop'
    };
    
    const html = `
    <style>
  /* Outer wrapper for centering */
  .minimal-gemstone-wrapper {
    width: 100%;
    display: flex;
    justify-content: center;
    margin: 0; /* Removed all margin */
  }
  
  /* Section with contained background - NO PADDING */
  .minimal-gemstone-section {
    background: #f5f5f5;
    padding: 0; /* Removed all padding */
    border-radius: 0; /* Removed border radius for seamless edge-to-edge */
    max-width: 100%; /* Full width */
    width: 100%;
    box-sizing: border-box;
  }
  
  .minimal-gemstone-container {
    max-width: 1100px;
    margin: 0 auto;
    padding: 40px 20px; /* Added padding here instead of outer section */
    box-sizing: border-box;
  }
  
  /* BOLDER TITLE */
  .minimal-gemstone-title {
    text-align: center;
    font-size: 28px;
    font-weight: 700; /* Bold */
    color: #333;
    margin-bottom: 30px;
    letter-spacing: 2px;
    text-transform: uppercase;
    ${!showTitle ? 'display: none;' : ''}
  }
  
  /* Grid container */
  .minimal-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 20px;
    justify-content: center;
  }
  
  /* Card sizing - REMOVED WHITE BACKGROUND */
  .minimal-card {
    flex: 0 1 calc(33.333% - 14px);
    max-width: 340px;
    background: transparent; /* Changed from #ffffff */
    border-radius: 0;
    overflow: hidden;
    box-shadow: none; /* Removed shadow */
    transition: transform 0.3s ease;
    box-sizing: border-box;
  }
  
  /* For 3 cards */
  @media (min-width: 769px) {
    .minimal-grid {
      justify-content: space-between;
    }
    
    .minimal-card:only-child {
      flex: 0 1 340px;
    }
    
    .minimal-card:nth-child(2):nth-last-child(1),
    .minimal-card:nth-child(1):nth-last-child(2) {
      flex: 0 1 calc(50% - 10px);
      max-width: 450px;
    }
  }
  
  .minimal-card:hover {
    transform: translateY(-2px);
    /* Removed hover shadow */
  }
  
  .minimal-card-image {
    width: 100%;
    height: 200px;
    overflow: hidden;
    background: #f0f0f0;
  }
  
  .minimal-card-image img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  
  /* Label with white background */
  .minimal-card-label {
    background: transparent; /* White background */
    color: #333; /* Dark text */
    padding: 15px 25px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    border-bottom: 1px solid #e5e5e5; /* Light border for definition */
    text-align: center;
  }
  
  /* Content area - transparent background */
  .minimal-card-content {
    padding: 25px;
    background: transparent; /* Changed from #fff */
  }
  
  .minimal-card-description {
    color: #333; /* Darker text for better readability on gray background */
    line-height: 1.7;
    font-size: 13px;
    margin: 0;
    text-align: center;
  }
  
  /* Mobile responsive */
  @media (max-width: 768px) {
    .minimal-gemstone-wrapper {
      margin: 0; /* No margin */
    }
    
    .minimal-gemstone-section {
      padding: 0; /* No padding */
      border-radius: 0;
    }
    
    .minimal-gemstone-container {
      padding: 20px 15px; /* Reduced padding on mobile */
    }
    
    .minimal-grid {
      flex-direction: column;
      align-items: center;
    }
    
    .minimal-card {
      flex: 0 1 100%;
      max-width: 100%;
      margin-bottom: 20px;
    }
    
    .minimal-card:last-child {
      margin-bottom: 0;
    }
    
    .minimal-gemstone-title {
      font-size: 22px;
      margin-bottom: 20px; /* Reduced from 30px */
      font-weight: 700; /* Keep bold on mobile */
    }
    
    .minimal-card-image {
      height: 180px;
    }
    
    .minimal-card-content {
      padding: 20px;
    }
    
    .minimal-card-label {
      font-size: 10px;
      padding: 12px 20px;
    }
  }
</style>

      
      <div class="minimal-gemstone-wrapper">
        <div class="minimal-gemstone-section">
          <div class="minimal-gemstone-container">
            ${showTitle ? `<h2 class="minimal-gemstone-title">${title}</h2>` : ''}
            
            <div class="minimal-grid">
              ${definitions.map(def => {
                const categoryLabel = def.category === 'origin' ? 'ORIGIN' : 
                                     (def.category === 'treatment' ? 'TREATMENT' : 'CERTIFICATE');
                const imageUrl = def.imageUrl || placeholderImages[def.category];
                
                return `
                  <div class="minimal-card">
                    <div class="minimal-card-label">${categoryLabel}</div>
                    <div class="minimal-card-image">
                      <img src="${imageUrl}" alt="${categoryLabel}">
                    </div>
                    <div class="minimal-card-content">
                      <p class="minimal-card-description">${def.description}</p>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        </div>
      </div>
    `;
    
    console.log("✅ Returning HTML");
    
    return new Response(html, {
      status: 200,
      headers: { 
        'Content-Type': 'text/html',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    });
    
  } catch (error) {
    console.error("❌ Error:", error);
    
    return new Response(`
      <div style="text-align: center; padding: 40px; color: #dc2626;">
        <h3>Error Loading Information</h3>
        <p>Please try again later.</p>
      </div>
    `, {
      status: 500,
      headers: { 
        'Content-Type': 'text/html',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
};