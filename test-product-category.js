const FILSTAR_TOKEN = process.env.FILSTAR_API_TOKEN;
const FILSTAR_API_BASE = 'https://filstar.com/api';

const TEST_SKUS = [
  '52475', '962013', '962013', '956532', '957231', '946238', '957900'
];

async function fetchAllProductsOnce() {
  try {
    console.log('Fetching all products (single request)...');
    
    const response = await fetch(`${FILSTAR_API_BASE}/products?per_page=10000`, {
      headers: {
        'Authorization': `Bearer ${FILSTAR_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    console.log(`Loaded ${data.products?.length || 0} products`);
    return data.products || [];
  } catch (error) {
    console.error('Error fetching products:', error.message);
    return [];
  }
}

async function runTest() {
  const allProducts = await fetchAllProductsOnce();
  
  if (allProducts.length === 0) {
    console.log('No products loaded');
    return;
  }

  const results = [];
  
  for (const sku of TEST_SKUS) {
    console.log(`\n=== Processing SKU: ${sku} ===`);
    
    const product = allProducts.find(p => p.sku === sku || p.id === sku);
    
    if (!product) {
      console.log(`SKU ${sku} not found`);
      continue;
    }

    const result = {
      sku: sku,
      name: product.name || 'N/A',
      categories: product.categories || [],
      attributes: product.attributes || {}
    };

    console.log('Categories:', JSON.stringify(result.categories, null, 2));
    console.log('Attributes:', JSON.stringify(result.attributes, null, 2));
    
    results.push(result);
  }
  
  const fs = require('fs');
  fs.writeFileSync('filstar-test-results.json', JSON.stringify(results, null, 2));
  
  console.log(`\nResults saved. Found: ${results.length}/${TEST_SKUS.length}`);
}

runTest().catch(console.error);
