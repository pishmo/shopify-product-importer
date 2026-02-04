// update-product-weights.js - Масово обновяване на тегло за всички продукти


const fetch = require('node-fetch');

const fs = require('fs').promises;
const path = require('path');

const SHOPIFY_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const FILSTAR_TOKEN = process.env.FILSTAR_API_TOKEN;
const API_VERSION = '2025-01';

const DEFAULT_WEIGHT_GRAMS = 1000; // 1 kg

async function shopifyGraphQL(query, variables = {}) {
  const response = await fetch(
    `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/graphql.json`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': ACCESS_TOKEN
      },
      body: JSON.stringify({ query, variables })
    }
  );
  return response.json();
}

async function getAllProducts() {
  console.log('📦 Fetching all products from Shopify...\n');
  let allProducts = [];
  let hasNextPage = true;
  let cursor = null;
  
  while (hasNextPage) {
    const query = `
      query getProducts($cursor: String) {
        products(first: 50, after: $cursor) {
          pageInfo {
            hasNextPage
            endCursor
          }
          edges {
            node {
              id
              title
              variants(first: 100) {
                edges {
                  node {
                    id
                    sku
                    weight
                    weightUnit
                  }
                }
              }
            }
          }
        }
      }
    `;
    
    const result = await shopifyGraphQL(query, { cursor });
    const products = result.data.products.edges;
    
    allProducts = allProducts.concat(products);
    hasNextPage = result.data.products.pageInfo.hasNextPage;
    cursor = result.data.products.pageInfo.endCursor;
    
    console.log(`  ✓ Fetched ${products.length} products (total: ${allProducts.length})`);
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  console.log(`\n✅ Total products: ${allProducts.length}\n`);
  return allProducts;
}

async function updateVariantWeight(variantId, weightGrams) {
  const mutation = `
    mutation updateVariant($input: ProductVariantInput!) {
      productVariantUpdate(input: $input) {
        productVariant {
          id
          weight
          weightUnit
        }
        userErrors {
          field
          message
        }
      }
    }
  `;
  
  const variables = {
    input: {
      id: variantId,
      weight: weightGrams,
      weightUnit: "GRAMS"
    }
  };
  
  return shopifyGraphQL(mutation, variables);
}

async function updateAllWeights() {
  console.log('🚀 Starting weight update process...\n');
  
  const products = await getAllProducts();
  let updatedCount = 0;
  let skippedCount = 0;
  
  for (const productEdge of products) {
    const product = productEdge.node;
    console.log(`\n📦 Processing: ${product.title}`);
    
    for (const variantEdge of product.variants.edges) {
      const variant = variantEdge.node;
      
      // Обнови само ако теглото е 0 или липсва
      if (!variant.weight || variant.weight === 0) {
        console.log(`  ⚙️  Updating variant ${variant.sku || 'no-sku'}: 0g → ${DEFAULT_WEIGHT_GRAMS}g`);
        
        const result = await updateVariantWeight(variant.id, DEFAULT_WEIGHT_GRAMS);
        
        if (result.data.productVariantUpdate.userErrors.length > 0) {
          console.log(`  ❌ Error:`, result.data.productVariantUpdate.userErrors);
        } else {
          console.log(`  ✅ Updated`);
          updatedCount++;
        }
        
        await new Promise(resolve => setTimeout(resolve, 500)); // Rate limiting
      } else {
        console.log(`  ⏭️  Skipped variant ${variant.sku || 'no-sku'}: already has weight ${variant.weight}g`);
        skippedCount++;
      }
    }
  }
  
  console.log(`\n\n✅ DONE!`);
  console.log(`   Updated: ${updatedCount} variants`);
  console.log(`   Skipped: ${skippedCount} variants`);
}

updateAllWeights();
