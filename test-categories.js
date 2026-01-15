// import-monofilament.js - Import на монофилни влакна с проверка за дублирани снимки
const fetch = require('node-fetch');

const SHOPIFY_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const FILSTAR_TOKEN = process.env.FILSTAR_API_TOKEN;
const API_VERSION = '2024-10';
const FILSTAR_API_BASE = 'https://filstar.com/api';

// Категория ID за монофилни влакна във Filstar
const MONOFILAMENT_CATEGORY_ID = 'XXX'; // <-- Трябва да сложиш правилното ID

// Функция за извличане на всички монофилни влакна от Filstar
async function fetchMonofilamentProducts() {
  console.log('Fetching all products from Filstar API...');
  
  try {
    const response = await fetch(`${FILSTAR_API_BASE}/products`, {
      headers: {
        'Authorization': `Bearer ${FILSTAR_TOKEN}`
      }
    });

    if (!response.ok) {
      throw new Error(`Filstar API error: ${response.status}`);
    }

    const allProducts = await response.json();
    console.log(`Total products fetched: ${allProducts.length}`);
    
    // Филтрирай само монофилните влакна
    const monofilamentProducts = allProducts.filter(product => 
      product.categories?.some(cat => 
        cat.name.includes('Монофилни') || 
        cat.name.toLowerCase().includes('monofilament') ||
        cat.name.toLowerCase().includes('mono')
      )
    );
    
    console.log(`Found ${monofilamentProducts.length} monofilament products`);
    
    return monofilamentProducts;
    
  } catch (error) {
    console.error('Error fetching products:', error.message);
    throw error;
  }
}
