// import-fishing-baits.js - Импорт на захранки от Filstar API с нормализация на изображения
const fetch = require('node-fetch');
const sharp = require('sharp');

const SHOPIFY_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const FILSTAR_TOKEN = process.env.FILSTAR_API_TOKEN;
const API_VERSION = '2024-10';
const FILSTAR_API_BASE = 'https://filstar.com/api';

// Shopify колекции за захранки
const COLLECTION_MAPPING = {
  groundbait: 'gid://shopify/Collection/739410641278',
  boilies: 'gid://shopify/Collection/739410674046',
  additives: 'gid://shopify/Collection/739410739582',
  seeds: 'gid://shopify/Collection/739410772350',
  pastes: 'gid://shopify/Collection/739410805118',
  other: 'gid://shopify/Collection/739410837886'
};

// Filstar категории за захранки
const FILSTAR_BAIT_CATEGORY_IDS = {
  groundbait: ['66'],
  boilies: ['69'],
  additives: ['71'],
  seeds: ['73'],
  pastes: ['75'],
  other: ['77']
};

const BAITS_PARENT_ID = '8';

const stats = {
  groundbait: { created: 0, updated: 0, images: 0 },
  boilies: { created: 0, updated: 0, images: 0 },
  additives: { created: 0, updated: 0, images: 0 },
  seeds: { created: 0, updated: 0, images: 0 },
  pastes: { created: 0, updated: 0, images: 0 },
  other: { created: 0, updated: 0, images: 0 }
};

function getCategoryName(category) {
  const names = {
    groundbait: 'Захранка',
    boilies: 'Бойли и пелети',
    additives: 'Добавки',
    seeds: 'Семена',
    pastes: 'Пасти',
    other: 'Други захранки'
  };
  return names[category] || category;
}

// Fetch всички продукти от Shopify
async function fetchAllShopifyProducts() {
  console.log('📡 Fetching ALL products from Shopify...');
  
  let allProducts = [];
  let pageInfo = null;
  let hasNextPage = true;
  let pageCount = 0;
  
  while (hasNextPage) {
    pageCount++;
    
    let url = `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/products.json?limit=250&fields=id,title,variants`;
    
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
      console.error(`Failed to fetch Shopify products: ${response.status}`);
      throw new Error(`Shopify API error: ${response.status}`);
    }
    
    const data = await response.json();
    allProducts = allProducts.concat(data.products);
    
    console.log(`  Page ${pageCount}: ${data.products.length} products (total: ${allProducts.length})`);
    
    const linkHeader = response.headers.get('Link');
    if (linkHeader && linkHeader.includes('rel="next"')) {
      const nextMatch = linkHeader.match(/<[^>]*[?&]page_info=([^>&]+)[^>]*>;\s*rel="next"/);
      if (nextMatch) {
        pageInfo = nextMatch[1];
      } else {
        hasNextPage = false;
      }
    } else {
      hasNextPage = false;
    }
    
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  console.log(`✅ Total Shopify products fetched: ${allProducts.length}\n`);
  return allProducts;
}

// Fetch всички захранки от Filstar
async function fetchAllFishingBaits() {
  console.log('🎣 Fetching fishing baits from Filstar API...\n');
  
  const allBaits = {
    groundbait: [],
    boilies: [],
    additives: [],
    seeds: [],
    pastes: [],
    other: []
  };
  
  let page = 1;
  let hasMore = true;
  
  while (hasMore) {
    console.log(`  Fetching page ${page}...`);
    
    const url = `${FILSTAR_API_BASE}/products?page=${page}&limit=100`;
    
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${FILSTAR_TOKEN}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        console.error(`Failed to fetch from Filstar: ${response.status}`);
        break;
      }
      
      const products = await response.json();
      
      if (!products || products.length === 0) {
        hasMore = false;
        break;
      }
      
      for (const product of products) {
        if (!product.categories || product.categories.length === 0) continue;
        
        for (const cat of product.categories) {
          if (cat.parent_id === BAITS_PARENT_ID) {
            const categoryType = getCategoryType(cat.id);
            if (categoryType && allBaits[categoryType]) {
              allBaits[categoryType].push(product);
            }
          }
        }
      }
      
      page++;
      await new Promise(resolve => setTimeout(resolve, 300));
      
    } catch (error) {
      console.error(`Error fetching page ${page}:`, error.message);
      hasMore = false;
    }
  }
  
  console.log('\n📊 Fetched baits by category:');
  for (const [category, products] of Object.entries(allBaits)) {
    console.log(`  ${getCategoryName(category)}: ${products.length} products`);
  }
  console.log('');
  
  return allBaits;
}

// Определи типа категория по ID
function getCategoryType(categoryId) {
  const id = String(categoryId);
  
  for (const [type, ids] of Object.entries(FILSTAR_BAIT_CATEGORY_IDS)) {
    if (ids.includes(id)) {
      return type;
    }
  }
  
  return null;
}

