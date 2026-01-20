// import-fishing-rods.js - Модерен импорт на въдици с нормализация на снимки
const fetch = require('node-fetch');
const sharp = require('sharp');

const SHOPIFY_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const FILSTAR_TOKEN = process.env.FILSTAR_API_TOKEN;
const API_VERSION = '2024-10';
const FILSTAR_API_BASE = 'https://filstar.com/api';
const FILSTAR_BASE_URL = 'https://filstar.com';

// Конфигурация за нормализация на снимки
const TARGET_WIDTH = 1200;
const TARGET_HEIGHT = 1000;
const BACKGROUND_COLOR = { r: 255, g: 255, b: 255, alpha: 1 };

// Колекции за въдици
const COLLECTION_MAPPING = {
  telescopes_with_guides: 'gid://shopify/Collection/739156001150',
  telescopes_without_guides: 'gid://shopify/Collection/739156033918',
  carp_rods: 'gid://shopify/Collection/739156099454',
  match_feeder: 'gid://shopify/Collection/739156132222',
  specialty_rods: 'gid://shopify/Collection/739156230526',
  kits: 'gid://shopify/Collection/739156164990',
  spinning: 'gid://shopify/Collection/739155968382'
};

// Filstar категории за въдици
const FILSTAR_ROD_CATEGORY_IDS = {
  telescopes_with_guides: ['33'],
  telescopes_without_guides: ['38'],
  carp_rods: ['44'],
  match_feeder: ['47'],
  specialty_rods: ['57'],
  kits: ['56'],
  spinning: ['28']
};

// Статистика
const stats = {
  telescopes_with_guides: { created: 0, updated: 0, images: 0 },
  telescopes_without_guides: { created: 0, updated: 0, images: 0 },
  carp_rods: { created: 0, updated: 0, images: 0 },
  match_feeder: { created: 0, updated: 0, images: 0 },
  specialty_rods: { created: 0, updated: 0, images: 0 },
  kits: { created: 0, updated: 0, images: 0 },
  spinning: { created: 0, updated: 0, images: 0 }
};

// Имена на категориите
function getCategoryName(category) {
  const names = {
    telescopes_with_guides: 'Телескопи с водачи',
    telescopes_without_guides: 'Телескопи без водачи',
    carp_rods: 'Шарански пръчки',
    match_feeder: 'Мач и Фидер',
    specialty_rods: 'Специални пръчки',
    kits: 'Комплекти',
    spinning: 'Спининг'
  };
  return names[category] || category;
}

// Функция за обновяване на съществуващ продукт
async function updateShopifyProduct(existingProduct, filstarProduct, category) {
  console.log(`Updating product: ${filstarProduct.name}`);
  
  const productId = existingProduct.id;
  
  try {
    // 1. Fetch текущите снимки
    const imagesResponse = await fetch(
      `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/products/${productId}/images.json`,
      {
        headers: {
          'X-Shopify-Access-Token': ACCESS_TOKEN,
          'Content-Type': 'application/json'
        }
      }
    );
    
    const imagesData = await imagesResponse.json();
    const existingImages = imagesData.images || [];
    
    console.log(`  📸 Existing images: ${existingImages.length}`);
    
    // 2. Обработи снимките от Filstar
    const filstarImages = [];
    
    if (filstarProduct.image) {
      const imageUrl = filstarProduct.image.startsWith('http') 
        ? filstarProduct.image 
        : `https://filstar.com/${filstarProduct.image}`;
      filstarImages.push(imageUrl);
    }
    
    if (filstarProduct.images && Array.isArray(filstarProduct.images)) {
      for (const img of filstarProduct.images) {
        const imageUrl = img.startsWith('http') ? img : `https://filstar.com/${img}`;
        filstarImages.push(imageUrl);
      }
    }
    
    if (filstarProduct.variants) {
      for (const variant of filstarProduct.variants) {
        if (variant.image) {
          const imageUrl = variant.image.startsWith('http') 
            ? variant.image 
            : `https://filstar.com/${variant.image}`;
          filstarImages.push(imageUrl);
        }
      }
    }
    
    console.log(`Processing ${filstarImages.length} images from Filstar...`);
    
    // 3. Качи нови снимки
    let uploadedCount = 0;
    for (const imageUrl of filstarImages) {
      const uploaded = await uploadProductImage(productId, imageUrl, existingImages);
      if (uploaded) uploadedCount++;
    }
    
    if (uploadedCount > 0) {
      console.log(`  ✅ Uploaded ${uploadedCount} new images`);
      
      // 4. Reorder снимките
      const updatedImagesResponse = await fetch(
        `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/products/${productId}/images.json`,
        {
          headers: {
            'X-Shopify-Access-Token': ACCESS_TOKEN,
            'Content-Type': 'application/json'
          }
        }
      );
      
      const updatedImagesData = await updatedImagesResponse.json();
      await reorderProductImages(productId, filstarProduct, updatedImagesData.images || []);
    } else {
      console.log(`  ℹ️  No new images to upload`);
      
      // Reorder съществуващите снимки
      await reorderProductImages(productId, filstarProduct, existingImages);
    }
    
    stats[category].updated++;
    
  } catch (error) {
    console.error(`  ❌ Error updating product:`, error.message);
  }
}


