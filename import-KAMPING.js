// import-CAMPING.js - Импорт на КЪМПИГ от Filstar API
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


// --- НАСТРОЙКИ ЗА ПОДКАТЕГОРИИ ---

const WANTED_SUBCATEGORIES = {
  "Шарански Риболов": [
      "PVA материали",
      "Аларми и индикатори",
      "Готови монтажи",
      "Инструменти",
      "Материали за монтажи",
      "Ракети",
      "Стопери и рингове",
      "Фидери",
      "Шарански стойки",
      "Други"
  ]
};





// Filstar category IDs за аксесоари
const FILSTAR_ACCESSORIES_CATEGORY_IDS = {
  
  camping: ['63'] 
};

const ACCESSORIES_PARENT_ID = '11';

// Shopify collection IDs
const COLLECTION_MAPPING  = {
  
  camping: 'gid://shopify/Collection/739661414782'
 
};

// Статистика
const stats = {
  
  camping: { created: 0, updated: 0, images: 0 }
  
};



// 2 част




// --- ЗАРЕЖДАНЕ НА ПРОМОЦИИ (Безопасен начин) ---
const fsSync = require('fs'); // Ползваме ново име, за да не гърми
let promoData = {};

try {
    if (fsSync.existsSync('./promo.json')) {
        promoData = JSON.parse(fsSync.readFileSync('./promo.json', 'utf8'));
        console.log(`✅ Loaded promo.json with ${Object.keys(promoData).length} items.`);
    } else {
        console.log('❌ promo.json not found!');
    }
     
} catch (error) {
    console.log('⚠️ Error loading promo.json:', error);
}
// ------------------------------------------------




// --- ПОМОЩНИ БЪЛК ФУНКЦИИ ---

async function productVariantsBulkUpdate(productId, variants) {
  const mutation = `
    mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
      productVariantsBulkUpdate(productId: $productId, variants: $variants) {
        product { id }
        userErrors { field message }
      }
    }
  `;
  const response = await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: { 
      'X-Shopify-Access-Token': ACCESS_TOKEN, 
      'Content-Type': 'application/json' 
    },
    body: JSON.stringify({ query: mutation, variables: { productId, variants } })
  });
  return response.json();
}

async function inventoryBulkSet(inventoryItemQuantities) {
  const mutation = `
    mutation inventorySetQuantities($input: InventorySetQuantitiesInput!) {
      inventorySetQuantities(input: $input) {
        inventoryLevels { available }
        userErrors { field message }
      }
    }
  `;
  const response = await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: { 
      'X-Shopify-Access-Token': ACCESS_TOKEN, 
      'Content-Type': 'application/json' 
    },
    body: JSON.stringify({ query: mutation, variables: { input: { 
      name: "available", 
      reason: "correction", 
      ignoreUnchangedCounts: true, 
      quantities: inventoryItemQuantities 
    } } })
  });
  return response.json();
}






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




//  Тука се оправят имената на снимките   =============================================================================================================

