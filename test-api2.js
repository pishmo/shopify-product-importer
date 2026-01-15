// debug-categories.js
const fetch = require('node-fetch');

const FILSTAR_TOKEN = process.env.FILSTAR_API_TOKEN;
const FILSTAR_API_BASE = 'https://filstar.com/api';

async function debugCategories() {
  const response = await fetch(`${FILSTAR_API_BASE}/products?limit=10`, {
    headers: { 'Authorization': `Bearer ${FILSTAR_TOKEN}` }
  });
  
  const products = await response.json();
  
  console.log('First 3 products with categories:\n');
  products.slice(0, 3).forEach((product, i) => {
    console.log(`Product ${i + 1}: ${product.name}`);
    console.log('Categories:', JSON.stringify(product.categories, null, 2));
    console.log('---\n');
  });
}

debugCategories();
