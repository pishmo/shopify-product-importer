// import-fishing-lines.js - Импорт на влакна с нормализация на снимки
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

// Колекции за влакна
const COLLECTION_MAPPING = {
  monofilament: 'gid://shopify/Collection/738965946750',
  braided: 'gid://shopify/Collection/738965979518',
  fluorocarbon: 'gid://shopify/Collection/738987442558',
  other: null // Няма колекция за "Други" засега
};

// Filstar категории за влакна
const FILSTAR_LINE_CATEGORY_IDS = {
  monofilament: ['41'],
  braided: ['105'],
  fluorocarbon: ['107'],
  other: ['109']
};

// Статистика
const stats = {
  monofilament: { created: 0, updated: 0, images: 0 },
  braided: { created: 0, updated: 0, images: 0 },
  fluorocarbon: { created: 0, updated: 0, images: 0 },
  other: { created: 0, updated: 0, images: 0 }
};

// Имена на категориите
function getCategoryName(category) {
  const names = {
    monofilament: 'Влакно монофилно',
    braided: 'Влакно плетено',
    fluorocarbon: 'Fluorocarbon',
    other: 'Други влакна'
  };
  return names[category] || category;
}

// Определяне на категория по Filstar данни
function getCategoryType(filstarProduct) {
  if (!filstarProduct.categories || filstarProduct.categories.length === 0) {
    return 'other';
  }
  
  for (const cat of filstarProduct.categories) {
    const catId = cat.id?.toString();
    
    if (FILSTAR_LINE_CATEGORY_IDS.monofilament.includes(catId)) {
      return 'monofilament';
    }
    if (FILSTAR_LINE_CATEGORY_IDS.braided.includes(catId)) {
      return 'braided';
    }
    if (FILSTAR_LINE_CATEGORY_IDS.fluorocarbon.includes(catId)) {
      return 'fluorocarbon';
    }
    if (FILSTAR_LINE_CATEGORY_IDS.other.includes(catId)) {
      return 'other';
    }
  }
  
  return 'other';
}

// Форматиране на variant name за влакна
function formatLineVariantName(variant, filstarProduct) {
  if (!variant.attributes || variant.attributes.length === 0) {
    return variant.model || variant.sku || 'Default';
  }
  
  const parts = [];
  
  // 1. Model (ако има)
  if (variant.model && variant.model.trim()) {
    parts.push(variant.model.trim());
  }
  
  // 2. Дължина
  const length = variant.attributes.find(a => 
    a.attribute_name.includes('ДЪЛЖИНА')
  )?.value;
  if (length) {
    parts.push(`${length}м`);
  }
  
  // 3. Диаметър
  const diameter = variant.attributes.find(a => 
    a.attribute_name.includes('РАЗМЕР') && a.attribute_name.includes('MM')
  )?.value;
  if (diameter) {
    parts.push(`Ø${diameter}мм`);
  }
  
  // 4. Японска номерация
  const japaneseSize = variant.attributes.find(a => 
    a.attribute_name.includes('ЯПОНСКА НОМЕРАЦИЯ')
  )?.value;
  if (japaneseSize) {
    parts.push(japaneseSize);
  }
  
  // 5. Тест (kg/LB)
  const testKg = variant.attributes.find(a => 
    a.attribute_name.includes('ТЕСТ') && a.attribute_name.includes('KG')
  )?.value;
  const testLb = variant.attributes.find(a => 
    a.attribute_name.includes('ТЕСТ') && a.attribute_name.includes('LB')
  )?.value;
  
  if (testKg && testLb) {
    parts.push(`${testKg}кг/${testLb}LB`);
  } else if (testKg) {
    parts.push(`${testKg}кг`);
  } else if (testLb) {
    parts.push(`${testLb}LB`);
  }
  
  return parts.length > 0 ? parts.join(' / ') : variant.sku;
}

// Уникални variant names
function ensureUniqueVariantNames(variants, filstarProduct) {
  const names = variants.map(v => formatLineVariantName(v, filstarProduct));
  const counts = {};
  
  return names.map((name, index) => {
    counts[name] = (counts[name] || 0) + 1;
    if (counts[name] > 1) {
      return `${name} (${variants[index].sku})`;
    }
    return name;
  });
}