// Функция за търсене на продукт в Shopify по SKU
async function findShopifyProductBySku(sku) {
  console.log(`  🔍 Searching in Shopify for SKU: ${sku}...`);
  
  try {
    let allProducts = [];
    let hasNextPage = true;
    let cursor = null;
    
    while (hasNextPage) {
      const response = await fetch(
        `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/products.json?limit=250${cursor ? `&page_info=${cursor}` : ''}`,
        {
          headers: {
            'X-Shopify-Access-Token': ACCESS_TOKEN,
            'Content-Type': 'application/json'
          }
        }
      );
      
      if (!response.ok) {
        throw new Error(`Shopify API error: ${response.status}`);
      }
      
      const data = await response.json();
      allProducts = allProducts.concat(data.products);
      
      // Провери за следваща страница
      const linkHeader = response.headers.get('Link');
      if (linkHeader && linkHeader.includes('rel="next"')) {
        const nextMatch = linkHeader.match(/<[^>]*page_info=([^>&]+)[^>]*>;\s*rel="next"/);
        cursor = nextMatch ? nextMatch[1] : null;
        hasNextPage = !!cursor;
      } else {
        hasNextPage = false;
      }
    }
    
    // Търси продукт с този SKU във вариантите
    for (const product of allProducts) {
      const variant = product.variants?.find(v => v.sku === sku);
      if (variant) {
        console.log(`  ✓ Found existing product (ID: ${product.id})`);
        return product;
      }
    }
    
    console.log(`  ℹ️  Product not found in Shopify`);
    return null;
    
  } catch (error) {
    console.error(`  ⚠️  Error searching Shopify:`, error.message);
    return null;
  }
}






/**
 * Нормализира изображение към 1200x1000 с бели полета
 */
