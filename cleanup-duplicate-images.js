// cleanup-duplicate-images.js - Изтриване на дублирани снимки от продукти
const fetch = require('node-fetch');

const SHOPIFY_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const API_VERSION = '2024-10';

// Функция за нормализиране на filename (премахва UUID и hash-ове)
// Функция за нормализиране на filename (премахва timestamp, UUID и hash-ове)
function getImageFilename(src) {
  if (!src || typeof src !== 'string') {
    return null;
  }
  
  const urlParts = src.split('/').pop();
  const withoutQuery = urlParts.split('?')[0];
  
  // Премахни Shopify UUID (формат: _xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)
  const uuidPattern = /_[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}(\\.[a-z]+)?$/i;
  let cleanFilename = withoutQuery.replace(uuidPattern, '$1');
  
  // Премахни hex hash-ове от края
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
  
  // 🆕 ПРЕМАХНИ TIMESTAMP И RANDOM NUMBER (формат: -20250423155733-938)
  // Това е ключовата промяна!
  cleanFilename = cleanFilename.replace(/-\d{14}-\d+/g, '');
  
  return cleanFilename;
}


// Функция за извличане на всички продукти с пълна пагинация
async function getAllProducts() {
  console.log('Fetching all products from Shopify...');
  
  let allProducts = [];
  let hasNextPage = true;
  let nextPageUrl = `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/products.json?fields=id,title,images&limit=250`;
  
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
    
    // Провери за следваща страница
    const linkHeader = response.headers.get('Link');
    
    if (linkHeader && linkHeader.includes('rel="next"')) {
      // Извлечи URL-а за следващата страница
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
    
    // Пауза между заявки
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  console.log(`Total products fetched: ${allProducts.length}`);
  return allProducts;
}

// Функция за намиране на дублирани снимки в продукт
// Функция за намиране на дублирани снимки в продукт
function findDuplicateImages(product) {
  if (!product.images || product.images.length === 0) {
    return [];
  }
  
  const imageMap = new Map();
  
  // Първо групирай всички снимки по нормализирано име
  for (const image of product.images) {
    const normalizedFilename = getImageFilename(image.src);
    
    if (!normalizedFilename) continue;
    
    if (!imageMap.has(normalizedFilename)) {
      imageMap.set(normalizedFilename, []);
    }
    
    imageMap.get(normalizedFilename).push(image);
  }
  
  const duplicates = [];
  
  // За всяка група снимки с еднакво име
  for (const [filename, images] of imageMap.entries()) {
    if (images.length > 1) {
      // Сортирай по created_at (най-новата първа)
      images.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      
      // Запази първата (най-новата), изтрий останалите
      console.log(`  Found ${images.length} duplicates of "${filename}"`);
      console.log(`    Keeping: ${images[0].id} (created: ${images[0].created_at})`);
      
      for (let i = 1; i < images.length; i++) {
        console.log(`    Deleting: ${images[i].id} (created: ${images[i].created_at})`);
        duplicates.push(images[i]);
      }
    }
  }
  
  return duplicates;
}


// Функция за изтриване на снимка
async function deleteProductImage(productId, imageId) {
  const url = `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/products/${productId}/images/${imageId}.json`;
  
  const response = await fetch(url, {
    method: 'DELETE',
    headers: {
      'X-Shopify-Access-Token': ACCESS_TOKEN,
      'Content-Type': 'application/json'
    }
  });
  
  if (response.ok) {
    console.log(`  ✓ Deleted image ${imageId}`);
    return true;
  } else {
    console.error(`  ✗ Failed to delete image ${imageId}: ${response.status}`);
    return false;
  }
}

// Главна функция
async function main() {
  try {
    console.log('='.repeat(70));
    console.log('Starting duplicate image cleanup...');
    console.log('='.repeat(70));
    
    // Извлечи всички продукти
    const products = await getAllProducts();
    
    let totalDuplicates = 0;
    let totalDeleted = 0;
    let productsWithDuplicates = 0;
    
    // Обработи всеки продукт
    for (const product of products) {
      const duplicates = findDuplicateImages(product);
      
      if (duplicates.length > 0) {
        productsWithDuplicates++;
        totalDuplicates += duplicates.length;
        
        console.log(`\n📦 Product: ${product.title} (ID: ${product.id})`);
        console.log(`   Found ${duplicates.length} duplicate image(s)`);
        
        // Изтрий дубликатите
        for (const duplicate of duplicates) {
          const filename = getImageFilename(duplicate.src);
          console.log(`   Deleting: ${filename} (created: ${duplicate.created_at})`);
          
          const deleted = await deleteProductImage(product.id, duplicate.id);
          if (deleted) {
            totalDeleted++;
          }
          
          // Пауза между изтривания
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      }
    }
    
    // Финален отчет
    console.log('\n' + '='.repeat(70));
    console.log('Cleanup completed!');
    console.log('='.repeat(70));
    console.log(`Products checked: ${products.length}`);
    console.log(`Products with duplicates: ${productsWithDuplicates}`);
    console.log(`Total duplicates found: ${totalDuplicates}`);
    console.log(`Successfully deleted: ${totalDeleted}`);
    console.log('='.repeat(70));
    
  } catch (error) {
    console.error('Error during cleanup:', error);
    process.exit(1);
  }
}

main();
