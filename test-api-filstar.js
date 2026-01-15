// Премахни require('dotenv').config();

const FILSTAR_API_BASE = 'https://filstar.com/api';
const FILSTAR_TOKEN = process.env.FILSTAR_API_TOKEN;

// Тест 1: Вземи една страница продукти
async function testSinglePage() {
  console.log('\n=== TEST 1: Single Page ===');
  
  const response = await fetch(`${FILSTAR_API_BASE}/products?page=1&per_page=5`, {
    headers: { 'Authorization': `Bearer ${FILSTAR_TOKEN}` }
  });
  
  const data = await response.json();
  console.log('Response structure:', Object.keys(data));
  console.log('Total products on page:', data.products?.length || 0);
  
  if (data.products && data.products[0]) {
    const product = data.products[0];
    console.log('\n--- First Product Structure ---');
    console.log('Keys:', Object.keys(product));
    console.log('\nProduct ID:', product.id);
    console.log('SKU:', product.sku);
    console.log('Name:', product.name);
    console.log('Category:', product.category);
    console.log('Type:', product.type);
    
    console.log('\n--- Images Structure ---');
    console.log('Images array:', product.images);
    if (product.images && product.images[0]) {
      console.log('First image type:', typeof product.images[0]);
      console.log('First image:', JSON.stringify(product.images[0], null, 2));
    }
    
    console.log('\n--- Variants Structure ---');
    if (product.variants && product.variants[0]) {
      console.log('First variant:', JSON.stringify(product.variants[0], null, 2));
    }
  }
}

// Тест 2: Търсене по категория
async function testCategoryFilter() {
  console.log('\n\n=== TEST 2: Category Filter ===');
  
  const categories = ['braided', 'плетено', 'pe-braid', 'line'];
  
  for (const cat of categories) {
    console.log(`\nTrying category: "${cat}"`);
    const response = await fetch(`${FILSTAR_API_BASE}/products?category=${cat}&per_page=5`, {
      headers: { 'Authorization': `Bearer ${FILSTAR_TOKEN}` }
    });
    
    const data = await response.json();
    console.log(`  Results: ${data.products?.length || 0} products`);
    if (data.products && data.products[0]) {
      console.log(`  Example: ${data.products[0].name}`);
    }
  }
}

// Тест 3: Търсене по тип продукт
async function testTypeFilter() {
  console.log('\n\n=== TEST 3: Type Filter ===');
  
  const types = ['braided', 'line', 'fishing-line'];
  
  for (const type of types) {
    console.log(`\nTrying type: "${type}"`);
    const response = await fetch(`${FILSTAR_API_BASE}/products?type=${type}&per_page=5`, {
      headers: { 'Authorization': `Bearer ${FILSTAR_TOKEN}` }
    });
    
    const data = await response.json();
    console.log(`  Results: ${data.products?.length || 0} products`);
  }
}

// Тест 4: Вземи конкретен продукт по SKU
async function testProductBySKU() {
  console.log('\n\n=== TEST 4: Product by SKU ===');
  
  const testSKU = '934079'; // SKU от лога
  console.log(`Searching for SKU: ${testSKU}`);
  
  const response = await fetch(`${FILSTAR_API_BASE}/products?sku=${testSKU}`, {
    headers: { 'Authorization': `Bearer ${FILSTAR_TOKEN}` }
  });
  
  const data = await response.json();
  console.log('Full product data:');
  console.log(JSON.stringify(data, null, 2));
}

// Тест 5: Провери pagination metadata
async function testPagination() {
  console.log('\n\n=== TEST 5: Pagination Info ===');
  
  const response = await fetch(`${FILSTAR_API_BASE}/products?page=1&per_page=10`, {
    headers: { 'Authorization': `Bearer ${FILSTAR_TOKEN}` }
  });
  
  const data = await response.json();
  console.log('Pagination keys:', Object.keys(data).filter(k => k !== 'products'));
  console.log('Total pages:', data.total_pages || data.pages || 'unknown');
  console.log('Total products:', data.total || data.total_products || 'unknown');
  console.log('Current page:', data.page || data.current_page || 'unknown');
}

// Изпълни всички тестове
async function runAllTests() {
  try {
    await testSinglePage();
    await testCategoryFilter();
    await testTypeFilter();
    await testProductBySKU();
    await testPagination();
    
    console.log('\n\n✅ All tests completed!');
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

runAllTests();
