// test-categories.js - Тест за извличане на всички категории влакна с пагинация
const fetch = require('node-fetch');

const SHOPIFY_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const FILSTAR_TOKEN = process.env.FILSTAR_API_TOKEN;
const API_VERSION = '2024-10';
const FILSTAR_API_BASE = 'https://filstar.com/api';

// Категория ID-та за влакна във Filstar
const FILSTAR_LINE_CATEGORY_IDS = {
  monofilament: ['41'],
  braided: ['105'],
  fluorocarbon: ['106'],
  other: ['107', '108', '109'] // Примерни ID-та - трябва да проверим реалните
};

// Parent категория "Влакна и поводи"
const LINES_PARENT_ID = '4';

// Функция за извличане на всички продукти от Filstar с пагинация
async function fetchAllProducts() {
  console.log('Fetching all products from Filstar API with pagination...');
  
  let allProducts = [];
  let page = 1;
  let hasMorePages = true;
  
  try {
    while (hasMorePages) {  
      console.log(`Fetching page ${page}...`);
      
      const response = await fetch(`${FILSTAR_API_BASE}/products?page=${page}&limit=1000`, {
        headers: {
          'Authorization': `Bearer ${FILSTAR_TOKEN}`
        }
      });

      if (!response.ok) {
        throw new Error(`Filstar API error: ${response.status}`);
      }

      const pageProducts = await response.json();
      console.log(`Page ${page}: ${pageProducts.length} products`);
      
      if (pageProducts.length === 0) {
        console.log('No more products, stopping pagination');
        hasMorePages = false;
      } else {
        allProducts = allProducts.concat(pageProducts);
        page++;
      }
    }
    
    console.log(`\n=== Total products fetched: ${allProducts.length} ===\n`);
    
    return allProducts;
    
  } catch (error) {
    console.error('Error fetching products:', error.message);
    throw error;
  }
}

// Функция за филтриране на влакна по категории
function filterLinesByCategory(allProducts) {
  const lines = {
    monofilament: [],
    braided: [],
    fluorocarbon: [],
    other: []
  };
  
  allProducts.forEach(product => {
    const categoryIds = product.categories?.map(c => c.id.toString()) || [];
    const categoryNames = product.categories?.map(c => c.name) || [];
    
    // Провери дали има parent "Влакна и поводи" (ID: 4)
    const hasLineParent = product.categories?.some(c => 
      c.parent_id === LINES_PARENT_ID || c.parent_id === parseInt(LINES_PARENT_ID)
    );
    
    // Монофилни
    if (categoryIds.some(id => FILSTAR_LINE_CATEGORY_IDS.monofilament.includes(id)) ||
        categoryNames.some(name => name.includes('Монофилни') || name.toLowerCase().includes('monofilament'))) {
      lines.monofilament.push(product);
    }
    // Плетени
    else if (categoryIds.some(id => FILSTAR_LINE_CATEGORY_IDS.braided.includes(id)) ||
             categoryNames.some(name => name.includes('Плетени') || name.toLowerCase().includes('braid'))) {
      lines.braided.push(product);
    }
    // Fluorocarbon
    else if (categoryIds.some(id => FILSTAR_LINE_CATEGORY_IDS.fluorocarbon.includes(id)) ||
             categoryNames.some(name => name.toLowerCase().includes('fluorocarbon'))) {
      lines.fluorocarbon.push(product);
    }
    // Други - САМО ако има parent "Влакна и поводи"
    else if (hasLineParent) {
      lines.other.push(product);
      console.log(`  [OTHER] ${product.name} - Categories: ${categoryNames.join(', ')}`);
    }
  });
  
  return lines;
}

// Стартирай теста
(async () => {
  try {
    console.log('=== Starting Fishing Lines Category Test ===\n');
    
    // Fetch всички продукти
    const allProducts = await fetchAllProducts();
    
    // Филтрирай по категории
    const lines = filterLinesByCategory(allProducts);
    
    console.log('\n=== Results ===');
    console.log(`Monofilament: ${lines.monofilament.length} products`);
    console.log(`Braided: ${lines.braided.length} products`);
    console.log(`Fluorocarbon: ${lines.fluorocarbon.length} products`);
    console.log(`Other (with parent check): ${lines.other.length} products`);
    console.log(`Total lines: ${lines.monofilament.length + lines.braided.length + lines.fluorocarbon.length + lines.other.length}`);
    
    console.log('\n=== Test Complete ===');
    
  } catch (error) {
    console.error('=== Test Failed ===');
    console.error(error);
    process.exit(1);
  }
})();
