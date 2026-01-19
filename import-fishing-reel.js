// import-fishing-reel.js - Универсален импорт на всички категории макари CARPLANDIA
const fetch = require('node-fetch');
const SHOPIFY_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const FILSTAR_TOKEN = process.env.FILSTAR_API_TOKEN;
const API_VERSION = '2024-10';
const FILSTAR_API_BASE = 'https://filstar.com/api';
const FILSTAR_BASE_URL = 'https://filstar.com';

const COLLECTION_MAPPING = {
  front_drag: 'gid://shopify/Collection/739175301502',
  rear_drag: 'gid://shopify/Collection/739175334270',
  baitrunner: 'gid://shopify/Collection/739175399806',
  multipliers: 'gid://shopify/Collection/739175432574',
  other: 'gid://shopify/Collection/739175530878'
};

const FILSTAR_REEL_CATEGORY_IDS = {
  front_drag: ['19'],
  rear_drag: ['24'],
  baitrunner: ['30'],
  multipliers: ['34'],
  other: ['43']
};

const REELS_PARENT_ID = '6';

const stats = {
  front_drag: { created: 0, updated: 0, images: 0 },
  rear_drag: { created: 0, updated: 0, images: 0 },
  baitrunner: { created: 0, updated: 0, images: 0 },
  multipliers: { created: 0, updated: 0, images: 0 },
  other: { created: 0, updated: 0, images: 0 }
};

// суров апи за тест
// Debug функция - добави я в началото на файла
function debugProductImages(filstarProduct) {
  console.log('\n🔍 RAW FILSTAR PRODUCT DATA:');
  console.log(JSON.stringify(filstarProduct, null, 2));
  console.log('\n');
}

async function getAllShopifyProducts() {
  console.log('📦 Fetching all Shopify products...');
  
  let allProducts = [];
  let hasNextPage = true;
  let pageInfo = null;
  let pageCount = 0;
  
  while (hasNextPage) {
    pageCount++;
    let url = `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/products.json?fields=id,title,variants,images&limit=250`;
    
    if (pageInfo) {
      url += `&page_info=${pageInfo}`;
    }
    
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'X-Shopify-Access-Token': ACCESS_TOKEN,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        console.error(`  ❌ Failed to fetch products (page ${pageCount}): ${response.status}`);
        break;
      }
      
      const data = await response.json();
      allProducts = allProducts.concat(data.products);
      
      console.log(`  ✓ Page ${pageCount}: ${data.products.length} products (Total: ${allProducts.length})`);
      
      // Провери за следваща страница
      const linkHeader = response.headers.get('Link');
      if (linkHeader && linkHeader.includes('rel="next"')) {
        const nextMatch = linkHeader.match(/<[^>]*page_info=([^>&]+)[^>]*>;\s*rel="next"/);
        pageInfo = nextMatch ? nextMatch[1] : null;
        hasNextPage = !!pageInfo;
      } else {
        hasNextPage = false;
      }
      
      await new Promise(resolve => setTimeout(resolve, 500));
      
    } catch (error) {
      console.error(`  ❌ Error fetching products (page ${pageCount}):`, error.message);
      break;
    }
  }
  
  console.log(`✅ Fetched ${allProducts.length} products from ${pageCount} pages`);
  return allProducts;
}




