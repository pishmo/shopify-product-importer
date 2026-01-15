// test-categories.js - Тест за извличане на монофилни влакна с пълна пагинация
const fetch = require('node-fetch');

const SHOPIFY_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const FILSTAR_TOKEN = process.env.FILSTAR_API_TOKEN;
const API_VERSION = '2024-10';
const FILSTAR_API_BASE = 'https://filstar.com/api';

// Категория ID за монофилни влакна във Filstar
const MONOFILAMENT_CATEGORY_ID = '41';

// Функция за извличане на всички монофилни влакна от Filstar с пълна пагинация
async function fetchMonofilamentProducts() {
  console.log('Fetching all products from Filstar API with full pagination...');
  
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
    
    console.log(`\n=== TOTAL: ${allProducts.length} products fetched ===\n`);
    
    // Филтрирай само монофилните влакна
    const monofilamentProducts = allProducts.filter(product => 
      product.categories?.some(cat => 
        cat.id === MONOFILAMENT_CATEGORY_ID ||
        cat.name.includes('Монофилни') || 
        cat.name.toLowerCase().includes('monofilament')
      )
    );
    
    console.log(`Found ${monofilamentProducts.length} monofilament products`);
    
    return monofilamentProducts;
    
  } catch (error) {
    console.error('Error fetching products:', error.message);
    throw error;
  }
}

// Стартирай теста
(async () => {
  try {
    console.log('=== Starting Monofilament Products Test ===');
    const products = await fetchMonofilamentProducts();
    console.log('=== Test Complete ===');
    console.log(`Successfully fetched ${products.length} monofilament products`);
  } catch (error) {
    console.error('=== Test Failed ===');
    console.error(error);
    process.exit(1);
  }
})();
