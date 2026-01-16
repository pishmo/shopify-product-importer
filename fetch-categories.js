// fetch-categories.js
const fetch = require('node-fetch');

const FILSTAR_TOKEN = process.env.FILSTAR_API_TOKEN;
const FILSTAR_API_BASE = 'https://filstar.com/api';

async function fetchAllCategories() {
  console.log('Fetching all categories from Filstar...\n');
  
  const categories = new Map();
  
  // Опитай да вземеш продукти и извлечи категориите от тях
  for (let page = 1; page <= 20; page++) {
    console.log(`Fetching products page ${page}...`);
    
    const url = `${FILSTAR_API_BASE}/products?page=${page}&limit=50`;
    
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${FILSTAR_TOKEN}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        console.error(`Error on page ${page}: ${response.status}`);
        break;
      }
      
      const data = await response.json();
      
      if (!data || data.length === 0) {
        console.log('No more products found.');
        break;
      }
      
      // Извлечи всички категории от продуктите
      for (const product of data) {
        if (product.categories && product.categories.length > 0) {
          for (const cat of product.categories) {
            if (!categories.has(cat.id)) {
              categories.set(cat.id, {
                id: cat.id,
                name: cat.name,
                slug: cat.slug,
                parent_id: cat.parent_id,
                parent_name: cat.parent_name
              });
            }
          }
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 500));
      
    } catch (error) {
      console.error(`Error fetching page ${page}:`, error.message);
      break;
    }
  }
  
  // Сортирай по ID
  const sortedCategories = Array.from(categories.values())
    .sort((a, b) => parseInt(a.id) - parseInt(b.id));
  
  console.log('\n=== ALL CATEGORIES ===\n');
  
  // Групирай по parent
  const byParent = {};
  
  for (const cat of sortedCategories) {
    const parentName = cat.parent_name || 'ROOT';
    if (!byParent[parentName]) {
      byParent[parentName] = [];
    }
    byParent[parentName].push(cat);
  }
  
  // Покажи групирано
  for (const [parentName, cats] of Object.entries(byParent)) {
    console.log(`\n📁 ${parentName}`);
    console.log('─'.repeat(60));
    
    for (const cat of cats) {
      console.log(`  ID: ${cat.id.padEnd(4)} | ${cat.name}`);
      if (cat.slug) {
        console.log(`       Slug: ${cat.slug}`);
      }
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log(`Total categories found: ${sortedCategories.length}`);
  
  // Запази в JSON файл
  const fs = require('fs');
  fs.writeFileSync('filstar-categories.json', JSON.stringify(sortedCategories, null, 2));
  console.log('\n✅ Categories saved to filstar-categories.json');
}

fetchAllCategories().catch(error => {
  console.error('Failed to fetch categories:', error);
  process.exit(1);
});
