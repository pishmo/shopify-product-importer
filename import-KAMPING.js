// import-KAMPING.js - Импорт на Къмпинг от Filstar API
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
const LOCATION_ID = 'gid://shopify/Location/109713850750';




// Shopify колекции за захранки
const COLLECTION_MAPPING = {
  kamping: 'gid://shopify/Collection/739661414782'
};

// Filstar категории за захранки
const FILSTAR_BAIT_CATEGORY_IDS = {
  kamping: ['63']
};

const BAITS_PARENT_ID = '11';




// Статистика
const stats = {
  kamping: { created: 0, updated: 0, images: 0 }
};




const fsSync = require('fs'); // Използваме това за синхронно четене

// --- ЗАРЕЖДАНЕ НА ПРОМОЦИИ ---
let promoData = {};
try {
    // Проверяваме дали файлът съществува
    if (fsSync.existsSync('./promo.json')) {
        const fileContent = fsSync.readFileSync('./promo.json', 'utf8');
        promoData = JSON.parse(fileContent);
        console.log(`✅ Loaded promo.json with ${Object.keys(promoData).length} items.`);
    } else {
        console.log('⚠️ promo.json not found - skipping promo prices.');
    }
} catch (error) {
    console.log('❌ Error loading promo.json:', error.message);
}
// -----------------------------



// 2 част


// Изтриване на продукт
async function deleteShopifyProduct(productId) {
  const numericId = productId.replace('gid://shopify/Product/', '');
  
  const response = await fetch(
    `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/products/${numericId}.json`,
    {
      method: 'DELETE',
      headers: {
        'X-Shopify-Access-Token': ACCESS_TOKEN
      }
    }
  );
  
  if (!response.ok) {
    throw new Error(`Failed to delete product: ${response.status}`);
  }
  
  console.log(` ✅ Product deleted`);
}

// нормализиране на името на снимките
function normalizeFilename(filename) {
  // Премахни hash и Shopify UUID
  let clean = getImageFilename(filename);
  // Нормализирай .jpeg → .jpg
  clean = clean.replace(/\.jpeg$/i, '.jpg');
  return clean;
}



// Функция за извличане на чист filename от URL

function getImageFilename(src) {
  if (!src) return null;
  let base = src.split('/').pop().split('?')[0];
  let ext = base.split('.').pop().toLowerCase();
  let name = base.substring(0, base.lastIndexOf('.'));

  // Махаме 32-символни хешове (като 1cfe38e2814718206acb35b17341aedd)
  name = name.replace(/[a-f0-9]{32}/i, '');
  // Махаме UUID-та
  name = name.replace(/(_[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12})/i, '');
  // Махаме остатъци от разширения в името
  name = name.replace(/[-_](jpg|jpeg|png|webp)$/i, '');
  // Чистим символи накрая
  name = name.replace(/[_-]+$/, '');

  return (name + "." + ext).toLowerCase();
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
    return null;
  }
  
  try {
    const url = `${FILSTAR_BASE_URL}/${productSlug}`;
    const response = await fetch(url);
    if (!response.ok) {
      return null;
    }
    
    const html = await response.text();
    
    // Търси background-image URL в img_product елемента
    const bgMatch = html.match(/background-image:\s*url\(['"&quot;]*([^'"&)]+)['"&quot;]*\)/);
    
    if (bgMatch && bgMatch[1]) {
      console.log(`   ✅ Found main image: ${bgMatch[1]}`);
      return bgMatch[1];
    }
    
    console.log('   ⚠️  Main image not found');
    return null;
  } catch (error) {
    console.error(`   ❌ Error: ${error.message}`);
    return null;
  }
}

// FORMAT NAME

// Глобална променлива за кеширане на категории

