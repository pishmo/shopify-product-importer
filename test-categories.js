// test-categories.js - Тест за проверка на конкретен SKU
const fetch = require('node-fetch');

const FILSTAR_TOKEN = process.env.FILSTAR_API_TOKEN;
const FILSTAR_API_BASE = 'https://filstar.com/api';

// SKU-та за тестване (добави SKU от "Други" категория)
const TEST_SKUS = [
  // Добави тук SKU от "Други" категория
];

async function testProductBySku(sku) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing SKU: ${sku}`);
  console.log('='.repeat(60));
  
  try {
    // Fetch всички продукти
    const response = await fetch(`${FILSTAR_API_BASE}/products?limit=1000`, {
      headers: {
        'Authorization': `Bearer ${FILSTAR_TOKEN}`
      }
    });

    if (!response.ok) {
      throw new Error(`Filstar API error: ${response.status}`);
    }

    const allProducts = await response.json();
    
    // Намери продукта по SKU
    const product = allProducts.find(p => 
      p.variants?.some(v => v.sku === sku)
    );
    
    if (product) {
      console.log('\n✅ PRODUCT FOUND!\n');
      console.log(JSON.stringify(product, null, 2));
    } else {
      console.log('\n❌ PRODUCT NOT FOUND in API response!');
      console.log(`Total products in API: ${allProducts.length}`);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

async function main() {
  console.log('🔍 Testing products by SKU...\n');
  
  if (TEST_SKUS.length === 0) {
    console.log('⚠️ No SKUs to test. Add SKUs to TEST_SKUS array.');
    return;
  }
  
  for (const sku of TEST_SKUS) {
    await testProductBySku(sku);
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  console.log('\n✅ Test completed!');
}

main();
