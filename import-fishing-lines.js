// import-fishing-lines.js - Универсален импорт на всички категории влакна
const fetch = require('node-fetch');

const SHOPIFY_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const FILSTAR_TOKEN = process.env.FILSTAR_API_TOKEN;
const API_VERSION = '2024-10';
const FILSTAR_API_BASE = 'https://filstar.com/api';
const FILSTAR_BASE_URL = 'https://filstar.com';
// ⭐ ДОБАВИ ТУК:
const COLLECTION_MAPPING = {
  monofilament: 'gid://shopify/Collection/738965946750',
  braided: 'gid://shopify/Collection/738965979518',
  fluorocarbon: 'gid://shopify/Collection/738987442558',
  other: 'gid://shopify/Collection/739068576126'
};



// Категория ID-та за влакна във Filstar
const FILSTAR_LINE_CATEGORY_IDS = {
  monofilament: ['41'],
  braided: ['105'],
  fluorocarbon: ['106'],
  other: ['109']
};
// Parent категория "Влакна и поводи"
const LINES_PARENT_ID = '4';


// Статистика за импорта
const stats = {
  monofilament: { created: 0, updated: 0, images: 0 },
  braided: { created: 0, updated: 0, images: 0 },
  fluorocarbon: { created: 0, updated: 0, images: 0 },
  other: { d: 0, updated: 0, images: 0 }
};



// Функция за извличане на filename от URL (без hash)
function getImageFilename(src) {
  if (!src || typeof src !== 'string') {
    console.log('⚠️ Invalid image src:', src);
    return null;
  }
  
  const urlParts = src.split('/').pop();
  const withoutQuery = urlParts.split('?')[0];
  
  const parts = withoutQuery.split('_');
  if (parts.length > 1) {
    const lastPart = parts[parts.length - 1];
    if (lastPart.length >= 32 && /^[a-f0-9]+/.test(lastPart)) {
      parts.pop();
    }
  }
  
  return parts.join('_');
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
    monofilament: [],
    braided: [],
    fluorocarbon: [],
    other: []
  };
  
  allProducts.forEach(product => {
    const categoryIds = product.categories?.map(c => c.id.toString()) || [];
    
    if (categoryIds.some(id => FILSTAR_LINE_CATEGORY_IDS.monofilament.includes(id))) {
      lines.monofilament.push(product);
    } else if (categoryIds.some(id => FILSTAR_LINE_CATEGORY_IDS.braided.includes(id))) {
      lines.braided.push(product);
    } else if (categoryIds.some(id => FILSTAR_LINE_CATEGORY_IDS.fluorocarbon.includes(id))) {
      lines.fluorocarbon.push(product);
    } else if (categoryIds.some(id => FILSTAR_LINE_CATEGORY_IDS.other.includes(id))) {
      lines.other.push(product);
    }
  });
  
  console.log(`\nCategorized fishing lines:`);
  console.log(`  - Monofilament: ${lines.monofilament.length}`);
  console.log(`  - Braided: ${lines.braided.length}`);
  console.log(`  - Fluorocarbon: ${lines.fluorocarbon.length}`);
  console.log(`  - Other: ${lines.other.length}\n`);
  
  return lines;
}












// Функция за филтриране на влакна по категории
function filterLinesByCategory(allProducts) {
  const lines = {
    monofilament: [],
    braided: [],
    fluorocarbon: [],
    other: []
  };
  
  allProducts.forEach(product => {
    const categoryIds = product.categories?.map(c => c.id.toString()) || [];
    const categoryNames = product.categories?.map(c => c.name) || [];
    
    // Провери дали има parent "Влакна и поводи" (ID: 4)
    const hasLineParent = product.categories?.some(c => 
      c.parent_id === LINES_PARENT_ID || c.parent_id === parseInt(LINES_PARENT_ID)
    );
    
    // Монофилни
    if (categoryIds.some(id => FILSTAR_LINE_CATEGORY_IDS.monofilament.includes(id)) ||
        categoryNames.some(name => name.includes('Монофилни') || name.toLowerCase().includes('monofilament'))) {
      lines.monofilament.push(product);
    }
    // Плетени
    else if (categoryIds.some(id => FILSTAR_LINE_CATEGORY_IDS.braided.includes(id)) ||
             categoryNames.some(name => name.includes('Плетени') || name.toLowerCase().includes('braid'))) {
      lines.braided.push(product);
    }
    // Fluorocarbon
    else if (categoryIds.some(id => FILSTAR_LINE_CATEGORY_IDS.fluorocarbon.includes(id)) ||
             categoryNames.some(name => name.toLowerCase().includes('fluorocarbon'))) {
      lines.fluorocarbon.push(product);
    }
    // Други - САМО ако има parent "Влакна и поводи"
    else if (categoryIds.some(id => FILSTAR_LINE_CATEGORY_IDS.other.includes(id)) && hasLineParent) {
      lines.other.push(product);
    }
  });
  
  console.log(`\nFiltered fishing lines:`);
  console.log(`  - Monofilament: ${lines.monofilament.length}`);
  console.log(`  - Braided: ${lines.braided.length}`);
  console.log(`  - Fluorocarbon: ${lines.fluorocarbon.length}`);
  console.log(`  - Other: ${lines.other.length}`);
  console.log(`  - Total: ${lines.monofilament.length + lines.braided.length + lines.fluorocarbon.length + lines.other.length}\n`);
  
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


// Функция за форматиране на variant име
function formatVariantName(variant, categoryType) {
  if (!variant.attributes || variant.attributes.length === 0) {
    return variant.model || `SKU: ${variant.sku}`;
  }
  
  const attributes = variant.attributes;
  let parts = [];
  
  // Модел (ако има)
  if (variant.model && variant.model.trim()) {
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
  if (categoryType === 'braided') {
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





// Функция за създаване на нов продукт в Shopify
async function createShopifyProduct(filstarProduct, category) {
  console.log(`\n🆕 Creating new product: ${filstarProduct.name}`);
  
  try {
    // Извлечи vendor
    const vendor = filstarProduct.manufacturer || 'Unknown';
    console.log(`  🏷️  Vendor: ${vendor}`);

    // Подготви продукта
    const productData = {
      product: {
        title: filstarProduct.name,
        body_html: filstarProduct.description || '',
        vendor: vendor,
        product_type: getCategoryName(category),
        tags: ['Filstar', category, vendor],
        status: 'active',
        variants: filstarProduct.variants.map(variant => ({
          sku: variant.sku,
          price: variant.price,
          inventory_quantity: parseInt(variant.quantity) || 0,
          inventory_management: 'shopify',
          option1: formatVariantName(variant, category),
          barcode: variant.barcode || null,
          weight: parseFloat(variant.weight) || 0,
          weight_unit: 'kg'
        })),
        options: [
          {
            name: 'Вариант',
            values: filstarProduct.variants.map(v => formatVariantName(v, category))
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
    monofilament: 'Влакно монофилно',
    braided: 'Влакно плетено',
    fluorocarbon: 'Fluorocarbon',
    other: 'Влакно Други'
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

