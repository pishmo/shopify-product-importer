// import-braided.js - Import на плетени влакна с проверка за дублирани снимки
const fetch = require('node-fetch');

const SHOPIFY_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const FILSTAR_TOKEN = process.env.FILSTAR_API_TOKEN;
const API_VERSION = '2024-10';
const FILSTAR_API_BASE = 'https://filstar.com/api';

// Категория ID за плетени влакна във Filstar
const BRAIDED_CATEGORY_ID = '105';



// Функция за извличане на filename от URL (без hash)
function getImageFilename(src) {
  // Проверка дали src е валиден string
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






// Функция за fetch на плетени влакна от Filstar
async function fetchBraidedProducts() {
  console.log('Fetching braided line products from Filstar...');
  
  let allProducts = [];
  let page = 1;
  
  while (true) {
    const url = `${FILSTAR_API_BASE}/products?page=${page}&limit=50`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${FILSTAR_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      console.error(`Error fetching page ${page}: ${response.status}`);
      break;
    }
    
    const data = await response.json();
    
    if (!data || data.length === 0) break;
    
    // Филтрирай само продукти от категория 105 (плетени влакна)
    const filtered = data.filter(p => {
      if (!p.categories || p.categories.length === 0) {
        return false;
      }
      return p.categories.some(cat => cat.id === BRAIDED_CATEGORY_ID);
    });
    
    allProducts = allProducts.concat(filtered);
    console.log(`Page ${page}: Found ${filtered.length} braided products`);
    
    page++;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  console.log(`Total braided products fetched: ${allProducts.length}`);
  return allProducts;
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


function imageExists(existingImages, newImageUrl) {
  const newFilename = getImageFilename(newImageUrl);
  if (!newFilename) return false; // Ако няма валиден filename, не е дубликат
  
  return existingImages.some(img => {
    const existingFilename = getImageFilename(img.src);
    return existingFilename && existingFilename === newFilename;
  });
}





// Функция за upload на снимка (само ако не съществува)
async function uploadProductImage(productId, imageUrl, existingImages) {
  // Провери дали снимката вече съществува
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
async function updateBraidedProduct(shopifyProduct, filstarProduct) {
  console.log(`\nUpdating product: ${shopifyProduct.title}`);
  
  const productId = shopifyProduct.id;
  let imagesUploaded = 0;
  let imagesSkipped = 0;
  
  // Upload снимки (само нови)
  if (filstarProduct.images && filstarProduct.images.length > 0) {
    console.log(`Processing ${filstarProduct.images.length} images from Filstar...`);
    
    for (const image of filstarProduct.images) {
      const uploaded = await uploadProductImage(productId, image.url, shopifyProduct.images);
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
        const newOptionName = formatBraidedVariantName(filstarVariant);
        
        // Update variant option name
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
  
  console.log(`✅ Finished updating product`);
}

// Функция за форматиране на variant име
function formatBraidedVariantName(variant) {
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

// Главна функция
async function main() {
  try {
    console.log('Starting braided line import...\n');
    
    // Fetch продукти от Filstar
    const filstarProducts = await fetchBraidedProducts();
    
    if (filstarProducts.length === 0) {
      console.log('No braided products found in Filstar');
      return;
    }
    
    // Update всеки продукт
    for (const filstarProduct of filstarProducts) {
      const firstSku = filstarProduct.variants?.[0]?.sku;
      
      if (!firstSku) {
        console.log(`Skipping product without SKU: ${filstarProduct.name}`);
        continue;
      }
      
      const shopifyProduct = await findShopifyProductBySku(firstSku);
      
      if (shopifyProduct) {
        await updateBraidedProduct(shopifyProduct, filstarProduct);
      } else {
        console.log(`Product not found in Shopify, skipping...`);
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log('\n✅ Braided line import completed!');
    
  } catch (error) {
    console.error('❌ Import failed:', error);
    process.exit(1);
  }
}

main();
