const FILSTAR_TOKEN = process.env.FILSTAR_API_TOKEN;
const FILSTAR_API_BASE = 'https://filstar.com/api';

// Редактирай тук SKU-тата, които искаш да тестваш
const TEST_SKUS = [
  '52475',
  '52476',
  '52477'
  // Добави още SKU-та тук
];

async function fetchProductData(sku) {
  try {
    const response = await fetch(`${FILSTAR_API_BASE}/products/${sku}`, {
      headers: {
        'Authorization': `Bearer ${FILSTAR_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error(`Error fetching SKU ${sku}:`, error.message);
    return null;
  }
}

async function extractCategoriesAndAttributes(sku) {
  console.log(`\n=== Fetching data for SKU: ${sku} ===`);
  
  const productData = await fetchProductData(sku);
  
  if (!productData) {
    console.log(`No data found for SKU ${sku}`);
    return null;
  }

  const result = {
    sku: sku,
    name: productData.name || 'N/A',
    categories: productData.categories || [],
    attributes: productData.attributes || {},
    // Добави други полета, които ти трябват
    rawData: productData // За пълен преглед
  };

  console.log('Categories:', JSON.stringify(result.categories, null, 2));
  console.log('Attributes:', JSON.stringify(result.attributes, null, 2));
  
  return result;
}

async function runTest() {
  console.log('Starting Filstar API test...');
  console.log(`Testing ${TEST_SKUS.length} SKUs`);
  
  const results = [];
  
  for (const sku of TEST_SKUS) {
    const result = await extractCategoriesAndAttributes(sku);
    if (result) {
      results.push(result);
    }
    // Пауза между заявките, за да не претоварим API
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  // Запиши резултатите във файл
  const fs = require('fs');
  fs.writeFileSync(
    'filstar-test-results.json',
    JSON.stringify(results, null, 2)
  );
  
  console.log('\n=== Test Complete ===');
  console.log(`Results saved to filstar-test-results.json`);
  console.log(`Successfully fetched: ${results.length}/${TEST_SKUS.length} products`);
}

// Стартирай теста
runTest().catch(console.error);
