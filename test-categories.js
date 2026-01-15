// test-categories.js - Тест за проверка на категориите
const fetch = require('node-fetch');

const FILSTAR_TOKEN = process.env.FILSTAR_API_TOKEN;
const FILSTAR_API_BASE = 'https://filstar.com/api';

// Категориите, които проверяваме
const CATEGORIES = {
  'Монофилни': '41',
  'Плетени': '105',
  'Fluorocarbon': '107',
  'Други': '109'
};

async function testCategories() {
  console.log('🔍 Testing category filtering...\n');
  
  try {
    // Fetch всички продукти
    console.log('Fetching products from Filstar...');
    const response = await fetch(`${FILSTAR_API_BASE}/products?limit=1000`, {
      headers: {
        'Authorization': `Bearer ${FILSTAR_TOKEN}`
      }
    });

    if (!response.ok) {
      throw new Error(`Filstar API error: ${response.status}`);
    }

    const allProducts = await response.json();
    console.log(`✓ Total products fetched: ${allProducts.length}\n`);
    
    // Провери всяка категория
    for (const [categoryName, categoryId] of Object.entries(CATEGORIES)) {
      console.log(`\n--- Testing category: ${categoryName} (ID: ${categoryId}) ---`);
      
      const filtered = allProducts.filter(product => {
        if (!product.categories || product.categories.length === 0) {
          return false;
        }
        
        return product.categories.some(cat => 
          cat.id == categoryId || // Сравнява string и number
          cat.id === String(categoryId) || 
          cat.id === Number(categoryId)
        );
      });
      
      console.log(`Found ${filtered.length} products in ${categoryName}`);
      
      // Покажи първите 3 продукта
      if (filtered.length > 0) {
        console.log('First 3 products:');
        filtered.slice(0, 3).forEach((p, i) => {
          console.log(`  ${i + 1}. ${p.name}`);
          console.log(`     Categories: ${p.categories.map(c => `${c.name} (ID: ${c.id}, type: ${typeof c.id})`).join(', ')}`);
        });
      } else {
        console.log('⚠️ NO PRODUCTS FOUND!');
        
        // Покажи примерни категории от други продукти
        console.log('\nSample categories from other products:');
        allProducts.slice(0, 5).forEach(p => {
          if (p.categories && p.categories.length > 0) {
            console.log(`  "${p.name}": ${p.categories.map(c => `${c.name} (ID: ${c.id}, type: ${typeof c.id})`).join(', ')}`);
          }
        });
      }
    }


// Добави след проверката на категориите:

console.log('\n\n--- Searching for categories containing "Монофилни" or "моно" ---');
const allCategoryIds = new Set();
const categoryNames = new Map();

allProducts.forEach(p => {
  p.categories?.forEach(cat => {
    allCategoryIds.add(cat.id);
    categoryNames.set(cat.id, cat.name);
  });
});

console.log('\nAll unique categories:');
Array.from(categoryNames.entries())
  .filter(([id, name]) => 
    name.toLowerCase().includes('моно') || 
    name.toLowerCase().includes('влакн')
  )
  .forEach(([id, name]) => {
    const count = allProducts.filter(p => 
      p.categories?.some(c => c.id === id)
    ).length;
    console.log(`  ${name} (ID: ${id}) - ${count} products`);
  });




    
    // Провери продукти БЕЗ категории
    const noCategories = allProducts.filter(p => !p.categories || p.categories.length === 0);
    console.log(`\n\n⚠️ Products WITHOUT categories: ${noCategories.length}`);
    if (noCategories.length > 0) {
      console.log('Examples:');
      noCategories.slice(0, 3).forEach(p => console.log(`  - ${p.name}`));
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testCategories();
