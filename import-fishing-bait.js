// ============================================
// FILSTAR BAIT IMPORT SCRIPT - PART 1/3
// ============================================

const fetch = require('node-fetch');
const sharp = require('sharp');

const SHOPIFY_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const FILSTAR_TOKEN = process.env.FILSTAR_API_TOKEN;
const API_VERSION = '2024-10';
const FILSTAR_API_BASE = 'https://filstar.com/api';
const FILSTAR_BASE_URL = 'https://filstar.com';

// ============================================
// КОНФИГУРАЦИЯ
// ============================================

const CONFIG = {
  image: {
    targetWidth: 1200,
    targetHeight: 1000,
    background: { r: 255, g: 255, b: 255, alpha: 1 }
  }
};

// ============================================
// МАПИНГ КАТЕГОРИИ
// ============================================

const COLLECTION_MAPPING = {
  66: 'gid://shopify/Collection/YOUR_COLLECTION_ID', // Захранка
  69: 'gid://shopify/Collection/YOUR_COLLECTION_ID', // Бойли и пелети
  71: 'gid://shopify/Collection/YOUR_COLLECTION_ID', // Добавки
  73: 'gid://shopify/Collection/YOUR_COLLECTION_ID', // Семена
  75: 'gid://shopify/Collection/YOUR_COLLECTION_ID', // Пасти
  77: 'gid://shopify/Collection/YOUR_COLLECTION_ID'  // Други Захранки
};

const FILSTAR_CATEGORIES = [66, 69, 71, 73, 75, 77];

// ============================================
// СТАТИСТИКА
// ============================================

const stats = {
  productsCreated: 0,
  productsUpdated: 0,
  productsSkipped: 0,
  imagesUploaded: 0,
  errors: []
};

// ============================================
// HELPER FUNCTIONS
// ============================================

function formatCategoryName(categoryId) {
  const names = {
    66: 'Захранка',
    69: 'Бойли и пелети',
    71: 'Добавки',
    73: 'Семена',
    75: 'Пасти',
    77: 'Други Захранки'
  };
  return names[categoryId] || 'Неизвестна категория';
}

function cleanFilename(filename) {
  if (!filename) return '';
  return filename
    .replace(/\.(jpg|jpeg|png|gif|webp)$/i, '')
    .replace(/[_-]/g, ' ')
    .trim();
}

function extractSkuFromFilename(filename) {
  if (!filename) return null;
  const match = filename.match(/(\d{6,})/);
  return match ? match[1] : null;
}

// ============================================
// ФОРМАТ НА ВАРИАНТИ
// ============================================

function formatVariantTitle(variant) {
  const parts = [variant.sku];
  
  if (variant.attributes && variant.attributes.length > 0) {
    variant.attributes.forEach(attr => {
      if (attr.attribute_name && attr.value) {
        parts.push(`${attr.attribute_name}: ${attr.value}`);
      }
    });
  }
  
  return parts.join(' / ');
}


// 2 част 

// ============================================
// IMAGE PROCESSING
// ============================================

async function normalizeImage(imageUrl) {
  try {
    const response = await axios.get(imageUrl, { 
      responseType: 'arraybuffer',
      timeout: 30000 
    });
    
    const image = sharp(response.data);
    const metadata = await image.metadata();
    
    const scale = Math.min(
      CONFIG.image.targetWidth / metadata.width,
      CONFIG.image.targetHeight / metadata.height
    );
    
    const newWidth = Math.round(metadata.width * scale);
    const newHeight = Math.round(metadata.height * scale);
    
    const normalized = await image
      .resize(newWidth, newHeight, { fit: 'inside' })
      .extend({
        top: Math.floor((CONFIG.image.targetHeight - newHeight) / 2),
        bottom: Math.ceil((CONFIG.image.targetHeight - newHeight) / 2),
        left: Math.floor((CONFIG.image.targetWidth - newWidth) / 2),
        right: Math.ceil((CONFIG.image.targetWidth - newWidth) / 2),
        background: CONFIG.image.background
      })
      .jpeg({ quality: 90 })
      .toBuffer();
    
    return normalized;
  } catch (error) {
    console.error(`Грешка при нормализация на изображение ${imageUrl}:`, error.message);
    return null;
  }
}

// ============================================
// SHOPIFY API FUNCTIONS
// ============================================