function getImageFilename(src) {
  if (!src || typeof src !== 'string') {
    return null;
  }
  
  // Вземи последната част от URL-а
  const urlParts = src.split('/').pop();
  const withoutQuery = urlParts.split('?')[0];
  
  let cleanFilename = withoutQuery;
  
  // 1. Премахни Shopify UUID (формат: _xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)
  cleanFilename = cleanFilename.replace(/_[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi, '');
  
  // 2. Премахни timestamp и random number (формат: -20220308121804-514)
  cleanFilename = cleanFilename.replace(/-\d{14}-\d+/g, '');
  
  // 3. Премахни Filstar hex hash-ове (формат: _52977f7fed325e2ac5328748cd59f743)
  const parts = cleanFilename.split('_');
  if (parts.length > 1) {
    const lastPart = parts[parts.length - 1].split('.')[0];
    // Ако последната част е 32+ символен hex hash, премахни го
    if (lastPart.length >= 32 && /^[a-f0-9]+$/i.test(lastPart)) {
      parts.pop();
      const extension = cleanFilename.split('.').pop();
      cleanFilename = parts.join('_') + '.' + extension;
    }
  }
  
  // 4. Премахни водещи долни черти
  cleanFilename = cleanFilename.replace(/^_+/, '');
  
  // 5. Премахни trailing underscores преди extension
  cleanFilename = cleanFilename.replace(/_+(\.[a-z]+)$/i, '$1');
  
  // ✅ НОВО: 6. Премахни множество последователни долни черти
  cleanFilename = cleanFilename.replace(/_+/g, '_');
  
  // ✅ НОВО: 7. Нормализирай extension към lowercase
  const filenameParts = cleanFilename.split('.');
  if (filenameParts.length > 1) {
    const extension = filenameParts.pop().toLowerCase();
    cleanFilename = filenameParts.join('.') + '.' + extension;
  }
  
  return cleanFilename;
}


// Функция за извличане на SKU от име на снимка
function extractSkuFromImageFilename(filename) {
  if (!filename || typeof filename !== 'string') {
    return '999999';
  }
  
  // ✅ ПОПРАВЕНО: Търси SKU в началото на filename-а (цифри)
  const match = filename.match(/^(\d+)/);
  
  if (match && match[1]) {
    return match[1];
  }
  
  // ✅ НОВО: Опитай да намериш SKU след тире или долна черта
  const altMatch = filename.match(/[-_](\d{6,})/);
  if (altMatch && altMatch[1]) {
    return altMatch[1];
  }
  
  // Ако няма SKU, върни голямо число за да отиде в края при сортиране
  return '999999';
}


// Функция за сортиране на снимките по SKU
function sortImagesBySku(imageUrls) {
  if (!imageUrls || !Array.isArray(imageUrls) || imageUrls.length === 0) {
    return [];
  }
  
  return [...imageUrls].sort((a, b) => {
    const filenameA = getImageFilename(a);
    const filenameB = getImageFilename(b);
    
    if (!filenameA || !filenameB) {
      return 0;
    }
    
    const skuA = extractSkuFromImageFilename(filenameA);
    const skuB = extractSkuFromImageFilename(filenameB);
    
    return skuA.localeCompare(skuB);
  });
}



function imageExists(existingImages, newImageUrl) {
  if (!existingImages || !Array.isArray(existingImages) || existingImages.length === 0) {
    return false;
  }
  
  const newFilename = getImageFilename(newImageUrl);
  if (!newFilename) {
    return false;
  }
  
  return existingImages.some(img => {
    // ✅ ПОПРАВЕНО: Провери дали img има src или url
    const imgSrc = img.src || img.url || img;
    const existingFilename = getImageFilename(imgSrc);
    return existingFilename && existingFilename === newFilename;
  });
}


async function uploadProductImage(productId, imageUrl, existingImages) {
  if (!imageUrl || typeof imageUrl !== 'string') {
    console.error(`  ✗ Invalid image URL`);
    return false;
  }

  // Провери дали снимката вече съществува
  if (imageExists(existingImages, imageUrl)) {
    const filename = getImageFilename(imageUrl);
    console.log(`  ⏭️ Image already exists, skipping: ${filename}`);
    return false;
  }

  const filename = getImageFilename(imageUrl);
  console.log(`  📸 Uploading new image: ${filename}`);

  try {
    const response = await fetch(
      `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/products/${productId}/images.json`,
      {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': ACCESS_TOKEN,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          image: {
            src: imageUrl
          }
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`  ✗ Failed to upload image: ${response.status} - ${errorText}`);
      return false;
    }

    const result = await response.json();
    console.log(`  ✓ Image uploaded successfully (ID: ${result.image.id})`);
    
    await new Promise(resolve => setTimeout(resolve, 500));
    return true;

  } catch (error) {
    console.error(`  ✗ Upload error:`, error.message);
    return false;
  }
}





