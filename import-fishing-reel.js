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
  let allProducts = [];
  let hasNextPage = true;
  let pageInfo = null;
  
  while (hasNextPage) {
    let url = `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/products.json?fields=id,title,variants,images&limit=250`;
    
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
      console.error('Failed to fetch Shopify products:', response.status);
      break;
    }
    
    const data = await response.json();
    allProducts = allProducts.concat(data.products);
    
    const linkHeader = response.headers.get('Link');
    if (linkHeader && linkHeader.includes('rel="next"')) {
      const nextMatch = linkHeader.match(/<[^>]*page_info=([^>&]+)[^>]*>;\s*rel="next"/);
      pageInfo = nextMatch ? nextMatch[1] : null;
      hasNextPage = !!pageInfo;
    } else {
      hasNextPage = false;
    }
    
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  return allProducts;
}






function getImageFilename(src) {
  if (!src || typeof src !== 'string') {
    console.log('⚠️ Invalid image src:', src);
    return null;
  }
  const urlParts = src.split('/').pop();
  const withoutQuery = urlParts.split('?')[0];
  const uuidPattern = /_[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/g;
  let cleanFilename = withoutQuery.replace(uuidPattern, '');
  const parts = cleanFilename.split('_');
  const extension = cleanFilename.split('.').pop();
  const filteredParts = parts.filter(part => {
    const partWithoutExt = part.split('.')[0];
    return !(partWithoutExt.length >= 32 && /^[a-f0-9]+$/i.test(partWithoutExt));
  });
  cleanFilename = filteredParts.join('_');
  if (!cleanFilename.endsWith('.' + extension)) {
    cleanFilename += '.' + extension;
  }
  cleanFilename = cleanFilename.replace(/^_+/, '');
  cleanFilename = cleanFilename.replace(/\.jpeg$/i, '.jpg');
  return cleanFilename;
}


// Функция за извличане на SKU от име на снимка
function extractSkuFromImageFilename(filename) {
  const match = filename.match(/^(\d+)/);
  return match ? match[1] : '999999';
}

// Функция за сортиране на снимките по SKU
function sortImagesBySku(imageUrls) {
  return [...imageUrls].sort((a, b) => {
    const filenameA = getImageFilename(a);
    const filenameB = getImageFilename(b);
    const skuA = extractSkuFromImageFilename(filenameA);
    const skuB = extractSkuFromImageFilename(filenameB);
    return skuA.localeCompare(skuB);
  });
}






function imageExists(existingImages, newImageUrl) {
  const newFilename = getImageFilename(newImageUrl);
  if (!newFilename) return false;
  return existingImages.some(img => {
    const existingFilename = getImageFilename(img.src);
    return existingFilename && existingFilename === newFilename;
  });
}


// 🆕 Функция за пренареждане на снимките в правилния ред (REST API)
// Функция за пренареждане на снимките в правилния ред (REST API)
async function reorderProductImages(productId, filstarProduct, existingImages) {
  console.log(`  🔄 Reordering images...`);
  
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
  
  // REST API Update
  if (reorderedImages.length > 0) {
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
        console.error(`    ❌ Failed to reorder: ${response.status}`);
        return false;
      }
      
      console.log(`    ✅ Reordered ${reorderedImages.length} images`);
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      return true;
      
    } catch (error) {
      console.error(`    ❌ Reorder error:`, error.message);
      return false;
    }
  }
  
  return false;
}


async function fetchAllProducts() {
  console.log('Fetching all products from Filstar API with pagination...');
  let allProducts = [];
  let page = 1;
  let hasMorePages = true;
  try {
    while (hasMorePages) {
      console.log(`Fetching page ${page}...`);
      const response = await fetch(`${FILSTAR_API_BASE}/products?page=${page}&amp;limit=1000`, {
        headers: { 'Authorization': `Bearer ${FILSTAR_TOKEN}` }
      });
      if (!response.ok) {
        throw new Error(`Filstar API error: ${response.status}`);
      }
      const pageProducts = await response.json();
      console.log(`Page ${page}: ${pageProducts.length} products`);
      if (pageProducts.length === 0) {
        console.log('No more products, stopping pagination');
        hasMorePages = false;
      } else {
        allProducts = allProducts.concat(pageProducts);
        page++;
      }
    }
    console.log(`\nTotal products fetched: ${allProducts.length}\n`);
    return allProducts;
  } catch (error) {
    console.error('Error fetching products:', error.message);
    throw error;
  }
}

