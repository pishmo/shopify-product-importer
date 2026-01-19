// delete-duplicate-products.js - Изтриване на дублирани продукти
const fetch = require('node-fetch');

const SHOPIFY_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const API_VERSION = '2024-10';

// Функция за извличане на всички продукти
async function getAllProducts() {
  console.log('Fetching all products...');
  
  let allProducts = [];
  let hasNextPage = true;
  let nextPageUrl = `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/products.json?fields=id,title,variants,created_at&limit=250`;
  
  while (hasNextPage) {
    const response = await fetch(nextPageUrl, {
      method: 'GET',
      headers: {
        'X-Shopify-Access-Token': ACCESS_TOKEN,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      console.error(`Failed to fetch products: ${response.status}`);
      break;
    }
    
    const data = await response.json();
    allProducts = allProducts.concat(data.products);
    
    console.log(`Fetched ${data.products.length} products (total: ${allProducts.length})`);
    
    const linkHeader = response.headers.get('Link');
    
    if (linkHeader && linkHeader.includes('rel="next"')) {
      const nextLinkMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
      
      if (nextLinkMatch && nextLinkMatch[1]) {
        nextPageUrl = nextLinkMatch[1];
        hasNextPage = true;
      } else {
        hasNextPage = false;
      }
    } else {
      hasNextPage = false;
    }
    
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  console.log(`Total products fetched: ${allProducts.length}\n`);
  return allProducts;
}

// Функция за намиране на дубликати по SKU
function findDuplicatesBySku(products) {
  const skuMap = new Map();
  
  for (const product of products) {
    const sku = product.variants[0]?.sku;
    
    if (!sku) continue;
    
    if (!skuMap.has(sku)) {
      skuMap.set(sku, []);
    }
    
    skuMap.get(sku).push(product);
  }
  
  const duplicates = [];
  
  for (const [sku, products] of skuMap.entries()) {
    if (products.length > 1) {
      // Сортирай по created_at (най-новият първи)
      products.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      
      duplicates.push({
        sku: sku,
        keep: products[0],
        delete: products.slice(1)
      });
    }
  }
  
  return duplicates;
}

// Функция за изтриване на продукт
async function deleteProduct(productId) {
  const url = `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/products/${productId}.json`;
  
  const response = await fetch(url, {
    method: 'DELETE',
    headers: {
      'X-Shopify-Access-Token': ACCESS_TOKEN,
      'Content-Type': 'application/json'
    }
  });
  
  if (response.ok) {
    return true;
  } else {
    console.error(`  ✗ Failed to delete product ${productId}: ${response.status}`);
    return false;
  }
}

// Главна функция
async function main() {
  try {
    console.log('='.repeat(70));
    console.log('Starting duplicate product cleanup...');
    console.log('='.repeat(70));
    
    const products = await getAllProducts();
    const duplicates = findDuplicatesBySku(products);
    
    console.log(`Found ${duplicates.length} SKUs with duplicates\n`);
    
    let totalDeleted = 0;
    
    for (const dup of duplicates) {
      console.log(`\n📦 SKU: ${dup.sku}`);
      console.log(`   Title: ${dup.keep.title}`);
      console.log(`   Keeping: ID ${dup.keep.id} (created: ${dup.keep.created_at})`);
      console.log(`   Deleting ${dup.delete.length} duplicate(s):`);
      
      for (const product of dup.delete) {
        console.log(`     - ID ${product.id} (created: ${product.created_at})`);
        
        const deleted = await deleteProduct(product.id);
        if (deleted) {
          totalDeleted++;
          console.log(`       ✓ Deleted`);
        }
        
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }
    
    console.log('\n' + '='.repeat(70));
    console.log('Cleanup completed!');
    console.log('='.repeat(70));
    console.log(`SKUs with duplicates: ${duplicates.length}`);
    console.log(`Products deleted: ${totalDeleted}`);
    console.log('='.repeat(70));
    
  } catch (error) {
    console.error('Error during cleanup:', error);
    process.exit(1);
  }
}

main();
