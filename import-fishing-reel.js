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


// Добави тази функция след константите в началото
function convertToGid(numericId) {
  if (typeof numericId === 'string' && numericId.startsWith('gid://')) {
    return numericId; // Вече е в GID формат
  }
  return `gid://shopify/Product/${numericId}`;
}




async function shopifyGraphQL(query, variables = {}) {
  const url = `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/graphql.json`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': ACCESS_TOKEN
    },
    body: JSON.stringify({
      query: query,
      variables: variables
    })
  });
  
  if (!response.ok) {
    throw new Error(`Shopify API error: ${response.status} ${response.statusText}`);
  }
  
  const result = await response.json();
  
  if (result.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
  }
  
  return result.data;
}



function generateTags(filstarProduct) {
  const tags = [];
  
  // Добави марката като таг
  if (filstarProduct.manufacturer) { // ПРОМЯНА: manufacturer вместо brand
    tags.push(filstarProduct.manufacturer);
  }
  
  // Добави категория
  tags.push('Fishing Reel', 'Макара');
  
  // Добави спецификации като тагове
  const specs = filstarProduct.specifications || {};
  
  if (specs.gear_ratio) {
    tags.push(`Gear Ratio ${specs.gear_ratio}`);
  }
  
  if (specs.bearings) {
    tags.push(`${specs.bearings} Bearings`);
  }
  
  // Добави тип спирачка ако има
  if (filstarProduct.drag_type) {
    tags.push(filstarProduct.drag_type);
  }
  
  // Добави серия/модел ако има
  if (filstarProduct.series) {
    tags.push(filstarProduct.series);
  }
  
  return tags.join(', ');
}




function generateDescription(filstarProduct) {
  const specs = filstarProduct.specifications || {};
  
  let html = `<div class="product-description">`;
  html += `<h2>${filstarProduct.name}</h2>`;
  
  if (filstarProduct.description) {
    html += `<p>${filstarProduct.description}</p>`;
  }
  
  html += `<h3>Технически характеристики:</h3>`;
  html += `<ul>`;
  
  if (specs.gear_ratio) html += `<li><strong>Предавателно число:</strong> ${specs.gear_ratio}</li>`;
  if (specs.weight) html += `<li><strong>Тегло:</strong> ${specs.weight}</li>`;
  if (specs.bearings) html += `<li><strong>Лагери:</strong> ${specs.bearings}</li>`;
  if (specs.line_capacity) html += `<li><strong>Капацитет на линия:</strong> ${specs.line_capacity}</li>`;
  if (specs.drag_power) html += `<li><strong>Мощност на спирачката:</strong> ${specs.drag_power}</li>`;
  if (specs.retrieve_rate) html += `<li><strong>Скорост на намотаване:</strong> ${specs.retrieve_rate}</li>`;
  
  html += `</ul>`;
  
  if (filstarProduct.brand) {
    html += `<p><strong>Марка:</strong> ${filstarProduct.brand}</p>`;
  }
  
  html += `</div>`;
  
  return html;
}









// суров апи за тест
// Debug функция - добави я в началото на файла
function debugProductImages(filstarProduct) {
  console.log('\n🔍 RAW FILSTAR PRODUCT DATA:');
  console.log(JSON.stringify(filstarProduct, null, 2));
  console.log('\n');
}


async function addProductImages(productId, imageUrls) {
  if (!imageUrls || imageUrls.length === 0) {
    console.log('  ⚠️ No images to add');
    return;
  }

  try {
    console.log(`  📸 Adding ${imageUrls.length} images to product...`);
    
    const media = imageUrls.map(url => ({
      originalSource: url,
      mediaContentType: 'IMAGE'
    }));

    const mutation = `
      mutation productCreateMedia($media: [CreateMediaInput!]!, $productId: ID!) {
        productCreateMedia(media: $media, productId: $productId) {
          media {
            ... on MediaImage {
              id
              image {
                url
              }
            }
          }
          mediaUserErrors {
            field
            message
          }
          product {
            id
          }
        }
      }
    `;

    const response = await shopifyGraphQL(mutation, {
      productId: productId,
      media: media
    });

    if (response.productCreateMedia.mediaUserErrors.length > 0) {
      console.error('  ❌ Errors adding images:', response.productCreateMedia.mediaUserErrors);
      return;
    }

    console.log(`  ✓ Added ${response.productCreateMedia.media.length} images`);
    
    // Изчакай малко преди refresh
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Refresh product images
    console.log('  🔄 Refreshing product images after upload...');
    const refreshedProduct = await getProductById(productId);
    const imageCount = refreshedProduct?.images?.edges?.length || 0;
    console.log(`  ✓ Refreshed ${imageCount} images`);
    
  } catch (error) {
    console.error('  ❌ Error adding images:', error.message);
    throw error;
  }
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
      console.log(`    ⚠️ Failed to fetch page: ${response.status}`);
      return null;
    }
    
    const html = await response.text();
    
    // Търси Open Graph image (og:image)
    const ogImageMatch = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i);
    if (ogImageMatch) {
      const imageUrl = ogImageMatch[1];
      console.log(`    ✓ Found OG image: ${getImageFilename(imageUrl)}`);
      return imageUrl;
    }
    
    console.log(`    ⚠️ No main image found in HTML`);
    return null;
  } catch (error) {
    console.log(`    ⚠️ Error fetching page: ${error.message}`);
    return null;
  }
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

