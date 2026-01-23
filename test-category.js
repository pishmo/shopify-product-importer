const fetch = require('node-fetch');

const FILSTAR_TOKEN = process.env.FILSTAR_API_TOKEN;
const FILSTAR_API_BASE = 'https://filstar.com/api';

async function testFilters() {
  console.log('🧪 Testing Filstar API category filters\n');
  
  const tests = [
    { url: `${FILSTAR_API_BASE}/products?category_id=87&limit=5`, desc: 'category_id=87 (sets)' },
    { url: `${FILSTAR_API_BASE}/products?category=87&limit=5`, desc: 'category=87' },
    { url: `${FILSTAR_API_BASE}/products?parent_category_id=10&limit=5`, desc: 'parent_category_id=10 (clothing)' },
    { url: `${FILSTAR_API_BASE}/products?categories=87&limit=5`, desc: 'categories=87' },
    { url: `${FILSTAR_API_BASE}/products?filter[category_id]=87&limit=5`, desc: 'filter[category_id]=87' },
    { url: `${FILSTAR_API_BASE}/products?limit=5`, desc: 'NO FILTER (baseline)' }
  ];
  
  for (const test of tests) {
    console.log(`\n📍 ${test.desc}`);
    console.log(`   ${test.url}`);
    
    try {
      const response = await fetch(test.url, {
        headers: { 'Authorization': `Bearer ${FILSTAR_TOKEN}` }
      });
      
      const products = await response.json();
      console.log(`   ✅ Status: ${response.status} | Products returned: ${products.length}`);
      
      if (products.length > 0) {
        const p = products[0];
        console.log(`   📦 First: ${p.name}`);
        console.log(`   🏷️  Cat IDs: ${p.categories?.map(c => c.id).join(', ') || 'none'}`);
      }
      
      await new Promise(r => setTimeout(r, 600));
      
    } catch (error) {
      console.log(`   ❌ Error: ${error.message}`);
    }
  }
  
  console.log('\n✅ Test complete');
}

testFilters();
