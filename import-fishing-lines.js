// import-fishing-lines.js - Import на влакна от всички категории
const fetch = require('node-fetch');

const SHOPIFY_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const FILSTAR_TOKEN = process.env.FILSTAR_API_TOKEN;
const API_VERSION = '2024-10';
const FILSTAR_API_BASE = 'https://filstar.com/api';

// Mapping на категории Filstar → Shopify колекции
const CATEGORY_MAPPING = {
  '41': {
    name: 'Монофилни',
    shopifyCollectionId: '738965946750'
  },
  '105': {
    name: 'Плетени',
    shopifyCollectionId: '738965979518'
  },
  '107': {
    name: 'Fluorocarbon',
    shopifyCollectionId: '738987442558'
  },
  '109': {
    name: 'Други',
    shopifyCollectionId: '739068576126'
  }
};

// Функция за извличане на filename от URL (без hash)
function getImageFilename(src) {
  if (!src || typeof src !== 'string') {
    console.log('⚠️ Invalid image src:', src);
    return null;
  }
  
  const urlParts = src.split('/').pop();
  const withoutQuery = urlParts.split('?')[0];
  
  // Премахни UUID hash-а (всичко след последното "_")
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

// Функция за извличане на всички продукти от Filstar
async function fetchAllFilstarProducts() {
  console.log('Fetching all products from Filstar API...');
  
  try {
    const response = await fetch(`${FILSTAR_API_BASE}/products?limit=1000`, {
      headers: {
        'Authorization': `Bearer ${FILSTAR_TOKEN}`
      }
    });

    if (!response.ok) {
      throw new Error(`Filstar API error: ${response.status}`);
    }

    const allProducts = await response.json();
    console.log(`Total products fetched: ${allProducts.length}`);
    
    return allProducts;
    
  } catch (error) {
    console.error('Error fetching products:', error.message);
    throw error;
  }
}

// Функция за филтриране на продукти по категория ID
function filterProductsByCategory(products, categoryId) {
  return products.filter(product => 
    product.categories?.some(cat => cat.id === parseInt(categoryId))
  );
}

// Функция за намиране на продукт в Shopify по SKU
async function findShopifyProductBySku(sku) {
  console.log(`Searching for product with SKU: ${sku}...`);
  
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
      console.log(`Found existing product: ${product.title} (ID: ${product.id})`);
      return product;
    }
  }
  
  console.log(`No existing product found with SKU: ${sku}`);
  return null;
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

// Функция за форматиране на variant име
function formatVariantName(variant) {
  if (!variant.attributes || variant.attributes.length === 0) {
    return variant.model || `SKU: ${variant.sku}`;
  }
  
  const attributes = variant.attributes;
  let parts = [];
  
  // 1. Модел
  if (variant.model && variant.model.trim()) {
    parts.push(variant.model.trim());
  }
  
  // 2. Дължина
  const length = attributes.find(a => 
    a.attribute_name.includes('ДЪЛЖИНА')
  )?.value;
  
  if (length) {
    parts.push(`${length}м`);
  }
  
  // 3. Диаметър
  const diameter = attributes.find(a => 
    a.attribute_name.includes('РАЗМЕР') && 
    a.attribute_name.includes('MM')
  )?.value;
  
  if (diameter) {
    parts.push(`⌀${diameter}мм`);
  }
  
  // 4. Японска номерация
  const japaneseSize = attributes.find(a => 
    a.attribute_name.includes('ЯПОНСКА НОМЕРАЦИЯ')
  )?.value;
  
  if (japaneseSize) {
    const formattedSize = japaneseSize.startsWith('#') 
      ? japaneseSize 
      : `#${japaneseSize}`;
    parts.push(formattedSize);
  }
  
  // 5. Тест кг
  const testKg = attributes.find(a => 
    a.attribute_name.includes('ТЕСТ') && 
    a.attribute_name.includes('KG')
  )?.value;
  
  if (testKg) {
    parts.push(`${testKg}кг`);
  }
  
  return parts.length > 0 ? parts.join(' / ') : `SKU: ${variant.sku}`;
}

