// test-sku.js - Тестване на конкретни SKU-та
const fetch = require('node-fetch');

const SHOPIFY_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const FILSTAR_TOKEN = process.env.FILSTAR_API_TOKEN;
const API_VERSION = '2024-10';
const FILSTAR_API_BASE = 'https://filstar.com/api';

// SKU-та за тестване
const TEST_SKUS = [
  '963102',
  // Добави още SKU-та тук ако искаш да тестваш повече
];

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

// Функция за намиране на продукт в Shopify по SKU
async function findShopifyProductBySku(sku) {
  console.log(`\n🔍 Searching in Shopify for SKU: ${sku}...`);
  
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
      // DEBUG: Покажи какво съдържа product
      console.log(`\n  🐛 DEBUG - Raw product data:`);
      console.log(`    - Product ID: ${product.id}`);
      console.log(`    - Images exists: ${!!product.images}`);
      console.log(`    - Images is array: ${Array.isArray(product.images)}`);
      console.log(`    - Images length: ${product.images?.length || 0}`);
      
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

async function testSku(sku) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`🔍 Testing SKU: ${sku}`);
  console.log('='.repeat(70));
  
  let filstarProduct = null;
  
  // Търси в Filstar
  for (let page = 1; page <= 10; page++) {
    const url = `${FILSTAR_API_BASE}/products?page=${page}&limit=1000`;
    
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${FILSTAR_TOKEN}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        console.error(`❌ Error on page ${page}: ${response.status}`);
        break;
      }
      
      const data = await response.json();
      
      if (!data || data.length === 0) {
        console.log(`📄 Page ${page}: No more products`);
        break;
      }
      
      // Търси продукта
      for (const product of data) {
        let hasSku = false;
        
        if (product.variants && product.variants.length > 0) {
          hasSku = product.variants.some(v => v.sku === sku);
        }
        
        if (hasSku || product.id === sku) {
          filstarProduct = product;
          
          console.log(`\n✅ FOUND in Filstar on page ${page}!`);
          console.log(`\n📦 Filstar Product Details:`);
          console.log(`  ID: ${product.id}`);
          console.log(`  Name: ${product.name}`);
          console.log(`  Slug: ${product.slug}`);
          
          if (product.categories && product.categories.length > 0) {
            console.log(`\n  Categories:`);
            for (const cat of product.categories) {
              console.log(`    - ID: ${cat.id} | Name: ${cat.name}`);
              if (cat.parent_id) {
                console.log(`      Parent ID: ${cat.parent_id} | Parent: ${cat.parent_name}`);
              }
              console.log(`      Slug: ${cat.slug}`);
            }
          } else {
            console.log(`\n  ⚠️  NO CATEGORIES!`);
          }
          
          if (product.variants && product.variants.length > 0) {
            console.log(`\n  Variants (${product.variants.length}):`);
            for (const variant of product.variants) {
              console.log(`    - SKU: ${variant.sku} | Model: ${variant.model || 'N/A'}`);
              if (variant.attributes && variant.attributes.length > 0) {
                console.log(`      Attributes:`);
                for (const attr of variant.attributes) {
                  console.log(`        ${attr.attribute_name}: ${attr.value}`);
                }
              }
            }
            
            console.log(`\n  📝 Formatted variant names:`);
            const formattedNames = product.variants.map(v => {
              const formatted = formatVariantName(v, 'braided');
              console.log(`    ${v.sku}: ${formatted}`);
              return formatted;
            });
            
            const duplicates = [];
            const seen = new Map();
            
            formattedNames.forEach((name, index) => {
              if (seen.has(name)) {
                duplicates.push({
                  name: name,
                  skus: [seen.get(name), product.variants[index].sku]
                });
              } else {
                seen.set(name, product.variants[index].sku);
              }
            });
            
            if (duplicates.length > 0) {
              console.log(`\n  ⚠️  DUPLICATE VARIANT NAMES FOUND:`);
              duplicates.forEach(dup => {
                console.log(`    ❌ "${dup.name}"`);
                console.log(`       SKUs: ${dup.skus.join(', ')}`);
              });
            } else {
              console.log(`\n  ✅ No duplicate variant names`);
            }
          }
          
          // НОВА ЧАСТ: Покажи снимките от Filstar
          console.log(`\n  🖼️  Filstar Images (${product.images ? product.images.length : 0}):`);
          if (product.images && product.images.length > 0) {
            product.images.forEach((imgUrl, index) => {
              const filename = getImageFilename(imgUrl);
              console.log(`    ${index + 1}. ${imgUrl}`);
              console.log(`       Filename: ${filename}`);
            });
          } else {
            console.log(`    ⚠️  No images`);
          }
          
          console.log(`\n  Manufacturer: ${product.manufacturer || 'N/A'}`);
          
          break;
        }
      }
      
      if (filstarProduct) break;
      
      if (page % 5 === 0) {
        console.log(`📄 Searched ${page} pages...`);
      }
      
      await new Promise(resolve => setTimeout(resolve, 300));
      
    } catch (error) {
      console.error(`❌ Error on page ${page}:`, error.message);
      break;
    }
  }
  
  if (!filstarProduct) {
    console.log(`\n❌ SKU ${sku} NOT FOUND in Filstar`);
    return;
  }
  
  // Търси в Shopify
  const shopifyProduct = await findShopifyProductBySku(sku);
  
  if (shopifyProduct) {
    console.log(`\n✅ FOUND in Shopify!`);
    console.log(`\n🛍️  Shopify Product Details:`);
    console.log(`  ID: ${shopifyProduct.id}`);
    console.log(`  Title: ${shopifyProduct.title}`);
    console.log(`  Variants: ${shopifyProduct.variants.length}`);
    
    // DEBUG: Покажи пълния images обект
    console.log(`\n  🐛 DEBUG - Images object type: ${typeof shopifyProduct.images}`);
    console.log(`  🐛 DEBUG - Images is array: ${Array.isArray(shopifyProduct.images)}`);
    console.log(`  🐛 DEBUG - Full images object:`, JSON.stringify(shopifyProduct.images, null, 2));
    
    // НОВА ЧАСТ: Покажи снимките от Shopify
    const shopifyImages = shopifyProduct.images || [];
    console.log(`\n  🖼️  Shopify Images (${shopifyImages.length}):`);
    
    if (shopifyImages.length > 0) {
      shopifyImages.forEach((img, index) => {
        console.log(`    ${index + 1}. Full image object:`, JSON.stringify(img, null, 2));
        const src = img.src || img.url || img;
        const filename = getImageFilename(src);
        console.log(`       URL: ${src}`);
        console.log(`       Filename: ${filename}`);
      });
    } else {
      console.log(`    ⚠️  No images found in Shopify product`);
    }
    
    // НОВА ЧАСТ: Сравни снимките
    console.log(`\n  🔍 Image Comparison:`);
    if (filstarProduct.images && filstarProduct.images.length > 0 && shopifyImages.length > 0) {
      const filstarFilenames = filstarProduct.images
        .map(url => getImageFilename(url))
        .filter(fn => fn !== null);
      
      const shopifyFilenames = shopifyImages
        .map(img => {
          const src = img.src || img.url || img;
          return getImageFilename(src);
        })
        .filter(fn => fn !== null);
      
      console.log(`\n    Filstar filenames (${filstarFilenames.length}):`);
      filstarFilenames.forEach((fn, i) => console.log(`      ${i + 1}. ${fn}`));
      
      console.log(`\n    Shopify filenames (${shopifyFilenames.length}):`);
      shopifyFilenames.forEach((fn, i) => console.log(`      ${i + 1}. ${fn}`));
      
      // Провери за дубликати
      const duplicateFilenames = filstarFilenames.filter(fn => 
        shopifyFilenames.includes(fn)
      );
      
      if (duplicateFilenames.length > 0) {
        console.log(`\n    ✅ Matching filenames (${duplicateFilenames.length}):`);
        duplicateFilenames.forEach(fn => console.log(`      - ${fn}`));
      } else {
        console.log(`\n    ⚠️  No matching filenames found!`);
      }
      
      const newImages = filstarFilenames.filter(fn => 
        !shopifyFilenames.includes(fn)
      );
      
      if (newImages.length > 0) {
        console.log(`\n    🆕 New images from Filstar (${newImages.length}):`);
        newImages.forEach(fn => console.log(`      - ${fn}`));
      }
    } else {
      if (!filstarProduct.images || filstarProduct.images.length === 0) {
        console.log(`    ⚠️  No images in Filstar product`);
      }
      if (shopifyImages.length === 0) {
        console.log(`    ⚠️  No images in Shopify product`);
      }
    }
    
  } else {
    console.log(`\n❌ NOT FOUND in Shopify`);
  }
}

async function main() {
  console.log('Starting SKU test with image comparison...\n');
  
  for (const sku of TEST_SKUS) {
    await testSku(sku);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log(`\n${'='.repeat(70)}`);
  console.log('✅ Test completed!');
  console.log('='.repeat(70));
}

main();
