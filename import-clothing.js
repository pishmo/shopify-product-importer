
// import-clothing.js - Импорт на облекло с нормализация на снимки
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

// Колекции за облекло (TODO: добави GID-овете на колекциите)
const COLLECTION_MAPPING = {
  shoes: 'gid://shopify/Collection/739347595646',
  tshirts: 'gid://shopify/Collection/739347038590',
  pants: 'gid://shopify/Collection/739347136894',
  jackets: 'gid://shopify/Collection/739347235198',
  hats: 'gid://shopify/Collection/739347399038',
  gloves: 'gid://shopify/Collection/739347530110',
  sunglasses: 'gid://shopify/Collection/739347628414',
  sets: 'gid://shopify/Collection/739347267966',
  other: 'gid://shopify/Collection/739347661182'


  
};


// Filstar категории за облекло
	
	// Filstar категории за облекло
const FILSTAR_CLOTHING_CATEGORY_IDS = {
  shoes: ['90'],
  tshirts: ['84'],
  pants: ['85'],
  jackets: ['86'],
  hats: ['88'],
  gloves: ['89'],
  sunglasses: ['92'],
  sets: ['87'],
  other: ['95']
};

	

const CLOTHING_PARENT_ID = '10';

// Статистика
const stats = {
  shoes: { created: 0, updated: 0, images: 0 },
  tshirts: { created: 0, updated: 0, images: 0 },
  pants: { created: 0, updated: 0, images: 0 },
  jackets: { created: 0, updated: 0, images: 0 },
  hats: { created: 0, updated: 0, images: 0 },
  gloves: { created: 0, updated: 0, images: 0 },
  sunglasses: { created: 0, updated: 0, images: 0 },
  sets: { created: 0, updated: 0, images: 0 },
  other: { created: 0, updated: 0, images: 0 }
};

// Имена на категориите
function getCategoryName(category) {
  const names = {
    shoes: 'Обувки',
    tshirts: 'Тениски',
    pants: 'Панталони',
    jackets: 'Якета',
    hats: 'Шапки',
    gloves: 'Ръкавици',
    sunglasses: 'Слънчеви очила',
    sets: 'Комплекти и костюми',
    other: 'Друго облекло'
  };
  return names[category] || category;
}



// ФУНКЦИИ