// Функция за създаване на нов продукт
async function createProduct(filstarProduct, collectionId) {
  console.log(`\n🆕 Creating new product: ${filstarProduct.name}`);
  
  // Подготви варианти
  const variants = filstarProduct.variants?.map(v => ({
    sku: v.sku,
    price: v.price || '0.00',
    inventory_management: 'shopify',
    inventory_policy: 'deny',
    option1: formatVariantName(v)
  })) || [];
  
  // Подготви снимки
  const images = filstarProduct.images?.map(url => ({ src: url })) || [];
  
  const productData = {
    product: {
      title: filstarProduct.name,
      body_html: filstarProduct.description || '',
      vendor: filstarProduct.brand || 'Filstar',
      product_type: 'Fishing Line',
      status: 'active',
      variants: variants,
      images: images,
      options: [
        {
          name: 'Вариант',
          values: variants.map(v => v.option1)
        }
      ]
    }
  };
  
  try {
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
      const error = await response.text();
      console.error(`  ✗ Failed to create product:`, error);
      return null;
    }
    
    const result = await response.json();
    const newProduct = result.product;
    console.log(`  ✓ Product created with ID: ${newProduct.id}`);
    
    // Добави към колекция
    await addProductToCollection(newProduct.id, collectionId);
    
    await new Promise(resolve => setTimeout(resolve, 500));
    return newProduct;
    
  } catch (error) {
    console.error(`  ✗ Error creating product:`, error.message);
    return null;
  }
}

// Функция за добавяне на продукт към колекция
async function addProductToCollection(productId, collectionId) {
  console.log(`  📁 Adding product to collection ${collectionId}...`);
  
  try {
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
            collection_id: collectionId
          }
        })
      }
    );
    
    if (response.ok) {
      console.log(`  ✓ Added to collection`);
    } else {
      console.log(`  ⚠️ Could not add to collection (may already exist)`);
    }
    
    await new Promise(resolve => setTimeout(resolve, 300));
    
  } catch (error) {
    console.error(`  ✗ Error adding to collection:`, error.message);
  }
}

// Функция за update на съществуващ продукт
async function updateProduct(shopifyProduct, filstarProduct, collectionId) {
  console.log(`\n🔄 Updating product: ${shopifyProduct.title}`);
  
  const productId = shopifyProduct.id;
  let imagesUploaded = 0;
  let imagesSkipped = 0;
  
  // Upload снимки (само нови)
  if (filstarProduct.images && filstarProduct.images.length > 0) {
    console.log(`Processing ${filstarProduct.images.length} images from Filstar...`);
    
    for (const imageUrl of filstarProduct.images) {
      const uploaded = await uploadProductImage(productId, imageUrl, shopifyProduct.images);
      if (uploaded) {
        imagesUploaded++;
      } else {
        imagesSkipped++;
      }
    }
    
    console.log(`Images: ${imagesUploaded} uploaded, ${imagesSkipped} skipped (already exist)`);
  }
  
  // Update варианти
  if (filstarProduct.variants && filstarProduct.variants.length > 0) {
    console.log(`Updating ${filstarProduct.variants.length} variants...`);
    
    for (const filstarVariant of filstarProduct.variants) {
      const existingVariant = shopifyProduct.variants.find(v => v.sku === filstarVariant.sku);
      
      if (existingVariant) {
        const newOptionName = formatVariantName(filstarVariant);
        
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
        }
        
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }
  }
  
  // Добави към колекция (ако не е вече)
  await addProductToCollection(productId, collectionId);
  
  console.log(`✅ Finished updating product`);
}

// Главна функция
// Главна функция
async function main() {
  try {
    console.log('🎣 Starting fishing lines import...\n');
    
    // Fetch всички продукти от Filstar веднъж
    const allFilstarProducts = await fetchAllFilstarProducts();
    
    // 🔍 DEBUG - покажи структурата на категориите
    console.log('\n🔍 DEBUG: Sample product structure:');
    console.log('Product name:', allFilstarProducts[0]?.name);
    console.log('Categories:', JSON.stringify(allFilstarProducts[0]?.categories, null, 2));
    console.log('\n');
    return; // ⛔ Спри тук за debugging
    
    console.log('Categories to process:');
    Object.entries(CATEGORY_MAPPING).forEach(([id, info]) => {
      console.log(`  - ${info.name} (Filstar ID: ${id})`);
    });
    console.log('');
    
    // ... останалия код остава същия


main();

