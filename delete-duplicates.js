// check-collection.js
const fetch = require('node-fetch');

const SHOPIFY_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const API_VERSION = '2024-10';

const COLLECTION_ID = '739175301502';

async function checkCollection() {
  console.log('Checking collection products...\n');
  
  const response = await fetch(
    `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/collections/${COLLECTION_ID}/products.json?limit=250`,
    {
      headers: {
        'X-Shopify-Access-Token': ACCESS_TOKEN,
        'Content-Type': 'application/json'
      }
    }
  );
  
  const data = await response.json();
  const products = data.products;
  
  console.log(`Total products: ${products.length}\n`);
  
  // Групирай по title
  const titleMap = {};
  products.forEach(p => {
    if (!titleMap[p.title]) {
      titleMap[p.title] = [];
    }
    titleMap[p.title].push(p.id);
  });
  
  // Намери дубликати
  const duplicates = Object.entries(titleMap).filter(([title, ids]) => ids.length > 1);
  
  console.log(`Unique titles: ${Object.keys(titleMap).length}`);
  console.log(`Duplicates: ${duplicates.length}\n`);
  
  if (duplicates.length > 0) {
    console.log('DUPLICATES:');
    duplicates.forEach(([title, ids]) => {
      console.log(`"${title}" - ${ids.length} copies`);
    });
  }
}

checkCollection();
