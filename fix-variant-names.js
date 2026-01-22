// fix-variant-names.js - Еднократна поправка на имена на варианти за влакна
const fetch = require('node-fetch');

const SHOPIFY_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const API_VERSION = '2024-10';

const LINE_COLLECTION_IDS = [
  '738965946750', // монофилни
  '738965979518', // плетени
  '738987442558', // fluorocarbon
  '739068576126'  // други
];

let stats = { checked: 0, updated: 0, skipped: 0 };

async function getCollectionProducts(collectionId) {
  console.log(`\n📦 Fetching products from collection ${collectionId}...`);
  let allProducts = [];
  let hasNextPage = true;
  let pageInfo = null;

  while (hasNextPage) {
    let url = `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/collections/${collectionId}/products.json?limit=250`;
    if (pageInfo) url += `&page_info=${pageInfo}`;

    const response = await fetch(url, {
      headers: {
        'X-Shopify-Access-Token': ACCESS_TOKEN,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      console.error(`❌ Failed: ${response.status}`);
      break;
    }

    const data = await response.json();
    allProducts = allProducts.concat(data.products);

    const linkHeader = response.headers.get('Link');
    if (linkHeader && linkHeader.includes('rel="next"')) {
      const match = linkHeader.match(/<[^>]*page_info=([^>&]+)[^>]*>;\s*rel="next"/);
      pageInfo = match ? match[1] : null;
      hasNextPage = !!pageInfo;
    } else {
      hasNextPage = false;
    }

    await new Promise(resolve => setTimeout(resolve, 300));
  }

  console.log(`✅ Fetched ${allProducts.length} products`);
  return allProducts;
}
function fixVariantName(name) {
  if (!name || typeof name !== 'string') return name;
  if (name.includes('#')) return null;

  let fixed = name;
  let changed = false;

  // 1. "Xмм" → "øXмм"
  if (/\d+\.?\d*мм/.test(fixed) && !fixed.includes('ø')) {
    fixed = fixed.replace(/(\d+\.?\d*)мм/g, 'ø$1мм');
    changed = true;
  }

  // 2. "/ 0.X /" → "/ ø0.Xмм /"
  if (/\/\s+0\.\d+\s+\//.test(fixed)) {
    fixed = fixed.replace(/\/\s+(0\.\d+)\s+\//g, '/ ø$1мм /');
    changed = true;
  }
  
  // 3. "/ 0.X " (без "/" след) → "/ ø0.Xмм "
  if (/\/\s+0\.\d+\s+(?!\/)/.test(fixed) && !changed) {
    fixed = fixed.replace(/\/\s+(0\.\d+)(\s+)/g, '/ ø$1мм$2');
    changed = true;
  }

  return changed ? fixed : null;
}


async function updateVariant(variantId, newName) {
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
          id: variantId,
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

async function processProduct(product) {
  if (!product.variants || !Array.isArray(product.variants)) {
    console.log(`⚠️ Skipping ${product.title} - no variants`);
    return;
  }
  
  stats.checked++;
  
  for (const variant of product.variants) {
    const oldName = variant.option1;
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
