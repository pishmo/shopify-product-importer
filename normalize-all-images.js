// normalize-all-images.js
const fetch = require('node-fetch');
const sharp = require('sharp');

const SHOPIFY_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const API_VERSION = '2024-10';

// Конфигурация за нормализация
const TARGET_WIDTH = 1200;
const TARGET_HEIGHT = 1000;
const BACKGROUND_COLOR = { r: 255, g: 255, b: 255, alpha: 1 }; // Бял фон

/**
 * Нормализира изображение към 1200x1000 с бели полета
 */
async function normalizeImage(imageUrl) {
  try {
    // 1. Свали изображението
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.status}`);
    }
    
    const imageBuffer = await response.buffer();
    
    // 2. Вземи метаданните
    const metadata = await sharp(imageBuffer).metadata();
    const originalWidth = metadata.width;
    const originalHeight = metadata.height;
    
    // 3. Провери дали вече е 1200x1000
    if (originalWidth === TARGET_WIDTH && originalHeight === TARGET_HEIGHT) {
      console.log(`    ⏭️  Already normalized: ${originalWidth}x${originalHeight}`);
      return null; // Не е нужна нормализация
    }
    
    console.log(`    🔧 Normalizing: ${originalWidth}x${originalHeight} → ${TARGET_WIDTH}x${TARGET_HEIGHT}`);
    
    // 4. Нормализирай с padding
    const normalizedBuffer = await sharp(imageBuffer)
      .resize(TARGET_WIDTH, TARGET_HEIGHT, {
        fit: 'contain', // Запазва aspect ratio и добавя padding
        background: BACKGROUND_COLOR,
        position: 'center'
      })
      .jpeg({ quality: 90 })
      .toBuffer();
    
    const originalSize = (imageBuffer.length / 1024).toFixed(1);
    const newSize = (normalizedBuffer.length / 1024).toFixed(1);
    console.log(`       Size: ${originalSize}KB → ${newSize}KB`);
    
    return normalizedBuffer;
    
  } catch (error) {
    console.error(`    ❌ Error normalizing:`, error.message);
    return null;
  }
}

/**
 * Презаписва снимка в Shopify със същото име
 */
async function replaceProductImage(productId, imageId, normalizedBuffer, position) {
  try {
    // 1. Изтрий старата снимка
    const deleteResponse = await fetch(
      `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/products/${productId}/images/${imageId}.json`,
      {
        method: 'DELETE',
        headers: {
          'X-Shopify-Access-Token': ACCESS_TOKEN
        }
      }
    );
    
    if (!deleteResponse.ok) {
      throw new Error(`Failed to delete: ${deleteResponse.status}`);
    }
    
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // 2. Качи новата нормализирана снимка
    const base64Image = normalizedBuffer.toString('base64');
    
    const uploadResponse = await fetch(
      `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/products/${productId}/images.json`,
      {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': ACCESS_TOKEN,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          image: {
            attachment: base64Image,
            position: position
          }
        })
      }
    );
    
    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      throw new Error(`Failed to upload: ${uploadResponse.status} - ${errorText}`);
    }
    
    console.log(`    ✅ Replaced image at position ${position}`);
    return true;
    
  } catch (error) {
    console.error(`    ❌ Error replacing image:`, error.message);
    return false;
  }
}

/**
 * Взима всички продукти от магазина
 */
async function getAllProducts() {
  const products = [];
  let url = `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/products.json?limit=250`;
  
  while (url) {
    const response = await fetch(url, {
      headers: {
        'X-Shopify-Access-Token': ACCESS_TOKEN,
        'Content-Type': 'application/json'
      }
    });
    
    const data = await response.json();
    products.push(...data.products);
    
    // Pagination
    const linkHeader = response.headers.get('Link');
    url = null;
    if (linkHeader) {
      const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
      if (nextMatch) {
        url = nextMatch[1];
      }
    }
    
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  return products;
}

/**
 * Нормализира всички снимки на продукт
 */
async function normalizeProductImages(product) {
  console.log(`\n📦 Processing: ${product.title}`);
  
  if (!product.images || product.images.length === 0) {
    console.log(`  ⏭️  No images, skipping`);
    return { normalized: 0, skipped: 0 };
  }
  
  console.log(`  📸 Found ${product.images.length} images`);
  
  let normalized = 0;
  let skipped = 0;
  
  for (const image of product.images) {
    const filename = image.src.split('/').pop().split('?')[0];
    console.log(`\n  🖼️  ${filename}`);
    
    // Нормализирай снимката
    const normalizedBuffer = await normalizeImage(image.src);
    
    if (!normalizedBuffer) {
      skipped++;
      continue; // Вече е нормализирана
    }
    
    // Презапиши снимката
    const replaced = await replaceProductImage(
      product.id,
      image.id,
      normalizedBuffer,
      image.position
    );
    
    if (replaced) {
      normalized++;
    }
    
    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  return { normalized, skipped };
}

/**
 * Main функция
 */
async function main() {
  console.log('🚀 Starting image normalization...\n');
  console.log(`Target size: ${TARGET_WIDTH}x${TARGET_HEIGHT}`);
  console.log(`Background: White (RGB 255,255,255)\n`);
  
  // Вземи всички продукти
  console.log('📥 Fetching all products...');
  const products = await getAllProducts();
  console.log(`✅ Found ${products.length} products\n`);
  
  let totalNormalized = 0;
  let totalSkipped = 0;
  
  // Обработи всеки продукт
  for (const product of products) {
    const result = await normalizeProductImages(product);
    totalNormalized += result.normalized;
    totalSkipped += result.skipped;
  }
  
  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('📊 NORMALIZATION SUMMARY');
  console.log('='.repeat(70));
  console.log(`✅ Normalized: ${totalNormalized} images`);
  console.log(`⏭️  Skipped: ${totalSkipped} images (already 1200x1000)`);
  console.log(`📦 Products processed: ${products.length}`);
  console.log('='.repeat(70));
}

main();