// Извличане на SKU от filename
function extractSkuFromImageFilename(filename) {
  if (!filename) return '999999';
  const match = filename.match(/(\d{6})/);
  return match ? match[1] : '999999';
}

function getImageFilename(src) {
  if (!src || typeof src !== 'string') {
    return null;
  }
  
  const urlParts = src.split('/').pop();
  const withoutQuery = urlParts.split('?')[0];
  
  let cleanFilename = withoutQuery;
  
  cleanFilename = cleanFilename.replace(/_[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi, '');
  cleanFilename = cleanFilename.replace(/-\d{14}-\d+/g, '');
  
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
  cleanFilename = cleanFilename.replace(/_+(\.[a-z]+)$/i, '$1');
  cleanFilename = cleanFilename.replace(/_+/g, '_');
  
  const filenameParts = cleanFilename.split('.');
  if (filenameParts.length > 1) {
    const extension = filenameParts.pop().toLowerCase();
    cleanFilename = filenameParts.join('.') + '.' + extension;
  }
  
  return cleanFilename;
}

function imageExists(existingImages, newImageUrl) {
  const newFilename = getImageFilename(newImageUrl);
  if (!newFilename) return false;
  
  return existingImages.some(img => {
    const existingFilename = getImageFilename(img.src);
    return existingFilename && existingFilename === newFilename;
  });
}

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

async function uploadProductImage(productId, imageUrl, existingImages) {
  if (!imageUrl || typeof imageUrl !== 'string') {
    console.error(`  ✗ Invalid image URL`);
    return false;
  }

  if (imageExists(existingImages, imageUrl)) {
    const filename = getImageFilename(imageUrl);
    console.log(`  ⏭️  Image already exists, skipping: ${filename}`);
    return false;
  }

  const filename = getImageFilename(imageUrl);
  console.log(`  📸 Uploading new image: ${filename}`);

  try {
    const normalizedBuffer = await normalizeImage(imageUrl);
    
    if (!normalizedBuffer) {
      console.log(`  ⚠️  Skipping image due to normalization error`);
      return false;
    }

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
            filename: filename
          }
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      
      if (errorText.includes('failed to download') || errorText.includes('file not found')) {
        console.log(`  ⚠️  Image not accessible, skipping: ${filename}`);
      } else {
        console.error(`  ✗ Failed to upload image: ${response.status} - ${errorText}`);
      }
      return false;
    }

    const result = await response.json();
    console.log(`  ✅ Normalized image uploaded (ID: ${result.image.id})`);
    
    await new Promise(resolve => setTimeout(resolve, 500));
    return true;

  } catch (error) {
    console.log(`  ⚠️  Upload error, skipping image: ${error.message}`);
    return false;
  }
}

async function fetchMainImageFromFilstarPage(slug) {
  if (!slug) return null;
  
  const productUrl = `${FILSTAR_BASE_URL}/${slug}`;
  
  try {
    console.log(`    🌐 Fetching main image from: ${productUrl}`);
    
    const response = await fetch(productUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ShopifyImporter/1.0)',
        'Accept': 'text/html'
      }
    });
    
    if (!response.ok) {
      console.log(`    ⚠️  Failed to fetch page: ${response.status}`);
      return null;
    }
    
    const html = await response.text();
    
    const ogImageMatch = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i);
    if (ogImageMatch) {
      const imageUrl = ogImageMatch[1];
      console.log(`    ✓ Found OG image: ${getImageFilename(imageUrl)}`);
      return imageUrl;
    }
    
    console.log(`    ⚠️  No main image found in HTML`);
    return null;
  } catch (error) {
    console.log(`    ⚠️  Error fetching page: ${error.message}`);
    return null;
  }
}