async function shopifyRequest(query, variables = {}) {
  try {
    const response = await axios.post(
      `https://${CONFIG.shopify.domain}/admin/api/${CONFIG.shopify.apiVersion}/graphql.json`,
      { query, variables },
      {
        headers: {
          'X-Shopify-Access-Token': CONFIG.shopify.accessToken,
          'Content-Type': 'application/json'
        }
      }
    );
    
    if (response.data.errors) {
      throw new Error(JSON.stringify(response.data.errors));
    }
    
    return response.data.data;
  } catch (error) {
    console.error('Shopify API грешка:', error.message);
    throw error;
  }
}

async function findProductBySku(sku) {
  const query = `
    query findProduct($query: String!) {
      products(first: 1, query: $query) {
        edges {
          node {
            id
            title
            variants(first: 100) {
              edges {
                node {
                  id
                  sku
                }
              }
            }
            images(first: 250) {
              edges {
                node {
                  id
                  url
                }
              }
            }
          }
        }
      }
    }
  `;
  
  const data = await shopifyRequest(query, { query: `sku:${sku}` });
  return data.products.edges[0]?.node || null;
}

async function createProduct(productData) {
  const mutation = `
    mutation createProduct($input: ProductInput!) {
      productCreate(input: $input) {
        product {
          id
          title
        }
        userErrors {
          field
          message
        }
      }
    }
  `;
  
  const data = await shopifyRequest(mutation, { input: productData });
  
  if (data.productCreate.userErrors.length > 0) {
    throw new Error(JSON.stringify(data.productCreate.userErrors));
  }
  
  return data.productCreate.product;
}

async function updateProduct(productId, productData) {
  const mutation = `
    mutation updateProduct($input: ProductInput!) {
      productUpdate(input: $input) {
        product {
          id
          title
        }
        userErrors {
          field
          message
        }
      }
    }
  `;
  
  productData.id = productId;
  const data = await shopifyRequest(mutation, { input: productData });
  
  if (data.productUpdate.userErrors.length > 0) {
    throw new Error(JSON.stringify(data.productUpdate.userErrors));
  }
  
  return data.productUpdate.product;
}

