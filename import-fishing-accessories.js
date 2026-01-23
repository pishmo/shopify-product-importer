// import-fishing-accessories.js - Импорт на аксесоари от Filstar API
const fetch = require('node-fetch');
const sharp = require('sharp');
const fs = require('fs').promises;
const path = require('path');

const SHOPIFY_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const FILSTAR_TOKEN = process.env.FILSTAR_API_TOKEN;
const API_VERSION = '2024-10';
const FILSTAR_API_BASE = 'https://filstar.com/api';

// Filstar category IDs за аксесоари
const FILSTAR_ACCESSORIES_CATEGORY_IDS = {
  nets_and_caps: ['17'],
  slingshots: ['26'],
  carp_fishing: ['37'],
  pike_and_catfish: ['45'],
  pole_and_match: ['50'],
  knives: ['59'],
  boxes_and_bags: ['61'],
  chairs_umbrellas_tents: ['63'],
  other: ['68']
};

const ACCESSORIES_PARENT_ID = '11';

// Shopify collection IDs
const SHOPIFY_ACCESSORIES_COLLECTIONS = {
  nets_and_caps: 'gid://shopify/Collection/739661087102',
  slingshots: 'gid://shopify/Collection/739661119870',
  carp_fishing: 'gid://shopify/Collection/739661152638',
  pike_and_catfish: 'gid://shopify/Collection/739661185406',
  pole_and_match: 'gid://shopify/Collection/739661218174',
  knives: 'gid://shopify/Collection/739661250942',
  boxes_and_bags: 'gid://shopify/Collection/739661316478',
  chairs_umbrellas_tents: 'gid://shopify/Collection/739661414782',
  other: 'gid://shopify/Collection/739661447550'
};

// Статистика
const stats = {
  nets_and_caps: { created: 0, updated: 0, images: 0 },
  slingshots: { created: 0, updated: 0, images: 0 },
  carp_fishing: { created: 0, updated: 0, images: 0 },
  pike_and_catfish: { created: 0, updated: 0, images: 0 },
  pole_and_match: { created: 0, updated: 0, images: 0 },
  knives: { created: 0, updated: 0, images: 0 },
  boxes_and_bags: { created: 0, updated: 0, images: 0 },
  chairs_umbrellas_tents: { created: 0, updated: 0, images: 0 },
  other: { created: 0, updated: 0, images: 0 }
};

// TEST MODE - само за 1 категория
const TEST_MODE = true;
const TEST_CATEGORY = 'nets_and_caps';

// Функция за нормализация на изображения
async function normalizeImage(imageUrl, sku) {
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) throw new Error(`Failed to fetch image: ${response.status}`);
    
    const buffer = await response.buffer();
    const tempDir = path.join(__dirname, 'temp');
    
    try {
      await fs.access(tempDir);
    } catch {
      await fs.mkdir(tempDir, { recursive: true });
    }
    
    const filename = `${sku}_${Date.now()}.jpg`;
    const outputPath = path.join(tempDir, filename);
    
    await sharp(buffer)
      .resize(1200, 1000, {
        fit: 'contain',
        background: { r: 255, g: 255, b: 255, alpha: 1 }
      })
      .jpeg({ quality: 90 })
      .toFile(outputPath);
    
    const normalizedBuffer = await fs.readFile(outputPath);
    await fs.unlink(outputPath);
    
    return normalizedBuffer;
  } catch (error) {
    console.error(`  ❌ Error normalizing image: ${error.message}`);
    return null;
  }
}

// Функция за качване на изображение в Shopify
async function uploadImageToShopify(imageBuffer, filename) {
  try {
    const base64Image = imageBuffer.toString('base64');
    
    const stagedUploadMutation = `
      mutation {
        stagedUploadsCreate(input: [{
          resource: IMAGE,
          filename: "${filename}",
          mimeType: "image/jpeg",
          httpMethod: POST
        }]) {
          stagedTargets {
            url
            resourceUrl
            parameters {
              name
              value
            }
          }
        }
      }
    `;
    
    const stagedResponse = await fetch(
      `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/graphql.json`,
      {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': ACCESS_TOKEN,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query: stagedUploadMutation })
      }
    );
    
    const stagedData = await stagedResponse.json();
    const stagedTarget = stagedData.data.stagedUploadsCreate.stagedTargets[0];
    
    const formData = new (require('form-data'))();
    stagedTarget.parameters.forEach(param => {
      formData.append(param.name, param.value);
    });
    formData.append('file', imageBuffer, { filename });
    
    await fetch(stagedTarget.url, {
      method: 'POST',
      body: formData
    });
    
    return stagedTarget.resourceUrl;
  } catch (error) {
    console.error(`  ❌ Error uploading image: ${error.message}`);
    return null;
  }
}

// Функция за форматиране на име на вариант
function formatVariantName(attributes) {
  if (!attributes || attributes.length === 0) {
    return 'Стандартен';
  }
  
  return attributes
    .map(attr => `${attr.attribute_name} ${attr.value}`)
    .join(' / ');
}

// Функция за определяне на типа аксесоар
function getCategoryType(product) {
  if (!product.categories || product.categories.length === 0) {
    return 'other';
  }
  
  for (const category of product.categories) {
    const categoryId = category.id?.toString();
    
    for (const [type, ids] of Object.entries(FILSTAR_ACCESSORIES_CATEGORY_IDS)) {
      if (ids.includes(categoryId)) {
        return type;
      }
    }
  }
  
  return 'other';
}

// Функция за извличане на всички продукти от Filstar
async function fetchAllProducts() {
  console.log('📦 Fetching all products from Filstar API with pagination...\n');
  let allProducts = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    console.log(`Fetching page ${page}...`);
    
    try {
      const response = await fetch(
        `${FILSTAR_API_BASE}/products?page=${page}&limit=1000`,
        {
          headers: {
            'Authorization': `Bearer ${FILSTAR_TOKEN}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      if (data && data.length > 0) {
        allProducts = allProducts.concat(data);
        console.log(`  ✓ Page ${page}: ${data.length} products`);
        page++;
        hasMore = data.length > 0;
        
        if (page > 10) {
          console.log('  ⚠️  Safety limit reached (10 pages)');
          hasMore = false;
        }
      } else {
        hasMore = false;
      }

      await new Promise(resolve => setTimeout(resolve, 500));
      
    } catch (error) {
      console.error(`  ❌ Error fetching page ${page}:`, error.message);
      hasMore = false;
    }
  }

  console.log(`\n✅ Total products fetched: ${allProducts.length}\n`);
  return allProducts;
}
