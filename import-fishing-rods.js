// import-fishing-rods.js - Универсален импорт на всички категории пръчки
const fetch = require('node-fetch');

const SHOPIFY_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const FILSTAR_TOKEN = process.env.FILSTAR_API_TOKEN;
const API_VERSION = '2024-10';
const FILSTAR_API_BASE = 'https://filstar.com/api';
const FILSTAR_BASE_URL = 'https://filstar.com';
// ⭐ ДОБАВИ ТУК:


const COLLECTION_MAPPING = {
  telescopes_with_guides: 'gid://shopify/Collection/739156001150',
  telescopes_without_guides: 'gid://shopify/Collection/739156033918',
  carp_rods: 'gid://shopify/Collection/739156099454',
  match_feeder: 'gid://shopify/Collection/739156132222',
  specialty_rods: 'gid://shopify/Collection/739156230526',
  kits: 'gid://shopify/Collection/739156164990',
  spinning: 'gid://shopify/Collection/739155968382'
 
};

// Категория ID-та за пръчки във Filstar
const FILSTAR_ROD_CATEGORY_IDS = {
  telescopes_with_guides: ['33'],
  telescopes_without_guides: ['38'],
  carp_rods: ['44'],
  match_feeder: ['47'],
  specialty_rods: ['57'],
  kits: ['56'],
  spinning: ['28']
  
};

// Parent категория "Пръчки"
const RODS_PARENT_ID = '2';

// Статистика за импорта

const stats = {
  telescopes_with_guides: { created: 0, updated: 0, images: 0 },
  telescopes_without_guides: { created: 0, updated: 0, images: 0 },
  carp_rods: { created: 0, updated: 0, images: 0 },
  match_feeder: { created: 0, updated: 0, images: 0 } , // ← Провери тази категория
  specialty_rods: { created: 0, updated: 0, images: 0 },
  kits: { created: 0, updated: 0, images: 0 } ,
  spinning: { created: 0, updated: 0, images: 0 } 
  
};




// Функция за извличане на filename от URL (без Shopify UUID и hash-ове)
function getImageFilename(src) {
  if (!src || typeof src !== 'string') {
    console.log('⚠️ Invalid image src:', src);
    return null;
  }
  
  const urlParts = src.split('/').pop();
  const withoutQuery = urlParts.split('?')[0];
  
  // Премахни Shopify UUID (формат: _xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)
  const uuidPattern = /_[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}(\.[a-z]+)?$/i;
  let cleanFilename = withoutQuery.replace(uuidPattern, '$1');
  
  // Премахни и стари hex hash-ове (без тирета, ако има)
  const parts = cleanFilename.split('_');
  if (parts.length > 1) {
    const lastPart = parts[parts.length - 1].split('.')[0]; // Вземи само името без extension
    if (lastPart.length >= 32 && /^[a-f0-9]+$/i.test(lastPart)) {
      parts.pop();
      const extension = cleanFilename.split('.').pop();
      cleanFilename = parts.join('_') + '.' + extension;
    }
  }
  
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
    telescopes_with_guides: [],
    telescopes_without_guides: [],
    carp_rods: [],
    match_feeder: [],
    specialty_rods: [],
    kits: [],
    spinning: []
   
  };
  
  allProducts.forEach(product => {
    const categoryIds = product.categories?.map(c => c.id.toString()) || [];
    
    if (categoryIds.some(id => FILSTAR_ROD_CATEGORY_IDS.telescopes_with_guides.includes(id))) {
      lines.telescopes_with_guides.push(product);
    } else if (categoryIds.some(id => FILSTAR_ROD_CATEGORY_IDS.telescopes_without_guides.includes(id))) {
      lines.telescopes_without_guides.push(product);
    } else if (categoryIds.some(id => FILSTAR_ROD_CATEGORY_IDS.carp_rods.includes(id))) {
      lines.carp_rods.push(product);
    } else if (categoryIds.some(id => FILSTAR_ROD_CATEGORY_IDS.match_feeder.includes(id))) {
      lines.match_feeder.push(product);
    } else if (categoryIds.some(id => FILSTAR_ROD_CATEGORY_IDS.specialty_rods.includes(id))) {
      lines.specialty_rods.push(product);
    } else if (categoryIds.some(id => FILSTAR_ROD_CATEGORY_IDS.kits.includes(id))) {
      lines.kits.push(product);
    } else if (categoryIds.some(id => FILSTAR_ROD_CATEGORY_IDS.spinning.includes(id))) {
      lines.spinning.push(product);  
    }
    }); 
  
  console.log(`\nCategorized fishing lines:`);
  console.log(`  - telescopes_with_guides: ${lines.telescopes_with_guides.length}`);
  console.log(`  - telescopes_without_guides: ${lines.telescopes_without_guides.length}`);
  console.log(`  - carp_rods: ${lines.carp_rods.length}`);
  console.log(`  - match_feeder: ${lines.match_feeder.length}`);
  console.log(`  - specialty_rods: ${lines.specialty_rods.length}`);
  console.log(`  - kits: ${lines.kits.length}`);
  console.log(`  - spinning: ${lines.spinning.length}\n`);
  return lines;
}