let cachedCategoryNames = ['Aксесоари други'];
function formatVariantName(variant, productName) { 
  const parts = [];  
  
  // Помощна функция за форматиране на име на атрибут 
  function formatAttributeName(name) { 
	  
    let formatted = name.charAt(0).toUpperCase() + name.slice(1).toLowerCase(); 
    if (formatted.includes(',')) { 
      if (!formatted.endsWith('.')) { 
        formatted = formatted + '. '; 
      } 
    } 
    return formatted;
  } 
  
  // 1. MODEL (ПЪРВИ - от variant.model или атрибут "АРТИКУЛ")
  let model = variant.model; 
  if (!model) { 
    const artikulAttr = variant.attributes?.find(attr => 
      attr.attribute_name.toUpperCase() === 'АРТИКУЛ' 
    ); 
    if (artikulAttr) { 
      model = artikulAttr.value; 
    } 
  } 
  if (model && model !== productName) { 
    parts.push(model); 
  } 
  
  // 2. АРТИКУЛ (само ако е различен от model)
  const artikulAttr = variant.attributes?.find(attr => 
    attr.attribute_name.toUpperCase() === 'АРТИКУЛ' 
  ); 
  if (artikulAttr && artikulAttr.value && artikulAttr.value !== model) { 
    parts.push(artikulAttr.value); 
  } 
  
  // 3. РАЗМЕР 
  const sizeAttr = variant.attributes?.find(attr => 
    attr.attribute_name.toUpperCase() === 'РАЗМЕР' 
  ); 
  if (sizeAttr && sizeAttr.value) { 
    parts.push(`${formatAttributeName(sizeAttr.attribute_name)} : ${sizeAttr.value}`); 
  } 
  
// 4. ОСТАНАЛИТЕ АТРИБУТИ (без Артикул, Размер и категория)
if (variant.attributes && variant.attributes.length > 0) {
  const otherAttrs = variant.attributes
    .filter(attr => {
      const name = attr.attribute_name.toUpperCase();
      
      // Проверяваме дали атрибутът съвпада с категория
      const matchesCategory = cachedCategoryNames.some(categoryName => 
        categoryName.toUpperCase() === name
      );
      
      return name !== 'АРТИКУЛ' && name !== 'РАЗМЕР' && !matchesCategory && attr.value;
    })
    .map(attr => `${formatAttributeName(attr.attribute_name)}: ${attr.value}`);
  
  parts.push(...otherAttrs);
}


  const result = parts.join(' / '); 
  
  // Ако има форматиран резултат - върни го
  if (result && result.trim() !== '') {
    return result;
  }
  
  // Ако НЯМА нищо - върни празен стринг
  return '';

}


