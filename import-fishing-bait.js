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
    
    const url = `${FILSTAR_API_BASE}/products?page=${page}&limit=1000`;
    
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



// част 2

  const response = await fetch(
    `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/products/${productId}/images.json`,
    {
      method: 'GET',
      headers: {
        'X-Shopify-Access-Token': ACCESS_TOKEN,
        'Content-Type': 'application/json'
      }
    }
  );
  
  let existingImages = [];
  if (response.ok) {
    const data = await response.json();
    existingImages = data.images || [];
  }
  
  let uploadedCount = 0;
  let position = existingImages.length + 1;
  
  for (const imageUrl of filstarProduct.images) {
    if (imageExists(existingImages, imageUrl)) {
      console.log(`    ⏭️  Skipping duplicate: ${getImageFilename(imageUrl)}`);
      continue;
    }
    
    const normalizedBuffer = await normalizeImage(imageUrl);
    
    if (normalizedBuffer) {
      const filename = getImageFilename(imageUrl) || `image_${position}.jpg`;
      const uploaded = await uploadImageToShopify(productId, normalizedBuffer, filename, position);
      
      if (uploaded) {
        uploadedCount++;
        position++;
      }
    }
    
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  console.log(`  ✅ Uploaded ${uploadedCount} new images\n`);
  return uploadedCount;
}

// Добави продукт към колекция
async function addProductToCollection(productId, category) {
  const collectionId = COLLECTION_MAPPING[category];
  
  if (!collectionId) {
    console.log(`  ⚠️  No collection mapping for category: ${category}`);
    return;
  }
  
  const numericCollectionId = collectionId.split('/').pop();
  
  try {
    const collectData = {
      collect: {
        product_id: productId,
        collection_id: numericCollectionId
      }
    };
    
    const response = await fetch(
      `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/collects.json`,
      {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': ACCESS_TOKEN,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(collectData)
      }
    );
    
    if (response.ok) {
      console.log(`  ✅ Added to collection: ${getCategoryName(category)}`);
    } else if (response.status === 422) {
      console.log(`  ℹ️  Already in collection: ${getCategoryName(category)}`);
    } else {
      const errorText = await response.text();
      console.log(`  ⚠️  Failed to add to collection: ${response.status}`);
    }
    
  } catch (error) {
    console.error(`  ❌ Error adding to collection:`, error.message);
  }
}

// Намери продукт в Shopify по SKU
function findShopifyProductBySku(sku, shopifyProducts) {
  if (!sku) return null;
  
  for (const product of shopifyProducts) {
    if (product.variants && product.variants.length > 0) {
      const hasMatchingSku = product.variants.some(v => v.sku === sku);
      if (hasMatchingSku) {
        return product;
      }
    }
  }
  
  return null;
}


// REORDER
 async function reorderProductImages(productId, filstarProduct, existingImages) {
  console.log(`  🔄 Reordering images...`);
  
  if (!existingImages || existingImages.length === 0) {
    console.log(`    ⚠️ No existing images`);
    return false;
  }

  let mainImageFromPage = null;
  if (filstarProduct.slug) {
    mainImageFromPage = await fetchMainImageFromFilstarPage(filstarProduct.slug);
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  const allImages = [];
  const seenFilenames = new Set();

  const addImage = (url, type, priority = 0) => {
    if (!url) return;
    const fullUrl = url.startsWith('http') ? url : `${FILSTAR_BASE_URL}/${url}`;
    const filename = getImageFilename(fullUrl);
    if (filename && !seenFilenames.has(filename)) {
      seenFilenames.add(filename);
      const sku = extractSkuFromImageFilename(filename);
      allImages.push({ url: fullUrl, filename, type, sku, priority });
    }
  };

  if (mainImageFromPage) {
    addImage(mainImageFromPage, 'main_page', 1000);
  }

  if (filstarProduct.image) {
    addImage(filstarProduct.image, 'main_api', 900);
  }

  if (filstarProduct.images) {
    filstarProduct.images.forEach(img => addImage(img, 'additional', 500));
  }

  if (filstarProduct.variants) {
    filstarProduct.variants.forEach(v => {
      if (v.image) addImage(v.image, 'variant', 100);
    });
  }

  allImages.sort((a, b) => {
    if (a.priority !== b.priority) return b.priority - a.priority;
    if (a.sku === '999999' && b.sku !== '999999') return -1;
    if (a.sku !== '999999' && b.sku === '999999') return 1;
    if (a.sku === '999999' && b.sku === '999999') {
      return a.filename.localeCompare(b.filename);
    }
    return a.sku.localeCompare(b.sku);
  });

  console.log(`    📋 Final order (${allImages.length} images):`);
  allImages.forEach((img, i) => {
    const label = img.sku === '999999' ? '🔤' : `🔢 ${img.sku}`;
    const priority = img.priority > 0 ? ` [P:${img.priority}]` : '';
    console.log(`      ${i+1}. ${label}${priority} ${img.filename}`);
  });

  const reorderedImages = [];
  for (let i = 0; i < allImages.length; i++) {
    const match = existingImages.find(img => {
      const imgSrc = img.src || img.url || (typeof img === 'string' ? img : null);
      if (!imgSrc) return false;
      return getImageFilename(imgSrc) === allImages[i].filename;
    });
    if (match) {
      const imgId = match.id || (typeof match === 'object' && match.id);
      if (imgId) {
        reorderedImages.push({ id: imgId, position: i + 1 });
      }
    }
  }

  if (reorderedImages.length === 0) {
    console.log(`    ⚠️ No images matched for reordering`);
    console.log(`    Debug: existingImages[0] =`, JSON.stringify(existingImages[0]));
    return false;
  }

  const response = await fetch(
    `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/products/${productId}.json`,
    {
      method: 'PUT',
      headers: {
        'X-Shopify-Access-Token': ACCESS_TOKEN,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ product: { id: productId, images: reorderedImages } })
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`    ❌ Failed to reorder: ${response.status} - ${errorText}`);
    return false;
  }

  console.log(`    ✅ Reordered ${reorderedImages.length} images`);
  await new Promise(resolve => setTimeout(resolve, 1000));
  return true;
}
















