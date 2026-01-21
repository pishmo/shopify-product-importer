const FILSTAR_TOKEN = process.env.FILSTAR_API_TOKEN;
const FILSTAR_API_BASE = 'https://filstar.com/api';

const TEST_SKUS = [
  '52475', '962013', '962013', '956532', '957231', '946238', '957900'
];

async function fetchAllProducts(page = 1, perPage = 100) {
  try {
    const response = await fetch(`${FILSTAR_API_BASE}/products?page=${page}&per_page=${perPage}`, {
      headers: {
        'Authorization': `Bearer ${FILSTAR_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error(`Error fetching page ${page}:`, error.message);
    return null;
  }
}

async function findProductBySKU(targetSKU) {
  let page = 1;
  const perPage = 100;

  console.log(`Searching for SKU: ${targetSKU}`);

  while (true) {
    console.log(`Fetching page ${page}...`);
    
    const response = await fetchAllProducts(page, perPage);
    
    if (!response || !response.products || response.products.length === 0) {
      console.log(`SKU ${targetSKU} not found`);
      return null;
    }

    const product = response.products.find(p => p.sku === targetSKU || p.id === targetSKU);
    
    if (product) {
      console.log(`Found SKU ${targetSKU} on page ${page}`);
      return product;
    }

    if (response.products.length < perPage) {
      console.log(`SKU ${targetSKU} not found`);
      return null;
    }

    page++;
    await new Promise(resolve => setTimeout(resolve, 300));
  }
}

async function extractCategoriesAndAttributes(sku) {
  console.log(`\n=== Processing SKU: ${sku} ===`);
  
  const productData = await findProductBySKU(sku);
  
  if (!productData) {
    return null;
  }

  const result = {
    sku: sku,
    name: productData.name || 'N/A',
    categories: productData.categories || [],
    attributes: productData.attributes || {},
    rawData: productData
  };

  console.log('Categories:', JSON.stringify(result.categories, null, 2));
  console.log('Attributes:', JSON.stringify(result.attributes, null, 2));
  
  return result;
}

async function runTest() {
  console.log(`Testing ${TEST_SKUS.length} SKUs`);
  
  const results = [];
  
  for (const sku of TEST_SKUS) {
    const result = await extractCategoriesAndAttributes(sku);
    if (result) {
      results.push(result);
    }
  }
  
  const fs = require('fs');
  fs.writeFileSync('filstar-test-results.json', JSON.stringify(results, null, 2));
  
  console.log(`\nResults saved. Found: ${results.length}/${TEST_SKUS.length}`);
}

runTest().catch(console.error);
