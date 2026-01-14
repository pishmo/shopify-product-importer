// import-fluorocarbon.js - Импорт на fluorocarbon влакна от Filstar страница
const SHOPIFY_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const FILSTAR_TOKEN = process.env.FILSTAR_API_TOKEN;
const API_VERSION = '2024-10';
const FILSTAR_API_BASE = 'https://filstar.com/api';

// URL на страницата с fluorocarbon продукти
// Примерно: /products?category=fluorocarbon или /products?page=X
const FLUOROCARBON_PAGE_URL = `${FILSTAR_API_BASE}/products?category=fluorocarbon`;

async function fetchFluorocarbonProducts() {
  console.log('Fetching fluorocarbon products from Filstar...');
  
  const response = await fetch(FLUOROCARBON_PAGE_URL, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${FILSTAR_TOKEN}`,
      'Content-Type': 'application/json'
    }
  });
  
  if (!response.ok) {
    throw new Error(`Filstar API error: ${response.status} ${response.statusText}`);
  }
  
  const data = await response.json();
  console.log(`Fetched ${data.length || 0} fluorocarbon products from Filstar`);
  
  return data;
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

async function createShopifyProduct(filstarProduct) {
  console.log(`Creating new product: ${filstarProduct.name}`);
  
  const productData = {
    product: {
      title: filstarProduct.name,
      body_html: filstarProduct.description || '',
      vendor: filstarProduct.manufacturer || 'Filstar',
      product_type: 'Fluorocarbon',
      status: 'active',
      variants: filstarProduct.variants.map(variant => ({
        sku: variant.sku,
        price: variant.price,
        inventory_quantity: parseInt(variant.quantity) || 0,
        inventory_management: 'shopify',
        option1: formatLineOption(variant),
        barcode: variant.barcode || null
      })),
      options: [
        {
          name: 'Вариант',
          values: filstarProduct.variants.map(v => formatLineOption(v))
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
  
  if (response.ok) {
    const result = await response.json();
    console.log(`✅ Created product: ${result.product.title} (ID: ${result.product.id})`);
    return result.product.id;
  } else {
    const error = await response.text();
    console.error(`✗ Failed to create product:`, error);
    return null;
  }
}

async function updateShopifyProduct(productId, filstarProduct) {
  console.log(`Updating product ID ${productId}...`);
  
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
    
    // Обнови варианти (цена, наличност и option name)
    for (const filstarVariant of filstarProduct.variants) {
      const existingVariant = existingProduct.variants.find(v => v.sku === filstarVariant.sku);
      
      if (existingVariant) {
        const newOptionName = formatLineOption(filstarVariant);
        
        // Update цена и option name
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
                price: filstarVariant.price,
                option1: newOptionName
              }
            })
          }
        );
        
        if (updateResponse.ok) {
          console.log(`  ✓ Updated price and option for SKU ${filstarVariant.sku}`);
        }
        
        await new Promise(resolve => setTimeout(resolve, 300));
        
        // Update наличност
        if (existingVariant.inventory_item_id) {
          const newQuantity = parseInt(filstarVariant.quantity) || 0;
          
          const inventoryResponse = await fetch(
            `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/inventory_levels.json?inventory_item_ids=${existingVariant.inventory_item_id}`,
            {
              method: 'GET',
              headers: {
                'X-Shopify-Access-Token': ACCESS_TOKEN,
                'Content-Type': 'application/json'
              }
            }
          );
          
          if (inventoryResponse.ok) {
            const inventoryData = await inventoryResponse.json();
            const inventoryLevel = inventoryData.inventory_levels[0];
            
            if (inventoryLevel) {
              const setResponse = await fetch(
                `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/inventory_levels/set.json`,
                {
                  method: 'POST',
                  headers: {
                    'X-Shopify-Access-Token': ACCESS_TOKEN,
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({
                    location_id: inventoryLevel.location_id,
                    inventory_item_id: existingVariant.inventory_item_id,
                    available: newQuantity
                  })
                }
              );
              
              if (setResponse.ok) {
                console.log(`  ✓ Updated inventory for SKU ${filstarVariant.sku}: ${newQuantity} units`);
              }
            }
          }
          
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      }
    }
    
    console.log(`✅ Successfully updated product ID ${productId}`);
    
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
    console.log('Starting fluorocarbon import...');
    
    // Свали цялата страница с fluorocarbon продукти
    const filstarProducts = await fetchFluorocarbonProducts();
    
    if (!filstarProducts || filstarProducts.length === 0) {
      console.log('No products found on the page');
      return;
    }
    
    console.log(`Processing ${filstarProducts.length} products...`);
    
    // Обработи всеки продукт
    for (const filstarProduct of filstarProducts) {
      const firstSku = filstarProduct.variants?.[0]?.sku;
      
      if (!firstSku) {
        console.log(`Skipping product ${filstarProduct.name} - no SKU found`);
        continue;
      }
      
      console.log(`\n--- Processing: ${filstarProduct.name} ---`);
      
      const productId = await findShopifyProductBySku(firstSku);
      
      if (productId) {
        // Продуктът съществува - update
        await updateShopifyProduct(productId, filstarProduct);
      } else {
        // Нов продукт - create
        await createShopifyProduct(filstarProduct);
      }
      
      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log('\n✅ Fluorocarbon import completed!');
  } catch (error) {
    console.error('Import failed:', error);
    process.exit(1);
  }
}

main();
