// debug-categories.js
const fetch = require('node-fetch');

const FILSTAR_TOKEN = process.env.FILSTAR_API_TOKEN;
const FILSTAR_API_BASE = 'https://filstar.com/api';

async function debugCategories() {
  console.log('Starting debug...');
  console.log('Token exists:', !!FILSTAR_TOKEN);
  
  try {
    console.log('Fetching products...');
    
    const response = await fetch(`${FILSTAR_API_BASE}/products?limit=1000`, {
      headers: { 'Authorization': `Bearer ${FILSTAR_TOKEN}` }
    });
    
    console.log('Response status:', response.status);
    
    const products = await response.json();
    console.log('Products count:', products.length);
    
    const categoryMap = {};
    
    products.forEach(p => {
      p.categories?.forEach(cat => {
        const key = `${cat.id}`;
        if (!categoryMap[key]) {
          categoryMap[key] = {
            id: cat.id,
            name: cat.name,
            parent_id: cat.parent_id,
            count: 0
          };
        }
        categoryMap[key].count++;
      });
    });
    
    const sorted = Object.values(categoryMap).sort((a, b) => b.count - a.count);
    
    console.log('\nAll categories:\n');
    sorted.forEach(cat => {
      console.log(`${cat.name} (ID: ${cat.id}, Parent: ${cat.parent_id}) - ${cat.count} products`);
    });
    
  } catch (error) {
    console.error('ERROR:', error.message);
  }
}

debugCategories();