// 🆕 Функция за пренареждане на снимките в правилния ред (REST API)
// Функция за пренареждане на снимките в правилния ред (REST API)
async function reorderProductImages(productId, filstarProduct, existingImages) {
  console.log(`  🔄 Reordering images...`);
  
  if (!existingImages || existingImages.length === 0) {
    console.log(`    ⚠️  No existing images to reorder`);
    return false;
  }
  
  const desiredOrder = [];
  const seenFilenames = new Set();
  
  // Помощна функция за добавяне на уникални снимки
  const addUniqueImage = (imageUrl) => {
    const filename = getImageFilename(imageUrl);
    if (filename && !seenFilenames.has(filename)) {
      seenFilenames.add(filename);
      desiredOrder.push(imageUrl);
    }
  };
  
  // 1️⃣ Главна снимка на продукта
  if (filstarProduct.image) {
    const imageUrl = filstarProduct.image.startsWith('http') 
      ? filstarProduct.image 
      : `${FILSTAR_BASE_URL}/${filstarProduct.image}`;
    addUniqueImage(imageUrl);
  }
  
  // 2️⃣ Допълнителни снимки (сортирани по SKU)
  if (filstarProduct.images && Array.isArray(filstarProduct.images)) {
    const sortedImages = sortImagesBySku(filstarProduct.images);
    for (const img of sortedImages) {
      const imageUrl = img.startsWith('http') ? img : `${FILSTAR_BASE_URL}/${img}`;
      addUniqueImage(imageUrl);
    }
  }
  
  // 3️⃣ Снимки на варианти (сортирани по SKU)
  if (filstarProduct.variants) {
    const sortedVariants = [...filstarProduct.variants].sort((a, b) => {
      const skuA = a.sku || '';
      const skuB = b.sku || '';
      return skuA.localeCompare(skuB);
    });
    
    for (const variant of sortedVariants) {
      if (variant.image) {
        const imageUrl = variant.image.startsWith('http') 
          ? variant.image 
          : `${FILSTAR_BASE_URL}/${variant.image}`;
        addUniqueImage(imageUrl);
      }
    }
  }
  
  if (desiredOrder.length === 0) {
    console.log(`    ⚠️  No images found in Filstar data`);
    return false;
  }
  
  // Намери съответните Shopify image IDs
  const reorderedImages = [];
  
  for (let i = 0; i < desiredOrder.length; i++) {
    const desiredUrl = desiredOrder[i];
    const desiredFilename = getImageFilename(desiredUrl);
    
    const existingImage = existingImages.find(img => {
      const existingFilename = getImageFilename(img.src);
      return existingFilename === desiredFilename;
    });
    
    if (existingImage) {
      reorderedImages.push({
        id: existingImage.id,
        position: i + 1
      });
    }
  }
  
  if (reorderedImages.length === 0) {
    console.log(`    ⚠️  No matching images found to reorder`);
    return false;
  }
  
  // ✅ ПОПРАВЕНО: Добавени всички останали снимки, които не са в desiredOrder
  // Това гарантира, че всички снимки остават в продукта
  const unmatchedImages = existingImages.filter(img => {
    const filename = getImageFilename(img.src);
    return !seenFilenames.has(filename);
  });
  
  // Добави неразпознатите снимки в края
  for (const img of unmatchedImages) {
    reorderedImages.push({
      id: img.id,
      position: reorderedImages.length + 1
    });
  }
  
  console.log(`    📊 Reordering ${reorderedImages.length} images (${desiredOrder.length} matched, ${unmatchedImages.length} unmatched)`);
  
  // REST API Update
  try {
    const response = await fetch(
      `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/products/${productId}.json`,
      {
        method: 'PUT',
        headers: {
          'X-Shopify-Access-Token': ACCESS_TOKEN,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          product: {
            id: productId,
            images: reorderedImages
          }
        })
      }
    );
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`    ❌ Failed to reorder: ${response.status} - ${errorText}`);
      return false;
    }
    
    console.log(`    ✅ Reordered ${reorderedImages.length} images successfully`);
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    return true;
    
  } catch (error) {
    console.error(`    ❌ Reorder error:`, error.message);
    return false;
  }
}