async function normalizeImage(imageUrl) {
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.status}`);
    }
    
    const imageBuffer = await response.buffer();
    const metadata = await sharp(imageBuffer).metadata();
    const originalWidth = metadata.width;
    const originalHeight = metadata.height;
    
    if (originalWidth === TARGET_WIDTH && originalHeight === TARGET_HEIGHT) {
      console.log(`    ⏭️  Already normalized: ${originalWidth}x${originalHeight}`);
      return null;
    }
    
    console.log(`    🔧 Normalizing: ${originalWidth}x${originalHeight} → ${TARGET_WIDTH}x${TARGET_HEIGHT}`);
    
    const normalizedBuffer = await sharp(imageBuffer)
      .resize(TARGET_WIDTH, TARGET_HEIGHT, {
        fit: 'contain',
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
 * Качва нормализирано изображение в Shopify
 */
async function uploadNormalizedImage(productId, imageUrl, position) {
  try {
    const normalizedBuffer = await normalizeImage(imageUrl);
    
    if (!normalizedBuffer) {
      // Вече е нормализирана, качи директно
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
              src: imageUrl,
              position: position
            }
          })
        }
      );
      
      if (!response.ok) {
        throw new Error(`Failed to upload: ${response.status}`);
      }
      
      console.log(`    ✅ Uploaded image (position ${position})`);
      return true;
    }
    
    // Качи нормализираната снимка
    const base64Image = normalizedBuffer.toString('base64');
    
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
            attachment: base64Image,
            position: position
          }
        })
      }
    );
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to upload: ${response.status} - ${errorText}`);
    }
    
    console.log(`    ✅ Uploaded normalized image (position ${position})`);
    return true;
    
  } catch (error) {
    console.error(`    ❌ Error uploading:`, error.message);
    return false;
  }
}

/**
 * Извлича filename от URL
 */
function getImageFilename(src) {
  if (!src || typeof src !== 'string') return null;
  
  const urlParts = src.split('/').pop();
  const withoutQuery = urlParts.split('?')[0];
  
  const uuidPattern = /_[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}(\.[a-z]+)?$/i;
  let cleanFilename = withoutQuery.replace(uuidPattern, '$1');
  
  const parts = cleanFilename.split('_');
  if (parts.length > 1) {
    const lastPart = parts[parts.length - 1].split('.')[0];
    if (lastPart.length >= 32 && /^[a-f0-9]+$/i.test(lastPart)) {
      parts.pop();
      const extension = cleanFilename.split('.').pop();
      cleanFilename = parts.join('_') + '.' + extension;
    }
  }
  
  cleanFilename = cleanFilename.replace(/^_+/, '');
  return cleanFilename;
}

/**
 * Проверява дали снимка съществува
 */
function imageExists(existingImages, newImageUrl) {
  const newFilename = getImageFilename(newImageUrl);
  if (!newFilename) return false;
  
  return existingImages.some(img => {
    const existingFilename = getImageFilename(img.src);
    return existingFilename && existingFilename === newFilename;
  });
}

/**
 * Извлича SKU от filename
 */
function extractSkuFromImageFilename(filename) {
  if (!filename || typeof filename !== 'string') return '999999';
  
  const match = filename.match(/^(\d+)/);
  if (match && match[1]) return match[1];
  
  const altMatch = filename.match(/[-_](\d{6,})/);
  if (altMatch && altMatch[1]) return altMatch[1];
  
  return '999999';
}

/**
 * Сортира снимки по SKU
 */
function sortImagesBySku(imageUrls) {
  if (!imageUrls || !Array.isArray(imageUrls) || imageUrls.length === 0) {
    return [];
  }
  
  return [...imageUrls].sort((a, b) => {
    const filenameA = getImageFilename(a);
    const filenameB = getImageFilename(b);
    
    if (!filenameA || !filenameB) return 0;
    
    const skuA = extractSkuFromImageFilename(filenameA);
    const skuB = extractSkuFromImageFilename(filenameB);
    
    return skuA.localeCompare(skuB);
  });
}

/**
 * Форматира име на вариант за въдици
 * Формат: Модел / Дължина / Акция
 */