function getOptionName(category) {
  if (category === 'shoes') return 'Размер / Номер';
  if (['tshirts', 'pants', 'jackets', 'sets', 'gloves'].includes(category)) return 'Размер';
  return 'Вариант';
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
      
     const linkHeader = response.headers.get('Link');
if (linkHeader) {
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




async function deleteExtraProducts(filstarProducts, shopifyProducts) {
  const filstarSKUs = new Set();
  
  filstarProducts.forEach(p => {
    if (p.sku) filstarSKUs.add(p.sku.toString());
    if (p.variants) {
      p.variants.forEach(v => {
        if (v.sku) filstarSKUs.add(v.sku.toString());
      });
    }
  });
  
  for (const shopifyProduct of shopifyProducts) {
    const hasMatchingSKU = shopifyProduct.variants.some(v => 
      filstarSKUs.has(v.sku?.toString())
    );
    
    if (!hasMatchingSKU) {
      console.log(`🗑️  Deleting extra product: ${shopifyProduct.title} (ID: ${shopifyProduct.id})`);
      
      await fetch(
        `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/products/${shopifyProduct.id}.json`,
        {
          method: 'DELETE',
          headers: { 'X-Shopify-Access-Token': ACCESS_TOKEN }
        }
      );
      
      await new Promise(resolve => setTimeout(resolve, 500));
    }
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

function getCategoryType(filstarProduct) {
  if (!filstarProduct.categories || filstarProduct.categories.length === 0) {
    return null;
  }


// Филтрирай само категория , въведи номер на категорията от мапинга
  if (!filstarProduct.categories.some(c => c.id?.toString() === '88')) {
    return null;
  }


	
  const hasClothingParent = filstarProduct.categories.some(c => c.parent_id?.toString() === CLOTHING_PARENT_ID);
  
  if (!hasClothingParent) {
    return null;
  }
  
  for (const cat of filstarProduct.categories) {
    const catId = cat.id?.toString();
    
    if (FILSTAR_CLOTHING_CATEGORY_IDS.shoes.includes(catId)) {
      return 'shoes';
    }
    if (FILSTAR_CLOTHING_CATEGORY_IDS.tshirts.includes(catId)) {
      return 'tshirts';
    }
    if (FILSTAR_CLOTHING_CATEGORY_IDS.pants.includes(catId)) {
      return 'pants';
    }
    if (FILSTAR_CLOTHING_CATEGORY_IDS.jackets.includes(catId)) {
      return 'jackets';
    }
    if (FILSTAR_CLOTHING_CATEGORY_IDS.hats.includes(catId)) {
      return 'hats';
    }
    if (FILSTAR_CLOTHING_CATEGORY_IDS.gloves.includes(catId)) {
      return 'gloves';
    }
    if (FILSTAR_CLOTHING_CATEGORY_IDS.sunglasses.includes(catId)) {
      return 'sunglasses';
    }
    if (FILSTAR_CLOTHING_CATEGORY_IDS.sets.includes(catId)) {
      return 'sets';
    }
    if (FILSTAR_CLOTHING_CATEGORY_IDS.other.includes(catId)) {
      return 'other';
    }
  }
  
  return null;
}


// 2 ра част


// Форматиране на variant name за облекло: модел / цвят / размер
function formatClothingVariantName(variant, filstarProduct) {
  if (!variant.attributes || variant.attributes.length === 0) {
    return variant.sku || 'Default';
  }
  
  const parts = [];
  
  // 1. Модел (ако има)
  if (variant.model && variant.model.trim()) {
    parts.push(variant.model.trim());
  }
  
  // 2. Цвят
  const color = variant.attributes.find(a => 
    a.attribute_name.includes('ЦВЯТ') || a.attribute_name.includes('COLOR')
  )?.value;
  if (color) {
    parts.push(color);
  }
  
  // 3. Размер
  const size = variant.attributes.find(a => 
    a.attribute_name.includes('РАЗМЕР') || a.attribute_name.includes('SIZE')
  )?.value;
  if (size) {
    parts.push(size);
  }
  
  return parts.length > 0 ? parts.join(' / ') : variant.sku;
}

// Уникални variant names
function ensureUniqueVariantNames(variants, filstarProduct) {
  const names = variants.map(v => formatClothingVariantName(v, filstarProduct));
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
  return imageBuffer;  // Върни оригиналния buffer вместо null
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

// 3та част
async function createShopifyProduct(filstarProduct, category) {
  console.log(`\n🆕 Creating new product: ${filstarProduct.name}`);
  try {
    const vendor = filstarProduct.manufacturer || 'Unknown';
    console.log(` 🏷️ Vendor: ${vendor}`);
    
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
          { name: getOptionName(category), values: variantNames }
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

    // Добави към колекция
    const collectionGid = COLLECTION_MAPPING[category];
    if (collectionGid) {
      const collectionId = collectionGid.split('/').pop();
      
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
              product_id: productId,
              collection_id: collectionId
            }
          })
        }
      );
      console.log(` 📁 Added to collection`);
      await new Promise(resolve => setTimeout(resolve, 300));
    }

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

    let uploadedCount = 0;
    if (filstarProduct.image) {
      const uploaded = await uploadProductImage(productId, filstarProduct.image, existingImages);
      if (uploaded) uploadedCount++;
    }

    if (filstarProduct.images && Array.isArray(filstarProduct.images)) {
      for (const imageUrl of filstarProduct.images) {
        const uploaded = await uploadProductImage(productId, imageUrl, existingImages);
        if (uploaded) uploadedCount++;
      }
    }

    if (filstarProduct.variants) {
      for (const variant of filstarProduct.variants) {
        if (variant.image) {
          const uploaded = await uploadProductImage(productId, variant.image, existingImages);
          if (uploaded) uploadedCount++;
        }
      }
    }

    console.log(` 📸 Uploaded ${uploadedCount} new images`);

    // Пренареди снимките
    const finalImagesResponse = await fetch(
      `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/products/${productId}/images.json`,
      {
        headers: {
          'X-Shopify-Access-Token': ACCESS_TOKEN,
          'Content-Type': 'application/json'
        }
      }
    );
    const finalImagesData = await finalImagesResponse.json();
    await reorderProductImages(productId, filstarProduct, finalImagesData.images || []);

    stats[category].created++;
    stats[category].images += uploadedCount;
    await new Promise(resolve => setTimeout(resolve, 1000));

  } catch (error) {
    console.error(` ❌ Error creating product:`, error.message);
  }
}




