// import-fishing-accessories.js - Импорт на аксесоари от Filstar API
const fetch = require('node-fetch');
const sharp = require('sharp');
const fs = require('fs').promises;
const path = require('path');

const SHOPIFY_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const FILSTAR_TOKEN = process.env.FILSTAR_API_TOKEN;
const API_VERSION = '2025-01';
const FILSTAR_API_BASE = 'https://filstar.com/api';
const FILSTAR_BASE_URL = 'https://filstar.com';
// Filstar category IDs за аксесоари - САМО 4 КАТЕГОРИИ
const FILSTAR_ACCESSORIES_CATEGORY_IDS = {
  pike_and_catfish: ['45'],
  pole_and_match: ['50'],
  knives: ['59'],
  chairs_umbrellas_tents: ['63']
};

const ACCESSORIES_PARENT_ID = '11';

// Shopify collection IDs - САМО 4 КАТЕГОРИИ
const SHOPIFY_ACCESSORIES_COLLECTIONS = {
  pike_and_catfish: 'gid://shopify/Collection/739661185406',
  pole_and_match: 'gid://shopify/Collection/739661218174',
  knives: 'gid://shopify/Collection/739661250942',
  chairs_umbrellas_tents: 'gid://shopify/Collection/739661414782'
};

// Статистика - САМО 4 КАТЕГОРИИ
const stats = {
  pike_and_catfish: { created: 0, updated: 0, images: 0 },
  pole_and_match: { created: 0, updated: 0, images: 0 },
  knives: { created: 0, updated: 0, images: 0 },
  chairs_umbrellas_tents: { created: 0, updated: 0, images: 0 }
};

// TEST MODE
const TEST_MODE = false;
const TEST_CATEGORY = 'knives';



// 2 част

// Функция за извличане на чист filename от URL
function getImageFilename(src) {
  if (!src || typeof src !== 'string') return null;
  
  const urlParts = src.split('/').pop();
  const withoutQuery = urlParts.split('?')[0];
  
  // Премахва Shopify UUID
  const uuidPattern = /_[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}(\.[a-z]+)?$/i;
  let cleanFilename = withoutQuery.replace(uuidPattern, '$1');
  
 // Премахва Filstar hex hash-ове (32+ char hex strings)
const parts = cleanFilename.split('_');
const cleanParts = parts.filter(part => {
  const partWithoutExt = part.split('.')[0];
  const isHex = partWithoutExt.length >= 32 && /^[a-f0-9]+$/i.test(partWithoutExt);
  return !isHex;
});
const extension = cleanFilename.split('.').pop();
cleanFilename = cleanParts.join('_') + '.' + extension;

  cleanFilename = cleanFilename.replace(/^_+/, '');
  return cleanFilename;
}



function imageExists(existingImages, newImageUrl) {
  if (!existingImages || !Array.isArray(existingImages) || existingImages.length === 0) {
    return false;
  }
  
  const newFilename = getImageFilename(newImageUrl);
  console.log(`   🔍 DEBUG: New image from Filstar: ${newImageUrl}`);
  console.log(`   🔍 DEBUG: Clean new filename: ${newFilename}`);
  
  if (!newFilename) {
    return false;
  }
  
  const found = existingImages.some(img => {
    const imgSrc = img.src || img.url || img;
    const existingFilename = getImageFilename(imgSrc);
    console.log(`   🔍 DEBUG: Comparing with existing: ${imgSrc} -> ${existingFilename}`);
    const match = existingFilename && existingFilename === newFilename;
    if (match) console.log(`   ✅ DEBUG: MATCH FOUND!`);
    return match;
  });
  
  console.log(`   🔍 DEBUG: Result: ${found ? 'EXISTS' : 'NEW IMAGE'}\n`);
  return found;
}






// Функция за извличане на SKU от filename
function extractSkuFromImageFilename(filename) {
  if (!filename || typeof filename !== 'string') return '999999';
  
  const match = filename.match(/^(\d+)/);
  if (match && match[1]) return match[1];
  
  const altMatch = filename.match(/[-_](\d{6,})/);
  if (altMatch && altMatch[1]) return altMatch[1];
  
  return '999999';
}



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
          filename: \"${filename}\",
          mimeType: \"image/jpeg\",
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


