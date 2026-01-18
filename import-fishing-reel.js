// import-fishing-reel.js - Универсален импорт на всички категории макари CARPLANDIA 
const fetch = require('node-fetch');

const SHOPIFY_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const FILSTAR_TOKEN = process.env.FILSTAR_API_TOKEN;
const API_VERSION = '2024-10';
const FILSTAR_API_BASE = 'https://filstar.com/api';
const FILSTAR_BASE_URL = 'https://filstar.com';
// ⭐ ДОБАВИ ТУК:


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


// Статистика за импорта

const stats = {
  front_drag: { created: 0, updated: 0, images: 0 },
  rear_drag: { created: 0, updated: 0, images: 0 },
  baitrunner: { created: 0, updated: 0, images: 0 },
  multipliers: { created: 0, updated: 0, images: 0 } , // ← Провери тази категория
  other: { created: 0, updated: 0, images: 0 }

  
};


function getImageFilename(src) {
  if (!src || typeof src !== 'string') {
    console.log('⚠️ Invalid image src:', src);
    return null;
  }
  
  const urlParts = src.split('/').pop();
  const withoutQuery = urlParts.split('?')[0];
  
  // Премахни Shopify UUID (формат: _xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)
  const uuidPattern = /_[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/g;
  let cleanFilename = withoutQuery.replace(uuidPattern, '');
  
  // Премахни hex hash-ове (32+ символа, само a-f0-9)
  const parts = cleanFilename.split('_');
  const extension = cleanFilename.split('.').pop();
  
  // Филтрирай всички части - премахни тези които са hash-ове
  const filteredParts = parts.filter(part => {
    const partWithoutExt = part.split('.')[0];
    // Ако частта е 32+ hex символа, премахни я
    return !(partWithoutExt.length >= 32 && /^[a-f0-9]+$/i.test(partWithoutExt));
  });
  
  cleanFilename = filteredParts.join('_');
  
  // Ако няма extension в края, добави го
  if (!cleanFilename.endsWith('.' + extension)) {
    cleanFilename += '.' + extension;
  }
  
  // Премахни leading underscores
  cleanFilename = cleanFilename.replace(/^_+/, '');
  
  // Нормализирай extension (.jpg и .jpeg са еднакви)
  cleanFilename = cleanFilename.replace(/\.jpeg$/i, '.jpg');
  
  return cleanFilename;
}





// Функция за проверка дали снимка съществува
function imageExists(existingImages, newImageUrl) {
  const newFilename = getImageFilename(newImageUrl);
  if (!newFilename) return false;
  
  return existingImages.some(img => {
    const existingFilename = getImageFilename(img.src);
    return existingFilename && existingFilename === newFilename;
  });
}

// Функция за извличане на всички продукти от Filstar с пагинация
async function fetchAllProducts() {
  console.log('Fetching all products from Filstar API with pagination...');
  
  let allProducts = [];
  let page = 1;
  let hasMorePages = true;
  
  try {
    while (hasMorePages) {  
      console.log(`Fetching page ${page}...`);
      
      const response = await fetch(`${FILSTAR_API_BASE}/products?page=${page}&limit=1000`, {
        headers: {
          'Authorization': `Bearer ${FILSTAR_TOKEN}`
        }
      });

      if (!response.ok) {
        throw new Error(`Filstar API error: ${response.status}`);
      }

      const pageProducts = await response.json();
      console.log(`Page ${page}: ${pageProducts.length} products`);
      
      if (pageProducts.length === 0) {
        console.log('No more products, stopping pagination');
        hasMorePages = false;
      } else {
        allProducts = allProducts.concat(pageProducts);
        page++;
      }
    }
    
    console.log(`\nTotal products fetched: ${allProducts.length}\n`);
    
    return allProducts;
    
  } catch (error) {
    console.error('Error fetching products:', error.message);
    throw error;
  }
}



// Функция за категоризиране на продуктите
async function fetchAllFishingLines() {
  const allProducts = await fetchAllProducts();
  
  const lines = {
    front_drag: [],
    rear_drag: [],
    baitrunner: [],
    multipliers: [],
    other: []
  };
  
  allProducts.forEach(product => {
    const categoryIds = product.categories?.map(c => c.id.toString()) || [];
    
    if (categoryIds.some(id => FILSTAR_REEL_CATEGORY_IDS.front_drag.includes(id))) {
      lines.front_drag.push(product);
    } else if (categoryIds.some(id => FILSTAR_REEL_CATEGORY_IDS.rear_drag.includes(id))) {
      lines.rear_drag.push(product);
    } else if (categoryIds.some(id => FILSTAR_REEL_CATEGORY_IDS.baitrunner.includes(id))) {
      lines.baitrunner.push(product);
    } else if (categoryIds.some(id => FILSTAR_REEL_CATEGORY_IDS.multipliers.includes(id))) {
      lines.multipliers.push(product);
    } else if (categoryIds.some(id => FILSTAR_REEL_CATEGORY_IDS.other.includes(id))) {
      lines.other.push(product);  
    }
    }); 
  
  console.log(`\nCategorized fishing lines:`);
  console.log(`  - front_drag: ${lines.front_drag.length}`);
  console.log(`  - rear_drag: ${lines.rear_drag.length}`);
  console.log(`  - baitrunner: ${lines.baitrunner.length}`);
  console.log(`  - multipliers: ${lines.multipliers.length}`);
  console.log(`  - other: ${lines.other.length}\n`);
  
  return lines;
}



// Функция за филтриране на макари по категории
function filterLinesByCategory(allProducts) {
  const lines = {
    front_drag: [],
    rear_drag: [],
    baitrunner: [],
    multipliers: [],
    other: []
  };
  
  allProducts.forEach(product => {
    const categoryIds = product.categories?.map(c => c.id.toString()) || [];
    const categoryNames = product.categories?.map(c => c.name) || [];
    

    //Макари Преден аванс
    if (categoryIds.some(id => FILSTAR_REEL_CATEGORY_IDS.front_drag.includes(id)) ||
        categoryNames.some(name => name.includes('Макари Преден аванс') || name.toLowerCase().includes('Reels Front'))) {
      lines.front_drag.push(product);
    }
    // Макари заден аванс
    else if (categoryIds.some(id => FILSTAR_REEL_CATEGORY_IDS.rear_drag.includes(id)) ||
             categoryNames.some(name => name.includes('Макари заден аванс') || name.toLowerCase().includes('Reels Rear'))) {
      lines.rear_drag.push(product);
    }
    // Баитрънър
    else if (categoryIds.some(id => FILSTAR_REEL_CATEGORY_IDS.baitrunner.includes(id)) ||
             categoryNames.some(name => name.toLowerCase().includes('Баитрънър'))) {
      lines.baitrunner.push(product);
    }

  // Мултипликатори
    else if (categoryIds.some(id => FILSTAR_REEL_CATEGORY_IDS.multipliers.includes(id)) ||
             categoryNames.some(name => name.toLowerCase().includes('Мач и Фидеер'))) {
      lines.multipliers.push(product);
    }
   // Специални пръчки
    else if (categoryIds.some(id => FILSTAR_REEL_CATEGORY_IDS.other.includes(id)) ||
             categoryNames.some(name => name.toLowerCase().includes('Мултипликатори'))) {
      lines.other.push(product);
    } 
  });
  
  console.log(`\nFiltered fishing lines:`);
  console.log(`  - front_drag: ${lines.front_drag.length}`);
  console.log(`  - rear_drag: ${lines.rear_drag.length}`);
  console.log(`  - baitrunner: ${lines.baitrunner.length}`);
  console.log(`  - multipliers: ${lines.multipliers.length}`);
  console.log(`  - other: ${lines.other.length}`);

  
  console.log(`  - Total: ${lines.front_drag.length + lines.rear_drag.length + 
                            lines.baitrunner.length + lines.multipliers.length + lines.other.length }\n`);
  
  return lines;
}

// Функция за намиране на продукт в Shopify по SKU (с пагинация)
async function findShopifyProductBySku(sku) {
  let allProducts = [];
  let pageInfo = null;
  let hasNextPage = true;
  
  while (hasNextPage) {
    // ПОПРАВКА: Премахнат fields параметър за да се вземат всички полета включително images.src
    let url = `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/products.json?limit=250`;
    
    if (pageInfo) {
      url += `&page_info=${pageInfo}`;
    }
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-Shopify-Access-Token': ACCESS_TOKEN,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      console.error('Failed to fetch Shopify products');
      return null;
    }
    
    const data = await response.json();
    allProducts = allProducts.concat(data.products);
    
    // Провери за следваща страница
    const linkHeader = response.headers.get('Link');
    if (linkHeader && linkHeader.includes('rel="next"')) {
      const nextMatch = linkHeader.match(/<[^>]*[?&]page_info=([^>&]+)[^>]*>;\s*rel="next"/);
      if (nextMatch) {
        pageInfo = nextMatch[1];
      } else {
        hasNextPage = false;
      }
    } else {
      hasNextPage = false;
    }
    
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  
  console.log(`  Searched ${allProducts.length} products for SKU: ${sku}`);
  
  // Търси в ВСИЧКИ продукти
  for (const product of allProducts) {
    const hasVariant = product.variants.some(v => v.sku === sku);
    if (hasVariant) {
      return product;
    }
  }
  
  return null;
}



function formatVariantName(variant, categoryType) {
  if (!variant.attributes || variant.attributes.length === 0) {
    return variant.model || `SKU: ${variant.sku}`;
  }
  
  const attributes = variant.attributes;
  
  // Размер на макарата
  const size = attributes.find(a => a.attribute_name.includes('РАЗМЕР'))?.value;
  
  if (size) {
    return `Размер ${size}`;
  }
  
  // Fallback към model или SKU
  return variant.model || `SKU: ${variant.sku}`;
}



async function addProductImages(productId, filstarProduct) {
  console.log(`Adding images to product ${productId}...`);
  
  let uploadedCount = 0; // ← Добави брояч
  
  // Събери всички изображения
  const images = [];
  
  // Главно изображение на продукта
  if (filstarProduct.image) {
    const imageUrl = filstarProduct.image.startsWith('http') 
      ? filstarProduct.image 
      : `${FILSTAR_BASE_URL}/${filstarProduct.image}`;
    images.push({ src: imageUrl });
    console.log(`  Found main image: ${imageUrl}`);
  }
  
  // Допълнителни изображения
  if (filstarProduct.images && Array.isArray(filstarProduct.images)) {
    for (const img of filstarProduct.images) {
      const imageUrl = img.startsWith('http') 
        ? img 
        : `${FILSTAR_BASE_URL}/${img}`;
      images.push({ src: imageUrl });
      console.log(`  Found additional image: ${imageUrl}`);
    }
  }
  
  // Изображения на варианти
  if (filstarProduct.variants) {
    for (const variant of filstarProduct.variants) {
      if (variant.image) {
        const imageUrl = variant.image.startsWith('http') 
          ? variant.image 
          : `${FILSTAR_BASE_URL}/${variant.image}`;
        images.push({ src: imageUrl });
        console.log(`  Found variant image: ${imageUrl}`);
      }
    }
  }
  
  if (images.length === 0) {
    console.log(`  No images found for this product`);
    return 0; // ← Върни 0
  }
  
  // Добави изображенията към продукта
  for (const image of images) {
    const response = await fetch(
      `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/products/${productId}/images.json`,
      {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': ACCESS_TOKEN,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ image })
      }
    );
    
    if (response.ok) {
      console.log(`  ✓ Added image: ${image.src}`);
      uploadedCount++; // ← Increment при успех
    } else {
      const error = await response.text();
      console.error(`  ✗ Failed to add image:`, error);
    }
    
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  return uploadedCount; // ← Върни броя
}


// Функция за проверка и коригиране на дубликати
function ensureUniqueVariantNames(variants, categoryType) {
  const formattedVariants = variants.map(v => ({
    original: v,
    name: formatVariantName(v, categoryType),
    sku: v.sku
  }));
  
  // Намери дубликати
  const nameCounts = {};
  formattedVariants.forEach(v => {
    nameCounts[v.name] = (nameCounts[v.name] || 0) + 1;
  });
  
  // Провери дали има поне един дубликат
  const hasDuplicates = Object.values(nameCounts).some(count => count > 1);
  
  // Ако има дубликати, добави SKU на ВСИЧКИ варианти
  if (hasDuplicates) {
    console.log('  ⚠️  Duplicates detected - adding SKU to all variant names');
    return formattedVariants.map(v => `SKU ${v.sku}: ${v.name}`);
  }
  
  // Ако няма дубликати, върни нормалните имена
  return formattedVariants.map(v => v.name);
}




// Функция за създаване на нов продукт в Shopify
async function createShopifyProduct(filstarProduct, category) {
  console.log(`\n🆕 Creating new product: ${filstarProduct.name}`);
  
  try {
    // Извлечи vendor
    const vendor = filstarProduct.manufacturer || 'Unknown';
    console.log(`  🏷️  Vendor: ${vendor}`);

    // Генерирай уникални имена на варианти (с проверка за дубликати)
    const variantNames = ensureUniqueVariantNames(filstarProduct.variants, category);

    // Подготви продукта
    const productData = {
      product: {
        title: filstarProduct.name,
        body_html: filstarProduct.description || '',
        vendor: vendor,
        product_type: getCategoryName(category),
        tags: ['Filstar', category, vendor],
        status: 'active',
        variants: filstarProduct.variants.map((variant, index) => ({
          sku: variant.sku,
          price: variant.price,
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

    // Добави изображения
    const uploadedImages = await addProductImages(productId, filstarProduct);

    // Добави в колекция
    await addProductToCollection(productId, category);

    // Обнови статистиката
    stats[category].created++;
    stats[category].images += uploadedImages;

    return result.product;

  } catch (error) {
    console.error(`  ❌ Error creating product:`, error.message);
    throw error;
  }
}






// Функция за добавяне на продукт в колекция
async function addProductToCollection(productId, category) {
  const collectionId = COLLECTION_MAPPING[category];
  
  if (!collectionId) {
    console.log(`  ⚠️  No collection mapping for category: ${category}`);
    return;
  }

  try {
    const numericCollectionId = collectionId.split('/').pop();
    
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

    if (response.ok) {
      console.log(`  ✅ Added to collection: ${getCategoryName(category)}`);
    }

  } catch (error) {
    console.error(`  ⚠️  Error adding to collection:`, error.message);
  }
}




// Функция за upload на снимка (само ако не съществува)
async function uploadProductImage(productId, imageUrl, existingImages) {
  if (imageExists(existingImages, imageUrl)) {
    console.log(`  ⏭️  Image already exists, skipping: ${getImageFilename(imageUrl)}`);
    return false;
  }
  
  console.log(`  📸 Uploading new image: ${getImageFilename(imageUrl)}`);
  
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
    const error = await response.text();
    console.error(`  ✗ Failed to upload image:`, error);
    return false;
  }
  
  console.log(`  ✓ Image uploaded successfully`);
  await new Promise(resolve => setTimeout(resolve, 300));
  return true;
}



// Функция за update на продукт
async function updateProduct(shopifyProduct, filstarProduct, categoryType) {
  let uploadedImagesCount = 0;
  let imagesUploaded = 0;
  let imagesSkipped = 0;
  
  console.log(`\nUpdating product: ${shopifyProduct.title}`);
  
  const productId = shopifyProduct.id;
 
  // Upload снимки (само нови)
  if (filstarProduct.images && filstarProduct.images.length > 0) {
    console.log(`Processing ${filstarProduct.images.length} images from Filstar...`);
    
    // DEBUG: Провери какво съдържа shopifyProduct.images
    console.log(`  🐛 DEBUG: shopifyProduct.images exists: ${!!shopifyProduct.images}`);
    console.log(`  🐛 DEBUG: shopifyProduct.images length: ${shopifyProduct.images?.length || 0}`);
    if (shopifyProduct.images && shopifyProduct.images.length > 0) {
      console.log(`  🐛 DEBUG: First image has src: ${!!shopifyProduct.images[0].src}`);
      console.log(`  🐛 DEBUG: First image src value: ${shopifyProduct.images[0].src || 'MISSING'}`);
    }
    
    for (const imageUrl of filstarProduct.images) {
      const uploaded = await uploadProductImage(productId, imageUrl, shopifyProduct.images);
      
      if (uploaded) {
        uploadedImagesCount++;
        imagesUploaded++;
        
        // Добави новата снимка към масива, за да се избегне дублиране в същия batch
        shopifyProduct.images.push({
          src: imageUrl,
          id: null
        });
      } else {
        imagesSkipped++;
      }
    }
  }
  
  // Останалата част на функцията...
}

// край на апдейт на продукт


// Функция за обработка на 1 продукт
async function processProduct(filstarProduct, category) {
  const firstVariantSku = filstarProduct.variants?.[0]?.sku;
  
  if (!firstVariantSku) {
    console.log(`  ⚠️  No SKU found, skipping: ${filstarProduct.name}`);
    return;
  }

  console.log(`\nProcessing: ${filstarProduct.name}`);
  console.log(`  Searching for SKU: ${firstVariantSku}...`);

  // Търси съществуващ продукт
  const existingProduct = await findShopifyProductBySku(firstVariantSku);

  if (existingProduct) {
    console.log(`  ✓ Found existing product (ID: ${existingProduct.id})`);
    await updateProduct(existingProduct, filstarProduct, category);
  } else {
    console.log(`  ℹ️  Product not found in Shopify`);
    await createShopifyProduct(filstarProduct, category);
  }
}






// Helper функция за име на категорията
function getCategoryName(category) {
  const names = {
    front_drag: 'Макари с преден аванс',
    rear_drag: 'Макари с заден аванс',
    baitrunner: 'Байтрънър',
    multipliers: 'Мултиплокатори',  other: 'Други'
  };
  return names[category] || category;
}


// Функция за показване на финална статистика
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
    console.log(`  ✨ Created: ${data.created} products`);
    console.log(`  🔄 Updated: ${data.updated} products`);
    console.log(`  🖼️  Images: ${data.images} uploaded`);

    totalCreated += data.created;
    totalUpdated += data.updated;
    totalImages += data.images;
  }

  console.log('\n' + '-'.repeat(70));
  console.log(`TOTAL: ${totalCreated} created | ${totalUpdated} updated | ${totalImages} images`);
  console.log('='.repeat(70) + '\n');
}


// Главна функция

async function main() {
  console.log('Starting import...\n');
  
 
  const fishingReels = await fetchAllFishingLines();
  
  // Категоризирай макарите
  const frontDragReels = filterLinesByCategory(fishingReels, FRONT_DRAG_CATEGORY_IDS);
  const rearDragReels = filterLinesByCategory(fishingReels, REAR_DRAG_CATEGORY_IDS);
  const baitrunnerReels = filterLinesByCategory(fishingReels, BAITRUNNER_CATEGORY_IDS);
  const multiplierReels = filterLinesByCategory(fishingReels, MULTIPLIER_CATEGORY_IDS);
  const otherReels = filterLinesByCategory(fishingReels, OTHER_CATEGORY_IDS);
  
  console.log(`\n📊 Found fishing reels:`);
  console.log(`  Макари с преден аванс: ${frontDragReels.length}`);
  console.log(`  Макари с заден аванс: ${rearDragReels.length}`);
  console.log(`  Байтрънър: ${baitrunnerReels.length}`);
  console.log(`  Мултиплокатори: ${multiplierReels.length}`);
  console.log(`  Други: ${otherReels.length}\n`);
  
  // Обработи всяка категория
  for (const reel of frontDragReels) {
    await processProduct(reel, 'frontDrag');
  }
  
  for (const reel of rearDragReels) {
    await processProduct(reel, 'rearDrag');
  }
  
  for (const reel of baitrunnerReels) {
    await processProduct(reel, 'baitrunner');
  }
  
  for (const reel of multiplierReels) {
    await processProduct(reel, 'multiplier');
  }
  
  for (const reel of otherReels) {
    await processProduct(reel, 'other');
  }
  
  printFinalStats();
}

main();


