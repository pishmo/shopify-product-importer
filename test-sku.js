
const fetch = require('node-fetch');
const sharp = require('sharp');

const SHOPIFY_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const FILSTAR_TOKEN = process.env.FILSTAR_API_TOKEN;
const API_VERSION = '2024-10';
const FILSTAR_API_BASE = 'https://filstar.com/api';
const FILSTAR_BASE_URL = 'https://filstar.com';



const SKU_TO_SEARCH = '957410';

async function searchBySKU() {
  try {
    console.log(`🔍 Търсене на SKU: ${SKU_TO_SEARCH}`);
    
    const response = await fetch(
      `${FILSTAR_API_BASE}/products?search=${SKU_TO_SEARCH}`
    );
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    
    console.log('\n📦 ПЪЛЕН RESPONSE:');
    console.log(JSON.stringify(data, null, 2));
    
    if (data.products && data.products.length > 0) {
      console.log(`\n✅ Намерени ${data.products.length} продукта`);
      
      data.products.forEach((product, index) => {
        console.log(`\n[${index + 1}] ${product.name || product.title}`);
        console.log(`ID: ${product.id}`);
        
        if (product.categories) {
          console.log(`📁 Категории (${product.categories.length}):`);
          product.categories.forEach(cat => {
            console.log(`• ${cat.name || cat.title}`);
            console.log(`  └─ CAT_ID: ${cat.CAT_ID} | PARENT_ID: ${cat.PARENT_ID} | PARENT: ${cat.parent_name || cat.PARENT}`);
          });
        }
        
        if (product.variants) {
          console.log(`📦 Варианти: ${product.variants.length}`);
        }
      });
    } else {
      console.log('\n❌ Не са намерени продукти');
    }
    
  } catch (error) {
    console.error('❌ Грешка:', error.message);
  }
}

searchBySKU();