async function scrapeOgImage(productSlug) {
  if (!productSlug) {
    console.log('   🐛 DEBUG: No product slug provided');
    return null;
  }
  
  try {
    const url = `${FILSTAR_BASE_URL}/${productSlug}`;
    console.log(`   🐛 DEBUG: Scraping OG image from: ${url}`);
    
    const response = await fetch(url);
    if (!response.ok) {
      console.log(`   🐛 DEBUG: Failed to fetch page: ${response.status}`);
      return null;
    }
    
    const html = await response.text();
    console.log(`   🐛 DEBUG: HTML length: ${html.length} chars`);
    console.log(`   🐛 DEBUG: Searching for og:image meta tag...`);
    
    const match = html.match(/<meta property="og:image" content="([^"]+)"/);
    
    if (match && match[1]) {
      const fullUrl = match[1];
      const filename = fullUrl.split('/').pop();
      console.log(`   🐛 DEBUG: OG image full URL: ${fullUrl}`);
      console.log(`   🐛 DEBUG: OG image filename: ${filename}`);
      return fullUrl;
    } else {
      console.log('   🐛 DEBUG: No OG image meta tag found in HTML');
      return null;
    }
  } catch (error) {
    console.error(`   🐛 DEBUG: Error scraping OG image: ${error.message}`);
    return null;
  }
}



// ПОПРАВЕНА функция за форматиране на име на вариант
function formatVariantName(attributes, sku) {
  if (!attributes || attributes.length === 0) {
    return sku || 'Стандартен';
  }
  
  // Филтрирай атрибути започващи с "Аксесоари" или други категорийни имена
  const filtered = attributes.filter(attr => {
    const name = attr.attribute_name || '';
    
    // Премахни всички атрибути започващи с "Аксесоари"
    if (name.startsWith('Аксесоари') || name.startsWith('АКСЕСОАРИ')) {
      return false;
    }
    
    // Премахни други категорийни имена
    const excludeList = [
      'ЖИВАРНИЦИ И КЕПЧЕТА',
      'ПРАШКИ',
      'НОЖОВЕ',
      'КУТИИ, КОШЧЕТА И КАЛЪФИ',
      'Раници, чанти, кошчета и кофи',
      'СТОЛОВЕ И ПАЛАТКИ',
      'ДРУГИ', 'Други',
      'МУХАРСКИ РУБОЛОВ',
      'ШАРАНСКИ РИБОЛОВ', 'Фидери',
      'РИБОЛОВ С ЩЕКА И МАЧ',  // ← ДОБАВЕНО
      'ЩЕКА И МАЧ'              // ← ДОБАВЕНО (вариация)
    ];
    
    return !excludeList.includes(name);
  });
  
  if (filtered.length === 0) {
    return sku || 'Стандартен';
  }
  
  // Търси "МОДЕЛ" атрибут
  const modelAttr = filtered.find(attr => attr.attribute_name?.toUpperCase().includes('МОДЕЛ'));
  const otherAttrs = filtered.filter(attr => !attr.attribute_name?.toUpperCase().includes('МОДЕЛ'));
  
  const parts = [];
  if (modelAttr) {
    parts.push(`${modelAttr.attribute_name} ${modelAttr.value}`);
  }
  otherAttrs.forEach(attr => {
    parts.push(`${attr.attribute_name} ${attr.value}`);
  });
  
  // Съедини частите
  let result = parts.join(' / ');
  
  // Премахни "/" от началото и края
  result = result.replace(/^\/+|\/+$/g, '').trim();
  
  // Ако е празно след филтъра, използвай SKU
  if (!result || result === '') {
    return sku || 'Стандартен';
  }
  
  return result;
}



// Функция за определяне на типа аксесоар
function getCategoryType(product) {
  if (!product.categories || product.categories.length === 0) {
    return null;
  }
  
  for (const category of product.categories) {
    const categoryId = category.id?.toString();
    
    for (const [type, ids] of Object.entries(FILSTAR_ACCESSORIES_CATEGORY_IDS)) {
      if (ids.includes(categoryId)) {
        return type;
      }
    }
  }
  
  return null;
}

// Функция за получаване на име на категория
function getCategoryName(categoryType) {
  const names = {
    pike_and_catfish: 'Аксесоари щука и сом',
    pole_and_match: 'Аксесоари щека и мач',
    knives: 'Ножове',
    chairs_umbrellas_tents: 'Столове и палатки'
  };
  
  return names[categoryType] || 'Аксесоари';
}





// 3 та част




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