// Функция за определяне на типа на категорията
function getCategoryType(product) {
  if (!product.categories || product.categories.length === 0) {
    return null;
  }
  
  for (const category of product.categories) {
    const categoryId = category.id?.toString();
    
    for (const [type, ids] of Object.entries(FILSTAR_BAIT_CATEGORY_IDS)) {
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
    other: 'Къмпинг'
   
  };
  
  return names[categoryType] || 'Къмпинг';
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
              options {
                id
                name
              }
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
                    inventoryItem {
                      id
                    }
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
const collectionId = COLLECTION_MAPPING[categoryType];
  
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
    
    const reorderedImages = images.map((img, index) => {
      const imageId = img.node?.id || img.id;
      const numericId = imageId.replace('gid://shopify/ProductImage/', '');
      
      return {
        id: numericId,
        position: index + 1
      };
    });

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


// Функция за създаване на нов продукт      CREATE PRODUCT


// Функция за създаване на нов продукт     ============================================================================

async function createShopifyProduct(filstarProduct, categoryType) {
  // Инициализиране на статистиката
  if (!stats[categoryType]) stats[categoryType] = { created: 0, updated: 0, images: 0 };

  console.log(`\n🆕 Creating: ${filstarProduct.name}`);
  const safeAlt = filstarProduct.name.replace(/"/g, '\\"');

  try {
    // 1. СЪЗДАВАНЕ НА ПРОДУКТА (Първоначално без снимки)
    const createMutation = `
      mutation productCreate($input: ProductInput!) {
        productCreate(input: $input) {
          product { id variants(first: 50) { edges { node { id sku } } } }
          userErrors { field message }
        }
      }
    `;

    const productInput = {
      title: filstarProduct.name,
      bodyHtml: filstarProduct.description || '',
      vendor: filstarProduct.manufacturer || 'Unknown',
      productType: filstarProduct.category || '',
      status: 'ACTIVE',
      variants: filstarProduct.variants.map(v => ({
        sku: v.sku,
        price: String(promoData && promoData[v.sku] ? promoData[v.sku] : v.price),
        compareAtPrice: (promoData && promoData[v.sku]) ? String(v.price) : null,
        inventoryQuantities: [{ locationId: LOCATION_ID, availableQuantity: parseInt(fv.quantity) || 0 }],
        barcode: v.barcode || ''
      }))
    };

    const response = await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/graphql.json`, {
      method: 'POST',
      headers: { 'X-Shopify-Access-Token': ACCESS_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: createMutation, variables: { input: productInput } })
    });

    const resData = await response.json();
    const newProduct = resData.data?.productCreate?.product;
    if (!newProduct) return;

    const productGid = newProduct.id;
    const shopifyVariants = newProduct.variants.edges;

    // 2. КАЧВАНЕ НА СНИМКИ С ЧИСТИ ИМЕНА
    let imageMap = new Map();
    const allImageUrls = filstarProduct.images || [];

    for (const imgUrl of allImageUrls) {
      const cleanName = getImageFilename(imgUrl); // ТУК ИЗПОЛЗВАМЕ ФИКСИРАНАТА getImageFilename
      console.log(`  🖼️  Uploading: ${cleanName}`);
      
      const normalizedBuffer = await normalizeImage(imgUrl, filstarProduct.variants[0].sku);
      if (normalizedBuffer) {
        // ПРАЩАМЕ ЧИСТОТО ИМЕ КЪМ SHOPIFY
        const resourceUrl = await uploadImageToShopify(normalizedBuffer, cleanName);
        
        const attachMutation = `
          mutation {
            productCreateMedia(productId: "${productGid}", media: [{
              originalSource: "${resourceUrl}",
              mediaContentType: IMAGE,
              alt: "${safeAlt}"
            }]) { media { id } }
          }
        `;

        const attachRes = await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/graphql.json`, {
          method: 'POST',
          headers: { 'X-Shopify-Access-Token': ACCESS_TOKEN, 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: attachMutation })
        });
        
        const attachData = await attachRes.json();
        const mediaId = attachData.data?.productCreateMedia?.media?.[0]?.id;
        if (mediaId) {
          imageMap.set(cleanName, mediaId);
          stats[categoryType].images++;
        }
      }
    }

    // 3. ПОДРЕДБА (REORDER) И СВЪРЗВАНЕ С ВАРИАНТИ
    const finalOrderIds = [];
    const variantAssignments = [];
    let logParts = [];

    // А) OG Image
    let ogSource = filstarProduct.ogImageUrl || allImageUrls[0];
    const ogName = getImageFilename(ogSource || "");
    if (ogName && imageMap.has(ogName)) {
      finalOrderIds.push(imageMap.get(ogName));
      logParts.push(`[OG: ${ogName}]`);
    }

    // Б) Free Images (Снимки, които не са OG и не са на конкретни варианти)
    const variantImageNames = new Set(filstarProduct.variants.map(v => v.image ? getImageFilename(v.image) : null).filter(Boolean));
    imageMap.forEach((id, name) => {
      if (name !== ogName && !variantImageNames.has(name)) {
        finalOrderIds.push(id);
      }
    });
    if (imageMap.size > (variantImageNames.size + 1)) logParts.push(`[Free Images Added]`);

    // В) Variant Images (Накрая)
    filstarProduct.variants.forEach(fv => {
      const vImgName = getImageFilename(fv.image || "");
      const mediaId = imageMap.get(vImgName);
      const sv = shopifyVariants.find(v => v.node.sku === fv.sku);
      if (mediaId) {
        if (!finalOrderIds.includes(mediaId)) finalOrderIds.push(mediaId);
        if (sv) {
          variantAssignments.push({ id: sv.node.id, mediaId });
          logParts.push(`[Variant: ${vImgName}]`);
        }
      }
    });

    console.log(`  ⚙️  REORDER: ${logParts.join(' ')}`);

    // Изпълнение на Reorder
    if (finalOrderIds.length > 0) {
      const moves = finalOrderIds.map((id, index) => ({ id, newPosition: String(index) }));
      await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/graphql.json`, {
        method: 'POST',
        headers: { 'X-Shopify-Access-Token': ACCESS_TOKEN, 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          query: `mutation productReorderMedia($id: ID!, $moves: [MoveInput!]!) { productReorderMedia(id: $id, moves: $moves) { userErrors { message } } }`,
          variables: { id: productGid, moves }
        })
      });
    }

    // Изпълнение на Variant Link
    if (variantAssignments.length > 0) {
      await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/graphql.json`, {
        method: 'POST',
        headers: { 'X-Shopify-Access-Token': ACCESS_TOKEN, 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          query: `mutation { productVariantsBulkUpdate(productId: "${productGid}", variants: ${JSON.stringify(variantAssignments).replace(/"([^"]+)":/g, '$1:')}) { userErrors { message } } }`
        })
      });
    }

    stats[categoryType].created++;
    console.log(`  ✅ Created successfully.`);

  } catch (e) {
    console.error(`  ❌ Error in Create: ${e.message}`);
  }
}

