// fix-line-variants-from-filstar.js - Поправка на варианти от Filstar данни
const fetch = require('node-fetch');

const SHOPIFY_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const FILSTAR_TOKEN = process.env.FILSTAR_API_TOKEN;
const API_VERSION = '2024-10';
const FILSTAR_API_BASE = 'https://filstar.com/api';

const LINE_COLLECTION_IDS = [
  'gid://shopify/Collection/738965946750', // монофилни
  'gid://shopify/Collection/738965979518', // плетени
  'gid://shopify/Collection/738987442558', // fluorocarbon
  'gid://shopify/Collection/739068576126'  // други
];

const FILSTAR_LINE_CATEGORY_IDS = ['41', '105', '107', '109'];

let stats = { checked: 0, updated: 0, skipped: 0, notFound: 0 };

// Fetch всички влакна от Filstar с пагинация
async function fetchAllFilstarLines() {
  console.log('📦 Fetching all lines from Filstar...\n');
  let allProducts = [];
  let page = 1;
  let hasMorePages = true;

  while (hasMorePages) {
    console.log(`  Page ${page}...`);
    const response = await fetch(
      `${FILSTAR_API_BASE}/products?page=${page}&limit=1000`,
      {
        headers: { 'Authorization': `Bearer ${FILSTAR_TOKEN}` }
      }
    );

    if (!response.ok) {
      throw new Error(`Filstar API error: ${response.status}`);
    }

    const pageProducts = await response.json();
    
    // Филтрирай само влакна
    const lines = pageProducts.filter(p => 
      p.categories?.some(c => FILSTAR_LINE_CATEGORY_IDS.includes(c.id?.toString()))
    );

    allProducts = allProducts.concat(lines);
    console.log(`    ✓ ${lines.length} lines (total: ${allProducts.length})`);

    if (pageProducts.length === 0) {
      hasMorePages = false;
    } else {
      page++;
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }

  console.log(`\n✅ Total lines: ${allProducts.length}\n`);
  return allProducts;
}

// Fetch всички Shopify продукти от колекциите
async function getShopifyLineProducts() {
  console.log('📦 Fetching Shopify line products...\n');
  let allProducts = [];

  for (const collectionGid of LINE_COLLECTION_IDS) {
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
                        sku
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
          body: JSON.stringify({ query, variables: { id: collectionGid, cursor } })
        }
      );

      const result = await response.json();
      const products = result.data.collection.products.edges.map(e => e.node);
      allProducts = allProducts.concat(products);

      hasNextPage = result.data.collection.products.pageInfo.hasNextPage;
      cursor = result.data.collection.products.pageInfo.endCursor;

      if (hasNextPage) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
  }

  console.log(`✅ Total Shopify products: ${allProducts.length}\n`);
  return allProducts;
}

// Форматиране на variant name от Filstar данни
function formatLineVariantName(variant) {
  if (!variant.attributes || variant.attributes.length === 0) {
    return variant.model || variant.sku || 'Default';
  }

  const parts = [];

  // 1. Дължина
  const length = variant.attributes.find(a => a.attribute_name.includes('ДЪЛЖИНА'))?.value;
  if (length) {
    parts.push(`${length}м`);
  }

  // 2. Диаметър (мм)
  const diameter = variant.attributes.find(a => 
    a.attribute_name.includes('РАЗМЕР') && a.attribute_name.includes('MM')
  )?.value;
  if (diameter) {
    parts.push(`ø${diameter}мм`);
  }

  // 3. Японска номерация
  const japaneseSize = variant.attributes.find(a => 
    a.attribute_name.includes('ЯПОНСКА НОМЕРАЦИЯ')
  )?.value;
  if (japaneseSize) {
    parts.push(japaneseSize);
  }

  // 4. Тест (kg/LB) - с интервал преди LB
  const testKg = variant.attributes.find(a => 
    a.attribute_name.includes('ТЕСТ') && a.attribute_name.includes('KG')
  )?.value;
  const testLb = variant.attributes.find(a => 
    a.attribute_name.includes('ТЕСТ') && a.attribute_name.includes('LB')
  )?.value;
  
  if (testKg && testLb) {
    parts.push(`${testKg}кг/${testLb} LB`);
  } else if (testKg) {
    parts.push(`${testKg}кг`);
  } else if (testLb) {
    parts.push(`${testLb} LB`);
  }

  return parts.length > 0 ? parts.join(' / ') : variant.sku;
}

// Апдейт на variant
async function updateVariant(variantGid, newName) {
  const variantId = variantGid.split('/').pop();

  const response = await fetch(
    `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/variants/${variantId}.json`,
    {
      method: 'PUT',
      headers: {
        'X-Shopify-Access-Token': ACCESS_TOKEN,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        variant: {
          id: parseInt(variantId),
          option1: newName
        }
      })
    }
  );

  if (!response.ok) {
    const error = await response.text();
    console.error(`  ❌ Failed: ${error}`);
    return false;
  }

  await new Promise(resolve => setTimeout(resolve, 500));
  return true;
}

// Обработка на продукт
async function processProduct(filstarProduct, shopifyProducts) {
  if (!filstarProduct.variants || filstarProduct.variants.length === 0) {
    return;
  }

  for (const filstarVariant of filstarProduct.variants) {
    if (!filstarVariant.sku) continue;

    // Намери Shopify продукта по SKU
    let shopifyProduct = null;
    let shopifyVariant = null;

    for (const product of shopifyProducts) {
      const variant = product.variants.edges.find(e => 
        e.node.sku === filstarVariant.sku
      );
      if (variant) {
        shopifyProduct = product;
        shopifyVariant = variant.node;
        break;
      }
    }

    if (!shopifyVariant) {
      stats.notFound++;
      continue;
    }

    stats.checked++;

    const currentName = shopifyVariant.selectedOptions.find(opt => 
      opt.name === 'Вариант'
    )?.value;

    const correctName = formatLineVariantName(filstarVariant);

    if (currentName !== correctName) {
      console.log(`\n${shopifyProduct.title}`);
      console.log(`  SKU: ${filstarVariant.sku}`);
      console.log(`  Old: ${currentName}`);
      console.log(`  New: ${correctName}`);

      const success = await updateVariant(shopifyVariant.id, correctName);
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
  console.log('🔧 Starting variant fix from Filstar data...\n');

  const filstarLines = await fetchAllFilstarLines();
  const shopifyProducts = await getShopifyLineProducts();

  console.log('🔄 Processing variants...\n');

  for (const filstarProduct of filstarLines) {
    await processProduct(filstarProduct, shopifyProducts);
  }

  console.log('\n' + '='.repeat(60));
  console.log('📊 SUMMARY');
  console.log('='.repeat(60));
  console.log(`Variants checked: ${stats.checked}`);
  console.log(`Variants updated: ${stats.updated}`);
  console.log(`Variants skipped: ${stats.skipped}`);
  console.log(`Variants not found: ${stats.notFound}`);
  console.log('='.repeat(60));
}

main();
