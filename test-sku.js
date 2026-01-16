// test-sku.js - Тестване на конкретни SKU-та
const fetch = require('node-fetch');

const FILSTAR_TOKEN = process.env.FILSTAR_API_TOKEN;
const FILSTAR_API_BASE = 'https://filstar.com/api';

// SKU-та за тестване
const TEST_SKUS = [
  '958716',
  // Добави още SKU-та тук ако искаш да тестваш повече
];

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
  
  let found = false;
  
  // Търси в първите 10 страници
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
        // Провери дали продуктът или някой от вариантите има това SKU
        let hasSku = false;
        
        if (product.variants && product.variants.length > 0) {
          hasSku = product.variants.some(v => v.sku === sku);
        }
        
        if (hasSku || product.id === sku) {
          found = true;
          
          console.log(`\n✅ FOUND on page ${page}!`);
          console.log(`\nProduct Details:`);
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
            
            // НОВА ЧАСТ: Форматирани имена и проверка за дубликати
            console.log(`\n  📝 Formatted variant names:`);
            const formattedNames = product.variants.map(v => {
              const formatted = formatVariantName(v, 'braided');
              console.log(`    ${v.sku}: ${formatted}`);
              return formatted;
            });
            
            // Провери за дубликати
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
          
          console.log(`\n  Images: ${product.images ? product.images.length : 0}`);
          console.log(`  Manufacturer: ${product.manufacturer || 'N/A'}`);
          
          break;
        }
      }
      
      if (found) break;
      
      // Покажи прогрес на всеки 5 страници
      if (page % 5 === 0) {
        console.log(`📄 Searched ${page} pages, ${page * 50} products...`);
      }
      
      await new Promise(resolve => setTimeout(resolve, 300));
      
    } catch (error) {
      console.error(`❌ Error on page ${page}:`, error.message);
      break;
    }
  }
  
  if (!found) {
    console.log(`\n❌ SKU ${sku} NOT FOUND in first 10 pages`);
    
    // Опитай директно търсене
    console.log(`\n🔍 Trying direct search...`);
    
    try {
      const searchUrl = `${FILSTAR_API_BASE}/products?search=${sku}`;
      const searchResponse = await fetch(searchUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${FILSTAR_TOKEN}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (searchResponse.ok) {
        const searchData = await searchResponse.json();
        
        if (searchData && searchData.length > 0) {
          console.log(`✅ Found via search! (${searchData.length} results)`);
          
          for (const product of searchData) {
            console.log(`\n  Product: ${product.name} (ID: ${product.id})`);
            if (product.categories) {
              console.log(`  Categories:`, product.categories.map(c => `${c.id}: ${c.name}`).join(', '));
            }
          }
        } else {
          console.log(`❌ Not found via search either`);
        }
      }
    } catch (error) {
      console.error(`❌ Search error:`, error.message);
    }
  }
}

async function main() {
  console.log('Starting SKU test...\n');
  
  for (const sku of TEST_SKUS) {
    await testSku(sku);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log(`\n${'='.repeat(70)}`);
  console.log('✅ Test completed!');
  console.log('='.repeat(70));
}

main();