function formatVariantName(variant, categoryType) {
  if (!variant.attributes || variant.attributes.length === 0) {
    return variant.model || `SKU: ${variant.sku}`;
  }
  
  const attributes = variant.attributes;
  let parts = [];
  
  // 1. Модел
  if (variant.model && variant.model.trim() && variant.model !== 'N/A') {
    parts.push(variant.model.trim());
  }
  
  // 2. Дължина (РАЗМЕР, M)
  const length = attributes.find(a => 
    a.attribute_name && a.attribute_name.includes('РАЗМЕР') && a.attribute_name.includes('M')
  )?.value;
  if (length) {
    parts.push(`${length}м`);
  }
  
  // 3. Акция (АКЦИЯ, G или АКЦИЯ, LB)
  const actionG = attributes.find(a => 
    a.attribute_name && a.attribute_name.includes('АКЦИЯ') && a.attribute_name.includes('G')
  )?.value;
  const actionLB = attributes.find(a => 
    a.attribute_name && a.attribute_name.includes('АКЦИЯ') && a.attribute_name.includes('LB')
  )?.value;
  
  if (actionG) {
    parts.push(`${actionG}g`);
  } else if (actionLB) {
    parts.push(`${actionLB}lb`);
  }
  
  return parts.length > 0 ? parts.join(' / ') : `SKU: ${variant.sku}`;
}

/**
 * Гарантира уникални имена на варианти
 */
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
    console.log('  ⚠️  Duplicates detected - adding SKU to all variant names');
    return formattedVariants.map(v => `SKU ${v.sku}: ${v.name}`);
  }
  
  return formattedVariants.map(v => v.name);
}

/**
 * Почиства HTML описание
 */
function cleanDescription(html) {
  if (!html) return '';
  
  let clean = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  clean = clean.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
  
  if (clean.length > 5000 || clean.includes('function(') || clean.includes('var ')) {
    return '';
  }
  
  return clean;
}

/**
 * Fetch всички продукти от Filstar с пагинация
 */
async function fetchAllProducts() {
  console.log('📥 Fetching all products from Filstar API...');
  
  let allProducts = [];
  let page = 1;
  let hasMorePages = true;
  
  while (hasMorePages) {
    console.log(`  Page ${page}...`);
    
    const response = await fetch(`${FILSTAR_API_BASE}/products?page=${page}&limit=1000`, {
      headers: {
        'Authorization': `Bearer ${FILSTAR_TOKEN}`
      }
    });
    
    if (!response.ok) {
      throw new Error(`Filstar API error: ${response.status}`);
    }
    
    const pageProducts = await response.json();
    console.log(`  ✓ Page ${page}: ${pageProducts.length} products`);
    
    if (pageProducts.length === 0) {
      hasMorePages = false;
    } else {
      allProducts = allProducts.concat(pageProducts);
      page++;
    }
  }
  
  console.log(`✅ Total products fetched: ${allProducts.length}\n`);
  return allProducts;
}

/**
 * Категоризира въдиците
 */
async function fetchAllFishingRods() {
  const allProducts = await fetchAllProducts();
  
  const rods = {
    telescopes_with_guides: [],
    telescopes_without_guides: [],
    carp_rods: [],
    match_feeder: [],
    specialty_rods: [],
    kits: [],
    spinning: []
  };
  
  allProducts.forEach(product => {
    const categoryIds = product.categories?.map(c => c.id.toString()) || [];
    
    if (categoryIds.some(id => FILSTAR_ROD_CATEGORY_IDS.telescopes_with_guides.includes(id))) {
      rods.telescopes_with_guides.push(product);
    } else if (categoryIds.some(id => FILSTAR_ROD_CATEGORY_IDS.telescopes_without_guides.includes(id))) {
      rods.telescopes_without_guides.push(product);
    } else if (categoryIds.some(id => FILSTAR_ROD_CATEGORY_IDS.carp_rods.includes(id))) {
      rods.carp_rods.push(product);
    } else if (categoryIds.some(id => FILSTAR_ROD_CATEGORY_IDS.match_feeder.includes(id))) {
      rods.match_feeder.push(product);
    } else if (categoryIds.some(id => FILSTAR_ROD_CATEGORY_IDS.specialty_rods.includes(id))) {
      rods.specialty_rods.push(product);
    } else if (categoryIds.some(id => FILSTAR_ROD_CATEGORY_IDS.kits.includes(id))) {
      rods.kits.push(product);
    } else if (categoryIds.some(id => FILSTAR_ROD_CATEGORY_IDS.spinning.includes(id))) {
      rods.spinning.push(product);
    }
  });
  
  console.log('📊 Categorized fishing rods:');
  console.log(`  - Telescopes with guides: ${rods.telescopes_with_guides.length}`);
  console.log(`  - Telescopes without guides: ${rods.telescopes_without_guides.length}`);
  console.log(`  - Carp rods: ${rods.carp_rods.length}`);
  console.log(`  - Match/Feeder: ${rods.match_feeder.length}`);
  console.log(`  - Specialty rods: ${rods.specialty_rods.length}`);
  console.log(`  - Kits: ${rods.kits.length}`);
  console.log(`  - Spinning: ${rods.spinning.length}\n`);
  
  return rods;
}

