// test-accessories-categories.js - Тест за извличане на category IDs за аксесоари
const fetch = require('node-fetch');

const SHOPIFY_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const FILSTAR_TOKEN = process.env.FILSTAR_API_TOKEN;
const API_VERSION = '2024-10';
const FILSTAR_API_BASE = 'https://filstar.com/api';

const TEST_SKUS = [
  '955952', // живарници и кепчета
  '926579', // прашки
  '961194', // шарански риболов
  '951949', // риболов на щука и сом
  '946802', // риболов на щека и мач
  '946750', // ножове
  '962914', // кутии кошчета и калъфи
  '963718', // столове, чадъри и палатки
  '961464'  // аксесоари други
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
    
    if (data.data && data.data.length > 0) {
      allProducts = allProducts.concat(data.data);
      console.log(`    ✓ Page ${page}: ${data.data.length} products`);
      hasMore = data.data.length === 1000;
      page++;
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
  
  const results = [];
  
  for (const sku of TEST_SKUS) {
    console.log(`📍 Looking for SKU: ${sku}`);
    
   const product = allProducts.find(p => 
  p.variants?.some(v => v.sku === sku)
);

    
    if (product) {
      console.log(`   ✅ Found: ${product.name}`);
      console.log(`   🏷️  Categories:`, product.categories);
      console.log('');
      
      results.push({
        sku: sku,
        name: product.name,
        categories: product.categories
      });
    } else {
      console.log(`   ❌ Not found\n`);
    }
  }
  
  console.log('\n📊 SUMMARY:\n');
  results.forEach(r => {
    console.log(`SKU ${r.sku}: ${r.name}`);
    console.log(`   Categories:`, r.categories);
    console.log('');
  });
}

testAccessoriesCategories();
