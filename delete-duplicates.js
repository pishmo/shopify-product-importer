// delete-duplicates.js - Премахване на дубликати от всички колекции с макари
const fetch = require('node-fetch');

const SHOPIFY_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const API_VERSION = '2024-10';

// Всички колекции с макари
const COLLECTION_IDS = [
  '739175301502',  // Front drag
  '739175334270',  // Rear drag
  '739175399806',  // Baitrunner
  '739175432574',  // Multipliers
  '739175530878'   // Other
];

async function getProductsFromCollection(collectionId) {
  const response = await fetch(
    `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/collections/${collectionId}/products.json?limit=250`,
    {
      headers: {
        'X-Shopify-Access-Token': ACCESS_TOKEN,
        'Content-Type': 'application/json'
      }
    }
  );
  
  if (!response.ok) {
    console.error(`Failed to fetch collection ${collectionId}`);
    return [];
  }
  
  const data = await response.json();
  return data.products || [];
}

async function deleteDuplicates() {
  console.log('======================================================================');
  console.log('🗑️  DELETING DUPLICATES FROM ALL REEL COLLECTIONS');
  console.log('======================================================================\n');
  
  let allProducts = [];
  
  // Събери всички продукти от всички колекции
  for (const collectionId of COLLECTION_IDS) {
    console.log(`Fetching products from collection ${collectionId}...`);
    const products = await getProductsFromCollection(collectionId);
    allProducts = allProducts.concat(products);
    console.log(`  Found ${products.length} products\n`);
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  console.log(`Total products fetched: ${allProducts.length}\n`);
  
  // Премахни дубликати по ID (ако един продукт е в няколко колекции)
  const uniqueProducts = [];
  const seenIds = new Set();
  
  for (const product of allProducts) {
    if (!seenIds.has(product.id)) {
      seenIds.add(product.id);
      uniqueProducts.push(product);
    }
  }
  
  console.log(`Unique products: ${uniqueProducts.length}\n`);
  
  // Групирай по title
  const titleMap = {};
  uniqueProducts.forEach(p => {
    if (!titleMap[p.title]) {
      titleMap[p.title] = [];
    }
    titleMap[p.title].push({ id: p.id, title: p.title, created_at: p.created_at });
  });
  
  // Намери дубликати
  const duplicates = Object.entries(titleMap).filter(([title, prods]) => prods.length > 1);
  
  console.log(`Found ${duplicates.length} products with duplicates\n`);
  console.log('======================================================================\n');
  
  if (duplicates.length === 0) {
    console.log('✅ No duplicates found!');
    return;
  }
  
  let deleted = 0;
  
  for (const [title, prods] of duplicates) {
    // Сортирай по дата (запази най-новия)
    prods.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    
    // Остави първия (най-новия), изтрий останалите
    const toKeep = prods[0];
    const toDelete = prods.slice(1);
    
    console.log(`"${title}"`);
    console.log(`  ✓ Keeping newest (ID: ${toKeep.id}, created: ${toKeep.created_at})`);
    console.log(`  🗑️  Deleting ${toDelete.length} older duplicate(s):`);
    
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
        console.log(`    ✓ Deleted ID: ${prod.id} (created: ${prod.created_at})`);
        deleted++;
      } else {
        console.log(`    ✗ Failed to delete ID: ${prod.id}`);
      }
      
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    console.log('');
  }
  
  console.log('======================================================================');
  console.log(`✅ COMPLETED: Deleted ${deleted} duplicate products`);
  console.log('======================================================================');
}

deleteDuplicates();
