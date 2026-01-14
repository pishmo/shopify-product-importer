// import-lines.js - Специален импорт за влакна (монофилно и плетено)
const SHOPIFY_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const FILSTAR_TOKEN = process.env.FILSTAR_API_TOKEN;
const API_VERSION = '2024-10';
const FILSTAR_API_BASE = 'https://filstar.com/api';

// SKU-та на влакната - ще попълним след като видим списъка
const LINE_SKUS = [
 // '955634',  // Монофилно влакно (тест)
  '928131'   // Плетено влакно (тест)
];

async function fetchLineProducts() {
  console.log('Fetching line products from Filstar...');
  
  let allProducts = [];
  
  for (const sku of LINE_SKUS) {
    const url = `${FILSTAR_API_BASE}/products?search=${sku}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${FILSTAR_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      console.error(`Error fetching SKU ${sku}: ${response.status}`);
      continue;
    }
    
    const data = await response.json();
    
    if (data && data.length > 0) {
      allProducts = allProducts.concat(data);
      console.log(`Found ${data.length} product(s) with SKU: ${sku}`);
      
      // DEBUG - покажи структурата на вариантите (само за първия продукт)
      if (allProducts.length === 1 && data[0].variants) {
        console.log('=== VARIANT STRUCTURE ===');
        data[0].variants.forEach((v, i) => {
          console.log(`Variant ${i}:`, JSON.stringify(v, null, 2));
        });
        console.log('=== END ===');
      }
    }
    
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  return allProducts;
}

async function findShopifyProductBySku(sku) {
  console.log(`Searching for product with SKU: ${sku} in Shopify...`);
  
  const response = await fetch(
    `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/products.json?fields=id,title,variants&limit=250`,
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
      return product.id;
    }
  }
  
  console.log(`No existing product found with SKU: ${sku}`);
  return null;
}

async function updateLineProduct(productId, filstarProduct) {
  console.log(`Updating line product ID: ${productId}`);
  
  try {
    const getResponse = await fetch(
      `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/products/${productId}.json`,
      {
        method: 'GET',
        headers: {
          'X-Shopify-Access-Token': ACCESS_TOKEN,
          'Content-Type': 'application/json'
        }
      }
    );
    
    if (!getResponse.ok) {
      console.error('Failed to get product details');
      return;
    }
    
    const existingData = await getResponse.json();
    const existingProduct = existingData.product;
    
    console.log(`Current product has ${existingProduct.variants.length} variants`);
    
    for (const filstarVariant of filstarProduct.variants) {
      const existingVariant = existingProduct.variants.find(v => v.sku === filstarVariant.sku);
      
      if (existingVariant) {
        const newOptionName = formatLineOption(filstarVariant);
        
        console.log(`Updating variant SKU ${filstarVariant.sku}:`);
        console.log(`  Old option: ${existingVariant.option1}`);
        console.log(`  New option: ${newOptionName}`);
        
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
                option1: newOptionName
              }
            })
          }
        );
        
        if (updateResponse.ok) {
          console.log(`  ✓ Updated variant option name`);
        } else {
          const error = await updateResponse.text();
          console.error(`  ✗ Failed to update variant:`, error);
        }
        
        await new Promise(resolve => setTimeout(resolve, 300));
      } else {
        console.log(`  ⚠ Variant with SKU ${filstarVariant.sku} not found in Shopify`);
      }
    }
    
    console.log(`✅ Finished updating product ID ${productId}`);
    
  } catch (error) {
    console.error(`ERROR updating product ID ${productId}:`, error.message);
  }
}

function formatLineOption(variant) {
  // Ако няма атрибути, използвай model или SKU
  if (!variant.attributes || variant.attributes.length === 0) {
    return variant.model || `SKU: ${variant.sku}`;
  }
  
  const attributes = variant.attributes;
  let parts = [];
  
  // 1. Модел (ако има)
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
  
  // 3. Размер (диаметър)
  const diameter = attributes.find(a => 
    a.attribute_name.includes('РАЗМЕР') && 
    a.attribute_name.includes('MM')
  )?.value;
  
  if (diameter) {
    parts.push(`Ø${diameter}мм`);
  }
  
  // 4. # Японска номерация
  const japaneseSize = attributes.find(a => 
    a.attribute_name.includes('ЯПОНСКА НОМЕРАЦИЯ')
  )?.value;
  
  if (japaneseSize) {
    parts.push(japaneseSize);
  }
  
  // 5. Тест кг / LB
  const testKg = attributes.find(a => 
    a.attribute_name.includes('ТЕСТ') && 
    a.attribute_name.includes('KG')
  )?.value;
  
  const testLb = attributes.find(a => 
    a.attribute_name.includes('ТЕСТ') && 
    a.attribute_name.includes('LB')
  )?.value;
  
  if (testKg && testLb) {
    parts.push(`${testKg}кг/${testLb}LB`);
  } else if (testKg) {
    parts.push(`${testKg}кг`);
  } else if (testLb) {
    parts.push(`${testLb}LB`);
  }
  
  // Ако няма нищо, върни SKU
  return parts.length > 0 ? parts.join(' / ') : `SKU: ${variant.sku}`;
}


async function main() {
  try {
    console.log('Starting line update...');
    
    const filstarProducts = await fetchLineProducts();
    console.log(`Total line products fetched from Filstar: ${filstarProducts.length}`);
    
    for (const filstarProduct of filstarProducts) {
      const firstSku = filstarProduct.variants?.[0]?.sku;
      
      if (!firstSku) {
        console.log('No SKU found in variants, skipping...');
        continue;
      }
      
      const productId = await findShopifyProductBySku(firstSku);
      
      if (productId) {
        await updateLineProduct(productId, filstarProduct);
      } else {
        console.log('Product not found in Shopify, skipping...');
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log('Line update completed!');
  } catch (error) {
    console.error('Update failed:', error);
    process.exit(1);
  }
}

main();
