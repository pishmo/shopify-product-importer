// debug-categories.js
const fetch = require('node-fetch');

const FILSTAR_TOKEN = process.env.FILSTAR_API_TOKEN;
const FILSTAR_API_BASE = 'https://filstar.com/api';

async function debugCategories() {
  const response = await fetch(`${FILSTAR_API_BASE}/products?limit=100`, { // ← 100 вместо 10
    headers: { 'Authorization': `Bearer ${FILSTAR_TOKEN}` }
  });
  
  const products = await response.json();
  
  // Намери влакна
  const lines = products.filter(p => 
    p.categories?.some(c => 
      c.name?.includes('влакно') || 
      c.name?.includes('Влакно') ||
      c.name?.includes('line')
    )
  );
  
  console.log(`Found ${lines.length} line products\n`);
  
  lines.slice(0, 3).forEach((product, i) => {
    console.log(`Product ${i + 1}: ${product.name}`);
    console.log('Categories:', JSON.stringify(product.categories, null, 2));
    console.log('---\n');
  });
}


debugCategories();