// Функция за филтриране на влакна по категории
function filterLinesByCategory(allProducts) {
  const lines = {
    telescopes_with_guides: [],
    telescopes_without_guides: [],
    carp_rods: [],
    match_feeder: [],
    specialty_rods: [],
    kits: [],
    spinning: []
   
  };
  
  allProducts.forEach(product => {
    const categoryIds = product.categories?.map(c => c.id.toString()) || [];
    const categoryNames = product.categories?.map(c => c.name) || [];
    

    // Телескопи без водачи
    if (categoryIds.some(id => FILSTAR_ROD_CATEGORY_IDS.telescopes_with_guides.includes(id)) ||
        categoryNames.some(name => name.includes('Телескопи с водачи') || name.toLowerCase().includes('telescope swith guides'))) {
      lines.telescopes_with_guides.push(product);
    }
    // Телескопи с водачи
    else if (categoryIds.some(id => FILSTAR_ROD_CATEGORY_IDS.telescopes_without_guides.includes(id)) ||
             categoryNames.some(name => name.includes('Телескопи без водачи') || name.toLowerCase().includes('telescopes without guides'))) {
      lines.telescopes_without_guides.push(product);
    }
    // Шарански пръчки
    else if (categoryIds.some(id => FILSTAR_ROD_CATEGORY_IDS.carp_rods.includes(id)) ||
             categoryNames.some(name => name.toLowerCase().includes('Шарански пръчки'))) {
      lines.carp_rods.push(product);
    }

  // Мач и Фидер
    else if (categoryIds.some(id => FILSTAR_ROD_CATEGORY_IDS.match_feeder.includes(id)) ||
             categoryNames.some(name => name.toLowerCase().includes('Мач и Фидеер'))) {
      lines.match_feeder.push(product);
    }
   // Специални пръчки
    else if (categoryIds.some(id => FILSTAR_ROD_CATEGORY_IDS.specialty_rods.includes(id)) ||
             categoryNames.some(name => name.toLowerCase().includes('Специални пръчки'))) {
      lines.specialty_rods.push(product);
    }   
 // Комплекти
    else if (categoryIds.some(id => FILSTAR_ROD_CATEGORY_IDS.kits.includes(id)) ||
             categoryNames.some(name => name.toLowerCase().includes('Комплекти'))) {
      lines.kits.push(product);
    }
// Спининг
    else if (categoryIds.some(id => FILSTAR_ROD_CATEGORY_IDS.spinning.includes(id)) ||
             categoryNames.some(name => name.toLowerCase().includes('Спининг'))) {
      lines.spinning.push(product);
    } 
  });
  
  console.log(`\nFiltered fishing lines:`);
  console.log(`  - telescopes_with_guides: ${lines.telescopes_with_guides.length}`);
  console.log(`  - telescopes_without_guides: ${lines.telescopes_without_guides.length}`);
  console.log(`  - carp_rods: ${lines.carp_rods.length}`);
  console.log(`  - match_feeder: ${lines.match_feeder.length}`);
  console.log(`  - specialty_rods: ${lines.specialty_rods.length}`);
  console.log(`  - kits: ${lines.kits.length}`);
  console.log(`  - spinning: ${lines.spinning.length}`);
  
  console.log(`  - Total: ${lines.telescopes_with_guides.length + lines.telescopes_without_guides.length + 
                            lines.carp_rods.length + lines.match_feeder.length + lines.specialty_rods.length + 
                            lines.kits.length+ lines.spinning.length}\n`);
  
  return lines;
}

