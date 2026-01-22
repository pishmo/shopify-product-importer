// fix-variant-names.js - Поправка на имена на варианти за влакна
const fetch = require('node-fetch');

const SHOPIFY_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const API_VERSION = '2024-10';

const LINE_COLLECTION_IDS = [
  'gid://shopify/Collection/738965946750', // монофилни
  'gid://shopify/Collection/738965979518', // плетени
  'gid://shopify/Collection/738987442558', // fluorocarbon
  'gid://shopify/Collection/739068576126'  // други
];

let stats = { checked: 0, updated: 0, skipped: 0 };

async function getCollectionProducts(collectionGid) {
  console.log(`\n📦 Fetching products from ${collectionGid}...`);
  let allProducts = [];
  let hasNextPage = true;
  let cursor = null;

  while (hasNextPage) {
    const query = `
      query ($id: ID!, $cursor: String) {
        collection(id: $id) {
          products(first: 250, after: $cursor) {
            edges {
              node {
                id
                title
                variants(first: 100) {
                  edges {
                    node {
                      id
                      displayName
                      selectedOptions {
                        name
                        value
                      }
                    }
                  }
                }
              }
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      }
    `;

    const response = await fetch(
      `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/graphql.json`,
      {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': ACCESS_TOKEN,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          query,
          variables: { id: collectionGid, cursor }
        })
      }
    );

    const result = await response.json();
    
    if (result.errors) {
      console.error('GraphQL errors:', result.errors);
      break;
    }

    const products = result.data.collection.products.edges.map(e => e.node);
    allProducts = allProducts.concat(products);
    
    console.log(`  Fetched ${products.length} products (total: ${allProducts.length})`);

    hasNextPage = result.data.collection.products.pageInfo.hasNextPage;
    cursor = result.data.collection.products.pageInfo.endCursor;

    if (hasNextPage) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  console.log(`  ✅ Total: ${allProducts.length} products`);
  return allProducts;
}

function fixVariantName(name) {
  if (!name || typeof name !== 'string') return null;
  
  if (name.includes('#')) return null;

  let fixed = name;
  let changed = false;

  if (fixed.includes('Ø')) {
    fixed = fixed.replace(/Ø/g, '⌀');
    changed = true;
  }

  if (fixed.includes('ø')) {
    fixed = fixed.replace(/ø/g, '⌀');
    changed = true;
  }

  if (/\/\s+0\.\d+\s+/.test(fixed) && !fixed.includes('⌀')) {
    fixed = fixed.replace(/\/\s+(0\.\d+)\s+/g, '/ ⌀$1мм ');
    changed = true;
  }

  return changed ? fixed : null;
}

async function updateVariant(variantGid, newName) {
  const mutation = `
    mutation ($input: ProductVariantInput!) {
      productVariantUpdate(input: $input) {
        productVariant {
          id
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const response = await fetch(
    `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/graphql.json`,
    {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': ACCESS_TOKEN,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query: mutation,
        variables: {
          input: {
            id: variantGid,
            selectedOptions: [{ name: 'Вариант', value: newName }]
          }
        }
      })
    }
  );

  const result = await response.json();

  if (result.data.productVariantUpdate.userErrors.length > 0) {
    console.error(`  ❌ Failed:`, result.data.productVariantUpdate.userErrors);
    return false;
  }

  await new Promise(resolve => setTimeout(resolve, 500));
  return true;
}

async function processProduct(product) {
  if (!product.variants || !product.variants.edges || product.variants.edges.length === 0) {
    console.log(`⚠️ Skipping ${product.title} - no variants`);
    return;
  }
  
  stats.checked++;
  
  for (const variantEdge of product.variants.edges) {
    const variant = variantEdge.node;
    const variantOption = variant.selectedOptions.find(opt => opt.name === 'Вариант');
    
    if (!variantOption) continue;
    
    const oldName = variantOption.value;
    const newName = fixVariantName(oldName);

    if (newName) {
      console.log(`\n${product.title}`);
      console.log(`  Old: ${oldName}`);
      console.log(`  New: ${newName}`);
      
      const success = await updateVariant(variant.id, newName);
      if (success) {
        console.log(`  ✅ Updated`);
        stats.updated++;
      }
    } else {
      stats.skipped++;
    }
  }
}

async function main() {
  console.log('🔧 Starting variant name fix...\n');

  for (const collectionId of LINE_COLLECTION_IDS) {
    const products = await getCollectionProducts(collectionId);
    
    for (const product of products) {
      await processProduct(product);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('📊 SUMMARY');
  console.log('='.repeat(60));
  console.log(`Products checked: ${stats.checked}`);
  console.log(`Variants updated: ${stats.updated}`);
  console.log(`Variants skipped: ${stats.skipped}`);
  console.log('='.repeat(60));
}

main();
