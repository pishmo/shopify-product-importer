// Test script for Filstar API response - SKU 957410
const FILSTAR_TOKEN = 'YOUR_TOKEN_HERE'; // Вземи от описанието на продукта
const FILSTAR_API_BASE = 'https://filstar.com/api';

async function testFilstarProduct(sku) {
  try {
    console.log(`\n=== Testing Filstar API for SKU: ${sku} ===\n`);
    
    const url = `${FILSTAR_API_BASE}/products/${sku}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${FILSTAR_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log(`Status: ${response.status} ${response.statusText}`);
    console.log(`URL: ${url}\n`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Error response:', errorText);
      return null;
    }
    
    const data = await response.json();
    
    // Pretty print the response
    console.log('=== FULL RESPONSE ===');
    console.log(JSON.stringify(data, null, 2));
    
    // Extract key fields
    console.log('\n=== KEY FIELDS ===');
    console.log('SKU:', data.sku || 'N/A');
    console.log('Title:', data.title || data.name || 'N/A');
    console.log('Price:', data.price || 'N/A');
    console.log('Category:', data.category || 'N/A');
    console.log('Images count:', data.images?.length || 0);
    console.log('Description length:', data.description?.length || 0);
    
    if (data.images && data.images.length > 0) {
      console.log('\n=== IMAGES ===');
      data.images.forEach((img, idx) => {
        console.log(`Image ${idx + 1}:`, img);
      });
    }
    
    return data;
    
  } catch (error) {
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    return null;
  }
}

// Run test
testFilstarProduct('957410');