// Функция за намиране на продукт в Shopify по SKU
async function findShopifyProductBySku(sku) {
  const response = await fetch(
    `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/products.json?fields=id,title,variants,images&limit=250`,
    {
      method: 'GET',
      headers: {
        'X-Shopify-Access-Token': ACCESS_TOKEN,
        'Content-Type': 'application/json'
      }
    }
  );
  
  if (!response.ok) {
    console.error('Failed to fetch Shopify products');
    return null;
  }
  
  const data = await response.json();
  
  for (const product of data.products) {
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
  let parts = [];
  
  // Модел (ако има)
  if (variant.model && variant.model.trim() && variant.model !== 'N/A') {
    parts.push(variant.model.trim());
  }
  
  // Дължина
  const length = attributes.find(a => a.attribute_name.includes('ДЪЛЖИНА'))?.value;
  if (length) {
    parts.push(`${length}м`);
  }
  
  // Диаметър
  const diameter = attributes.find(a => 
    a.attribute_name.includes('РАЗМЕР') && a.attribute_name.includes('MM')
  )?.value;
  if (diameter) {
    parts.push(`⌀${diameter}мм`);
  }
  
  // Японска номерация (за плетени)
  if (categoryType === 'telescopes_without_guides') {
    const japaneseSize = attributes.find(a => 
      a.attribute_name.includes('ЯПОНСКА НОМЕРАЦИЯ')
    )?.value;
    if (japaneseSize) {
      const formattedSize = japaneseSize.startsWith('#') ? japaneseSize : `#${japaneseSize}`;
      parts.push(formattedSize);
    }
  }
  
  // Тест кг
  const testKg = attributes.find(a => 
    a.attribute_name.includes('ТЕСТ') && a.attribute_name.includes('KG')
  )?.value;
  if (testKg) {
    parts.push(`${testKg}кг`);
  }
  
  // НОВО: Цвят (добави накрая)
  const color = attributes.find(a => a.attribute_name.includes('ЦВЯТ'))?.value;
  if (color) {
    parts.push(color);
  }
  
  return parts.length > 0 ? parts.join(' / ') : `SKU: ${variant.sku}`;
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


 let uploadedImagesCount = 0; // ← За статистиката
  let imagesUploaded = 0;      // ← За локалния лог
  let imagesSkipped = 0;       // ← За skip-натите
  
  console.log(`\nUpdating product: ${shopifyProduct.title}`);
  
  const productId = shopifyProduct.id;
 
  
  // Upload снимки (само нови)
  if (filstarProduct.images && filstarProduct.images.length > 0) {
    console.log(`Processing ${filstarProduct.images.length} images from Filstar...`);
    
    for (const imageUrl of filstarProduct.images) {
      const uploaded = await uploadProductImage(productId, imageUrl, shopifyProduct.images);
      if (uploaded) {
        imagesUploaded++;
        uploadedImagesCount++;
      } else {
        imagesSkipped++;
      }
    }
    
    console.log(`Images: ${imagesUploaded} uploaded, ${imagesSkipped} skipped (already exist)`);
  }
  
  // // Update варианти
   if (filstarProduct.variants && filstarProduct.variants.length > 0) {
     console.log(`Updating ${filstarProduct.variants.length} variants...`);
     
     for (const filstarVariant of filstarProduct.variants) {
       const existingVariant = shopifyProduct.variants.find(v => v.sku === filstarVariant.sku);
       
       if (existingVariant) {
         const newOptionName = formatVariantName(filstarVariant, categoryType);
         
         const updateResponse = await fetch(
           `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/variants/${existingVariant.id}.json`,
           {
             method: 'PUT',
            headers: {
              'X-Shopify-Access-Token': ACCESS_TOKEN,
               'Content-Type': 'application/json'
             },
             body: JSON.stringify({
               variant: {
                 id: existingVariant.id,
                 option1: newOptionName,
                 price: filstarVariant.price || existingVariant.price
               }
             })
           }
      );
         
         if (updateResponse.ok) {
           console.log(`  ✓ Updated variant: ${newOptionName}`);
           stats[categoryType].updated++;
           stats[categoryType].images += uploadedImagesCount;

           
         }
         
         await new Promise(resolve => setTimeout(resolve, 300));
       }
     }
   }


  // Обнови статистиката
stats[categoryType].updated++;
stats[categoryType].images += uploadedImagesCount;
  console.log(`✅ Finished updating product`);
  // Обнови статистиката


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
    telescopes_with_guides: 'Телескопи с водачи',
    telescopes_without_guides: 'Телескопи без водачи',
    carp_rods: 'Шарански пръчки',
    match_feeder: 'Maч и Фидер',  specialty_rods: Специални пръчки',  kits: 'Комплекти',  spinning: 'Спининг'
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
  console.log('Starting fishing lines import...\n');

  try {
  const lines = await fetchAllFishingLines(); // ← Обратно на старото име

    // Loop през 4-те категории
    for (const [category, products] of Object.entries(lines)) {
      if (products.length === 0) continue;

      console.log(`\n${'='.repeat(60)}`);
      console.log(`Processing ${getCategoryName(category)}: ${products.length} products`);
      console.log('='.repeat(60));

      for (const product of products) {
        await processProduct(product, category);
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    // Покажи финална статистика
    printFinalStats();

    console.log('✅ Import completed!');

  } catch (error) {
    console.error('❌ Import failed:', error.message);
    process.exit(1);
  }
}

main();

