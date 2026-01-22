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
    let url = `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/collections/${collectionId}/products.json?fields=id,title,variants&limit=250`;
    if (pageInfo) url += `&page_info=${pageInfo}`;
    
    // ... останалото същото
  }
}


function fixVariantName(name) {
  if (!name || typeof name !== 'string') return name;
  
  // Пропускай японска номерация
  if (name.includes('#')) return null;

  let fixed = name;
  let changed = false;

  // 1. Замени Ø (скандинавска главна) → ⌀
  if (fixed.includes('Ø')) {
    fixed = fixed.replace(/Ø/g, '⌀');
    changed = true;
  }

  // 2. Замени ø (скандинавска малка) → ⌀
  if (fixed.includes('ø')) {
    fixed = fixed.replace(/ø/g, '⌀');
    changed = true;
  }

  // 3. Добави ⌀ и мм за "/ 0.X " (без символ и мм)
  if (/\/\s+0\.\d+\s+/.test(fixed) && !fixed.includes('⌀')) {
    fixed = fixed.replace(/\/\s+(0\.\d+)\s+/g, '/ ⌀$1мм ');
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
