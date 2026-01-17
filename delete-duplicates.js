// delete-duplicates.js
const fetch = require('node-fetch');

const SHOPIFY_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const API_VERSION = '2024-10';

const COLLECTION_ID = '739175301502';

async function deleteDuplicates() {
  console.log('Finding and deleting duplicates...\n');
  
  const response = await fetch(
    `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/collections/${COLLECTION_ID}/products.json?limit=250`,
    {
      headers: {
        'X-Shopify-Access-TOKEN': ACCESS_TOKEN,
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
    titleMap[p.title].push({ id: p.id, title: p.title });
  });
  
  // Намери дубликати
  const duplicates = Object.entries(titleMap).filter(([title, prods]) => prods.length > 1);
  
  console.log(`Found ${duplicates.length} products with duplicates\n`);
  
  let deleted = 0;
  
  for (const [title, prods] of duplicates) {
    // Остави първия, изтрий останалите
    const toDelete = prods.slice(1);
    
    console.log(`"${title}" - keeping 1, deleting ${toDelete.length}`);
    
    for (const prod of toDelete) {
      const delResponse = await fetch(
        `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/products/${prod.id}.json`,
        {
          method: 'DELETE',
          headers: {
            'X-Shopify-Access-Token': ACCESS_TOKEN
          }
        }
      );
      
      if (delResponse.ok) {
        console.log(`  ✓ Deleted ID: ${prod.id}`);
        deleted++;
      } else {
        console.log(`  ✗ Failed to delete ID: ${prod.id}`);
      }
      
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  console.log(`\n✅ Deleted ${deleted} duplicate products`);
}

deleteDuplicates();
