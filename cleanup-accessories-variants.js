const fetch = require('node-fetch');

const SHOPIFY_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const API_VERSION = '2024-10';

// Категорийни тагове за премахване
const CATEGORY_TAGS = [
  'ШАРАНСКИ РИБОЛОВ',
  'ШАРАНСКИ РИБОЛОВ Шарански стойки',
  'ШАРАНСКИ РИБОЛОВ Ракети',
  'ШАРАНСКИ РИБОЛОВ Готови монтажи',
  'ШАРАНСКИ РИБОЛОВ Материали за монтажи',
  'ШАРАНСКИ РИБОЛОВ Стопери и рингове',
  'ШАРАНСКИ РИБОЛОВ Инструменти',
  'ШАРАНСКИ РИБОЛОВ Други',
  'ШАРАНСКИ РИБОЛОВ Аларми и индикатори',
  'ШАРАНСКИ РИБОЛОВ Фидери',
  'ШАРАНСКИ РИБОЛОВ PVA материали'
];

const COLLECTION_ID = 'gid://shopify/Collection/739661152638';

async function fetchAllProducts() {
  console.log('📦 Fetching all products...\n');
  
  let allProducts = [];
  let hasNextPage = true;
  let cursor = null;
  let page = 1;

  while (hasNextPage) {
    const query = `
      query ($cursor: String) {
        collection(id: "${COLLECTION_ID}") {
          products(first: 250, after: $cursor) {
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
                      title
                      sku
                    }
                  }
                }
              }
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
        body: JSON.stringify({ query, variables: { cursor } })
      }
    );

    const { data } = await response.json();
    const products = data.collection.products.edges.map(e => e.node);
    
    allProducts.push(...products);
    console.log(`  ✓ Page ${page}: ${products.length} products (Total: ${allProducts.length})`);
    
    hasNextPage = data.collection.products.pageInfo.hasNextPage;
    cursor = data.collection.products.pageInfo.endCursor;
    page++;
  }

  console.log(`\n✅ Total: ${allProducts.length} products\n`);
  return allProducts;
}

function cleanVariantTitle(title, sku) {
  let cleaned = title;
  
  // Сортирай по дължина (най-дългите първи)
  const sortedTags = [...CATEGORY_TAGS].sort((a, b) => b.length - a.length);
  
  for (const tag of sortedTags) {
    cleaned = cleaned.replace(tag, '').trim();
  }
  
  // Премахни множество интервали
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  
  // Премахни водещи "/" или "-"
  cleaned = cleaned.replace(/^[\s\/\-]+/, '').trim();
  
  // Премахни "/" накрая
  cleaned = cleaned.replace(/[\s\/\-]+$/, '').trim();
  
  // Ако е празно → използвай SKU
  if (!cleaned || cleaned === '') {
    cleaned = sku;
  }
  
  return cleaned;
}

async function updateVariant(variantId, newTitle) {
  const numericId = variantId.split('/').pop();
  
  const response = await fetch(
    `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/variants/${numericId}.json`,
    {
      method: 'PUT',
      headers: {
        'X-Shopify-Access-Token': ACCESS_TOKEN,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        variant: {
          option1: newTitle  // ✅ Използвай option1, НЕ title
        }
      })
    }
  );
  
  const result = await response.json();
  
  if (!response.ok) {
    return { userErrors: [{ message: result.errors || 'Update failed' }] };
  }
  
  return { userErrors: [] };
}



async function cleanupVariants() {
  console.log('🧹 Starting variant cleanup...\n');
  
  const products = await fetchAllProducts();
  
  let cleaned = 0;
  let skipped = 0;
  
  for (const product of products) {
    for (const variantEdge of product.variants.edges) {
      const variant = variantEdge.node;
      const originalTitle = variant.title;
      const cleanedTitle = cleanVariantTitle(originalTitle, variant.sku);
      
      if (originalTitle !== cleanedTitle) {
        console.log(`🔧 ${product.title}`);
        console.log(`   OLD: "${originalTitle}"`);
        console.log(`   NEW: "${cleanedTitle}"`);
        
        const result = await updateVariant(variant.id, cleanedTitle);
        
        if (result.userErrors.length === 0) {
          console.log(`   ✅ Updated\n`);
          cleaned++;
        } else {
          console.log(`   ❌ Error: ${result.userErrors[0].message}\n`);
        }
        
        await new Promise(r => setTimeout(r, 300));
      } else {
        skipped++;
      }
    }
  }
  
  console.log('\n======================================');
  console.log(`✅ Cleaned: ${cleaned} variants`);
  console.log(`⏭️  Skipped: ${skipped} variants (already clean)`);
  console.log('======================================');
}

cleanupVariants();