// 1. Основната функция за почистване (Хирургическа)
function getImageFilename(src) {
  if (!src || typeof src !== 'string') return null;

  // Взимаме името на файла и махаме "?v=..."
  let filename = src.split('/').pop().split('?')[0];

  // Махаме разширението временно, за да работим само с името
  const lastDot = filename.lastIndexOf('.');
  let ext = lastDot !== -1 ? filename.substring(lastDot).toLowerCase() : '';
  let name = lastDot !== -1 ? filename.substring(0, lastDot) : filename;

  // --- СТЪПКА 1: Махане на хешове и UUID ---
  
  // Махаме Filstar Hash (долна черта + 32 или повече hex символа)
  // Пример: ...main-1_a7ac8da... -> става ...main-1
  name = name.replace(/_[a-f0-9]{32,}$/i, '');

  // Махаме Shopify UUID (стандартен формат с тирета)
  name = name.replace(/_[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i, '');

  // --- СТЪПКА 2: Махане на служебна наставка "-jpg" ---
  // Filstar URLs често са: "name-1-jpg_hash.jpeg"
  // След Стъпка 1 остава: "name-1-jpg"
  // Трябва да махнем това "-jpg", за да остане чистият индекс "name-1"
  name = name.replace(/-jpe?g$/i, '');

  // --- СТЪПКА 3: Финална козметика ---
  // Ако случайно сме оставили долна черта накрая
  name = name.replace(/_+$/, '');

  // Стандартизираме разширението
  if (ext === '.jpeg') ext = '.jpg';

  return name + ext;
}

// 2. Normalize - просто вика горната
function normalizeFilename(filename) {
  return getImageFilename(filename);
}

// 3. Image Exists - сравнява "обелените" имена
function imageExists(existingImages, newImageUrl) {
  if (!existingImages || !existingImages.length) return false;

  const targetClean = normalizeFilename(newImageUrl);

  return existingImages.some(img => {
    const imgSrc = img.src || img.url || '';
    // Белим и името от Shopify, за да видим дали е същото
    const existingClean = normalizeFilename(imgSrc);
    return existingClean === targetClean;
  });
}


// до тук снимките  ===============================================================================================================================



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






// Функция за качване на изображение в Shopify   ============================================================
async function uploadImageToShopify(imageBuffer, filename) {
  try {
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
          userErrors { field message }
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
    
    if (stagedData.data.stagedUploadsCreate.userErrors?.length > 0) {
        console.error(`  ❌ Staged Upload Error:`, stagedData.data.stagedUploadsCreate.userErrors);
        return null;
    }

    const stagedTarget = stagedData.data.stagedUploadsCreate.stagedTargets[0];
    
    const formData = new (require('form-data'))();
    stagedTarget.parameters.forEach(param => {
      formData.append(param.name, param.value);
    });
    formData.append('file', imageBuffer, { filename });
    
    const uploadRes = await fetch(stagedTarget.url, {
      method: 'POST',
      body: formData
    });

    if (uploadRes.ok) {
        console.log(`  🔹 File ${filename} staged successfully.`);
        return stagedTarget.resourceUrl;
    } else {
        console.error(`  ❌ Failed to push binary to Shopify storage.`);
        return null;
    }
    
  } catch (error) {
    console.error(`  ❌ Error uploading image: ${error.message}`);
    return null;
  }
}

// OG Image  =======================================================================================================================


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

let cachedCategoryNames = ['Шарански Риболов'];
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
    camping: 'Къмпинг'
   
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


async function reorderProductImages(productGid, itemsWithPositions) {
  try {
    const productId = productGid.replace('gid://shopify/Product/', '');
    
    // Превръщаме данните в това, което Shopify иска (числови ID-та)
    const moves = itemsWithPositions.map(item => {
        // Изчистваме GID-то, ако е останало
        const cleanId = item.id.toString().replace('gid://shopify/ProductImage/', '');
        return {
            id: cleanId,
            position: item.position
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
            images: moves
          }
        })
      }
    );

    if (!response.ok) {
      console.log(`  🐛 Reorder error: ${response.status}`);
      return false;
    }
    
    console.log(`    ✅ Reordered ${moves.length} images successfully`);
    return true;
  } catch (error) {
    console.error(`  ❌ Error reordering: ${error.message}`);
    return false;
  }
}





// --- ПОМОЩНА ФУНКЦИЯ ЗА ПОДКАТЕГОРИИ ---


