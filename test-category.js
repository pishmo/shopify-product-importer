// update-all-products-weight.js - Апдейт на тегло 1кг за всички продукти
const fetch = require('node-fetch');

const SHOPIFY_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const FILSTAR_TOKEN = process.env.FILSTAR_API_TOKEN;
const API_VERSION = '2024-10';
const FILSTAR_API_BASE = 'https://filstar.com/api';

const TEST_SKUS = [
  '925637'
];

async function fetchAllShopifyProducts() {
  console.log('📦 Fetching all products from Shopify...\n');
  let allProducts = [];
  let pageInfo = null;
  let page = 1;
  
  while (true) {
    const url = pageInfo 
      ? `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/products.json?limit=250&page_info=${pageInfo}`
      : `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/products.json?limit=250`;
    
    const response = await fetch(url, {
      headers: {
        'X-Shopify-Access-Token': ACCESS_TOKEN,
        'Content-Type': 'application/json'
      }
    });
    
    const data = await response.json();
    
    if (data.products && data.products.length > 0) {
      allProducts = allProducts.concat(data.products);
      console.log(`  Page ${page}: ${data.products.length} products (Total: ${allProducts.length})`);
      page++;
      
      // Check for next page
      const linkHeader = response.headers.get('Link');
      if (linkHeader && linkHeader.includes('rel="next"')) {
        const nextMatch = linkHeader.match(/<[^>]*page_info=([^>&]+)[^>]*>;\s*rel="next"/);
        pageInfo = nextMatch ? nextMatch[1] : null;
      } else {
        break;
      }
    } else {
      break;
    }
    
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  console.log(`\n✅ Total products fetched: ${allProducts.length}\n`);
  return allProducts;
}

async function updateProductWeight(productId, variantId, currentWeight) {
  const url = `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/variants/${variantId}.json`;
  
  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      'X-Shopify-Access-Token': ACCESS_TOKEN,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      variant: {
        id: variantId,
        weight: 1.0,
        weight_unit: 'kg'
      }
    })
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to update variant ${variantId}: ${error}`);
  }
  
  return await response.json();
}

async function updateAllProductsWeight() {
  const allProducts = await fetchAllShopifyProducts();
  
  console.log('🔄 Starting weight update to 1kg...\n');
  
  let updated = 0;
  let skipped = 0;
  let errors = 0;
  
  for (let i = 0; i < allProducts.length; i++) {
    const product = allProducts[i];
    
    for (const variant of product.variants) {
      try {
        // Update only if weight is not already 1kg
        if (variant.weight !== 1.0 || variant.weight_unit !== 'kg') {
          await updateProductWeight(product.id, variant.id, variant.weight);
          updated++;
          
          // Log every 100 updates
          if (updated % 100 === 0) {
            console.log(`  ✓ Updated ${updated} variants...`);
          }
        } else {
          skipped++;
        }
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 250));
        
      } catch (error) {
        errors++;
        console.log(`  ❌ Error updating variant ${variant.id}: ${error.message}`);
      }
    }
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('📊 SUMMARY:');
  console.log(`   Total products: ${allProducts.length}`);
  console.log(`   ✅ Updated: ${updated}`);
  console.log(`   ⏭️  Skipped (already 1kg): ${skipped}`);
  console.log(`   ❌ Errors: ${errors}`);
  console.log('='.repeat(80) + '\n');
}

updateAllProductsWeight();
