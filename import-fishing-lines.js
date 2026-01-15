// import-all-lines.js - Универсален импорт на всички влакна с пагинация
const fetch = require('node-fetch');

const SHOPIFY_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const FILSTAR_TOKEN = process.env.FILSTAR_API_TOKEN;
const API_VERSION = '2024-10';
const FILSTAR_API_BASE = 'https://filstar.com/api';

// Категории
const CATEGORIES = {
  'Монофилни': '41',
  'Плетени': '105',
  'Fluorocarbon': '107',
  'Други': '109'
};

// ========== FETCH ВСИЧКИ ПРОДУКТИ С ПАГИНАЦИЯ ==========
async function fetchAllFilstarProducts() {
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
    
    console.log(`\n✅ Total products fetched: ${allProducts.length}\n`);
    return allProducts;
    
  } catch (error) {
    console.error('Error fetching products:', error.message);
    throw error;
  }
}

// ========== ФИЛТРИРАНЕ ПО КАТЕГОРИЯ ==========
function filterByCategory(allProducts, categoryId, categoryName) {
  const filtered = allProducts.filter(product => 
    product.categories?.some(cat => 
      cat.id === categoryId || 
      cat.name.includes(categoryName)
    )
  );
  
  console.log(`Found ${filtered.length} products in category: ${categoryName}`);
  return filtered;
}

// ========== HELPER ФУНКЦИИ ==========
function getImageFilename(imageUrl) {
  if (!imageUrl) return null;
  try {
    const url = new URL(imageUrl);
    const pathname = url.pathname;
    return pathname.substring(pathname.lastIndexOf('/') + 1);
  } catch (e) {
    return null;
  }
}

function imageExists(existingImages, newImageUrl) {
  const newFilename = getImageFilename(newImageUrl);
  if (!newFilename) return false;
  
  return existingImages.some(img => {
    const existingFilename = getImageFilename(img.src);
    return existingFilename && existingFilename === newFilename;
  });
}

// ========== SHOPIFY ФУНКЦИИ ==========
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

// ========== ФОРМАТИРАНЕ НА VARIANT ИМЕНА ==========
function formatVariantName(variant, categoryName) {
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

// ========== UPDATE ПРОДУКТ ==========
async function updateProduct(shopifyProduct, filstarProduct, categoryName) {
  console.log(`\nUpdating product: ${shopifyProduct.title} [${categoryName}]`);
  
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
        const newOptionName = formatVariantName(filstarVariant, categoryName);
        
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

// ========== ПРОЦЕСИРАНЕ НА КАТЕГОРИЯ ==========
async function processCategory(allProducts, categoryId, categoryName) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`PROCESSING CATEGORY: ${categoryName} (ID: ${categoryId})`);
  console.log(`${'='.repeat(60)}\n`);
  
  const categoryProducts = filterByCategory(allProducts, categoryId, categoryName);
  
  if (categoryProducts.length === 0) {
    console.log(`No products found for category: ${categoryName}\n`);
    return;
  }
  
  let processed = 0;
  let skipped = 0;
  
  for (const filstarProduct of categoryProducts) {
    const firstSku = filstarProduct.variants?.[0]?.sku;
    
    if (!firstSku) {
      console.log(`Skipping product without SKU: ${filstarProduct.name}`);
      skipped++;
      continue;
    }
    
    const shopifyProduct = await findShopifyProductBySku(firstSku);
    
    if (shopifyProduct) {
      await updateProduct(shopifyProduct, filstarProduct, categoryName);
      processed++;
    } else {
      console.log(`Product not found in Shopify, skipping...`);
      skipped++;
    }
    
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log(`\n✅ Category ${categoryName} complete: ${processed} processed, ${skipped} skipped\n`);
}

// ========== ГЛАВНА ФУНКЦИЯ ==========
async function main() {
  try {
    console.log('Starting universal fishing line import...\n');
    
    // 1. Fetch ВСИЧКИ продукти с пагинация
    const allProducts = await fetchAllFilstarProducts();
    
    if (allProducts.length === 0) {
      console.log('No products found in Filstar');
      return;
    }
    
    // 2. Процесирай всяка категория
    for (const [categoryName, categoryId] of Object.entries(CATEGORIES)) {
      await processCategory(allProducts, categoryId, categoryName);
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ ALL CATEGORIES IMPORT COMPLETED!');
    console.log('='.repeat(60));
    
  } catch (error) {
    console.error('❌ Import failed:', error);
    process.exit(1);
  }
}

main();