/**
 * Взима всички Shopify продукти
 */
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
  
  console.log(`✅ Fetched ${allProducts.length} products from ${pageCount} pages\n`);
  return allProducts;
}

/**
 * Намира продукт по SKU
 */
function findProductBySku(allProducts, sku) {
  return allProducts.find(product => 
    product.variants.some(v => v.sku === sku)
  );
}

/**
 * Добавя продукт в колекция
 */
async function addProductToCollection(productId, category) {
  const collectionId = COLLECTION_MAPPING[category];
  
  if (!collectionId) {
    console.log(`  ⚠️  No collection mapping for: ${category}`);
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
      console.log(`  ✅ Added to collection: ${getCategoryName(category)}`);
    }
  } catch (error) {
    console.error(`  ⚠️  Error adding to collection:`, error.message);
  }
}

/**
 * Добавя и подрежда снимки
 */
async function addAndReorderImages(productId, filstarProduct) {
  console.log(`  📸 Processing images...`);
  
  const desiredOrder = [];
  let position = 1;
  
  // 1️⃣ Главна снимка
  if (filstarProduct.image) {
    const imageUrl = filstarProduct.image.startsWith('http') 
      ? filstarProduct.image 
      : `${FILSTAR_BASE_URL}/${filstarProduct.image}`;
    desiredOrder.push(imageUrl);
  }
  
  // 2️⃣ Допълнителни снимки (сортирани по SKU)
  if (filstarProduct.images && Array.isArray(filstarProduct.images)) {
    const sortedImages = sortImagesBySku(filstarProduct.images);
    for (const img of sortedImages) {
      const imageUrl = img.startsWith('http') ? img : `${FILSTAR_BASE_URL}/${img}`;
      if (!desiredOrder.includes(imageUrl)) {
        desiredOrder.push(imageUrl);
      }
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
        if (!desiredOrder.includes(imageUrl)) {
          desiredOrder.push(imageUrl);
        }
      }
    }
  }
  
  console.log(`  📋 Total images to upload: ${desiredOrder.length}`);
  
  let uploadedCount = 0;
  
  for (const imageUrl of desiredOrder) {
    const uploaded = await uploadNormalizedImage(productId, imageUrl, position);
    if (uploaded) {
      uploadedCount++;
      position++;
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log(`  ✅ Uploaded ${uploadedCount} images`);
  return uploadedCount;
}

/**
 * Създава нов продукт
 */
async function createShopifyProduct(filstarProduct, category) {
  console.log(`\n🆕 Creating new product: ${filstarProduct.name}`);
  
  try {
    const vendor = filstarProduct.manufacturer || 'Unknown';
    console.log(`  🏷️  Vendor: ${vendor}`);
    
    const variantNames = ensureUniqueVariantNames(filstarProduct.variants, category);
    const cleanedDescription = cleanDescription(filstarProduct.description);
    
    const productData = {
      product: {
        title: filstarProduct.name,
        body_html: cleanedDescription,
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
    const uploadedImages = await addAndReorderImages(productId, filstarProduct);
    
    // Добави в колекция
    await addProductToCollection(productId, category);
    
    stats[category].created++;
    stats[category].images += uploadedImages;
    
    console.log(`  ✅ Product creation completed`);
    return result.product;
    
  } catch (error) {
    console.error(`  ❌ Error creating product:`, error.message);
    throw error;
  }
}

/**
 * Update на съществуващ продукт
 */
async function updateProduct(shopifyProduct, filstarProduct, categoryType) {
  console.log(`\n🔄 Updating product: ${shopifyProduct.title}`);
  
  const productId = shopifyProduct.id;
  const allImages = [];
  
  // Събери всички снимки от Filstar
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
  
  // Качи нови снимки
  let imagesUploaded = 0;
  let imagesSkipped = 0;
  
  if (allImages.length > 0) {
    console.log(`  Processing ${allImages.length} images from Filstar...`);
    
    for (const imageUrl of allImages) {
      if (imageExists(shopifyProduct.images, imageUrl)) {
        console.log(`  ⏭️  Image already exists, skipping: ${getImageFilename(imageUrl)}`);
        imagesSkipped++;
      } else {
        const uploaded = await uploadNormalizedImage(productId, imageUrl, shopifyProduct.images.length + 1);
        if (uploaded) {
          imagesUploaded++;
          shopifyProduct.images.push({ src: imageUrl, id: null });
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }
  
  stats[categoryType].updated++;
  stats[categoryType].images += imagesUploaded;
  
  console.log(`  ✅ Updated | Images: ${imagesUploaded} new, ${imagesSkipped} skipped`);
}

/**
 * Обработва един продукт
 */
async function processProduct(filstarProduct, category) {
  const firstVariantSku = filstarProduct.variants?.[0]?.sku;
  
  if (!firstVariantSku) {
    console.log(`  ⚠️  No SKU found, skipping: ${filstarProduct.name}`);
    return;
  }

  console.log(`\nProcessing: ${filstarProduct.name}`);

  // Търси съществуващ продукт в Shopify
  const existingProduct = await findShopifyProductBySku(firstVariantSku);

  if (existingProduct) {
    await updateShopifyProduct(existingProduct, filstarProduct, category);
  } else {
    await createShopifyProduct(filstarProduct, category);
  }
}


/**
 * Принтира финална статистика
 */
function printFinalStats() {
  console.log('\n======================================================================');
  console.log('📊 IMPORT SUMMARY');
  console.log('======================================================================');
  
  Object.entries(stats).forEach(([category, data]) => {
    if (data.created > 0 || data.updated > 0) {
      console.log(`\n${getCategoryName(category)}:`);
      console.log(` ✨ Created: ${data.created} products`);
      console.log(` 🔄 Updated: ${data.updated} products`);
      console.log(` 🖼️  Images: ${data.images} uploaded`);
    }
  });
  
  const totalCreated = Object.values(stats).reduce((sum, s) => sum + s.created, 0);
  const totalUpdated = Object.values(stats).reduce((sum, s) => sum + s.updated, 0);
  const totalImages = Object.values(stats).reduce((sum, s) => sum + s.images, 0);
  
  console.log('\n----------------------------------------------------------------------');
  console.log(`TOTAL: ${totalCreated} created | ${totalUpdated} updated | ${totalImages} images`);
  console.log('======================================================================');
}

/**
 * Main функция
 */
async function main() {
  console.log('Starting fishing rods import...\n');

  try {
    // Fetch всички въдици от Filstar
    const rods = await fetchAllFishingRods();

    // Обработи всяка категория
    for (const [category, products] of Object.entries(rods)) {
      if (products.length === 0) continue;

      console.log(`\n${'='.repeat(60)}`);
      console.log(`Processing ${getCategoryName(category)}: ${products.length} products`);
      console.log('='.repeat(60));

      for (const product of products) {
        await processProduct(product, category);
        await new Promise(resolve => setTimeout(resolve, 500)); // Rate limiting
      }
    }

    console.log('\n✅ Import completed!');

  } catch (error) {
    console.error('❌ Import failed:', error.message);
    process.exit(1);
  }
}

main();
