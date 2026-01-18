// cleanup-duplicate-images.js - Премахва дублирани снимки от продукти
const fetch = require('node-fetch');

const SHOPIFY_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const API_VERSION = '2024-10';

// Функция за нормализиране на filename (същата като в импорт скрипта)
function getImageFilename(src) {
  if (!src || typeof src !== 'string') {
    return null;
  }
  
  const urlParts = src.split('/').pop();
  const withoutQuery = urlParts.split('?')[0];
  
  // Премахни Shopify UUID
  const uuidPattern = /_[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}(\.[a-z]+)?$/i;
  let cleanFilename = withoutQuery.replace(uuidPattern, '$1');
  
  // Премахни hex hash-ове
  const parts = cleanFilename.split('_');
  if (parts.length > 1) {
    const lastPart = parts[parts.length - 1].split('.')[0];
    if (lastPart.length >= 32 && /^[a-f0-9]+$/i.test(lastPart)) {
      parts.pop();
      const extension = cleanFilename.split('.').pop();
      cleanFilename = parts.join('_') + '.' + extension;
    }
  }
  
  // Премахни водещи долни черти
  cleanFilename = cleanFilename.replace(/^_+/, '');
  
  return cleanFilename;
}

// Функция за вземане на всички продукти с pagination
async function getAllProducts() {
  console.log('Fetching all products...\n');
  
  let allProducts = [];
  let hasNextPage = true;
  let pageInfo = null;
  
  while (hasNextPage) {
    let url = `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/products.json?limit=250&fields=id,title,images`;
    
    if (pageInfo) {
      url += `&page_info=${pageInfo}`;
    }
    
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
    
    // Проверка за следваща страница
    const linkHeader = response.headers.get('Link');
    hasNextPage = false;
    
    if (linkHeader) {
      const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
      if (nextMatch) {
        const nextUrl = nextMatch[1];
        const pageInfoMatch = nextUrl.match(/page_info=([^&]+)/);
        if (pageInfoMatch) {
          pageInfo = pageInfoMatch[1];
          hasNextPage = true;
        }
      }
    }
    
    console.log(`Fetched ${allProducts.length} products so far...`);
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  console.log(`\nTotal products fetched: ${allProducts.length}\n`);
  return allProducts;
}

// Функция за намиране на дублирани снимки в продукт
function findDuplicateImages(images) {
  if (!images || images.length <= 1) {
    return [];
  }
  
  const seen = new Map(); // normalized filename -> първата снимка
  const duplicates = [];
  
  for (const image of images) {
    const normalizedFilename = getImageFilename(image.src);
    
    if (!normalizedFilename) continue;
    
    if (seen.has(normalizedFilename)) {
      // Това е дубликат - запази ID-то за изтриване
      duplicates.push({
        id: image.id,
        src: image.src,
        filename: normalizedFilename,
        created: image.created_at
      });
    } else {
      // Първо срещане на тази снимка
      seen.set(normalizedFilename, image);
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
        'X-Shopify-Access-Token': ACCESS_TOKEN,
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
    console.log('Starting duplicate image cleanup...\n');
    console.log('='.repeat(70));
    
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
        console.log(`   ID: ${product.id}`);
        console.log(`   Total images: ${product.images.length}`);
        console.log(`   Duplicates found: ${duplicates.length}`);
        console.log(`   Unique images: ${product.images.length - duplicates.length}`);
        
        // Покажи кои снимки ще се изтрият
        console.log(`\n   🗑️  Duplicates to delete:`);
        duplicates.forEach(dup => {
          console.log(`      - ${dup.filename}`);
          console.log(`        ID: ${dup.id} | Created: ${dup.created}`);
        });
        
        // Изтриване на дубликатите
        for (const dup of duplicates) {
          try {
            await deleteProductImage(product.id, dup.id);
            totalDuplicatesDeleted++;
            console.log(`   ✓ Deleted: ${dup.id}`);
          } catch (error) {
            console.error(`   ✗ Failed to delete ${dup.id}:`, error.message);
          }
        }
        
        console.log(`   ✅ Cleaned up ${duplicates.length} duplicate images`);
      }
    }
    
    console.log('\n' + '='.repeat(70));
    console.log('CLEANUP SUMMARY');
    console.log('='.repeat(70));
    console.log(`Total products checked: ${products.length}`);
    console.log(`Products with duplicates: ${productsWithDuplicates}`);
    console.log(`Total duplicates found: ${totalDuplicatesFound}`);
    console.log(`Total duplicates deleted: ${totalDuplicatesDeleted}`);
    console.log('='.repeat(70));
    console.log('\n✅ Cleanup completed successfully!');
    
  } catch (error) {
    console.error('❌ Cleanup failed:', error);
    process.exit(1);
  }
}

main();