// Извлечи SKU от variant
function extractSKU(variant) {
  if (variant.sku) return variant.sku;
  if (variant.article) return variant.article;
  if (variant.barcode) return variant.barcode;
  return null;
}

// Форматирай име на вариант за захранки
function formatBaitVariantName(variant) {
  const parts = [];
  
  // Добави SKU ако няма други атрибути
  const sku = extractSKU(variant);
  if (sku && (!variant.attributes || variant.attributes.length === 0)) {
    parts.push(sku);
  }
  
  // Добави всички атрибути с техните имена
  if (variant.attributes && variant.attributes.length > 0) {
    for (const attr of variant.attributes) {
      if (attr.attribute_name && attr.value) {
        parts.push(`${attr.attribute_name}: ${attr.value}`);
      }
    }
  }
  
  return parts.length > 0 ? parts.join(' / ') : (sku || 'Default');
}

// Почисти име на файл
function cleanFilename(url) {
  if (!url) return null;
  
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const filename = pathname.split('/').pop();
    
    return filename
      .toLowerCase()
      .replace(/[^a-z0-9.-]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
  } catch (error) {
    return null;
  }
}

// Провери дали изображение вече съществува
function imageExists(existingImages, newImageUrl) {
  if (!existingImages || existingImages.length === 0) return false;
  
  const newFilename = cleanFilename(newImageUrl);
  if (!newFilename) return false;
  
  return existingImages.some(img => {
    const existingFilename = cleanFilename(img.src);
    return existingFilename === newFilename;
  });
}

// Вземи име на файл от URL
function getImageFilename(url) {
  if (!url) return null;
  
  try {
    const urlObj = new URL(url);
    return urlObj.pathname.split('/').pop();
  } catch (error) {
    return null;
  }
}

// Нормализирай изображение
async function normalizeImage(imageUrl) {
  try {
    console.log(`    🖼️  Normalizing image: ${getImageFilename(imageUrl)}`);
    
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status}`);
    }
    
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    const image = sharp(buffer);
    const metadata = await image.metadata();
    
    const targetWidth = 1200;
    const targetHeight = 1000;
    
    let processedImage = image;
    
    if (metadata.width !== targetWidth || metadata.height !== targetHeight) {
      const aspectRatio = metadata.width / metadata.height;
      const targetAspectRatio = targetWidth / targetHeight;
      
      let resizeWidth, resizeHeight;
      
      if (aspectRatio > targetAspectRatio) {
        resizeWidth = targetWidth;
        resizeHeight = Math.round(targetWidth / aspectRatio);
      } else {
        resizeHeight = targetHeight;
        resizeWidth = Math.round(targetHeight * aspectRatio);
      }
      
      processedImage = processedImage.resize(resizeWidth, resizeHeight, {
        fit: 'inside',
        withoutEnlargement: false
      });
      
      const padLeft = Math.floor((targetWidth - resizeWidth) / 2);
      const padTop = Math.floor((targetHeight - resizeHeight) / 2);
      
      processedImage = processedImage.extend({
        top: padTop,
        bottom: targetHeight - resizeHeight - padTop,
        left: padLeft,
        right: targetWidth - resizeWidth - padLeft,
        background: { r: 255, g: 255, b: 255, alpha: 1 }
      });
    }
    
    const outputBuffer = await processedImage.jpeg({ quality: 90 }).toBuffer();
    
    console.log(`    ✅ Normalized: ${metadata.width}x${metadata.height} → ${targetWidth}x${targetHeight}`);
    
    return outputBuffer;
    
  } catch (error) {
    console.error(`    ❌ Error normalizing image:`, error.message);
    return null;
  }
}

// Качи изображение в Shopify
async function uploadImageToShopify(productId, imageBuffer, filename, position) {
  try {
    const base64Image = imageBuffer.toString('base64');
    
    const imageData = {
      image: {
        attachment: base64Image,
        filename: filename,
        position: position
      }
    };
    
    const response = await fetch(
      `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/products/${productId}/images.json`,
      {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': ACCESS_TOKEN,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(imageData)
      }
    );
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to upload image: ${response.status} - ${errorText}`);
    }
    
    const result = await response.json();
    console.log(`    ✅ Uploaded: ${filename}`);
    
    await new Promise(resolve => setTimeout(resolve, 500));
    
    return result.image;
    
  } catch (error) {
    console.error(`    ❌ Error uploading image:`, error.message);
    return null;
  }
}

// Добави изображения към продукт
async function addProductImages(productId, filstarProduct) {
  console.log(`  📸 Processing images...`);
  
  if (!filstarProduct.images || filstarProduct.images.length === 0) {
    console.log(`  ⚠️  No images found`);
    return 0;
  }