// Функция за намиране на продукт в Shopify по SKU
async function findProductBySku(sku) {
  try {
    const query = `
      {
        products(first: 1, query: \"sku:${sku}\") {
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
          id: \"${collectionId}\",
          productIds: [\"${productId}\"]
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
    const productId = productGid.replace('gid://shopify/Product/', '');
    
    const reorderedImages = images.map((img, index) => ({
      id: img.id.replace('gid://shopify/ProductImage/', ''),
      position: index + 1
    }));

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
      console.log(`  🐛 Reorder error: ${response.status} - ${errorText}`);
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
// Функция за създаване на нов продукт
async function createShopifyProduct(filstarProduct, categoryType) {
  console.log(`\n🆕 Creating: ${filstarProduct.name}`);
  
  try {
    const vendor = filstarProduct.manufacturer || 'Unknown';
    console.log(` 🏷️ Manufacturer: ${filstarProduct.manufacturer} → Vendor: ${vendor}`);
    
    const productType = getCategoryName(categoryType);
    
    // Подготви варианти с поправено форматиране
    const variants = filstarProduct.variants.map(variant => {
      const variantName = formatVariantName(variant.attributes, variant.sku);
      
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
                  productId: \"${productGid}\",
                  media: [{
                    originalSource: \"${resourceUrl}\",
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
      
      // Reorder images - премести OG image на първо място
      if (uploadedImages.length > 0) {
        const updatedProductQuery = `
          {
            product(id: \"${productGid}\") {
              images(first: 50) {
                edges {
                  node {
                    id
                    src
                  }
                }
              }
            }
          }
        `;
        
        const updatedResponse = await fetch(
          `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/graphql.json`,
          {
            method: 'POST',
            headers: {
              'X-Shopify-Access-Token': ACCESS_TOKEN,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ query: updatedProductQuery })
          }
        );
        
        const updatedData = await updatedResponse.json();
        const allImages = updatedData.data?.product?.images?.edges?.map(edge => ({
          id: edge.node.id,
          src: edge.node.src
        })) || [];
        
        if (allImages.length > 0) {
          console.log(`  🔄 Reordering images...`);
          
          const ogImage = await scrapeOgImage(filstarProduct.slug);
          
          if (ogImage) {
            const ogFilename = ogImage.split('/').pop();
            
            const ogIndex = allImages.findIndex(img => {
              const shopifyFilename = img.src.split('/').pop().split('?')[0];
              const ogFilenameClean = ogFilename.split('?')[0];
              const matches = shopifyFilename === ogFilenameClean || 
                              shopifyFilename.includes(ogFilenameClean) ||
                              ogFilenameClean.includes(shopifyFilename);
              return matches;
            });
            
            if (ogIndex > 0) {
              const [ogImg] = allImages.splice(ogIndex, 1);
              allImages.unshift(ogImg);
              console.log(`  ✅ Moved OG image to first position`);
              await reorderProductImages(productGid, allImages);
            } else if (ogIndex === 0) {
              console.log(`  ℹ️  OG image already first`);
            } else {
              console.log(`  ⚠️  OG image not found - keeping current order`);
            }
          } else {
            console.log(`  ⚠️  No OG image found from scraping`);
          }
        }
      }
    }

    stats[categoryType].created++;
    return result.product;

  } catch (error) {
    console.error(`  ❌ Error creating product: ${error.message}`);
    return null;
  }
}


// Функция за обновяване на съществуващ продукт

async function updateShopifyProduct(shopifyProduct, filstarProduct, categoryType) {
  console.log(`\n🔄 Updating: ${filstarProduct.name}`);
  
  try {
    const productId = shopifyProduct.id.replace('gid://shopify/Product/', '');
    const productGid = shopifyProduct.id;
    
    const existingImages = shopifyProduct.images?.edges?.map(edge => ({
      id: edge.node.id,
      src: edge.node.src
    })) || [];
    
    const existingFilenames = existingImages.map(img => {
      return getImageFilename(img.src);
    });
    
    if (filstarProduct.images && filstarProduct.images.length > 0) {
      console.log(`   🖼️  Processing ${filstarProduct.images.length} images from Filstar...`);
      
      let newImagesUploaded = 0;
      
      for (const imageUrl of filstarProduct.images) {
        const filename = imageUrl.split('/').pop();
        
       if (imageExists(existingImages, imageUrl)) {
          console.log(`      ⏭️  Image already exists, skipping: ${filename}`);
          continue;
        }
        
        const normalizedBuffer = await normalizeImage(imageUrl, filstarProduct.variants[0].sku);
        
        if (normalizedBuffer) {
          const resourceUrl = await uploadImageToShopify(normalizedBuffer, filename);
          
          if (resourceUrl) {
            const attachMutation = `
              mutation {
                productCreateMedia(
                  productId: \"${productGid}\",
                  media: [{
                    originalSource: \"${resourceUrl}\",
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
              console.log(`      ✓ Uploaded new image: ${filename}`);
              newImagesUploaded++;
              stats[categoryType].images++;
            }
          }
        }
        
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      if (newImagesUploaded > 0) {
        console.log(`   ✅ Uploaded ${newImagesUploaded} new images`);
      } else {
        console.log(`   ℹ️  No new images to upload`);
      }
      
      const updatedProductQuery = `
        {
          product(id: \"${productGid}\") {
            images(first: 50) {
              edges {
                node {
                  id
                  src
                }
              }
            }
          }
        }
      `;
      
      const updatedResponse = await fetch(
        `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/graphql.json`,
        {
          method: 'POST',
          headers: {
            'X-Shopify-Access-Token': ACCESS_TOKEN,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ query: updatedProductQuery })
        }
      );
      
      const updatedData = await updatedResponse.json();
      const allImages = updatedData.data?.product?.images?.edges?.map(edge => ({
        id: edge.node.id,
        src: edge.node.src
      })) || [];
      
      if (allImages.length > 0) {
        console.log(`   🔄 Reordering images...`);
        
        const ogImage = await scrapeOgImage(filstarProduct.slug);
        
        if (ogImage) {
          const ogFilename = ogImage.split('/').pop();
          
          const ogIndex = allImages.findIndex(img => {
            const shopifyFilename = img.src.split('/').pop().split('?')[0];
            const ogFilenameClean = ogFilename.split('?')[0];
            const matches = shopifyFilename === ogFilenameClean || 
                            shopifyFilename.includes(ogFilenameClean) ||
                            ogFilenameClean.includes(shopifyFilename);
            return matches;
          });
          
          if (ogIndex > 0) {
            const [ogImg] = allImages.splice(ogIndex, 1);
            allImages.unshift(ogImg);
            console.log(`   ✅ Moved OG image to first position`);
            await reorderProductImages(productGid, allImages);
          } else if (ogIndex === 0) {
            console.log(`   ℹ️  OG image already first`);
          } else {
            console.log(`   ⚠️  OG image not found - keeping current order`);
          }
        } else {
          console.log(`   ⚠️  No OG image found from scraping`);
        }
      }
    }
    
    stats[categoryType].updated++;
    return true;
  } catch (error) {
    console.error(`   ❌ Error updating product: ${error.message}`);
    return false;
  }
}