async function updateShopifyProduct(shopifyProduct, filstarProduct, category) {
  console.log(`\n🔄 Updating product: ${filstarProduct.name}`);
  try {
    const productId = shopifyProduct.id;
    const vendor = filstarProduct.manufacturer || 'Unknown';
    const variantNames = ensureUniqueVariantNames(filstarProduct.variants, filstarProduct);
    
    const updateData = {
      product: {
        id: productId,
        title: filstarProduct.name,
        body_html: filstarProduct.description || filstarProduct.short_description || '',
        vendor: vendor,
        product_type: getCategoryName(category),
        tags: ['Filstar', category, vendor].filter(Boolean).join(', '),
        options: [
          { name: getOptionName(category), values: variantNames }
        ]
      }
    };

    const response = await fetch(
      `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/products/${productId}.json`,
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

    console.log(` ✅ Product updated`);

    // Добави към колекция ако не е
    const collectionGid = COLLECTION_MAPPING[category];
    if (collectionGid) {
      const collectionId = collectionGid.split('/').pop();
      
      // Провери дали вече е в колекцията
      const collectsCheck = await fetch(
        `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/collects.json?product_id=${productId}&collection_id=${collectionId}`,
        {
          headers: {
            'X-Shopify-Access-Token': ACCESS_TOKEN,
            'Content-Type': 'application/json'
          }
        }
      );
      
      const collectsData = await collectsCheck.json();
      
      if (!collectsData.collects || collectsData.collects.length === 0) {
        // Добави към колекцията
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
                product_id: productId,
                collection_id: collectionId
              }
            })
          }
        );
        console.log(` 📁 Added to collection`);
      }
    }

    // Update variants
    for (let i = 0; i < filstarProduct.variants.length; i++) {
      const filstarVariant = filstarProduct.variants[i];
      const shopifyVariant = shopifyProduct.variants.find(v => v.sku === filstarVariant.sku);
      
      if (shopifyVariant) {
        const variantUpdateData = {
          variant: {
            id: shopifyVariant.id,
            price: parseFloat(filstarVariant.price) || '0.00',
            inventory_quantity: parseInt(filstarVariant.quantity) || 0,
            option1: variantNames[i],
            barcode: filstarVariant.barcode || null,
            weight: parseFloat(filstarVariant.weight) || 0,
            weight_unit: 'kg'
          }
        };

        await fetch(
          `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/variants/${shopifyVariant.id}.json`,
          {
            method: 'PUT',
            headers: {
              'X-Shopify-Access-Token': ACCESS_TOKEN,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(variantUpdateData)
          }
        );
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }

    console.log(` 📦 Updated ${filstarProduct.variants.length} variants`);

    // Upload new images
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
    let uploadedCount = 0;

    if (filstarProduct.image) {
      const uploaded = await uploadProductImage(productId, filstarProduct.image, existingImages);
      if (uploaded) uploadedCount++;
    }

    if (filstarProduct.images && Array.isArray(filstarProduct.images)) {
      for (const imageUrl of filstarProduct.images) {
        const uploaded = await uploadProductImage(productId, imageUrl, existingImages);
        if (uploaded) uploadedCount++;
      }
    }

    if (filstarProduct.variants) {
      for (const variant of filstarProduct.variants) {
        if (variant.image) {
          const uploaded = await uploadProductImage(productId, variant.image, existingImages);
          if (uploaded) uploadedCount++;
        }
      }
    }

    if (uploadedCount > 0) {
      console.log(` 📸 Uploaded ${uploadedCount} new images`);
    }

    // Reorder images
    const finalImagesResponse = await fetch(
      `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/products/${productId}/images.json`,
      {
        headers: {
          'X-Shopify-Access-Token': ACCESS_TOKEN,
          'Content-Type': 'application/json'
        }
      }
    );

    const finalImagesData = await finalImagesResponse.json();
    await reorderProductImages(productId, filstarProduct, finalImagesData.images || []);

    stats[category].updated++;
    stats[category].images += uploadedCount;
    await new Promise(resolve => setTimeout(resolve, 1000));

  } catch (error) {
    console.error(` ❌ Error updating product:`, error.message);
  }
}



async function main() {
  console.log('🚀 Starting Filstar clothing import...\n');

  try {
    const allFilstarProducts = await fetchAllProducts();
    const allShopifyProducts = await getAllShopifyProducts();

    const clothingProducts = allFilstarProducts.filter(p => getCategoryType(p) !== null);
    console.log(`\n👕 Found ${clothingProducts.length} clothing products to import\n`);


let currentIndex = 0;
const totalProducts = clothingProducts.length;	  
    for (const filstarProduct of clothingProducts) {
	  currentIndex++;
      const category = getCategoryType(filstarProduct);
      if (!category) continue;

      console.log(`\n${'='.repeat(80)}`);
      console.log(`Processing: ${filstarProduct.name} [${getCategoryName(category)}]`);
	  console.log(`[${currentIndex}/${totalProducts}]`);
      console.log(`${'='.repeat(80)}`);

      const existingProduct = allShopifyProducts.find(sp =>
        sp.variants.some(v => 
          filstarProduct.variants.some(fv => fv.sku === v.sku)
        )
      );

      if (existingProduct) {
        await updateShopifyProduct(existingProduct, filstarProduct, category);
      } else {
        await createShopifyProduct(filstarProduct, category);
      }
    }

 //   await deleteExtraProducts(clothingProducts, allShopifyProducts);

    console.log('\n\n' + '='.repeat(80));
    console.log('📊 FINAL STATISTICS');
    console.log('='.repeat(80));

    Object.keys(stats).forEach(category => {
      const s = stats[category];
      if (s.created > 0 || s.updated > 0) {
        console.log(`\n${getCategoryName(category)}:`);
        console.log(`  ✨ Created: ${s.created}`);
        console.log(`  🔄 Updated: ${s.updated}`);
        console.log(`  📸 Images: ${s.images}`);
      }
    });

    console.log('\n' + '='.repeat(80));
    console.log('✅ Import completed successfully!');
    console.log('='.repeat(80) + '\n');

  } catch (error) {
    console.error('\n❌ Fatal error:', error.message);
    process.exit(1);
  }
}

main();