async function fetchAllProducts() {
  console.log('📦 Fetching all products from Filstar API with pagination...');
  
  let allProducts = [];
  let page = 1;
  let hasMorePages = true;

  try {
    while (hasMorePages) {
      console.log(`Fetching page ${page}...`);
      
      const response = await fetch(
        `${FILSTAR_API_BASE}/products?page=${page}&limit=1000`,
        {
          headers: {
            'Authorization': `Bearer ${FILSTAR_TOKEN}`
          }
        }
      );

      if (!response.ok) {
        throw new Error(`Filstar API error: ${response.status}`);
      }

      const pageProducts = await response.json();
      console.log(`  ✓ Page ${page}: ${pageProducts.length} products`);

      if (pageProducts.length === 0) {
        console.log('  ℹ️ No more products, stopping pagination');
        hasMorePages = false;
      } else {
        allProducts = allProducts.concat(pageProducts);
        page++;
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }

    console.log(`\n✅ Total products fetched: ${allProducts.length}\n`);
    return allProducts;

  } catch (error) {
    console.error('❌ Error fetching products:', error.message);
    throw error;
  }
}


async function fetchAllFishingReels() {
  const allProducts = await fetchAllProducts();
  
  const reels = {
    front_drag: [],
    rear_drag: [],
    baitrunner: [],
    multipliers: [],
    other: []
  };

  allProducts.forEach(product => {
    const categoryIds = product.categories?.map(c => c.id.toString()) || [];
    
    if (categoryIds.some(id => FILSTAR_REEL_CATEGORY_IDS.front_drag.includes(id))) {
      reels.front_drag.push(product);
    } else if (categoryIds.some(id => FILSTAR_REEL_CATEGORY_IDS.rear_drag.includes(id))) {
      reels.rear_drag.push(product);
    } else if (categoryIds.some(id => FILSTAR_REEL_CATEGORY_IDS.baitrunner.includes(id))) {
      reels.baitrunner.push(product);
    } else if (categoryIds.some(id => FILSTAR_REEL_CATEGORY_IDS.multipliers.includes(id))) {
      reels.multipliers.push(product);
    } else if (categoryIds.some(id => FILSTAR_REEL_CATEGORY_IDS.other.includes(id))) {
      reels.other.push(product);
    }
  });

  console.log(`\n✅ Categorized fishing reels:`);
  console.log(`  - Front Drag: ${reels.front_drag.length}`);
  console.log(`  - Rear Drag: ${reels.rear_drag.length}`);
  console.log(`  - Baitrunner: ${reels.baitrunner.length}`);
  console.log(`  - Multipliers: ${reels.multipliers.length}`);
  console.log(`  - Other: ${reels.other.length}\n`);

  return reels;
}


async function findShopifyProductBySku(sku) {
  let allProducts = [];
  let pageInfo = null;
  let hasNextPage = true;
  let pageCount = 0;

  while (hasNextPage) {
    pageCount++;
    let url = `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/products.json?fields=id,title,variants,images&limit=250`;
    
    if (pageInfo) {
      url += `&page_info=${pageInfo}`;
    }

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'X-Shopify-Access-Token': ACCESS_TOKEN,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        console.error(`❌ Failed to fetch products (page ${pageCount}): ${response.status}`);
        return null;
      }

      const data = await response.json();
      allProducts = allProducts.concat(data.products);

      // Провери за следваща страница
      const linkHeader = response.headers.get('Link');
      if (linkHeader && linkHeader.includes('rel="next"')) {
        const nextMatch = linkHeader.match(/<[^>]*page_info=([^>&]+)[^>]*>;\s*rel="next"/);
        pageInfo = nextMatch ? nextMatch[1] : null;
        hasNextPage = !!pageInfo;
      } else {
        hasNextPage = false;
      }

      await new Promise(resolve => setTimeout(resolve, 300));
    } catch (error) {
      console.error(`❌ Error fetching products (page ${pageCount}):`, error.message);
      return null;
    }
  }

  console.log(`  🔍 Searched ${allProducts.length} products for SKU: ${sku}`);

  // Търси продукт с този SKU
  for (const product of allProducts) {
    const hasVariant = product.variants.some(v => v.sku === sku);
    if (hasVariant) {
      console.log(`  ✅ Found product: ${product.title} (ID: ${product.id})`);
      return product;
    }
  }

  console.log(`  ⚠️ No product found with SKU: ${sku}`);
  return null;
}

function formatVariantName(variant, categoryType) {
  if (!variant.attributes || variant.attributes.length === 0) {
    return variant.model || `SKU: ${variant.sku}`;
  }

  const attributes = variant.attributes;
  
  // Търси размер в атрибутите
  const size = attributes.find(a => 
    a.attribute_name && a.attribute_name.includes('РАЗМЕР')
  )?.value;
  
  if (size) {
    return `Размер ${size}`;
  }

  // Търси други релевантни атрибути за макари
  const capacity = attributes.find(a => 
    a.attribute_name && (
      a.attribute_name.includes('КАПАЦИТЕТ') || 
      a.attribute_name.includes('CAPACITY')
    )
  )?.value;
  
  if (capacity) {
    return `Капацитет ${capacity}`;
  }

  const gearRatio = attributes.find(a => 
    a.attribute_name && (
      a.attribute_name.includes('ПРЕДАВКА') || 
      a.attribute_name.includes('GEAR RATIO')
    )
  )?.value;
  
  if (gearRatio) {
    return `Предавка ${gearRatio}`;
  }

  // Ако няма специфични атрибути, използвай модел или SKU
  return variant.model || `SKU: ${variant.sku}`;
}