// Създай нов продукт в Shopify
async function createShopifyProduct(filstarProduct, category) {
  console.log(`\n🆕 Creating new product: ${filstarProduct.name}`);
  
  try {
    const vendor = filstarProduct.manufacturer || 'Unknown';
    console.log(`  🏷️  Vendor: ${vendor}`);
    
    const productData = {
      product: {
        title: filstarProduct.name,
        body_html: filstarProduct.description || '',
        vendor: vendor,
        product_type: getCategoryName(category),
        tags: ['Filstar', category, vendor],
        status: 'active',
        variants: filstarProduct.variants.map(variant => ({
          sku: extractSKU(variant),
          price: variant.price,
          inventory_quantity: parseInt(variant.quantity) || 0,
          inventory_management: 'shopify',
          option1: formatBaitVariantName(variant),
          barcode: variant.barcode || null,
          weight: parseFloat(variant.weight) || 0,
          weight_unit: 'kg'
        })),
        options: [
          {
            name: 'Вариант',
            values: filstarProduct.variants.map(v => formatBaitVariantName(v))
          }
        ]
      }
    };
    
    const response = await fetch(
      `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/products.json`,
      {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': ACCESS_TOKEN,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(productData)
      }
    );
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to create product: ${response.status} - ${errorText}`);
    }
    
    const result = await response.json();
    const productId = result.product.id;
    
    console.log(`  ✅ Product created with ID: ${productId}`);
    console.log(`  📦 Created ${filstarProduct.variants.length} variants`);
    
    const uploadedImages = await addProductImages(productId, filstarProduct);
    
    await addProductToCollection(productId, category);
    
    stats[category].created++;
    stats[category].images += uploadedImages;
    
    return result.product;
    
  } catch (error) {
    console.error(`  ❌ Error creating product:`, error.message);
    throw error;
  }
}






// Обнови съществуващ продукт
async function updateProduct(shopifyProduct, filstarProduct, categoryType) {
  console.log(`\n🔄 Updating product: ${filstarProduct.name}`);
  console.log(`  Shopify ID: ${shopifyProduct.id}`);
  
  try {
    const vendor = filstarProduct.manufacturer || 'Unknown';
    
    const existingVariantsBySku = new Map();
    if (shopifyProduct.variants) {
      for (const variant of shopifyProduct.variants) {
        if (variant.sku) {
          existingVariantsBySku.set(variant.sku, variant);
        }
      }
    }
    
    const variantsToUpdate = [];
    const variantsToCreate = [];
    
    for (const filstarVariant of filstarProduct.variants) {
      const sku = extractSKU(filstarVariant);
      const existingVariant = existingVariantsBySku.get(sku);
      
      const variantData = {
        sku: sku,
        price: filstarVariant.price,
        inventory_quantity: parseInt(filstarVariant.quantity) || 0,
        option1: formatBaitVariantName(filstarVariant),
        barcode: filstarVariant.barcode || null,
        weight: parseFloat(filstarVariant.weight) || 0,
        weight_unit: 'kg'
      };
      
      if (existingVariant) {
        variantData.id = existingVariant.id;
        variantsToUpdate.push(variantData);
      } else {
        variantsToCreate.push(variantData);
      }
    }
    
    const updateData = {
      product: {
        id: shopifyProduct.id,
        title: filstarProduct.name,
        body_html: filstarProduct.description || '',
        vendor: vendor,
        product_type: getCategoryName(categoryType),
        variants: [...variantsToUpdate, ...variantsToCreate],
        options: [
          {
            name: 'Вариант',
            values: filstarProduct.variants.map(v => formatBaitVariantName(v))
          }
        ]
      }
    };
    
    const response = await fetch(
      `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/products/${shopifyProduct.id}.json`,
      {
        method: 'PUT',
        headers: {
          'X-Shopify-Access-Token': ACCESS_TOKEN,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updateData)
      }
    );
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to update product: ${response.status} - ${errorText}`);
    }
    
    console.log(`  ✅ Product updated`);
    console.log(`  📦 Updated ${variantsToUpdate.length} variants, created ${variantsToCreate.length} new variants`);
    
    const uploadedImages = await addProductImages(shopifyProduct.id, filstarProduct);
    
    await addProductToCollection(shopifyProduct.id, categoryType);
    
    stats[categoryType].updated++;
    stats[categoryType].images += uploadedImages;
    
    return true;
    
  } catch (error) {
    console.error(`  ❌ Error updating product:`, error.message);
    return false;
  }
}