async function fetchAllFishingLines() {
  const allProducts = await fetchAllProducts();
  const lines = {
    front_drag: [],
    rear_drag: [],
    baitrunner: [],
    multipliers: [],
    other: []
  };
  allProducts.forEach(product => {
    const categoryIds = product.categories?.map(c => c.id.toString()) || [];
    if (categoryIds.some(id => FILSTAR_REEL_CATEGORY_IDS.front_drag.includes(id))) {
      lines.front_drag.push(product);
    } else if (categoryIds.some(id => FILSTAR_REEL_CATEGORY_IDS.rear_drag.includes(id))) {
      lines.rear_drag.push(product);
    } else if (categoryIds.some(id => FILSTAR_REEL_CATEGORY_IDS.baitrunner.includes(id))) {
      lines.baitrunner.push(product);
    } else if (categoryIds.some(id => FILSTAR_REEL_CATEGORY_IDS.multipliers.includes(id))) {
      lines.multipliers.push(product);
    } else if (categoryIds.some(id => FILSTAR_REEL_CATEGORY_IDS.other.includes(id))) {
      lines.other.push(product);
    }
  });
  console.log(`\nCategorized fishing lines:`);
  console.log(` - front_drag: ${lines.front_drag.length}`);
  console.log(` - rear_drag: ${lines.rear_drag.length}`);
  console.log(` - baitrunner: ${lines.baitrunner.length}`);
  console.log(` - multipliers: ${lines.multipliers.length}`);
  console.log(` - other: ${lines.other.length}\n`);
  return lines;
}

async function findShopifyProductBySku(sku) {
  let allProducts = [];
  let pageInfo = null;
  let hasNextPage = true;
  while (hasNextPage) {
    let url = `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/products.json?limit=250`;
    if (pageInfo) {
      url += `&amp;page_info=${pageInfo}`;
    }
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-Shopify-Access-Token': ACCESS_TOKEN,
        'Content-Type': 'application/json'
      }
    });
    if (!response.ok) {
      console.error('Failed to fetch Shopify products');
      return null;
    }
    const data = await response.json();
    allProducts = allProducts.concat(data.products);
    const linkHeader = response.headers.get('Link');
    if (linkHeader && linkHeader.includes('rel=\"next\"')) {
      const nextMatch = linkHeader.match(/<[^>]*[?&amp;]page_info=([^>&amp;]+)[^>]*>;\s*rel=\"next\"/);
      if (nextMatch) {
        pageInfo = nextMatch[1];
      } else {
        hasNextPage = false;
      }
    } else {
      hasNextPage = false;
    }
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  console.log(` Searched ${allProducts.length} products for SKU: ${sku}`);
  for (const product of allProducts) {
    const hasVariant = product.variants.some(v => v.sku === sku);
    if (hasVariant) {
      return product;
    }
  }
  return null;
}

function formatVariantName(variant, categoryType) {
  if (!variant.attributes || variant.attributes.length === 0) {
    return variant.model || `SKU: ${variant.sku}`;
  }
  const attributes = variant.attributes;
  const size = attributes.find(a => a.attribute_name.includes('РАЗМЕР'))?.value;
  if (size) {
    return `Размер ${size}`;
  }
  return variant.model || `SKU: ${variant.sku}`;
}