async function updateProduct(shopifyProduct, filstarProduct) {
  try {
    console.log(`\n📝 Updating product: ${shopifyProduct.title}`);
    
    const productData = {
      id: convertToGid(shopifyProduct.id),
      title: filstarProduct.name,
      descriptionHtml: generateDescription(filstarProduct),
      vendor: filstarProduct.manufacturer || 'Unknown', // ПРОМЯНА: manufacturer вместо brand
      productType: 'Fishing Reel',
      tags: generateTags(filstarProduct)
    };

    const mutation = `
      mutation updateProduct($input: ProductInput!) {
        productUpdate(input: $input) {
          product {
            id
            title
            images(first: 10) {
              edges {
                node {
                  id
                  url
                }
              }
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const response = await shopifyGraphQL(mutation, { input: productData });
    
    if (response.productUpdate.userErrors.length > 0) {
      console.error('❌ Errors updating product:', response.productUpdate.userErrors);
      return null;
    }
    
    console.log('✓ Product updated successfully');
    return response.productUpdate.product;
    
  } catch (error) {
    console.error('❌ Error in updateProduct:', error.message);
    throw error;
  }
}

async function processProduct(filstarProduct, categoryType, cachedShopifyProducts) {
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`📦 Processing: ${filstarProduct.name}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  if (!categoryType || typeof categoryType !== 'string') {
    console.log(`  ⚠️ Invalid categoryType: ${categoryType}, using "other"`);
    categoryType = 'other';
  }

  if (!stats[categoryType]) {
    console.log(`  ⚠️ Unknown category: ${categoryType}, using "other"`);
    categoryType = 'other';
  }

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
    let productId;
    
    if (shopifyProduct) {
      await updateProduct(shopifyProduct, filstarProduct, categoryType);
      productId = shopifyProduct.id;
    } else {
      const newProduct = await createShopifyProduct(filstarProduct, categoryType);
      productId = newProduct.id;
      stats[categoryType].created++;
    }
    
    console.log('📸 Checking images...');
    const numericId = productId.toString().replace(/\D/g, '');
    
    const currentProduct = cachedShopifyProducts.find(p => p.id.toString() === numericId);
    const existingImages = currentProduct?.images || [];
    
    let uploadedCount = 0;
    const allImageUrls = [];
    
    if (filstarProduct.image) allImageUrls.push(filstarProduct.image);
    if (filstarProduct.images) allImageUrls.push(...filstarProduct.images);
    if (filstarProduct.variants) {
      filstarProduct.variants.forEach(v => {
        if (v.image) allImageUrls.push(v.image);
      });
    }
    
    for (const url of allImageUrls) {
      let fullUrl = url.startsWith('http') ? url : `${FILSTAR_BASE_URL}/${url}`;
      fullUrl = fullUrl.replace(/([^:])\/\//g, '$1/'); // Поправи двойни //
      const uploaded = await uploadProductImage(numericId, fullUrl, existingImages);
      if (uploaded) uploadedCount++;
    }
    
    if (uploadedCount > 0) {
      stats[categoryType].images += uploadedCount;
      console.log(`  ✅ Uploaded ${uploadedCount} new images`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    // Винаги прави reorder ако има снимки
    if (existingImages.length > 0 || uploadedCount > 0) {
      const refreshResponse = await fetch(
        `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/products/${numericId}.json?fields=id,images`,
        {
          headers: {
            'X-Shopify-Access-Token': ACCESS_TOKEN,
            'Content-Type': 'application/json'
          }
        }
      );
      
      const refreshedData = await refreshResponse.json();
      const refreshedImages = refreshedData.product?.images || [];
      
      console.log(`  🔄 Found ${refreshedImages.length} total images`);
      await reorderProductImages(numericId, filstarProduct, refreshedImages);
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
      
      // КОРИГИРАН КОД: Намери категорията на текущата макара
      const categoryType = Object.keys(categorizedReels).find(cat => 
        categorizedReels[cat].includes(reel)
      ) || 'other';
      
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

main();

