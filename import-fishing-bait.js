// ============================================
// FILSTAR BAIT IMPORT SCRIPT - PART 1/3
// ============================================

const axios = require('axios');
const sharp = require('sharp');
const fs = require('fs').promises;
const path = require('path');

// ============================================
// КОНФИГУРАЦИЯ
// ============================================

const CONFIG = {
  shopify: {
    domain: 'carplandia.myshopify.com',
    accessToken: 'YOUR_SHOPIFY_ACCESS_TOKEN',
    apiVersion: '2024-01'
  },
  filstar: {
    baseUrl: 'https://www.filstar.bg/api',
    apiKey: 'YOUR_FILSTAR_API_KEY'
  },
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