// 🆕 Подобрена функция за добавяне на снимки с правилна подредба
async function addProductImages(productId, filstarProduct) {
  console.log(`Adding images to product ${productId}...`);
  let uploadedCount = 0;
  
  // 🆕 Сортирай снимките по SKU
  const sortedImages = sortImagesBySku(filstarProduct.images || []);
  console.log(` 🔄 Images sorted by SKU for upload`);
  
  const imagesToUpload = [];
  
  // 1️⃣ Главна снимка (макарата)
  if (filstarProduct.image) {
    const imageUrl = filstarProduct.image.startsWith('http') 
      ? filstarProduct.image 
      : `${FILSTAR_BASE_URL}/${filstarProduct.image}`;
    imagesToUpload.push({ src: imageUrl, type: 'main' });
    console.log(` 🎯 Main image: ${getImageFilename(imageUrl)}`);
  }
  
  // 2️⃣ Допълнителни снимки - ИЗПОЛЗВАЙ sortedImages
  if (sortedImages && Array.isArray(sortedImages)) {
    for (const img of sortedImages) {
      const imageUrl = img.startsWith('http') ? img : `${FILSTAR_BASE_URL}/${img}`;
      imagesToUpload.push({ src: imageUrl, type: 'additional' });
      console.log(` 📸 Additional: ${getImageFilename(imageUrl)}`);
    }
  }
  
  // 3️⃣ Снимки на варианти (шпули)
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
    console.log(` ℹ️ No images found`);
    return 0;
  }
  
  // Upload в правилния ред
  for (let i = 0; i < imagesToUpload.length; i++) {
    const imageData = imagesToUpload[i];
    
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
            src: imageData.src,
            position: i + 1
          } 
        })
      }
    );
    
    if (response.ok) {
      console.log(` ✓ Position ${i + 1}: ${getImageFilename(imageData.src)}`);
      uploadedCount++;
    } else {
      const error = await response.text();
      console.error(` ✗ Failed:`, error);
    }
    
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
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
    console.log(` 🏷️ Vendor: ${vendor}`);
    const variantNames = ensureUniqueVariantNames(filstarProduct.variants, category);
    const productData = {
      product: {
        title: filstarProduct.name,
        body_html: filstarProduct.description || '',
        vendor: vendor,
        product_type: getCategoryName(category),
        tags: ['Filstar', category, vendor],
        status: 'active',
        variants: filstarProduct.variants.map((variant, index) => ({
          sku: variant.sku,
          price: variant.price,
          inventory_quantity: parseInt(variant.quantity) || 0,
          inventory_management: 'shopify',
          option1: variantNames[index],
          barcode: variant.barcode || null,
          weight: parseFloat(variant.weight) || 0,
          weight_unit: 'kg'
        })),
        options: [
          { name: 'Вариант', values: variantNames }
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
    console.log(` ✅ Product created with ID: ${productId}`);
    console.log(` 📦 Created ${filstarProduct.variants.length} variants`);
    const uploadedImages = await addProductImages(productId, filstarProduct);
    await addProductToCollection(productId, category);
    stats[category].created++;
    stats[category].images += uploadedImages;
    return result.product;
  } catch (error) {
    console.error(` ❌ Error creating product:`, error.message);
    throw error;
  }
}

async function addProductToCollection(productId, category) {
  const collectionId = COLLECTION_MAPPING[category];
  if (!collectionId) {
    console.log(` ⚠️ No collection mapping for category: ${category}`);
    return;
  }
  try {
    const numericCollectionId = collectionId.split('/').pop();
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
    if (response.ok) {
      console.log(` ✅ Added to collection: ${getCategoryName(category)}`);
    }
  } catch (error) {
    console.error(` ⚠️ Error adding to collection:`, error.message);
  }
}

async function uploadProductImage(productId, imageUrl, existingImages) {
  if (imageExists(existingImages, imageUrl)) {
    console.log(`  ⏭️  Image already exists, skipping: ${getImageFilename(imageUrl)}`);
    return false;
  }
  console.log(` 📸 Uploading new image: ${getImageFilename(imageUrl)}`);
  const response = await fetch(
    `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/products/${productId}/images.json`,
    {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': ACCESS_TOKEN,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ image: { src: imageUrl } })
    }
  );
  if (!response.ok) {
    const error = await response.text();
    console.error(` ✗ Failed to upload image:`, error);
    return false;
  }
  console.log(` ✓ Image uploaded successfully`);
  await new Promise(resolve => setTimeout(resolve, 300));
  return true;
}

// 🆕 Подобрена функция за update с пренареждане
async function updateProduct(shopifyProduct, filstarProduct, categoryType) {
  let imagesUploaded = 0;
  let imagesSkipped = 0;
  
  console.log(`\n🔄 Updating product: ${shopifyProduct.title}`);
  const productId = shopifyProduct.id;
  
  // Upload нови снимки (ако има)
  const allImages = [];
  
  if (filstarProduct.image) {
    const imageUrl = filstarProduct.image.startsWith('http') 
      ? filstarProduct.image 
      : `${FILSTAR_BASE_URL}/${filstarProduct.image}`;
    allImages.push(imageUrl);
  }
  
  if (filstarProduct.images && Array.isArray(filstarProduct.images)) {
    for (const img of filstarProduct.images) {
      const imageUrl = img.startsWith('http') ? img : `${FILSTAR_BASE_URL}/${img}`;
      allImages.push(imageUrl);
    }
  }
  
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
  
  if (allImages.length > 0) {
    console.log(`Processing ${allImages.length} images from Filstar...`);
    for (const imageUrl of allImages) {
      const uploaded = await uploadProductImage(productId, imageUrl, shopifyProduct.images);
      if (uploaded) {
        imagesUploaded++;
        shopifyProduct.images.push({ src: imageUrl, id: null });
      } else {
        imagesSkipped++;
      }
    }
  }
  
  // 🆕 Пренареди снимките в правилния ред
  await reorderProductImages(productId, filstarProduct, shopifyProduct.images);
  
  stats[categoryType].updated++;
  stats[categoryType].images += imagesUploaded;
  
  console.log(` ✅ Updated | Images: ${imagesUploaded} new, ${imagesSkipped} skipped`);
}

async function processProduct(filstarProduct, categoryType, cachedShopifyProducts) {
  console.log(`Processing: ${filstarProduct.name}`);

  
  // Намери продукта в кеша
  let shopifyProduct = null;
  
  for (const variant of filstarProduct.variants || []) {
    const foundProduct = cachedShopifyProducts.find(p => 
      p.variants.some(v => v.sku === variant.sku)
    );
    
    if (foundProduct) {
      shopifyProduct = foundProduct;
      break;
    }
  }
  
  if (shopifyProduct) {
    // UPDATE EXISTING PRODUCT
    console.log(`  ✓ Found existing product (ID: ${shopifyProduct.id})`);
    console.log(`Updating product: ${filstarProduct.name}`);
    
    // Обработка на снимки
    const imagesToUpload = [];
    
    console.log(`Processing ${filstarProduct.images ? filstarProduct.images.length : 0} images from Filstar...`);
    
    // Главна снимка
    if (filstarProduct.image) {
      const imageUrl = filstarProduct.image.startsWith('http') 
        ? filstarProduct.image 
        : `${FILSTAR_BASE_URL}/${filstarProduct.image}`;
      
      if (!imageExists(shopifyProduct.images, imageUrl)) {
        imagesToUpload.push({ src: imageUrl });
        console.log(`  📸 New main image to upload`);
      } else {
        console.log(`  ⏭️  Main image already exists, skipping`);
      }
    }
    
    // Допълнителни снимки
    if (filstarProduct.images && Array.isArray(filstarProduct.images)) {
      for (const img of filstarProduct.images) {
        const imageUrl = img.startsWith('http') ? img : `${FILSTAR_BASE_URL}/${img}`;
        const filename = getImageFilename(imageUrl);
        
        if (!imageExists(shopifyProduct.images, imageUrl)) {
          imagesToUpload.push({ src: imageUrl });
          console.log(`  📸 Uploading new image: ${filename}`);
        } else {
          console.log(`  ⏭️  Image already exists, skipping: ${filename}`);
        }
      }
    }
    
    // Качи новите снимки
    if (imagesToUpload.length > 0) {
      for (const imageData of imagesToUpload) {
        await addProductImages(shopifyProduct.id, [imageData]);
        stats[categoryType].images++;
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    // 🔄 Reorder снимките (винаги, дори ако няма нови)
    if (shopifyProduct.images && shopifyProduct.images.length > 0) {
      // Refresh images след upload
      const updatedProduct = await fetch(
        `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/products/${shopifyProduct.id}.json?fields=images`,
        {
          headers: {
            'X-Shopify-Access-Token': ACCESS_TOKEN,
            'Content-Type': 'application/json'
          }
        }
      );
      
      if (updatedProduct.ok) {
        const data = await updatedProduct.json();
        await reorderProductImages(shopifyProduct.id, filstarProduct, data.product.images);
      }
    }
    
    if (!stats[categoryType]) {
  console.warn(`⚠️  Unknown categoryType: "${categoryType}", using "other"`);
  categoryType = 'other';
}
stats[categoryType].updated++;


console.log(`  🐛 DEBUG: categoryType = "${categoryType}"`);

if (stats[categoryType]) {
  stats[categoryType].updated++;
} else {
  console.error(`❌ Category "${categoryType}" not found in stats object`);
}

    
  } else {
    // CREATE NEW PRODUCT
    console.log(`  ✗ Not found, creating new product`);
    
    const collectionId = COLLECTION_MAPPING[categoryType];
    
    const productData = {
      title: filstarProduct.name,
      body_html: filstarProduct.description || '',
      vendor: filstarProduct.manufacturer || 'Unknown',
      product_type: 'Fishing Reel',
      variants: filstarProduct.variants.map(v => ({
        sku: v.sku,
        price: v.price || '0.00',
        inventory_management: 'shopify',
        inventory_quantity: v.stock || 0
      }))
    };
    
    // Създай продукта
    const createResponse = await fetch(
      `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/products.json`,
      {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': ACCESS_TOKEN,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ product: productData })
      }
    );
    
    if (!createResponse.ok) {
      const error = await createResponse.text();
      console.error(`  ❌ Failed to create product:`, error);
      return;
    }
    
    const createdData = await createResponse.json();
    const newProductId = createdData.product.id;
    console.log(`  ✅ Created product ID: ${newProductId}`);
    
    // Добави към колекция
    await fetch(
      `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/collects.json`,
      {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': ACCESS_TOKEN,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          collect: {
            product_id: newProductId,
            collection_id: collectionId.replace('gid://shopify/Collection/', '')
          }
        })
      }
    );
    
    // Качи снимки
    const imagesToUpload = [];
    
    if (filstarProduct.image) {
      const imageUrl = filstarProduct.image.startsWith('http') 
        ? filstarProduct.image 
        : `${FILSTAR_BASE_URL}/${filstarProduct.image}`;
      imagesToUpload.push({ src: imageUrl });
    }
    
    if (filstarProduct.images && Array.isArray(filstarProduct.images)) {
      for (const img of filstarProduct.images) {
        const imageUrl = img.startsWith('http') ? img : `${FILSTAR_BASE_URL}/${img}`;
        imagesToUpload.push({ src: imageUrl });
      }
    }
    
    if (imagesToUpload.length > 0) {
      console.log(`  📸 Uploading ${imagesToUpload.length} images...`);
      await addProductImages(newProductId, imagesToUpload);
      stats[categoryType].images += imagesToUpload.length;
    }
    
    stats[categoryType].created++;
  }
  
  await new Promise(resolve => setTimeout(resolve, 1000));
}