// Апдейт на продукти   ===================================================================================================================

async function updateShopifyProduct(shopifyProduct, filstarProduct, categoryType) {
  // Инициализиране на статистиката
  if (!stats[categoryType]) stats[categoryType] = { created: 0, updated: 0, images: 0 };

  console.log(`\n🔄 Updating: ${filstarProduct.name}`);
  const productGid = shopifyProduct.id;
  const safeAlt = filstarProduct.name.replace(/"/g, '\\"');

  try {
    const productQuery = `query { product(id: "${productGid}") {
      images(first: 50) { edges { node { id src altText } } }
      variants(first: 50) { edges { node { id sku price inventoryItem { id } } } }
    }}`;

    const response = await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/graphql.json`, {
      method: 'POST', headers: { 'X-Shopify-Access-Token': ACCESS_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: productQuery })
    });
    const resData = await response.json();
    const fullProduct = resData.data.product;
    const existingImages = fullProduct.images.edges.map(e => e.node);
    const shopifyVariants = fullProduct.variants.edges;

    let imageMap = new Map();
    existingImages.forEach(img => imageMap.set(getImageFilename(img.src), img.id));

    // 1. КАЧВАНЕ НА НОВИ СНИМКИ
    if (filstarProduct.images) {
      for (const imgUrl of filstarProduct.images) {
        const cleanName = getImageFilename(imgUrl);
        if (!imageMap.has(cleanName)) {
          console.log(`  🖼️  Uploading: ${cleanName}`);
          const normalizedBuffer = await normalizeImage(imgUrl, filstarProduct.variants[0].sku);
          if (normalizedBuffer) {
            const resourceUrl = await uploadImageToShopify(normalizedBuffer, cleanName);
            const attachMutation = `mutation { productCreateMedia(productId: "${productGid}", media: [{originalSource: "${resourceUrl}", mediaContentType: IMAGE, alt: "${safeAlt}"}]) { media { id } } }`;
            const attachRes = await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/graphql.json`, {
              method: 'POST', headers: { 'X-Shopify-Access-Token': ACCESS_TOKEN, 'Content-Type': 'application/json' },
              body: JSON.stringify({ query: attachMutation })
            });
            const attachData = await attachRes.json();
            const newId = attachData.data?.productCreateMedia?.media?.[0]?.id;
            if (newId) { 
              imageMap.set(cleanName, newId); 
              stats[categoryType].images++; 
            }
          }
        }
      }
    }

    // 2. ПОДГОТОВКА НА НОВИЯ РЕД: OG -> FREE -> VARIANTS
    const finalOrder = [];
    const assignments = [];
    let logParts = [];

    // А) OG Image (Позиция 1)
    let ogSource = filstarProduct.ogImageUrl || (filstarProduct.images && filstarProduct.images[0]);
    const ogName = getImageFilename(ogSource || "");
    if (ogName && imageMap.has(ogName)) {
      finalOrder.push(imageMap.get(ogName));
      logParts.push(`[OG: ${ogName}]`);
    }

    // Б) Free Images (Всички, които не са OG и не са към вариант)
    const variantImageNames = new Set(filstarProduct.variants.map(v => v.image ? getImageFilename(v.image) : null).filter(Boolean));
    let freeImageNames = [];
    
    imageMap.forEach((id, name) => {
      if (name !== ogName && !variantImageNames.has(name)) {
        finalOrder.push(id);
        freeImageNames.push(name);
      }
    });
    if (freeImageNames.length > 0) logParts.push(`[Free: ${freeImageNames.join(', ')}]`);

    // В) Variant Images (Накрая на галерията)
    filstarProduct.variants.forEach(fv => {
      const vImgName = getImageFilename(fv.image || "");
      const mediaId = imageMap.get(vImgName);
      const sv = shopifyVariants.find(v => v.node.sku === fv.sku);
      if (mediaId) {
        if (!finalOrder.includes(mediaId)) {
          finalOrder.push(mediaId);
          logParts.push(`[Variant: ${vImgName}]`);
        }
        if (sv) assignments.push({ id: sv.node.id, mediaId });
      }
    });

    console.log(`  ⚙️  REORDER: ${logParts.join(' ')}`);

    // Изпълнение на Reorder
    if (finalOrder.length > 0) {
      const moves = finalOrder.map((id, index) => ({ id, newPosition: String(index) }));
      await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/graphql.json`, {
        method: 'POST', headers: { 'X-Shopify-Access-Token': ACCESS_TOKEN, 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          query: `mutation productReorderMedia($id: ID!, $moves: [MoveInput!]!) { productReorderMedia(id: $id, moves: $moves) { userErrors { message } } }`,
          variables: { id: productGid, moves }
        })
      });
    }

    // Свързване с SKU
    if (assignments.length > 0) {
      await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/graphql.json`, {
        method: 'POST', headers: { 'X-Shopify-Access-Token': ACCESS_TOKEN, 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          query: `mutation { productVariantsBulkUpdate(productId: "${productGid}", variants: ${JSON.stringify(assignments).replace(/"([^"]+)":/g, '$1:')}) { userErrors { message } } }`
        })
      });
      console.log(`    🔗 Linked ${assignments.length} variant images.`);
    }

    // 3. ЦЕНИ И НАЛИЧНОСТИ (Винаги)
    for (const fv of filstarProduct.variants) {
      const sv = shopifyVariants.find(v => v.node.sku === fv.sku)?.node;
      if (sv) {
        const vId = sv.id.split('/').pop();
        let price = String(fv.price);
        if (typeof promoData !== 'undefined' && promoData[fv.sku]) price = String(promoData[fv.sku]);
        
        console.log(`    💰 [${fv.sku}] ${sv.price} -> ${price} | Qty: ${fv.quantity}`);

        await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/variants/${vId}.json`, {
          method: 'PUT', headers: { 'X-Shopify-Access-Token': ACCESS_TOKEN, 'Content-Type': 'application/json' },
          body: JSON.stringify({ variant: { id: vId, price, barcode: fv.barcode || '' } })
        });
        
        const invId = sv.inventoryItem.id.split('/').pop();
        await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/inventory_levels/set.json`, {
          method: 'POST', headers: { 'X-Shopify-Access-Token': ACCESS_TOKEN, 'Content-Type': 'application/json' },
          body: JSON.stringify({ location_id: LOCATION_ID.split('/').pop(), inventory_item_id: invId, available: parseInt(fv.quantity) })
        });
      }
    }

    // Успешно обновен продукт
    stats[categoryType].updated++;

  } catch (e) { 
    console.error(`  ❌ Error: ${e.message}`); 
  }
}




