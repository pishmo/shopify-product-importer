// check-collection.js
const fetch = require('node-fetch');

const SHOPIFY_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const API_VERSION = '2024-10';

// ID на колекцията "Макари с преден аванс"
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
  
  console.log('API Response:', JSON.stringify(data, null, 2));
  
  if (!data.products) {
    console.log('\n❌ No products found. Check collection ID!');
    return;
  }
  
  const products = data.products;
  
  console.log(`\nTotal products in collection: ${products.length}\n`);
  
  // Групирай по vendor
  const vendors = {};
  products.forEach(p => {
    const vendor = p.vendor || 'No vendor';
    if (!vendors[vendor]) vendors[vendor] = 0;
    vendors[vendor]++;
  });
  
  console.log('Products by vendor:');
  Object.entries(vendors).forEach(([vendor, count]) => {
    console.log(`  ${vendor}: ${count}`);
  });
}

checkCollection();
