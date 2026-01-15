const FILSTAR_API_BASE = 'https://filstar.com/api';
const FILSTAR_TOKEN = process.env.FILSTAR_API_TOKEN;

// Тест 1: Вземи една страница продукти
async function testSinglePage() {
  console.log('\n=== TEST 1: Single Page ===');
  
  const response = await fetch(`${FILSTAR_API_BASE}/products?page=1&per_page=5`, {
    headers: { 'Authorization': `Bearer ${FILSTAR_TOKEN}` }
  });
  
  const products = await response.json();
  console.log('Response type:', Array.isArray(products) ? 'Array' : 'Object');
  console.log('Total products:', products.length);
  
  if (products[0]) {
    const product = products[0];
    console.log('\n--- First Product ---');
    console.log('ID:', product.id);
    console.log('SKU:', product.variants?.[0]?.sku);
    console.log('Name:', product.name);
    console.log('Categories:', product.categories?.map(c => c.name).join(', '));
    
    console.log('\n--- Images ---');
    console.log('Images type:', Array.isArray(product.images) ? 'Array of strings' : typeof product.images);
    console.log('First image:', product.images?.[0]);
    
    console.log('\n--- Variants ---');
    console.log('Variants count:', product.variants?.length);
    if (product.variants?.[0]) {
      console.log('First variant SKU:', product.variants[0].sku);
      console.log('First variant price:', product.variants[0].price);
      console.log('First variant quantity:', product.variants[0].quantity);
    }
  }
}

// Тест 2: Намери плетени влакна
async function testFindBraidedProducts() {
  console.log('\n\n=== TEST 2: Find Braided Products ===');
  
  const response = await fetch(`${FILSTAR_API_BASE}/products?page=1&per_page=100`, {
    headers: { 'Authorization': `Bearer ${FILSTAR_TOKEN}` }
  });
  
  const products = await response.json();
  
  // Филтрирай по категория name
  const braided = products.filter(p => 
    p.categories?.some(cat => 
      cat.name.toLowerCase().includes('плетен') || 
      cat.name.toLowerCase().includes('braid')
    )
  );
  
  console.log(`Found ${braided.length} braided products in first 100`);
  
  if (braided[0]) {
    console.log('\nExample braided product:');
    console.log('Name:', braided[0].name);
    console.log('Categories:', braided[0].categories?.map(c => c.name).join(', '));
    console.log('SKU:', braided[0].variants?.[0]?.sku);
  }
}

// Тест 3: Провери pagination
async function testPagination() {
  console.log('\n\n=== TEST 3: Pagination ===');
  
  const page1 = await fetch(`${FILSTAR_API_BASE}/products?page=1&per_page=10`, {
    headers: { 'Authorization': `Bearer ${FILSTAR_TOKEN}` }
  });
  
  const page2 = await fetch(`${FILSTAR_API_BASE}/products?page=2&per_page=10`, {
    headers: { 'Authorization': `Bearer ${FILSTAR_TOKEN}` }
  });
  
  const p1 = await page1.json();
  const p2 = await page2.json();
  
  console.log('Page 1 products:', p1.length);
  console.log('Page 2 products:', p2.length);
  console.log('First product page 1:', p1[0]?.name);
  console.log('First product page 2:', p2[0]?.name);
  console.log('Are they different?', p1[0]?.id !== p2[0]?.id);
}

// Изпълни тестове
async function runAllTests() {
  try {
    await testSinglePage();
    await testFindBraidedProducts();
    await testPagination();
    
    console.log('\n\n✅ All tests completed!');
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error);
  }
}

runAllTests();
