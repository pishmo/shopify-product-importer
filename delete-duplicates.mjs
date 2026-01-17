// find-duplicates.js
const SHOPIFY_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const API_VERSION = '2024-10';

async function findDuplicates() {
  console.log('Searching for duplicate products...\n');
  
  const response = await fetch(
    `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/products.json?limit=250`,
    {
      headers: {
        'X-Shopify-Access-Token': ACCESS_TOKEN,
        'Content-Type': 'application/json'
      }
    }
  );
  
  const data = await response.json();
  const products = data.products;
  
  // Групирай по title
  const titleMap = {};
  products.forEach(p => {
    if (!titleMap[p.title]) {
      titleMap[p.title] = [];
    }
    titleMap[p.title].push({ id: p.id, title: p.title });
  });
  
  // Намери дубликати
  const duplicates = Object.entries(titleMap).filter(([title, prods]) => prods.length > 1);
  
  console.log(`Total products: ${products.length}`);
  console.log(`Unique titles: ${Object.keys(titleMap).length}`);
  console.log(`Duplicate titles: ${duplicates.length}\n`);
  
  if (duplicates.length > 0) {
    console.log('DUPLICATES FOUND:');
    console.log('='.repeat(60));
    duplicates.forEach(([title, prods]) => {
      console.log(`\n"${title}" - ${prods.length} copies`);
      prods.forEach(p => console.log(`  ID: ${p.id}`));
    });
  }
}

findDuplicates();