// 🆕 Подобрена функция за добавяне на снимки с правилна подредба
async function addProductImages(productId, filstarProduct, existingImages = []) {
  console.log(`Adding images to product ${productId}...`);
  let uploadedCount = 0;
  
  const imagesToUpload = [];
  
  // 1️⃣ Главна снимка
  if (filstarProduct.image) {
    const imageUrl = filstarProduct.image.startsWith('http') 
      ? filstarProduct.image 
      : `${FILSTAR_BASE_URL}/${filstarProduct.image}`;
    imagesToUpload.push({ src: imageUrl, type: 'main' });
    console.log(` 🎯 Main image: ${getImageFilename(imageUrl)}`);
  }
  
  // 2️⃣ Допълнителни снимки (сортирани по SKU)
  if (filstarProduct.images && Array.isArray(filstarProduct.images)) {
    const sortedImages = sortImagesBySku(filstarProduct.images);
    console.log(` 🔄 Images sorted by SKU for upload`);
    
    for (const img of sortedImages) {
      const imageUrl = img.startsWith('http') ? img : `${FILSTAR_BASE_URL}/${img}`;
      imagesToUpload.push({ src: imageUrl, type: 'additional' });
      console.log(` 📸 Additional: ${getImageFilename(imageUrl)}`);
    }
  }
  
  // 3️⃣ Снимки на варианти
  if (filstarProduct.variants) {
    for (const variant of filstarProduct.variants) {
      if (variant.image) {
        const imageUrl = variant.image.startsWith('http') 
          ? variant.image 
          : `${FILSTAR_BASE_URL}/${variant.image}`;
        imagesToUpload.push({ src: imageUrl, type: 'variant' });
        console.log(` 🎨 Variant: ${getImageFilename(imageUrl)}`);
      }
    }
  }
  
  if (imagesToUpload.length === 0) {
    console.log(` ℹ️ No images found in Filstar data`);
    return 0;
  }
  
  // ✅ ПОПРАВЕНО: Филтрирай дубликатите ПРЕДИ качване
  const newImages = imagesToUpload.filter(img => {
    const exists = imageExists(existingImages, img.src);
    if (exists) {
      console.log(` ⏭️  Skipping duplicate: ${getImageFilename(img.src)}`);
    }
    return !exists;
  });
  
  console.log(` 📊 Total: ${imagesToUpload.length} images, ${newImages.length} new, ${imagesToUpload.length - newImages.length} duplicates skipped`);
  
  if (newImages.length === 0) {
    console.log(` ✅ All images already exist, skipping upload`);
    return 0;
  }
  
  // ✅ ПОПРАВЕНО: Не задавай position при upload - Shopify автоматично ги добавя в края
  for (let i = 0; i < newImages.length; i++) {
    const imageData = newImages[i];
    
    const response = await fetch(
      `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/products/${productId}/images.json`,
      {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': ACCESS_TOKEN,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          image: { 
            src: imageData.src
            // ✅ Премахнато: position - ще се зададе от reorderProductImages
          } 
        })
      }
    );
    
    if (response.ok) {
      const result = await response.json();
      console.log(` ✓ Uploaded: ${getImageFilename(imageData.src)} (ID: ${result.image.id})`);
      uploadedCount++;
    } else {
      const error = await response.text();
      console.error(` ✗ Failed to upload ${getImageFilename(imageData.src)}:`, error);
    }
    
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  console.log(` ✅ Uploaded ${uploadedCount} new images`);
  return uploadedCount;
}

function ensureUniqueVariantNames(variants, categoryType) {
  const formattedVariants = variants.map(v => ({
    original: v,
    name: formatVariantName(v, categoryType),
    sku: v.sku
  }));
  const nameCounts = {};
  formattedVariants.forEach(v => {
    nameCounts[v.name] = (nameCounts[v.name] || 0) + 1;
  });
  const hasDuplicates = Object.values(nameCounts).some(count => count > 1);
  if (hasDuplicates) {
    console.log(' ⚠️ Duplicates detected - adding SKU to all variant names');
    return formattedVariants.map(v => `SKU ${v.sku}: ${v.name}`);
  }
  return formattedVariants.map(v => v.name);
}