// MAIN функция       ===================================================================================================================

  async function main() {
  console.log('🚀 Starting Filstar REELS Import\n');
  console.log('📋 Categories to import:');
  console.log('  - Къмпинг - Категория Id - (63)');
     
  try {
    // Fetch всички продукти от Filstar
    const allProducts = await fetchAllProducts();
    
    // Филтрирай само аксесоарите от 4-те категории
    let accessoryProducts = allProducts.filter(product => {
      const categoryType = getCategoryType(product);
      return categoryType !== null;
    });




 // Филтър за конкретни SKU (ако е нужно)
    const targetSkus = ['960300','963863']; // Замени с реалните SKU-та
    accessoryProducts = accessoryProducts.filter(product => 
      product.variants && product.variants.some(v => targetSkus.includes(v.sku))
    );




	  
	  
    console.log(`🎯 Found ${accessoryProducts.length} products to process\n`);
    
    // Групирай по категория
const productsByCategory = {
  kamping: []
	  
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
    
    // Обработи всяка категория
    
    for (const [categoryType, products] of Object.entries(productsByCategory)) {
      if (products.length === 0) continue;
      
      console.log(`\n${'='.repeat(60)}`);
      console.log(`📂 Processing category: ${getCategoryName(categoryType)}`);
      console.log(`${'='.repeat(60)}\n`);
      
      const totalInCategory = products.length;
      
for (let i = 0; i < products.length; i++) {
  const product = products[i];
  const productNumber = i + 1;
         
  console.log(`\n${'-'.repeat(60)}`);
  console.log(`[${productNumber}/${totalInCategory}] Processing: ${product.name}`);
  console.log(`${'-'.repeat(60)}`);
  
  if (!product.variants || product.variants.length === 0) {
    console.log(`⏭️  Skipping - no variants`);
    continue;
  }
  
  const firstSku = product.variants[0].sku;
  const existingProduct = await findProductBySku(firstSku);
  
  if (existingProduct) {
    console.log(` ✓ Found existing product (ID: ${existingProduct.id})`);
    await updateShopifyProduct(existingProduct, product, categoryType);
  } else {
    console.log(` ✓ Product not found, creating new...`);
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
