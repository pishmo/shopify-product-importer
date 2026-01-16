// import-fishing-lines.js - Универсален импорт на всички категории влакна
const fetch = require('node-fetch');

const SHOPIFY_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const FILSTAR_TOKEN = process.env.FILSTAR_API_TOKEN;
const API_VERSION = '2024-10';
const FILSTAR_API_BASE = 'https://filstar.com/api';

// Категория ID-та за влакна във Filstar
const FILSTAR_LINE_CATEGORY_IDS = {
  monofilament: ['41'],
  braided: ['105'],
  fluorocarbon: ['106'],
  other: ['109']
};

// Parent категория "Влакна и поводи"
const LINES_PARENT_ID = '4';

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



// Функция за update на продукт
async function updateProduct(shopifyProduct, filstarProduct, categoryType) {
  console.log(`\nUpdating product: ${shopifyProduct.title}`);
  
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
  
  // // Update варианти
  // if (filstarProduct.variants && filstarProduct.variants.length > 0) {
  //   console.log(`Updating ${filstarProduct.variants.length} variants...`);
  //   
  //   for (const filstarVariant of filstarProduct.variants) {
  //     const existingVariant = shopifyProduct.variants.find(v => v.sku === filstarVariant.sku);
  //     
  //     if (existingVariant) {
  //       const newOptionName = formatVariantName(filstarVariant, categoryType);
  //       
  //       const updateResponse = await fetch(
  //         `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/variants/${existingVariant.id}.json`,
  //         {
  //           method: 'PUT',
  //           headers: {
  //             'X-Shopify-Access-Token': ACCESS_TOKEN,
  //             'Content-Type': 'application/json'
  //           },
  //           body: JSON.stringify({
  //             variant: {
  //               id: existingVariant.id,
  //               option1: newOptionName,
  //               price: filstarVariant.price || existingVariant.price
  //             }
  //           })
  //         }
  //       );
  //       
  //       if (updateResponse.ok) {
  //         console.log(`  ✓ Updated variant: ${newOptionName}`);
  //       }
  //       
  //       await new Promise(resolve => setTimeout(resolve, 300));
  //     }
  //   }
  // }
  
  console.log(`✅ Finished updating product`);
}








// Главна функция
async function main() {
  try {
    console.log('=== Starting Fishing Lines Import ===\n');
    
    // 1. Fetch всички продукти от Filstar
    const allProducts = await fetchAllProducts();
    
    // 2. Филтрирай по категории
    const lines = filterLinesByCategory(allProducts);
    
    // 3. Обработи всяка категория
    const categories = [
      { name: 'monofilament', products: lines.monofilament },
      { name: 'braided', products: lines.braided },
      { name: 'fluorocarbon', products: lines.fluorocarbon },
      { name: 'other', products: lines.other }
    ];
    
    for (const category of categories) {
      console.log(`\n=== Processing ${category.name.toUpperCase()} (${category.products.length} products) ===\n`);
      
      for (const filstarProduct of category.products) {
        const firstSku = filstarProduct.variants?.[0]?.sku;
        
        if (!firstSku) {
          console.log(`Skipping product without SKU: ${filstarProduct.name}`);
          continue;
        }
        
        console.log(`Searching for product with SKU: ${firstSku}...`);
        const shopifyProduct = await findShopifyProductBySku(firstSku);
        
        if (shopifyProduct) {
          console.log(`Found existing product: ${shopifyProduct.title} (ID: ${shopifyProduct.id})`);
          await updateProduct(shopifyProduct, filstarProduct, category.name);
        } else {
          console.log(`Product not found in Shopify, skipping...`);
        }
        
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    console.log('\n=== Fishing Lines Import Completed! ===');
    
  } catch (error) {
    console.error('❌ Import failed:', error);
    process.exit(1);
  }
}

main();