async function reorderProductImages(productId, filstarProduct, existingImages) {
  console.log(`  🔄 Reordering images...`);
  
  if (!existingImages || existingImages.length === 0) {
    console.log(`    ⚠️  No existing images`);
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
    console.log(`    ⚠️  No images matched for reordering`);
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

async function createShopifyProduct(filstarProduct, category) {
  console.log(`\n🆕 Creating new product: ${filstarProduct.name}`);
  
  try {
    const vendor = filstarProduct.manufacturer || 'Unknown';
    console.log(`  🏷️  Vendor: ${vendor}`);

    const variantNames = ensureUniqueVariantNames(filstarProduct.variants, filstarProduct);

    const productData = {
      product: {
        title: filstarProduct.name,
        body_html: filstarProduct.description || filstarProduct.short_description || '',
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

    // Качи снимки
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
    
    const filstarImages = [];
    
    if (filstarProduct.image) {
      const imageUrl = filstarProduct.image.startsWith('http') 
        ? filstarProduct.image 
        : `${FILSTAR_BASE_URL}/${filstarProduct.image}`;
      filstarImages.push(imageUrl);
    }
    
    if (filstarProduct.images && Array.isArray(filstarProduct.images)) {
      for (const img of filstarProduct.images) {
        const imageUrl = img.startsWith('http') ? img : `${FILSTAR_BASE_URL}/${img}`;
        filstarImages.push(imageUrl);
      }
    }
    
    if (filstarProduct.variants) {
      for (const variant of filstarProduct.variants) {
        if (variant.image) {
          const imageUrl = variant.image.startsWith('http') 
            ? variant.image 
            : `${FILSTAR_BASE_URL}/${variant.image}`;
          filstarImages.push(imageUrl);
        }
      }
    }
    
    let uploadedCount = 0;
    for (const imageUrl of filstarImages) {
      const uploaded = await uploadProductImage(productId, imageUrl, existingImages);
      if (uploaded) uploadedCount++;
    }
    
    if (uploadedCount > 0) {
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
    }
    
    // Добави към колекция
    if (COLLECTION_MAPPING[category]) {
      await addProductToCollection(productId, category);
    }

    stats[category].created++;
    stats[category].images += uploadedCount;

    console.log(`  ✅ Product creation completed`);
    
    return result.product;

  } catch (error) {
    console.error(`  ❌ Error creating product:`, error.message);
    throw error;
  }
}

async function updateShopifyProduct(existingProduct, filstarProduct, category) {
  console.log(`\n🔄 Updating product: ${filstarProduct.name}`);
  
  const productId = existingProduct.id;
  
  try {
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
    
    const filstarImages = [];
    
    if (filstarProduct.image) {
      const imageUrl = filstarProduct.image.startsWith('http') 
        ? filstarProduct.image 
        : `${FILSTAR_BASE_URL}/${filstarProduct.image}`;
      filstarImages.push(imageUrl);
    }
    
    if (filstarProduct.images && Array.isArray(filstarProduct.images)) {
      for (const img of filstarProduct.images) {
        const imageUrl = img.startsWith('http') ? img : `${FILSTAR_BASE_URL}/${img}`;
        filstarImages.push(imageUrl);
      }
    }
    
    if (filstarProduct.variants) {
      for (const variant of filstarProduct.variants) {
        if (variant.image) {
          const imageUrl = variant.image.startsWith('http') 
            ? variant.image 
            : `${FILSTAR_BASE_URL}/${variant.image}`;
          filstarImages.push(imageUrl);
        }
      }
    }
    
    console.log(`  Processing ${filstarImages.length} images from Filstar...`);
    
    let uploadedCount = 0;
    for (const imageUrl of filstarImages) {
      const uploaded = await uploadProductImage(productId, imageUrl, existingImages);
      if (uploaded) uploadedCount++;
    }
    
    if (uploadedCount > 0) {
      console.log(`  ✅ Uploaded ${uploadedCount} new images`);
      
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
      await reorderProductImages(productId, filstarProduct, existingImages);
    }
    
    stats[category].updated++;
    stats[category].images += uploadedCount;
    
  } catch (error) {
    console.error(`  ❌ Error updating product:`, error.message);
  }
}

async function addProductToCollection(productId, category) {
  const collectionId = COLLECTION_MAPPING[category];
  
  if (!collectionId) {
    console.log(`  ⚠️  No collection mapping for category: ${category}`);
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
    console.log(`  ✅ Added to collection (Collect ID: ${result.collect.id})`);
    
    await new Promise(resolve => setTimeout(resolve, 300));
    return true;

  } catch (error) {
    console.error(`  ❌ Error adding to collection:`, error.message);
    return false;
  }
}

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
      
      const linkHeader = response.headers.get('Link');
      if (linkHeader && linkHeader.includes('rel="next"')) {
        const nextMatch = linkHeader.match(/<[^>]*page_info=([^>&]+)[^>]*>;\s*rel="next"/);
        cursor = nextMatch ? nextMatch[1] : null;
        hasNextPage = !!cursor;
      } else {
        hasNextPage = false;
      }
    }
    
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

async function fetchAllFishingLines() {
  const allProducts = await fetchAllProducts(); // ← Използвай функцията с pagination
  
  const categorizedLines = {
    monofilament: [],
    braided: [],
    fluorocarbon: [],
    other: []
  };
  
  for (const product of allProducts) {
    const category = getCategoryType(product);
    if (categorizedLines[category]) {
      categorizedLines[category].push(product);
    }
  }
  
  console.log('📊 Found fishing lines:');
  console.log(`  - Monofilament: ${categorizedLines.monofilament.length}`);
  console.log(`  - Braided: ${categorizedLines.braided.length}`);
  console.log(`  - Fluorocarbon: ${categorizedLines.fluorocarbon.length}`);
  console.log(`  - Other: ${categorizedLines.other.length}\n`);
  
  return categorizedLines;
}


async function processProduct(filstarProduct, category) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`Processing: ${filstarProduct.name}`);
  console.log(`Category: ${getCategoryName(category)}`);
  console.log(`${'='.repeat(80)}`);
  
  if (!filstarProduct.variants || filstarProduct.variants.length === 0) {
    console.log('  ⚠️  No variants found, skipping product');
    return;
  }
  
  const firstSku = filstarProduct.variants[0].sku;
  
  if (!firstSku) {
    console.log('  ⚠️  No SKU found, skipping product');
    return;
  }
  
  const existingProduct = await findShopifyProductBySku(firstSku);
  
  if (existingProduct) {
    await updateShopifyProduct(existingProduct, filstarProduct, category);
  } else {
    await createShopifyProduct(filstarProduct, category);
  }
  
  await new Promise(resolve => setTimeout(resolve, 1000));
}

function printFinalStats() {
  console.log('\n' + '='.repeat(80));
  console.log('📊 FINAL STATISTICS');
  console.log('='.repeat(80));
  
  let totalCreated = 0;
  let totalUpdated = 0;
  let totalImages = 0;
  
  for (const [category, data] of Object.entries(stats)) {
    if (data.created > 0 || data.updated > 0) {
      console.log(`\n${getCategoryName(category)}:`);
      console.log(`  ✨ Created: ${data.created}`);
      console.log(`  🔄 Updated: ${data.updated}`);
      console.log(`  🖼️  Images: ${data.images}`);
      
      totalCreated += data.created;
      totalUpdated += data.updated;
      totalImages += data.images;
    }
  }
  
  console.log('\n' + '-'.repeat(80));
  console.log('TOTALS:');
  console.log(`  ✨ Total Created: ${totalCreated}`);
  console.log(`  🔄 Total Updated: ${totalUpdated}`);
  console.log(`  🖼️  Total Images: ${totalImages}`);
  console.log('='.repeat(80) + '\n');
}

async function main() {
  console.log('Starting fishing lines import...\n');
  
  const categorizedLines = await fetchAllFishingLines();
  
  const allLines = [
    ...categorizedLines.monofilament,
    ...categorizedLines.braided,
    ...categorizedLines.fluorocarbon,
    ...categorizedLines.other
  ];
  
  console.log(`\n📊 Processing ${allLines.length} fishing lines total\n`);
  
  for (const line of allLines) {
    const categoryType = getCategoryType(line);
    await processProduct(line, categoryType);
  }
  
  printFinalStats();
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