function getCategoryName(category) {
  const names = {
    front_drag: 'Макари с преден аванс',
    rear_drag: 'Макари с заден аванс',
    baitrunner: 'Байтрънър',
    multipliers: 'Мултиплокатори',
    other: 'Други'
  };
  return names[category] || category;
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
  
  // 🚀 КЕШИРАЙ всички Shopify продукти в началото
  console.log('📦 Fetching all Shopify products...');
  const allShopifyProducts = await getAllShopifyProducts();
  console.log(`✅ Cached ${allShopifyProducts.length} Shopify products\n`);
  
  // Fetch всички макари от Filstar
  const categorizedReels = await fetchAllFishingLines();
  const allReels = [
    ...(categorizedReels.front_drag || []),
    ...(categorizedReels.rear_drag || []),
    ...(categorizedReels.baitrunner || []),
    ...(categorizedReels.multipliers || []),
    ...(categorizedReels.other || [])
  ];
  
  console.log(`📊 Found ${allReels.length} fishing reels total\n`);
  console.log('======================================================================\n');
  
  // Обработи ВСИЧКИ макари
  for (const reel of allReels) {
    const categoryType = getCategoryName(reel) || 'other';
    await processProduct(reel, categoryType, allShopifyProducts);
  }
  
  // Покажи финална статистика
  printFinalStats();
  
  console.log('\n======================================================================');
  console.log('✅ IMPORT COMPLETED SUCCESSFULLY');
  console.log('======================================================================');
}

main();