// Обработи един продукт
async function processProduct(filstarProduct, category, shopifyProducts) {
  try {
    if (!filstarProduct.variants || filstarProduct.variants.length === 0) {
      console.log(`⚠️  Skipping ${filstarProduct.name} - no variants`);
      return;
    }
    
    const firstSku = extractSKU(filstarProduct.variants[0]);
    
    if (!firstSku) {
      console.log(`⚠️  Skipping ${filstarProduct.name} - no SKU found`);
      return;
    }
    
    const existingProduct = findShopifyProductBySku(firstSku, shopifyProducts);
    
    if (existingProduct) {
      await updateProduct(existingProduct, filstarProduct, category);
    } else {
      await createShopifyProduct(filstarProduct, category);
    }
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    
  } catch (error) {
    console.error(`❌ Error processing product ${filstarProduct.name}:`, error.message);
  }
}

// Главна функция
async function main() {
  console.log('🚀 Starting Fishing Baits Import from Filstar to Shopify\n');
  console.log('='.repeat(60));
  console.log('');
  
  try {


  // 3 част

    const shopifyProducts = await fetchAllShopifyProducts();
    
    const allBaits = await fetchAllFishingBaits();
    
    console.log('='.repeat(60));
    console.log('🔄 Processing baits by category...\n');
    
    for (const [category, products] of Object.entries(allBaits)) {
      if (products.length === 0) {
        console.log(`⏭️  Skipping ${getCategoryName(category)} - no products\n`);
        continue;
      }
      
      console.log(`\n${'='.repeat(60)}`);
      console.log(`📂 Processing ${getCategoryName(category)} (${products.length} products)`);
      console.log('='.repeat(60));
      
      for (let i = 0; i < products.length; i++) {
        const product = products[i];
        console.log(`\n[${i + 1}/${products.length}] Processing: ${product.name}`);
        await processProduct(product, category, shopifyProducts);
      }
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('📊 FINAL STATISTICS');
    console.log('='.repeat(60));
    console.log('');
    
    let totalCreated = 0;
    let totalUpdated = 0;
    let totalImages = 0;
    
    for (const [category, stat] of Object.entries(stats)) {
      if (stat.created > 0 || stat.updated > 0 || stat.images > 0) {
        console.log(`${getCategoryName(category)}:`);
        console.log(`  ✅ Created: ${stat.created} products`);
        console.log(`  🔄 Updated: ${stat.updated} products`);
        console.log(`  📸 Images uploaded: ${stat.images}`);
        console.log('');
        
        totalCreated += stat.created;
        totalUpdated += stat.updated;
        totalImages += stat.images;
      }
    }
    
    console.log('='.repeat(60));
    console.log('TOTAL:');
    console.log(`  ✅ Created: ${totalCreated} products`);
    console.log(`  🔄 Updated: ${totalUpdated} products`);
    console.log(`  📸 Images uploaded: ${totalImages}`);
    console.log('='.repeat(60));
    console.log('');
    console.log('✅ Import completed successfully!');
    
  } catch (error) {
    console.error('\n❌ Fatal error during import:', error);
    process.exit(1);
  }
}

main();

    