async function createShopifyProduct(filstarProduct, category) {
  console.log(`\n🆕 Creating new product: ${filstarProduct.name}`);
  
  try {
    const vendor = filstarProduct.manufacturer || 'Unknown';
    console.log(`  🏷️ Vendor: ${vendor}`);

    const variantNames = ensureUniqueVariantNames(filstarProduct.variants, category);

    const productData = {
      product: {
        title: filstarProduct.name,
        body_html: filstarProduct.description || '',
        vendor: vendor,
        product_type: getCategoryName(category),
        tags: ['Filstar', category, vendor].filter(Boolean).join(', '),
        status: 'active',
        variants: filstarProduct.variants.map((variant, index) => ({
          sku: variant.sku,
          price: parseFloat(variant.price) || '0.00',
          inventory_quantity: parseInt(variant.quantity) || 0,
          inventory_management: 'shopify',
          option1: variantNames[index],
          barcode: variant.barcode || null,
          weight: parseFloat(variant.weight) || 0,
          weight_unit: 'kg'
        })),
        options: [
          {
            name: 'Вариант',
            values: variantNames
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

    // Добави снимки
    const uploadedImages = await addProductImages(productId, filstarProduct);
    
    // Добави към колекция
    await addProductToCollection(productId, category);

    // Обнови статистиката
    stats[category].created++;
    stats[category].images += uploadedImages;

    console.log(`  ✅ Product creation completed`);
    
    return result.product;

  } catch (error) {
    console.error(`  ❌ Error creating product:`, error.message);
    throw error;
  }
}

async function addProductToCollection(productId, category) {
  const collectionId = COLLECTION_MAPPING[category];
  
  if (!collectionId) {
    console.log(`  ⚠️ No collection mapping for category: ${category}`);
    return false;
  }

  try {
    const numericCollectionId = collectionId.split('/').pop();
    
    console.log(`  📂 Adding to collection: ${getCategoryName(category)}`);

    const response = await fetch(
      `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/collects.json`,
      {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': ACCESS_TOKEN,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          collect: {
            product_id: productId,
            collection_id: numericCollectionId
          }
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`  ❌ Failed to add to collection: ${response.status} - ${errorText}`);
      return false;
    }

    const result = await response.json();
    console.log(`  ✅ Added to collection: ${getCategoryName(category)} (Collect ID: ${result.collect.id})`);
    
    await new Promise(resolve => setTimeout(resolve, 300));
    return true;

  } catch (error) {
    console.error(`  ❌ Error adding to collection:`, error.message);
    return false;
  }
}

async function addProductImages(productId, filstarProduct, existingImages = []) {
  console.log(`  📸 Adding images to product ${productId}...`);
  
  let uploadedCount = 0;
  const imagesToUpload = [];
  const seenUrls = new Set();

  // Помощна функция за добавяне на уникални снимки
  const addUniqueImage = (imageUrl, type) => {
    if (!imageUrl) return;
    
    const fullUrl = imageUrl.startsWith('http') 
      ? imageUrl 
      : `${FILSTAR_BASE_URL}/${imageUrl}`;
    
    const filename = getImageFilename(fullUrl);
    
    // Провери дали вече сме я добавили в списъка
    if (seenUrls.has(filename)) {
      console.log(`    ⏭️ Duplicate in batch, skipping: ${filename}`);
      return;
    }
    
    // Провери дали съществува в Shopify
    if (imageExists(existingImages, fullUrl)) {
      console.log(`    ⏭️ Already exists in Shopify, skipping: ${filename}`);
      return;
    }
    
    seenUrls.add(filename);
    imagesToUpload.push({ src: fullUrl, type });
    console.log(`    ➕ Queued for upload [${type}]: ${filename}`);
  };

  // 1️⃣ Главна снимка
  if (filstarProduct.image) {
    addUniqueImage(filstarProduct.image, 'main');
  }

  // 2️⃣ Допълнителни снимки (сортирани по SKU)
  if (filstarProduct.images && Array.isArray(filstarProduct.images)) {
    const sortedImages = sortImagesBySku(filstarProduct.images);
    for (const img of sortedImages) {
      addUniqueImage(img, 'additional');
    }
  }

  // 3️⃣ Снимки на варианти
  if (filstarProduct.variants) {
    for (const variant of filstarProduct.variants) {
      if (variant.image) {
        addUniqueImage(variant.image, 'variant');
      }
    }
  }

  if (imagesToUpload.length === 0) {
    console.log(`    ℹ️ No new images to upload`);
    return 0;
  }

  console.log(`    📊 Uploading ${imagesToUpload.length} new images...`);

  // Качи снимките
  for (let i = 0; i < imagesToUpload.length; i++) {
    const imageData = imagesToUpload[i];
    
    try {
      const response = await fetch(
        `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/products/${productId}/images.json`,
        {
          method: 'POST',
          headers: {
            'X-Shopify-Access-Token': ACCESS_TOKEN,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            image: { src: imageData.src }
          })
        }
      );

      if (response.ok) {
        const result = await response.json();
        console.log(`    ✓ Uploaded [${imageData.type}]: ${getImageFilename(imageData.src)} (ID: ${result.image.id})`);
        uploadedCount++;
      } else {
        const error = await response.text();
        console.error(`    ✗ Failed [${imageData.type}]: ${getImageFilename(imageData.src)} - ${error}`);
      }

      await new Promise(resolve => setTimeout(resolve, 500));

    } catch (error) {
      console.error(`    ✗ Upload error:`, error.message);
    }
  }

  console.log(`    ✅ Uploaded ${uploadedCount}/${imagesToUpload.length} images`);
  return uploadedCount;
}



// 🆕 Подобрена функция за update с пренареждане
async function updateProduct(shopifyProduct, filstarProduct, categoryType) {
  let imagesUploaded = 0;
  let imagesSkipped = 0;

  console.log(`\n🔄 Updating product: ${shopifyProduct.title}`);
  
  const productId = shopifyProduct.id;

  // Събери всички снимки от Filstar
  const allImages = [];
  
  // 1. Главна снимка
  if (filstarProduct.image) {
    const imageUrl = filstarProduct.image.startsWith('http') 
      ? filstarProduct.image 
      : `${FILSTAR_BASE_URL}/${filstarProduct.image}`;
    allImages.push(imageUrl);
  }

  // 2. Допълнителни снимки
  if (filstarProduct.images && Array.isArray(filstarProduct.images)) {
    for (const img of filstarProduct.images) {
      const imageUrl = img.startsWith('http') 
        ? img 
        : `${FILSTAR_BASE_URL}/${img}`;
      allImages.push(imageUrl);
    }
  }

  // 3. Снимки на варианти
  if (filstarProduct.variants) {
    for (const variant of filstarProduct.variants) {
      if (variant.image) {
        const imageUrl = variant.image.startsWith('http') 
          ? variant.image 
          : `${FILSTAR_BASE_URL}/${variant.image}`;
        allImages.push(imageUrl);
      }
    }
  }

  // Качи нови снимки
  if (allImages.length > 0) {
    console.log(`  📊 Processing ${allImages.length} images from Filstar...`);
    
    for (const imageUrl of allImages) {
      const uploaded = await uploadProductImage(productId, imageUrl, shopifyProduct.images);
      
      if (uploaded) {
        imagesUploaded++;
        // Добави снимката към локалния кеш
        shopifyProduct.images.push({ src: imageUrl, id: null });
      } else {
        imagesSkipped++;
      }
    }
  }

  // Refresh images след upload преди reorder
  if (imagesUploaded > 0) {
    console.log(`  🔄 Refreshing product images after upload...`);
    
    try {
      const refreshResponse = await fetch(
        `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/products/${productId}.json?fields=images`,
        {
          headers: {
            'X-Shopify-Access-Token': ACCESS_TOKEN,
            'Content-Type': 'application/json'
          }
        }
      );

      if (refreshResponse.ok) {
        const refreshData = await refreshResponse.json();
        shopifyProduct.images = refreshData.product.images;
        console.log(`  ✓ Refreshed ${shopifyProduct.images.length} images`);
      } else {
        console.error(`  ⚠️ Failed to refresh images: ${refreshResponse.status}`);
      }
    } catch (error) {
      console.error(`  ⚠️ Error refreshing images:`, error.message);
    }

    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // Пренареди снимките в правилния ред
  await reorderProductImages(productId, filstarProduct, shopifyProduct.images);

  // Обнови статистиката
  stats[categoryType].updated++;
  stats[categoryType].images += imagesUploaded;

  console.log(`  ✅ Updated | Images: ${imagesUploaded} new, ${imagesSkipped} skipped`);
  
  return true;
}


async function processProduct(filstarProduct, categoryType, cachedShopifyProducts) {
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`📦 Processing: ${filstarProduct.name}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  // Валидирай categoryType
  if (!categoryType || typeof categoryType !== 'string') {
    console.log(`  ⚠️ Invalid categoryType: ${categoryType}, using "other"`);
    categoryType = 'other';
  }

  // Провери дали categoryType съществува в stats
  if (!stats[categoryType]) {
    console.log(`  ⚠️ Unknown category: ${categoryType}, using "other"`);
    categoryType = 'other';
  }

  // Намери продукта в кеша по SKU
  let shopifyProduct = null;
  
  if (filstarProduct.variants && filstarProduct.variants.length > 0) {
    for (const variant of filstarProduct.variants) {
      if (!variant.sku) continue;
      
      const foundProduct = cachedShopifyProducts.find(p => 
        p.variants && p.variants.some(v => v.sku === variant.sku)
      );
      
      if (foundProduct) {
        shopifyProduct = foundProduct;
        console.log(`  ✓ Found existing product (ID: ${shopifyProduct.id})`);
        break;
      }
    }
  }

  try {
    if (shopifyProduct) {
      // UPDATE EXISTING PRODUCT
      await updateProduct(shopifyProduct, filstarProduct, categoryType);
    } else {
      // CREATE NEW PRODUCT
      await createShopifyProduct(filstarProduct, categoryType);
    }
    
    console.log(`  ✅ Processing completed successfully`);
    return true;

  } catch (error) {
    console.error(`  ❌ Error processing product:`, error.message);
    return false;
  }
}

function getCategoryName(category) {
  const categoryNames = {
    front_drag: 'Front Drag Reels',
    rear_drag: 'Rear Drag Reels',
    baitrunner: 'Baitrunner Reels',
    multipliers: 'Multiplier Reels',
    other: 'Other Reels'
  };

  return categoryNames[category] || 'Other Reels';
}


function printFinalStats() {
  console.log('\n' + '='.repeat(70));
  console.log('📊 IMPORT SUMMARY');
  console.log('='.repeat(70));
  let totalCreated = 0;
  let totalUpdated = 0;
  let totalImages = 0;
  for (const [category, data] of Object.entries(stats)) {
    if (data.created === 0 && data.updated === 0) continue;
    console.log(`\n${getCategoryName(category)}:`);
    console.log(` ✨ Created: ${data.created} products`);
    console.log(` 🔄 Updated: ${data.updated} products`);
    console.log(` 🖼️ Images: ${data.images} uploaded`);
    totalCreated += data.created;
    totalUpdated += data.updated;
    totalImages += data.images;
  }
  console.log('\n' + '-'.repeat(70));
  console.log(`TOTAL: ${totalCreated} created | ${totalUpdated} updated | ${totalImages} images`);
  console.log('='.repeat(70) + '\n');
}
async function main() {
  console.log('======================================================================');
  console.log('🎣 STARTING FISHING REEL IMPORT - FULL MODE');
  console.log('======================================================================\n');
  
  try {
    // 🚀 КЕШИРАЙ всички Shopify продукти в началото
    const allShopifyProducts = await getAllShopifyProducts();
    console.log(`✅ Cached ${allShopifyProducts.length} Shopify products\n`);
    
    // Fetch всички макари от Filstar
    console.log('🌐 Fetching fishing reels from Filstar API...');
    const categorizedReels = await fetchAllFishingReels();
    const allReels = [
      ...(categorizedReels.front_drag || []),
      ...(categorizedReels.rear_drag || []),
      ...(categorizedReels.baitrunner || []),
      ...(categorizedReels.multipliers || []),
      ...(categorizedReels.other || [])
    ];
    
    console.log(`📊 Found ${allReels.length} fishing reels total`);
    console.log(` - Front Drag: ${categorizedReels.front_drag?.length || 0}`);
    console.log(` - Rear Drag: ${categorizedReels.rear_drag?.length || 0}`);
    console.log(` - Baitrunner: ${categorizedReels.baitrunner?.length || 0}`);
    console.log(` - Multipliers: ${categorizedReels.multipliers?.length || 0}`);
    console.log(` - Other: ${categorizedReels.other?.length || 0}`);
    console.log('======================================================================\n');
    
    // Обработи ВСИЧКИ макари
    for (let i = 0; i < allReels.length; i++) {
      const reel = allReels[i];
      const categoryType = getCategoryName(reel) || 'other';
      console.log(`\n[${i + 1}/${allReels.length}] Processing: ${reel.name || 'Unknown'}`);
      await processProduct(reel, categoryType, allShopifyProducts);
    }
    
    // Покажи финална статистика
    printFinalStats();
    
    console.log('\n======================================================================');
    console.log('✅ IMPORT COMPLETED SUCCESSFULLY');
    console.log('======================================================================');
  } catch (error) {
    console.error('\n======================================================================');
    console.error('❌ IMPORT FAILED');
    console.error('======================================================================');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

// ✅ САМО ЕДИН ИЗВИК
main();

