// cleanup-duplicate-images.js - ОБНОВЕНА ВЕРСИЯ
const fetch = require('node-fetch');

const SHOPIFY_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const API_VERSION = '2024-10';

// Функция за извличане на filename от URL
function getImageFilename(src) {
  // Извлича filename преди hash-а
  // Пример: "elite-8-multi-300m-1-jpg_0dcf0dcbe24fa36699f6d464979dbb98" -> "elite-8-multi-300m-1-jpg"
  const urlParts = src.split('/').pop(); // Вземи последната част от URL
  const withoutQuery = urlParts.split('?')[0]; // Премахни query параметри
  
  // Премахни UUID hash-а (всичко след последното "_")
  const parts = withoutQuery.split('_');
  if (parts.length > 1) {
    // Ако последната част изглежда като hash (32+ chars), премахни я
    const lastPart = parts[parts.length - 1];
    if (lastPart.length >= 32 && /^[a-f0-9]+/.test(lastPart)) {
      parts.pop();
    }
  }
  
  return parts.join('_');
}

// Функция за вземане на всички продукти
async function getAllProducts() {
  console.log('Fetching all products...');
  
  let allProducts = [];
  let url = `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/products.json?limit=250&fields=id,title,images`;
  
  while (url) {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-Shopify-Access-Token': ACCESS_TOKEN,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch products: ${response.status}`);
    }
    
    const data = await response.json();
    allProducts = allProducts.concat(data.products);
    
    const linkHeader = response.headers.get('link');
    url = null;
    
    if (linkHeader) {
      const nextLink = linkHeader.split(',').find(link => link.includes('rel="next"'));
      if (nextLink) {
        const match = nextLink.match(/<([^>]+)>/);
        if (match) {
          url = match[1];
        }
      }
    }
    
    console.log(`Fetched ${allProducts.length} products so far...`);
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  console.log(`Total products fetched: ${allProducts.length}`);
  return allProducts;
}

// Функция за намиране на дублирани снимки
function findDuplicateImages(images) {
  if (!images || images.length <= 1) {
    return [];
  }
  
  const seen = new Map(); // filename -> първата снимка с този filename
  const duplicates = [];
  
  for (const image of images) {
    const filename = getImageFilename(image.src);
    
    if (seen.has(filename)) {
      // Това е дубликат - запази ID-то за изтриване
      duplicates.push({
        id: image.id,
        src: image.src,
        filename: filename
      });
    } else {
      // Първо срещане на тази снимка
      seen.set(filename, image);
    }
  }
  
  return duplicates;
}

// Функция за изтриване на снимка
async function deleteProductImage(productId, imageId) {
  const response = await fetch(
    `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/products/${productId}/images/${imageId}.json`,
    {
      method: 'DELETE',
      headers: {
        'X-Shopify-Access-TOKEN': ACCESS_TOKEN,
        'Content-Type': 'application/json'
      }
    }
  );
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to delete image ${imageId}: ${error}`);
  }
  
  await new Promise(resolve => setTimeout(resolve, 300));
}

// Главна функция
async function main() {
  try {
    console.log('Starting duplicate image cleanup (by filename)...\n');
    
    const products = await getAllProducts();
    
    let totalDuplicatesFound = 0;
    let totalDuplicatesDeleted = 0;
    let productsWithDuplicates = 0;
    
    for (const product of products) {
      const duplicates = findDuplicateImages(product.images);
      
      if (duplicates.length > 0) {
        productsWithDuplicates++;
        totalDuplicatesFound += duplicates.length;
        
        console.log(`\n📦 Product: ${product.title}`);
        console.log(`   Total images: ${product.images.length}`);
        console.log(`   Duplicates found: ${duplicates.length}`);
        console.log(`   Unique images: ${product.images.length - duplicates.length}`);
        
        // Покажи примери от дубликатите
        if (duplicates.length > 0) {
          console.log(`   Example duplicate: ${duplicates[0].filename}`);
        }
        
        // Изтриване на дубликатите
        for (const duplicate of duplicates) {
          try {
            await deleteProductImage(product.id, duplicate.id);
            totalDuplicatesDeleted++;
            console.log(`   ✓ Deleted: ${duplicate.filename} (ID: ${duplicate.id})`);
          } catch (error) {
            console.error(`   ✗ Failed to delete ${duplicate.id}:`, error.message);
          }
        }
        
        console.log(`   ✅ Cleaned up ${duplicates.length} duplicate images`);
      }
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('CLEANUP SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total products checked: ${products.length}`);
    console.log(`Products with duplicates: ${productsWithDuplicates}`);
    console.log(`Total duplicates found: ${totalDuplicatesFound}`);
    console.log(`Total duplicates deleted: ${totalDuplicatesDeleted}`);
    console.log('='.repeat(60));
    console.log('\n✅ Cleanup completed successfully!');
    
  } catch (error) {
    console.error('❌ Cleanup failed:', error);
    process.exit(1);
  }
}

main();