// --- ПОМОЩНА ФУНКЦИЯ ЗА ПОДКАТЕГОРИИ (С НОРМАЛИЗИРАНЕ) ---
function getSubcategoryTag(filstarProduct) {
  // 1. Проверки за валидност - да не гръмне ако няма инфо
  if (!filstarProduct.categories || filstarProduct.categories.length === 0) return null;
  if (!filstarProduct.variants || filstarProduct.variants.length === 0) return null;

  // 2. Взимаме името на категорията на продукта (напр. "Шарански Риболов")
  const categoryNameRaw = filstarProduct.categories[0].name.trim();

  // 3. Търсим дали тази категория я има в настройките (без значение малки/големи букви)
  const configKey = Object.keys(WANTED_SUBCATEGORIES).find(
      key => key.toLowerCase() === categoryNameRaw.toLowerCase()
  );

  if (!configKey) return null; // Категорията не е в списъка за обработка

  // 4. Търсим атрибут във вариантите, който съвпада с името на категорията
  const variant = filstarProduct.variants[0];
  if (!variant.attributes) return null;

  const matchingAttribute = variant.attributes.find(attr => 
      attr.attribute_name.trim().toLowerCase() === categoryNameRaw.toLowerCase()
  );

  if (matchingAttribute) {
      const apiValue = matchingAttribute.value.trim(); // Това идва от API-то (може да е "ракети" или "РАКЕТИ")
      
      // Взимаме твоя "чист" списък от настройките
      const allowedList = WANTED_SUBCATEGORIES[configKey]; 
      
      // 5. МАГИЯТА: Намираме коя дума от ТВОЯ списък отговаря на думата от API-то
      const cleanValue = allowedList.find(
          allowedItem => allowedItem.toLowerCase() === apiValue.toLowerCase()
      );

      if (cleanValue) {
          // Връщаме ТВОЯТА красива дума (напр. "Ракети"), а не грозната от API-то
          return `subcat:${cleanValue}`;
      }
  }

  return null;
}





// Функция за създаване на нов продукт      CREATE PRODUCT   =======================================================================================



