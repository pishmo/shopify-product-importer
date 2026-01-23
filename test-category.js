const FILSTAR_API_BASE = 'https://filstar.com/api';
const FILSTAR_TOKEN = process.env.FILSTAR_API_TOKEN;

async function testSearchFormat(url, description) {
  console.log(`\n=== ${description} ===`);
  console.log(`URL: ${url}`);
  
  try {
    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${FILSTAR_TOKEN}` }
    });
    
    const products = await response.json();
    
    console.log(`✅ Response OK`);
    console.log(`Products count: ${Array.isArray(products) ? products.length : 'Not an array'}`);
    
    if (Array.isArray(products) && products.length > 0) {
      const firstProduct = products[0];
      console.log(`First product: ${firstProduct.name}`);
      console.log(`Categories:`, firstProduct.categories?.map(c => `${c.name} (ID:${c.id})`).join(', '));
      
      // Провери дали има категория 84
      const hasCategory84 = firstProduct.categories?.some(c => c.id?.toString() === '84');
      console.log(`Has category 84: ${hasCategory84 ? '✅ YES' : '❌ NO'}`);
    }
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
  }
}

async function runTests() {
  console.log('🔍 Testing different search formats for category ID 84\n');
  
  // Тест 1: search=category:84
  await testSearchFormat(
    `${FILSTAR_API_BASE}/products?search=category:84&per_page=5`,
    'Format: search=category:84'
  );
  
  // Тест 2: search=category_id:84
  await testSearchFormat(
    `${FILSTAR_API_BASE}/products?search=category_id:84&per_page=5`,
    'Format: search=category_id:84'
  );
  
  // Тест 3: search[category]=84
  await testSearchFormat(
    `${FILSTAR_API_BASE}/products?search[category]=84&per_page=5`,
    'Format: search[category]=84'
  );
  
  // Тест 4: category=84
  await testSearchFormat(
    `${FILSTAR_API_BASE}/products?category=84&per_page=5`,
    'Format: category=84'
  );
  
  // Тест 5: category_id=84
  await testSearchFormat(
    `${FILSTAR_API_BASE}/products?category_id=84&per_page=5`,
    'Format: category_id=84'
  );
  
  // Тест 6: filter[category]=84
  await testSearchFormat(
    `${FILSTAR_API_BASE}/products?filter[category]=84&per_page=5`,
    'Format: filter[category]=84'
  );
  
  // Тест 7: categories=84
  await testSearchFormat(
    `${FILSTAR_API_BASE}/products?categories=84&per_page=5`,
    'Format: categories=84'
  );
  
  console.log('\n✅ All tests completed!');
}

runTests();
