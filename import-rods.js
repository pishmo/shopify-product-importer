// import-rods.js - UPDATE на съществуващи пръчки

const SHOPIFY_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const FILSTAR_TOKEN = process.env.FILSTAR_API_TOKEN;
const API_VERSION = '2024-10';
const FILSTAR_API_BASE = 'https://filstar.com/api';

// SKU-та на пръчките за update
const ROD_SKUS = [
  '943215'  // Добави всички SKU-та на пръчките от колекцията
];

async function fetchRodProducts() {
  console.log('Fetching rod products from Filstar...');
  
  let allProducts = [];
  
  for (const sku of ROD_SKUS) {
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
      
      // DEBUG - покажи структурата на вариантите
      console.log('=== VARIANT STRUCTURE ===');
      if (data[0].variants) {
        data[0].variants.forEach((v, i) => {
          console.log(`Variant ${i}:`, JSON.stringify(v, null, 2));
        });
      }
      console.log('=== END ===');
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
  
  // Намери продукт, който има вариант с този SKU
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

async function updateRodProduct(productId, filstarProduct) {
  console.log(`Updating rod product ID: ${productId}`);
  
  try {
    // Вземи пълните данни на продукта
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
    
    // Update всеки вариант с нов option name
    for (const filstarVariant of filstarProduct.variants) {
      const existingVariant = existingProduct.variants.find(v => v.sku === filstarVariant.sku);
      
      if (existingVariant) {
        // Форматирай новото име на опцията
        const newOptionName = formatRodOption(filstarVariant);
        
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

function formatRodOption(variant) {
  // Ако няма атрибути (напр. резервен връх), използвай model или SKU
  if (!variant.attributes || variant.attributes.length === 0) {
    return variant.model || `SKU: ${variant.sku}`;
  }
  
  // Извлечи размер и акция
  const attributes = variant.attributes;
  const size = attributes.find(a => a.attribute_name.includes('РАЗМЕР'))?.value || '';
  const action = attributes.find(a => a.attribute_name.includes('АКЦИЯ'))?.value || '';
  
  // Ако има и двата атрибута
  if (size && action) {
    return `${size}м / ${action} LB`;
  }
  
  // Ако има само размер
  if (size) {
    return `${size}м`;
  }
  
  // Fallback към model или SKU
  return variant.model || `SKU: ${variant.sku}`;
}



async function main() {
  try {
    console.log('Starting rod update...');
    
    const filstarProducts = await fetchRodProducts();
    console.log(`Total rod products fetched from Filstar: ${filstarProducts.length}`);
    
    for (const filstarProduct of filstarProducts) {
      // Намери първия SKU от вариантите
      const firstSku = filstarProduct.variants?.[0]?.sku;
      
      if (!firstSku) {
        console.log('No SKU found in variants, skipping...');
        continue;
      }
      
      // Намери съществуващия продукт в Shopify
      const productId = await findShopifyProductBySku(firstSku);
      
      if (productId) {
        await updateRodProduct(productId, filstarProduct);
      } else {
        console.log('Product not found in Shopify, skipping...');
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log('Rod update completed!');
  } catch (error) {
    console.error('Update failed:', error);
    process.exit(1);
  }
}

main();