// Функция за създаване на нов продукт
async function createShopifyProduct(filstarProduct, categoryType) {
 
  try {
    console.log(`\n📦 Creating: ${filstarProduct.name}`);
    console.log(`  SKUs: ${filstarProduct.variants.map(v => v.sku).join(', ')}`);
    
    const vendor = filstarProduct.manufacturer || 'Unknown';
    const productType = getCategoryName(categoryType);
    const categoryNames = filstarProduct.categories?.map(c => c.name) || [];
    
    const needsOptions = filstarProduct.variants.length > 1 || 
      (filstarProduct.variants.length === 1 && formatVariantName(filstarProduct.variants[0], categoryNames));
    
     const variants = filstarProduct.variants.map(variant => {
      const variantName = formatVariantName(variant, categoryNames);
      const finalName = variantName || variant.sku;
      
      console.log(`\n📦 Variant VALUE : ${variantName}`);

      // --- НОВАТА ЛОГИКА ЗА ЦЕНИ ---
      const sku = variant.sku.toString();
      const originalPrice = variant.price?.toString() || '0';
      
      // Търсим в заредения promoData
      const promoPrice = promoData[sku]; 
      
      const variantData = {
        sku: sku,
        barcode: variant.barcode || sku,
        inventory_quantity: parseInt(variant.quantity) || 0,
        inventory_management: 'shopify'
      };

      // Проверяваме дали имаме съвпадение в промоциите
      if (promoPrice !== undefined && parseFloat(promoPrice) < parseFloat(originalPrice)) {
        variantData.price = promoPrice.toString();        // Намалена цена
        variantData.compare_at_price = originalPrice;    // Стара цена (зачеркната)
        console.log(`    🏷️  PROMO found for SKU ${sku}: ${originalPrice} -> ${promoPrice}`);
      } else {
        variantData.price = originalPrice;               // Нормална цена
        variantData.compare_at_price = null;
      }
      // -----------------------------
      
      if (needsOptions) {
        variantData.option1 = finalName;
      }
      
      return variantData;
    });
	  
  
	// --- ЗАМЕСТВАШ ГО С ТОВА: ---
    
   // 1. Подготвяме базовите тагове (като масив)
    const tagsArray = ['Filstar', categoryType, vendor];

    // 2. Проверяваме за подкатегория
    const subcatTag = getSubcategoryTag(filstarProduct);

    // 3. Ако има, добавяме я към списъка
    if (subcatTag) {
        tagsArray.push(subcatTag);
        console.log(`   🏷️  [CREATE] Adding subcategory tag: ${subcatTag}`);
    }

    // 4. ВАЖНО: Превръщаме масива в ТЕКСТ (String)
    // От ['Filstar', 'Шаран'] става "Filstar, Шаран"
    const tagsString = tagsArray.join(', ');

    // 5. Създаваме обекта
    const productData = {
      product: {
        title: filstarProduct.name,
        body_html: filstarProduct.description || filstarProduct.short_description || '',
        vendor: vendor,
        product_type: productType,
        
        // 👇 ТУК подаваме готовия ТЕКСТ
        tags: tagsString, 
        
        status: 'active',
        variants: variants
      }
    };



	  
    if (needsOptions) {
      productData.product.options = [{ name: 'Вариант' }];
    }
    
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
      console.log(`  ❌ Failed to create: ${response.status} - ${errorText}`);
      stats[categoryType].errors++;
      return null;
    }
    
    const result = await response.json();
    const productGid = `gid://shopify/Product/${result.product.id}`;
    console.log(`  ✅ Created product: ${productGid}`);
    stats[categoryType].created++;
    
    await addProductToCollection(productGid, categoryType);


	  
    // IMAGES      =============================================================================================      IMAGES  
    
	  
	const imageMapping = new Map();
	const nameCounts = {};
    const uploadedMedia = [];
    if (filstarProduct.images && filstarProduct.images.length > 0) {
      console.log(`  🖼️  Uploading ${filstarProduct.images.length} images...`);
      
     
	for (const imageUrl of filstarProduct.images) {
        // 1. Първоначално белене
        let rawCleanName = getImageFilename(imageUrl); 
        
        // 2. Логика за уникално име (индексиране)
        let filename;
        if (!nameCounts[rawCleanName]) {
            filename = rawCleanName; // Първи път: 963811.jpg
            nameCounts[rawCleanName] = 1;
        } else {
            // Втори път: 963811-1.jpg, 963811-2.jpg...
            const lastDot = rawCleanName.lastIndexOf('.');
            const namePart = lastDot !== -1 ? rawCleanName.substring(0, lastDot) : rawCleanName;
            const extPart = lastDot !== -1 ? rawCleanName.substring(lastDot) : '.jpg';
            
            filename = `${namePart}-${nameCounts[rawCleanName]}${extPart}`;
            nameCounts[rawCleanName]++;
        }
		  
		  
        const fullImageUrl = imageUrl.startsWith('http') ? imageUrl : `${FILSTAR_BASE_URL}/${imageUrl}`;
        
        const normalizedBuffer = await normalizeImage(fullImageUrl, filstarProduct.variants[0].sku);
        
        if (normalizedBuffer) {
          const resourceUrl = await uploadImageToShopify(normalizedBuffer, filename);
          
          if (resourceUrl) {

            const altText = filstarProduct.name.replace(/"/g, '\\"'); // Ескейпваме кавичките

            const attachMutation = `
              mutation {
                productCreateMedia(
                  productId: "${productGid}"
                  media: [{
                    originalSource: "${resourceUrl}"
                    mediaContentType: IMAGE
                    alt: "${altText}"
                  }]
                ) {
                  media {
                    ... on MediaImage {
                      id
                      image { url }
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
              const shopifyImageId = attachData.data.productCreateMedia.media[0].id;
              
              // 1. Записваме с ОРИГИНАЛНОТО чисто име (за да може вариантът да го намери)
              // rawCleanName е името без индекси (-1, -2), което дефинирахме в началото на цикъла
              imageMapping.set(rawCleanName, shopifyImageId);

              // 2. Записваме и с УНИКАЛНОТО име (това с индекса, ако има такъв)
              // Така Reorder логиката ще го намери, дори името да е променено
              imageMapping.set(filename, shopifyImageId);

              console.log(`    ✓ Uploaded: ${filename}`);
              stats[categoryType].images++;
            } else if (attachData.data?.productCreateMedia?.mediaUserErrors?.length > 0) {
              console.log(`    ❌ Upload error: ${attachData.data.productCreateMedia.mediaUserErrors[0].message}`);
            }
          }
        }
        
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    // Scrape OG image
    const ogImageUrl = await scrapeOgImage(filstarProduct.slug);



	  
   
// ASSIGN IMAGES TO VARIANTS ===========================================================================
    const variantImageAssignments = [];
    
    if (imageMapping.size > 0) {
      console.log(`  🔗 Assigning images to variants...`);
      
     const productQuery = `
        {
          product(id: "${productGid}") {
            id
            images(first: 50) { edges { node { id url } } }
            variants(first: 50) {
              edges {
                node {
                  id
                  sku
                  price
                  inventoryQuantity
                  inventoryItem { id }
                  image { id }
                }
              }
            }
          }
        }
      `;
      
      const productResponse = await fetch(
        `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/graphql.json`,
        {
          method: 'POST',
          headers: {
            'X-Shopify-Access-Token': ACCESS_TOKEN,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ query: productQuery })
        }
      );
      
      const productData = await productResponse.json();
      const shopifyVariants = productData.data?.product?.variants?.edges || [];
      
      const variantsToUpdate = [];
      
      for (const filstarVariant of filstarProduct.variants) {
        let variantImageUrl = null;
        
        if (filstarVariant.image) {
          variantImageUrl = filstarVariant.image.startsWith('http') 
            ? filstarVariant.image 
            : `${FILSTAR_BASE_URL}/${filstarVariant.image}`;
        } else if (ogImageUrl) {
          variantImageUrl = ogImageUrl;
        }
        
        if (variantImageUrl) {
          // Използваме белачката, за да намерим правилното ID в mapping-а
          const cleanFilename = getImageFilename(variantImageUrl);
          const shopifyImageId = imageMapping.get(cleanFilename);
          
          if (shopifyImageId) {
            const shopifyVariant = shopifyVariants.find(v => v.node.sku === filstarVariant.sku);
            
            if (shopifyVariant) {
              variantsToUpdate.push({
                id: shopifyVariant.node.id,
                mediaId: shopifyImageId
              });
              
              // Критично за правилния REORDER: запазваме асоциацията
              variantImageAssignments.push({
                variantId: shopifyVariant.node.id,
                imageId: shopifyImageId
              });
            }
          }
        }
      }
      
      if (variantsToUpdate.length > 0) {
        const bulkUpdateMutation = `
          mutation {
            productVariantsBulkUpdate(
              productId: "${productGid}"
              variants: ${JSON.stringify(variantsToUpdate).replace(/"([^"]+)":/g, '$1:')}
            ) {
              productVariants {
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
            body: JSON.stringify({ query: bulkUpdateMutation })
          }
        );
        
        const data = await response.json();
        console.log(`  ✅ Assigned ${variantsToUpdate.length} variant images`);
      }
    }
	  
//  до тук ASSIGN IMAGES TO VARIANTS





	  
	  // Fetch all images за reorder
    const allImagesQuery = `
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

    const allImagesResponse = await fetch(
      `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/graphql.json`,
      {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': ACCESS_TOKEN,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query: allImagesQuery })
      }
    );

    const allImagesData = await allImagesResponse.json();
    const allImages = allImagesData.data?.product?.images?.edges || [];

    
// REORDER IMAGES ---------------------------------------------------------------------------------------------------------------
  
    // ===========================================================================
    // REORDER IMAGES (Filename Match Logic)
    // ===========================================================================
    if (allImages.length > 0 && ogImageUrl) {
      console.log(`\n🔄 Reordering images (Matching by Filename)...`);
      
      // 1. Събираме чистите имена на снимките, които сме асоциирали с варианти
      const variantNames = new Set();
      variantImageAssignments.forEach(assignment => {
        for (let [name, id] of imageMapping.entries()) {
          if (id === assignment.imageId) {
            variantNames.add(name);
          }
        }
      });

      // 2. Взимаме името на основната (OG) снимка
      const ogName = getImageFilename(ogImageUrl);

      const unassignedImages = []; // Свободни (FREE)
      const assignedImages = [];   // Вариантни (VARIANT)
      let ogImageNode = null;

      // 3. Разпределяме снимките според имената им в Shopify
      allImages.forEach(edge => {
        const node = edge.node;
        const currentName = getImageFilename(node.url || node.src);

        // Проверяваме дали това е основната снимка
        if (currentName === ogName && !ogImageNode) {
          ogImageNode = node;
          return;
        }

        // Проверяваме дали името съвпада с някой вариант
        if (variantNames.has(currentName)) {
          assignedImages.push(node);
        } else {
          unassignedImages.push(node);
        }
      });

      // Ако не сме намерили OG по име, взимаме първата налична като резерва
      if (!ogImageNode) ogImageNode = allImages[0].node ? allImages[0].node : allImages[0];

      // 4. Генерираме финалния План за лога
      console.log(`  📋 REORDER PLAN:`);
      const mainNameLog = getImageFilename(ogImageNode.url || ogImageNode.src || "");
      console.log(`    1. [OG-MAIN] ${mainNameLog}`);

      unassignedImages.forEach((img, i) => {
          const name = getImageFilename(img.url || img.src);
          console.log(`    ${i + 2}. [FREE]    ${name}`);
      });
      
      const startVarIdx = unassignedImages.length + 2;
      assignedImages.forEach((img, i) => {
          const name = getImageFilename(img.url || img.src);
          console.log(`    ${startVarIdx + i}. [VARIANT] ${name}`);
      });

      // 5. ПОДГОТОВКА НА ID-тата ЗА ШОПИФАЙ
      // Важно: тук ползваме node.id, което Shopify ни върна в allImages (ProductImage ID)
      const finalOrderIds = [
        ogImageNode.id,
        ...unassignedImages.map(img => img.id),
        ...assignedImages.map(img => img.id)
      ];

      const itemsToReorder = finalOrderIds.map((id, index) => ({
        id: id,
        position: index + 1
      }));

      await reorderProductImages(productGid, itemsToReorder);
    }
	  
    return productGid;
    
  } catch (error) {
    console.error(`  ❌ Error creating product: ${error.message}`);
    stats[categoryType].errors++;
    return null;
  }
}







// UPDATE              ============================================================================================================================


async function updateShopifyProduct(shopifyProduct, filstarProduct, categoryType) {
    const productName = filstarProduct.name;
    console.log(`\n${'='.repeat(40)}`);
    console.log(`🔄 [PROCESS] ${productName}`);
    console.log(`${'='.repeat(40)}`);

    // 1. ПРОВЕРКА ЗА ВАРИАНТИ
    const shopifyVariantsCount = shopifyProduct.variants?.edges?.length || 0;
    const filstarVariantsCount = filstarProduct.variants?.length || 0;

    if (shopifyVariantsCount !== filstarVariantsCount) {
        console.log(`  ⚠️ MISMATCH! Shopify: ${shopifyVariantsCount}, Filstar: ${filstarVariantsCount}`);
        console.log(`  🚀 Recreating product...`);
        await deleteShopifyProduct(shopifyProduct.id);
        await createShopifyProduct(filstarProduct, categoryType);
        return;
    }

    try {
        const productGid = shopifyProduct.id;

        // 2. FETCH НА ТЕКУЩИ ДАННИ
        const productQuery = `
          query getProduct($id: ID!) {
            product(id: $id) {
              id
              tags
              images(first: 250) { edges { node { id src } } }
              variants(first: 100) {
                edges {
                  node {
                    id
                    sku
                    price
                    inventoryItem { id }
                    image { id }
                  }
                }
              }
            }
          }
        `;

        const productResponse = await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/graphql.json`, {
            method: 'POST',
            headers: { 'X-Shopify-Access-Token': ACCESS_TOKEN, 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: productQuery, variables: { id: productGid } })
        });

        const productResult = await productResponse.json();
        const fullProduct = productResult.data?.product;
        if (!fullProduct) throw new Error("Неуспешно извличане на продукта.");

        // 3. UPDATE ТАГОВЕ И ОСНОВНИ ПОЛЕТА
        console.log(`  🏷️  Updating tags...`);
        let finalTags = fullProduct.tags ? [...fullProduct.tags] : [];
        if (filstarProduct.tags) {
            const filstarTags = Array.isArray(filstarProduct.tags) ? filstarProduct.tags : filstarProduct.tags.split(',').map(t => t.trim());
            filstarTags.forEach(tag => { if (!finalTags.includes(tag)) finalTags.push(tag); });
        }
        const subcatTag = getSubcategoryTag(filstarProduct);
        if (subcatTag && !finalTags.includes(subcatTag)) finalTags.push(subcatTag);

        await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/graphql.json`, {
            method: 'POST',
            headers: { 'X-Shopify-Access-Token': ACCESS_TOKEN, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                query: `mutation p($input: ProductInput!) { productUpdate(input: $input) { product { id } } }`,
                variables: { input: { id: productGid, tags: finalTags, status: 'ACTIVE' } }
            })
        });

        // 4. UPDATE ВАРИАНТИ (REST API)
        console.log(`  💰 Processing price and inventory...`);
        const shopifyVariants = fullProduct.variants.edges.map(e => ({
            ...e.node,
            inventoryItemId: e.node.inventoryItem?.id.replace('gid://shopify/InventoryItem/', '')
        }));

        for (let i = 0; i < filstarProduct.variants.length; i++) {
            const fv = filstarProduct.variants[i];
            const sv = shopifyVariants[i];
            if (!sv) continue;

            const variantId = sv.id.replace('gid://shopify/ProductVariant/', '');
            let finalPrice = String(fv.price);
            let compareAtPrice = null;

            if (typeof promoData !== 'undefined' && promoData[fv.sku]) {
                finalPrice = String(promoData[fv.sku]);
                compareAtPrice = String(fv.price);
                console.log(`    🔥 PROMO: ${fv.sku} (${finalPrice} лв.)`);
            }

            // Update Price
            await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/variants/${variantId}.json`, {
                method: 'PUT',
                headers: { 'X-Shopify-Access-Token': ACCESS_TOKEN, 'Content-Type': 'application/json' },
                body: JSON.stringify({ variant: { id: variantId, price: finalPrice, compare_at_price: compareAtPrice } })
            });

            // Update Inventory
            if (sv.inventoryItemId) {
                const locId = LOCATION_ID.replace('gid://shopify/Location/', '');
                await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/inventory_levels/set.json`, {
                    method: 'POST',
                    headers: { 'X-Shopify-Access-Token': ACCESS_TOKEN, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ location_id: locId, inventory_item_id: sv.inventoryItemId, available: parseInt(fv.quantity) || 0 })
                });
            }
        }

        // 5. МЕДИЯ (КАЧВАНЕ И СВЪРЗВАНЕ)
        const existingImages = fullProduct.images.edges.map(e => getImageFilename(e.node.src));
        const filstarUrls = [
            ...(filstarProduct.images || []), 
            ...filstarProduct.variants.filter(v => v.image).map(v => v.image)
        ];
        
        const processedNames = new Set();

        for (const url of filstarUrls) {
            const cleanFilename = getImageFilename(url);
            if (processedNames.has(cleanFilename) || existingImages.includes(cleanFilename)) continue;
            processedNames.add(cleanFilename);

            console.log(`    📸 Uploading new image: ${cleanFilename}...`);
            let fullUrl = url.trim().startsWith('http') ? url.trim() : `${FILSTAR_BASE_URL}/${url.trim().replace(/^\//, '')}`;
            const buffer = await normalizeImage(encodeURI(fullUrl), filstarProduct.id || 'id');
            
            if (buffer) {
                const resourceUrl = await uploadImageToShopify(buffer, cleanFilename);
                if (resourceUrl) {
                    const altText = filstarProduct.name.replace(/"/g, '\\"');
                    const attachMutation = `
                      mutation {
                        productCreateMedia(
                          productId: "${productGid}"
                          media: [{
                            originalSource: "${resourceUrl}"
                            mediaContentType: IMAGE
                            alt: "${altText}"
                          }]
                        ) {
                          media { id }
                          mediaUserErrors { message }
                        }
                      }
                    `;

                    const attachRes = await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/graphql.json`, {
                        method: 'POST',
                        headers: { 'X-Shopify-Access-Token': ACCESS_TOKEN, 'Content-Type': 'application/json' },
                        body: JSON.stringify({ query: attachMutation })
                    });
                    
                    const attachData = await attachRes.json();
                    
                    // ЛОГ ЗА ДИАГНОСТИКА
                    console.log(`    📡 Media API Response: ${JSON.stringify(attachData).substring(0, 100)}`);

                    const newMediaId = attachData.data?.productCreateMedia?.media?.[0]?.id;

                    if (newMediaId) {
                        console.log(`    ✅ Image linked to product.`);
                        const targetFv = filstarProduct.variants.find(v => getImageFilename(v.image) === cleanFilename);
                        if (targetFv) {
                            const targetSv = shopifyVariants.find(s => s.sku === targetFv.sku);
                            if (targetSv) {
                                console.log(`    🔗 Linking to variant ${targetSv.sku}...`);
                                await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/graphql.json`, {
                                    method: 'POST',
                                    headers: { 'X-Shopify-Access-Token': ACCESS_TOKEN, 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                        query: `mutation v($i: ProductVariantInput!) { productVariantUpdate(input: $i) { productVariant { id } } }`,
                                        variables: { input: { id: targetSv.id, mediaId: newMediaId } }
                                    })
                                });
                            }
                        }
                    } else {
                        const err = attachData.data?.productCreateMedia?.mediaUserErrors?.[0]?.message;
                        console.log(`    ❌ Media Error: ${err || 'No ID returned'}`);
                    }
                }
            }
        }

        if (categoryType && stats[categoryType]) stats[categoryType].updated++;
        console.log(`\n✅ [FINISH] Update complete.`);

    } catch (error) {
        console.error(`❌ CRITICAL ERROR:`, error.message);
    }
}




// MAIN функция   =================================================================================================================================

  async function main() {
  console.log('🚀 Starting Filstar  КЪМПИНГ Import\n');
  console.log('📋 Categories to import:');
  console.log('  -  Категория Къмпинг  (ID: 63 ) ');
     
  try {
    // Fetch всички продукти от Filstar
    const allProducts = await fetchAllProducts();
    
    // Филтрирай само аксесоарите от 4-те категории
    let accessoryProducts = allProducts.filter(product => {
      const categoryType = getCategoryType(product);
      return categoryType !== null;
    });




 // Филтър за конкретни SKU (ако е нужно)
    const targetSkus = ['963810']; // Замени с реалните SKU-та
    accessoryProducts = accessoryProducts.filter(product => 
      product.variants && product.variants.some(v => targetSkus.includes(v.sku))
    );


	  
console.log(`🎯 Found ${accessoryProducts.length} products to process\n`);
	  
  
    // Групирай по категория
const productsByCategory = {
 camping: []
	  
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
