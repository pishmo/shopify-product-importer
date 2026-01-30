// test-accessories-categories.js - Тест за извличане на ВСЕ полета от API
const fetch = require('node-fetch');

const SHOPIFY_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const FILSTAR_TOKEN = process.env.FILSTAR_API_TOKEN;
const API_VERSION = '2024-10';
const FILSTAR_API_BASE = 'https://filstar.com/api';

const TEST_SKUS = [
  '960874'
];

async function fetchAllProducts() {
  console.log('📦 Fetching all products from Filstar...\n');
  let allProducts = [];
  let page = 1;
  let hasMore = true;
  
  while (hasMore) {
    console.log(`  Fetching page ${page}...`);
    const response = await fetch(
      `${FILSTAR_API_BASE}/products?page=${page}&limit=1000`,
      {
        headers: {
          'Authorization': `Bearer ${FILSTAR_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    const data = await response.json();
    if (data && data.length > 0) {
      allProducts = allProducts.concat(data);
      console.log(`  ✓ Page ${page}: ${data.length} products`);
      page++;
      hasMore = data.length > 0;
      if (page > 10) hasMore = false;
    } else {
      hasMore = false;
    }
    
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  console.log(`\n✅ Total products fetched: ${allProducts.length}\n`);
  return allProducts;
}

async function testAccessoriesCategories() {
  const allProducts = await fetchAllProducts();
  
  console.log('🧪 Searching for test SKUs...\n');
  
  for (const sku of TEST_SKUS) {
    console.log(`📍 Looking for SKU: ${sku}`);
    
    const product = allProducts.find(p => 
      p.variants?.some(v => v.sku === sku)
    );
    
    if (product) {
      console.log(`\n✅ PRODUCT FOUND: ${product.name}\n`);
      
      // Покажи ВСИЧКИ полета на продукта
      console.log('📦 FULL PRODUCT OBJECT:');
      console.log(JSON.stringify(product, null, 2));
      console.log('\n' + '='.repeat(80) + '\n');
      
      // Специално внимание на снимките
      console.log('🖼️  IMAGES:');
      if (product.images) {
        console.log(`   Total images: ${product.images.length}`);
        product.images.forEach((img, i) => {
          console.log(`   [${i}] ${JSON.stringify(img, null, 2)}`);
        });
      } else {
        console.log('   No images field');
      }
      console.log('');
      
      // Специално внимание на вариантите
      console.log('🔧 VARIANTS:');
      product.variants.forEach((v, i) => {
        console.log(`\n   [${i}] VARIANT ${i}:`);
        console.log(JSON.stringify(v, null, 2));
      });
      
    } else {
      console.log(`   ❌ Not found\n`);
    }
  }
}

testAccessoriesCategories();