async function uploadImage(productId, imageBuffer, filename, altText = '') {
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
      }
    }
  `;
  
  const base64Image = imageBuffer.toString('base64');
  
  const media = [{
    originalSource: `data:image/jpeg;base64,${base64Image}`,
    alt: altText,
    mediaContentType: 'IMAGE'
  }];
  
  const data = await shopifyRequest(mutation, { 
    productId, 
    media 
  });
  
  if (data.productCreateMedia.mediaUserErrors.length > 0) {
    throw new Error(JSON.stringify(data.productCreateMedia.mediaUserErrors));
  }
  
  return data.productCreateMedia.media[0];
}

async function reorderImages(productId, imageIds) {
  const mutation = `
    mutation productReorderMedia($id: ID!, $moves: [MoveInput!]!) {
      productReorderMedia(id: $id, moves: $moves) {
        userErrors {
          field
          message
        }
      }
    }
  `;
  
  const moves = imageIds.map((id, index) => ({
    id,
    newPosition: index.toString()
  }));
  
  await shopifyRequest(mutation, { id: productId, moves });
}
  // 3 част

// ============================================
// FILSTAR API FUNCTIONS
// ============================================

async function fetchFilstarProducts(categoryId, page = 1) {
  try {
    const response = await axios.get(`${CONFIG.filstar.baseUrl}/products`, {
      params: {
        api_key: CONFIG.filstar.apiKey,
        category_id: categoryId,
        page: page,
        limit: 50
      },
      timeout: 30000
    });
    
    return response.data;
  } catch (error) {
    console.error(`Грешка при извличане на продукти от категория ${categoryId}:`, error.message);
    return null;
  }
}

async function getAllFilstarProducts(categoryId) {
  let allProducts = [];
  let page = 1;
  let hasMore = true;
  
  while (hasMore) {
    console.log(`Зареждане на страница ${page} от категория ${formatCategoryName(categoryId)}...`);
    const response = await fetchFilstarProducts(categoryId, page);
    
    if (!response || !response.products || response.products.length === 0) {
      hasMore = false;
      break;
    }
    
    allProducts = allProducts.concat(response.products);
    hasMore = response.pagination?.has_next || false;
    page++;
    
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  
  console.log(`✓ Заредени ${allProducts.length} продукта от ${formatCategoryName(categoryId)}`);
  return allProducts;
}

// ============================================
// MAIN IMPORT LOGIC
// ============================================

async function processProduct(filstarProduct, categoryId) {
  try {
    const sku = filstarProduct.sku || filstarProduct.id.toString();
    console.log(`\nОбработка: ${filstarProduct.name} (SKU: ${sku})`);
    
    const existingProduct = await findProductBySku(sku);
    
    const variants = filstarProduct.variants.map(variant => ({
      sku: variant.sku,
      price: variant.price,
      inventoryPolicy: 'DENY',
      inventoryManagement: 'SHOPIFY',
      inventoryQuantities: [{
        availableQuantity: variant.quantity || 0,
        locationId: 'gid://shopify/Location/YOUR_LOCATION_ID'
      }],
      barcode: variant.barcode || '',
      option1: formatVariantTitle(variant)
    }));
    
    const productData = {
      title: filstarProduct.name,
      descriptionHtml: filstarProduct.description || '',
      vendor: filstarProduct.manufacturer || 'Filstar',
      productType: formatCategoryName(categoryId),
      tags: ['Захранка', formatCategoryName(categoryId)],
      status: 'ACTIVE',
      variants: variants,
      collectionsToJoin: [COLLECTION_MAPPING[categoryId]]
    };
    
    let product;
    
    if (existingProduct) {
      console.log('→ Актуализация на съществуващ продукт');
      product = await updateProduct(existingProduct.id, productData);
      stats.productsUpdated++;
    } else {
      console.log('→ Създаване на нов продукт');
      product = await createProduct(productData);
      stats.productsCreated++;
    }
    
    if (filstarProduct.images && filstarProduct.images.length > 0) {
      console.log(`→ Обработка на ${filstarProduct.images.length} изображения`);
      
      const uploadedImageIds = [];
      
      for (const image of filstarProduct.images) {
        try {
          const normalizedBuffer = await normalizeImage(image.url);
          
          if (normalizedBuffer) {
            const filename = cleanFilename(image.filename || path.basename(image.url));
            const uploadedImage = await uploadImage(
              product.id,
              normalizedBuffer,
              filename,
              filstarProduct.name
            );
            
            uploadedImageIds.push(uploadedImage.id);
            stats.imagesUploaded++;
          }
        } catch (imgError) {
          console.error(`  ✗ Грешка при изображение:`, imgError.message);
        }
      }
      
      if (uploadedImageIds.length > 0) {
        await reorderImages(product.id, uploadedImageIds);
      }
    }
    
    console.log(`✓ Завършен`);
    await new Promise(resolve => setTimeout(resolve, 500));
    
  } catch (error) {
    console.error(`✗ Грешка при ${filstarProduct.name}:`, error.message);
    stats.errors.push({
      product: filstarProduct.name,
      sku: filstarProduct.sku,
      error: error.message
    });
    stats.productsSkipped++;
  }
}

async function importBaits() {
  console.log('\n============================================');
  console.log('  ИМПОРТ НА ЗАХРАНКИ ОТ FILSTAR');
  console.log('============================================\n');
  
  const startTime = Date.now();
  
  for (const categoryId of FILSTAR_CATEGORIES) {
    console.log(`\n┌─ ${formatCategoryName(categoryId)} (ID: ${categoryId}) ─┐\n`);
    
    const products = await getAllFilstarProducts(categoryId);
    
    if (products.length === 0) {
      console.log('└─ Няма продукти ─┘\n');
      continue;
    }
    
    for (let i = 0; i < products.length; i++) {
      console.log(`\n[${i + 1}/${products.length}]`);
      await processProduct(products[i], categoryId);
    }
    
    console.log(`\n└─ Завършена категория ─┘\n`);
  }
  
  const duration = ((Date.now() - startTime) / 1000 / 60).toFixed(2);
  
  console.log('\n============================================');
  console.log('  ФИНАЛНА СТАТИСТИКА');
  console.log('============================================');
  console.log(`Време: ${duration} минути`);
  console.log(`Създадени: ${stats.productsCreated}`);
  console.log(`Актуализирани: ${stats.productsUpdated}`);
  console.log(`Пропуснати: ${stats.productsSkipped}`);
  console.log(`Изображения: ${stats.imagesUploaded}`);
  console.log(`Грешки: ${stats.errors.length}`);
  
  if (stats.errors.length > 0) {
    console.log('\n--- ГРЕШКИ ---');
    stats.errors.forEach((err, idx) => {
      console.log(`${idx + 1}. ${err.product} (${err.sku}): ${err.error}`);
    });
  }
  
  console.log('\n============================================\n');
}

// ============================================
// START
// ============================================

importBaits().catch(error => {
  console.error('\n✗ КРИТИЧНА ГРЕШКА:', error);
  process.exit(1);
});


