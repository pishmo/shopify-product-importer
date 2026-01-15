// import-braided.js - Импорт на плетени влакна чрез search
const SHOPIFY_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const FILSTAR_TOKEN = process.env.FILSTAR_API_TOKEN;
const API_VERSION = '2024-10';
const FILSTAR_API_BASE = 'https://filstar.com/api';

// Search query за плетени влакна
const SEARCH_QUERY = 'плетено';

// Колекция "Влакно плетено"
const COLLECTION_ID = '738965979518';



// сновата функция

// update-braided.js
const BRAIDED_CATEGORY_ID = '105';
async function fetchBraidedProducts() {
  console.log('Fetching braided line products from Filstar (Category ID: 105)...');
  
  let allProducts = [];
  
  for (let page = 1; page <= 150; page++) { // Увеличено до 150 страници
    console.log(`Fetching page ${page}...`);
    
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
    
    if (!data || data.length === 0) {
      console.log('No more products found.');
      break;
    }
    
    const filtered = data.filter(p => {
      if (!p.categories || p.categories.length === 0) {
        return false;
      }
      
      const isBraided = p.categories.some(cat => cat.id === '105');
      
      if (isBraided) {
        console.log(`  ? Found: ${p.name} (ID: ${p.id})`);
      }
      
      return isBraided;
    });
    
    allProducts = allProducts.concat(filtered);
    console.log(`  Page ${page}: ${filtered.length} braided products found`);
    
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  console.log(`\nTotal braided products: ${allProducts.length}`);
  return allProducts;
}



// край на феч



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

async function addProductToCollection(productId) {
  console.log(`Adding product ${productId} to collection ${COLLECTION_ID}...`);
  
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
            collection_id: COLLECTION_ID
          }
        })
      }
    );
    
    if (response.ok) {
      console.log(`  ? Added to collection`);
    } else if (response.status === 422) {
      console.log(`  ? Already in collection`);
    } else {
      const error = await response.text();
      console.error(`  ? Failed to add to collection:`, error);
    }
    
    await new Promise(resolve => setTimeout(resolve, 300));
  } catch (error) {
    console.error(`ERROR adding to collection:`, error.message);
  }
}

async function addImagesToProduct(productId, filstarProduct) {
  if (!filstarProduct.images || filstarProduct.images.length === 0) {
    console.log(`  No images found for product`);
    return;
  }
  
  console.log(`Adding ${filstarProduct.images.length} images to product ${productId}...`);
  
  for (const imageUrl of filstarProduct.images) {
    try {
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
      
      if (response.ok) {
        console.log(`  ? Added image: ${imageUrl}`);
      } else {
        const error = await response.text();
        console.error(`  ? Failed to add image:`, error);
      }
      
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      console.error(`ERROR adding image:`, error.message);
    }
  }
}

async function createShopifyProduct(filstarProduct) {
  console.log(`Creating new product: ${filstarProduct.name}`);
  
  const productData = {
    product: {
      title: filstarProduct.name,
      body_html: filstarProduct.description || filstarProduct.short_description || '',
      vendor: filstarProduct.manufacturer || 'Filstar',
      product_type: 'Плетено влакно',
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
    console.log(`? Created product: ${result.product.title} (ID: ${result.product.id})`);
    
    // Добави към колекцията
    await addProductToCollection(result.product.id);
    
    // Добави снимки
    await addImagesToProduct(result.product.id, filstarProduct);
    
    return result.product.id;
  } else {
    const error = await response.text();
    console.error(`? Failed to create product:`, error);
    return null;
  }
}

async function updateShopifyProduct(productId, filstarProduct) {
  console.log(`Updating product ID ${productId}...`);
  
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
    
    for (const filstarVariant of filstarProduct.variants) {
      const existingVariant = existingProduct.variants.find(v => v.sku === filstarVariant.sku);
      
      if (existingVariant) {
        const newOptionName = formatLineOption(filstarVariant);
        
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
          console.log(`  ? Updated price and option for SKU ${filstarVariant.sku}`);
        }
        
        await new Promise(resolve => setTimeout(resolve, 300));
        
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
                console.log(`  ? Updated inventory for SKU ${filstarVariant.sku}: ${newQuantity} units`);
              }
            }
          }
          
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      }
    }
    
    console.log(`? Successfully updated product ID ${productId}`);
    
    // Увери се че е в колекцията
    await addProductToCollection(productId);
    
    // Добави снимки ако липсват
    await addImagesToProduct(productId, filstarProduct);
    
  } catch (error) {
    console.error(`ERROR updating product ID ${productId}:`, error.message);
  }
}





function formatLineOption(variant) {
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
    parts.push(`Ø${diameter}мм`);
  }
  
  // 4. Японска номерация
  const japaneseSize = attributes.find(a => 
    a.attribute_name.includes('ЯПОНСКА НОМЕРАЦИЯ')
  )?.value;
  
  if (japaneseSize) {
    // Ако вече започва с #, не добавяй втори
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
  
  // 6. Тест LB
  const testLb = attributes.find(a => 
    a.attribute_name.includes('ТЕСТ') && 
    a.attribute_name.includes('LB')
  )?.value;
  
  if (testLb) {
    parts.push(`${testLb}LB`);
  }
  
  return parts.length > 0 ? parts.join(' / ') : `SKU: ${variant.sku}`;
}




//край на формата



async function main() {
  try {
    console.log('Starting braided line import...');
    
    const filstarProducts = await fetchBraidedProducts();
    
    if (!filstarProducts || filstarProducts.length === 0) {
      console.log('No braided line products found');
      return;
    }
    
    console.log(`Processing ${filstarProducts.length} products...`);
    
    for (const filstarProduct of filstarProducts) {
      const firstSku = filstarProduct.variants?.[0]?.sku;
      
      if (!firstSku) {
        console.log(`Skipping product ${filstarProduct.name} - no SKU found`);
        continue;
      }
      
      console.log(`\n--- Processing: ${filstarProduct.name} ---`);
      
      const productId = await findShopifyProductBySku(firstSku);
      
      if (productId) {
        await updateShopifyProduct(productId, filstarProduct);
      } else {
        await createShopifyProduct(filstarProduct);
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log('\n? Braided line import completed!');
  } catch (error) {
    console.error('Import failed:', error);
    process.exit(1);
  }
}

main();
