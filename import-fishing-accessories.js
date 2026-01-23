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


// 2  част 


// Функция за намиране на продукт в Shopify по SKU
async function findProductBySku(sku) {
  try {
    const query = `
      {
        products(first: 1, query: "sku:${sku}") {
          edges {
            node {
              id
              title
              handle
              images(first: 50) {
                edges {
                  node {
                    id
                    src
                  }
                }
              }
              variants(first: 100) {
                edges {
                  node {
                    id
                    sku
                  }
                }
              }
            }
          }
        }
      }
    `;

    const response = await fetch(
      `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/graphql.json`,
      {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': ACCESS_TOKEN,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query })
      }
    );

    const data = await response.json();
    
    if (data.data?.products?.edges?.length > 0) {
      return data.data.products.edges[0].node;
    }
    
    return null;
  } catch (error) {
    console.error(`  ❌ Error finding product by SKU: ${error.message}`);
    return null;
  }
}

// Функция за добавяне на продукт в колекция
async function addProductToCollection(productId, categoryType) {
  const collectionId = SHOPIFY_ACCESSORIES_COLLECTIONS[categoryType];
  
  if (!collectionId) {
    console.log(`  ⚠️  No collection mapping for category: ${categoryType}`);
    return;
  }

  try {
    const mutation = `
      mutation {
        collectionAddProducts(
          id: "${collectionId}",
          productIds: ["${productId}"]
        ) {
          collection {
            id
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const response = await fetch(
      `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/graphql.json`,
      {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': ACCESS_TOKEN,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query: mutation })
      }
    );

    const data = await response.json();
    
    if (data.data?.collectionAddProducts?.userErrors?.length > 0) {
      console.log(`  ⚠️  Collection errors:`, data.data.collectionAddProducts.userErrors);
    }
  } catch (error) {
    console.error(`  ❌ Error adding to collection: ${error.message}`);
  }
}

// Функция за пренареждане на изображенията
async function reorderProductImages(productGid, images) {
  try {
    const imageIds = images.map(img => `"${img.id}"`).join(', ');
    
    const mutation = `
      mutation {
        productReorderImages(
          id: "${productGid}",
          moves: [${images.map((img, index) => `{
            id: "${img.id}",
            newPosition: "${index}"
          }`).join(', ')}]
        ) {
          product {
            id
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const response = await fetch(
      `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/graphql.json`,
      {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': ACCESS_TOKEN,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query: mutation })
      }
    );

    const data = await response.json();
    
    if (data.data?.productReorderImages?.userErrors?.length > 0) {
      console.log(`  ⚠️  Reorder errors:`, data.data.productReorderImages.userErrors);
      return false;
    }
    
    console.log(`    ✅ Reordered ${images.length} images`);
    return true;
  } catch (error) {
    console.error(`  ❌ Error reordering images: ${error.message}`);
    return false;
  }
}

// Функция за създаване на нов продукт
async function createShopifyProduct(filstarProduct, categoryType) {
  console.log(`\n🆕 Creating: ${filstarProduct.name}`);
  
  try {
    const vendor = filstarProduct.manufacturer || 'Unknown';
    const productType = getCategoryName(categoryType);
    
    // Подготви варианти
    const variants = filstarProduct.variants.map(variant => {
      const variantName = formatVariantName(variant.attributes);
      
      return {
        option1: variantName,
        price: variant.price?.toString() || '0',
        sku: variant.sku,
        barcode: variant.barcode || variant.sku,
        inventory_quantity: parseInt(variant.quantity) || 0,
        inventory_management: 'shopify'
      };
    });

    // Създай продукта
    const productData = {
      product: {
        title: filstarProduct.name,
        body_html: filstarProduct.description || filstarProduct.short_description || '',
        vendor: vendor,
        product_type: productType,
        tags: ['Filstar', categoryType, vendor],
        status: 'active',
        variants: variants,
        options: [
          { name: 'Вариант' }
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
    const productGid = `gid://shopify/Product/${productId}`;
    
    console.log(`  ✅ Created product ID: ${productId}`);
    console.log(`  📦 Created ${variants.length} variants`);

    // Добави в колекция
    await addProductToCollection(productGid, categoryType);

    // Качи и нормализирай изображения
    if (filstarProduct.images && filstarProduct.images.length > 0) {
      console.log(`  🖼️  Processing ${filstarProduct.images.length} images...`);
      
      const uploadedImages = [];
      
      for (const imageUrl of filstarProduct.images) {
        const filename = imageUrl.split('/').pop();
        const normalizedBuffer = await normalizeImage(imageUrl, filstarProduct.variants[0].sku);
        
        if (normalizedBuffer) {
          const resourceUrl = await uploadImageToShopify(normalizedBuffer, filename);
          
          if (resourceUrl) {
            const attachMutation = `
              mutation {
                productCreateMedia(
                  productId: "${productGid}",
                  media: [{
                    originalSource: "${resourceUrl}",
                    mediaContentType: IMAGE
                  }]
                ) {
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
            
            const attachResponse = await fetch(
              `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/graphql.json`,
              {
                method: 'POST',
                headers: {
                  'X-Shopify-Access-Token': ACCESS_TOKEN,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({ query: attachMutation })
              }
            );
            
            const attachData = await attachResponse.json();
            
            if (attachData.data?.productCreateMedia?.media?.[0]) {
              uploadedImages.push(attachData.data.productCreateMedia.media[0]);
              console.log(`    ✓ Uploaded: ${filename}`);
              stats[categoryType].images++;
            }
          }
        }
        
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      console.log(`  ✅ Uploaded ${uploadedImages.length} images`);
    }

    stats[categoryType].created++;
    return result.product;

  } catch (error) {
    console.error(`  ❌ Error creating product: ${error.message}`);
    return null;
  }
}

// Функция за получаване на име на категория
function getCategoryName(categoryType) {
  const names = {
    nets_and_caps: 'Живарници и кепчета',
    slingshots: 'Прашки',
    carp_fishing: 'Аксесоари шарански риболов',
    pike_and_catfish: 'Аксесоари щука и сом',
    pole_and_match: 'Аксесоари щека и мач',
    knives: 'Ножове',
    boxes_and_bags: 'Кутии и калъфи',
    chairs_umbrellas_tents: 'Столове и палатки',
    other: 'Други аксесоари'
  };
  
  return names[categoryType] || 'Аксесоари';
}




