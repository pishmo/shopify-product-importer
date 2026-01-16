// test-rod-categories.js
const fetch = require('node-fetch');

const FILSTAR_TOKEN = process.env.FILSTAR_API_TOKEN;
const FILSTAR_API_BASE = 'https://filstar.com/api';

async function findRodCategories() {
  console.log('Fetching all products to find rod categories...\n');
  
  const response = await fetch(`${FILSTAR_API_BASE}/products`, {
    headers: { 'Authorization': `Bearer ${FILSTAR_TOKEN}` }
  });

  const allProducts = await response.json();
  console.log(`Total products: ${allProducts.length}\n`);
  
  // Намери всички категории, които съдържат "пръчк", "въдиц", "rod"
  const rodCategories = new Map();
  
  allProducts.forEach(product => {
    product.categories?.forEach(cat => {
      const name = cat.name.toLowerCase();
      if (name.includes('пръчк') || name.includes('въдиц') || name.includes('rod') || name.includes('спининг') || name.includes('телескоп') || name.includes('комплекти')) {
        if (!rodCategories.has(cat.id)) {
          rodCategories.set(cat.id, {
            id: cat.id,
            name: cat.name,
            parent_id: cat.parent_id,
            count: 0
          });
        }
        rodCategories.get(cat.id).count++;
      }
    });
  });
  
  console.log('Found rod categories:\n');
  Array.from(rodCategories.values())
    .sort((a, b) => b.count - a.count)
    .forEach(cat => {
      console.log(`  ${cat.name} (ID: ${cat.id}, Parent: ${cat.parent_id}) - ${cat.count} products`);
    });
}

findRodCategories();