// MAIN функция
async function main() {
  console.log('🚀 Starting Filstar Accessories Import\n');
  console.log('📋 Categories to import:');
  console.log('  - Аксесоари щука и сом (45)');
  console.log('  - Аксесоари щека и мач (50)');
  console.log('  - Ножове (59)');
  console.log('  - Столове и палатки (63)\n');
  
  try {
    // Fetch всички продукти от Filstar
    const allProducts = await fetchAllProducts();
    
    // Филтрирай само аксесоарите от 4-те категории


   
    let accessoryProducts = allProducts.filter(product => {

      const categoryType = getCategoryType(product);
      return categoryType !== null;
    });
    
    console.log(`🎯 Found ${accessoryProducts.length} accessory products to process\n`);


// филтър за 1 ску
    
// Филтър за тест на 1 продукт
accessoryProducts = accessoryProducts.filter(p => 
  p.variants?.some(v => v.sku === '963717')
);
console.log(`🧪 Filtered to SKU 963717: ${accessoryProducts.length} products\n`);

// край на филтъра за 1 ску
    
    
    // Групирай по категория
    const productsByCategory = {
      pike_and_catfish: [],
      pole_and_match: [],
      knives: [],
      chairs_umbrellas_tents: []
    };
    
    accessoryProducts.forEach(product => {
      const categoryType = getCategoryType(product);
      if (categoryType) {
        productsByCategory[categoryType].push(product);
      }
    });
    
    // Покажи разпределението
    console.log('📊 Products by category:');
    Object.entries(productsByCategory).forEach(([type, products]) => {
      console.log(`  ${getCategoryName(type)}: ${products.length} products`);
    });
    console.log('');
    
    // TEST MODE проверка
    const categoriesToProcess = TEST_MODE 
      ? { [TEST_CATEGORY]: productsByCategory[TEST_CATEGORY] }
      : productsByCategory;
    
    // Обработи всяка категория
    for (const [categoryType, products] of Object.entries(categoriesToProcess)) {
      if (products.length === 0) continue;
      
      console.log(`\n${'='.repeat(60)}`);
      console.log(`📂 Processing category: ${getCategoryName(categoryType)}`);
      console.log(`${'='.repeat(60)}\n`);
      
      for (const product of products) {
        if (!product.variants || product.variants.length === 0) {
          console.log(`⏭️  Skipping ${product.name} - no variants`);
          continue;
        }
        
        const firstSku = product.variants[0].sku;
        const existingProduct = await findProductBySku(firstSku);
        
        if (existingProduct) {
          await updateShopifyProduct(existingProduct, product, categoryType);
        } else {
          await createShopifyProduct(product, categoryType);
        }
        
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    // Финална статистика
    console.log(`\n${'='.repeat(60)}`);
    console.log('📊 FINAL STATISTICS');
    console.log(`${'='.repeat(60)}\n`);
    
    Object.entries(stats).forEach(([category, data]) => {
      console.log(`${getCategoryName(category)}:`);
      console.log(`  Created: ${data.created}`);
      console.log(`  Updated: ${data.updated}`);
      console.log(`  Images: ${data.images}\n`);
    });
    
    console.log('✅ Import completed successfully!');
    
  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

main();






