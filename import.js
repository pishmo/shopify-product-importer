const fetch = require('node-fetch');

const SHOPIFY_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const FILSTAR_TOKEN = process.env.FILSTAR_API_TOKEN;
const API_VERSION = '2024-10';

const FILSTAR_API_BASE = 'https://filstar.com/api';

const PRODUCT_SKUS = [
  // Добавете SKU кодовете тук, например:
  // 'ABC123',
  // 'XYZ789',
  // 'CARP-001'
947828,943215
 
];

async function fetchExternalProducts() {
  console.log('Fetching products from Filstar API by SKU...');
  
  let allProducts = [];
  
  for (const sku of PRODUCT_SKUS) {
    // 1. Fetch product info (name, description, images)
    const productUrl = `${FILSTAR_API_BASE}/products?search=${sku}`;
    
    const productResponse = await fetch(productUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${FILSTAR_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!productResponse.ok) {
      console.error(`Error fetching product SKU ${sku}: ${productResponse.status}`);
      continue;
    }
    
    const productData = await productResponse.json();
    
    if (productData && productData.length > 0) {
      // 2. Fetch price and quantity info
      const priceUrl = `${FILSTAR_API_BASE}/price-quantity?search=${sku}`;
      
      const priceResponse = await fetch(priceUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${FILSTAR_TOKEN}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (priceResponse.ok) {
        const priceData = await priceResponse.json();
        
        // 3. Комбинирай product info + price info
        for (const product of productData) {
          // Намери съответстващия вариант по SKU
          const variant = priceData.find(v => v.sku === sku);
          
          if (variant) {
            product.sku = variant.sku;
            product.barcode = variant.barcode;
            product.price = variant.price;
            product.quantity = variant.quantity;
          }
          
          allProducts.push(product);
        }
        
        console.log(`Found ${productData.length} product(s) with SKU: ${sku}`);
      } else {
        console.error(`Error fetching price for SKU ${sku}: ${priceResponse.status}`);
      }
    } else {
      console.log(`No product found with SKU: ${sku}`);
    }
    
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  console.log(`Total products fetched: ${allProducts.length}`);
  return allProducts;
}


// създаване на продуктите

async function createShopifyProduct(product) {
  console.log(`Processing product: ${product.name}`);
  
  const description = product.description || product.short_description || '';
  
  // Вземи SKU на първия вариант за търсене
  const mainSku = product.variants[0]?.sku;
  
  if (!mainSku) {
    console.log('?? Product has no SKU, skipping...');
    return;
  }
  
  // 1. ПРОВЕРИ ДАЛИ ПРОДУКТЪТ ВЕЧЕ СЪЩЕСТВУВА
  console.log(`Checking if product with SKU ${mainSku} already exists...`);
  
  try {
    const searchResponse = await fetch(
      `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/products.json?fields=id,variants&limit=250`,
      {
        method: 'GET',
        headers: {
          'X-Shopify-Access-Token': ACCESS_TOKEN,
          'Content-Type': 'application/json'
        }
      }
    );
    
    if (!searchResponse.ok) {
      console.error('Failed to search for existing products');
      return;
    }
    
    const searchData = await searchResponse.json();
    
    // Намери продукт, който има вариант с този SKU
    const existingProduct = searchData.products.find(p => 
      p.variants.some(v => v.sku === mainSku)
    );
    
    if (existingProduct) {
      console.log(`? Product already exists (ID: ${existingProduct.id}), updating...`);
      await updateShopifyProduct(existingProduct.id, product);
      return;
    }
    
    console.log('Product does not exist, creating new...');
    
  } catch (error) {
    console.error('Error checking for existing product:', error.message);
  }






  
  // 2. СЪЗДАЙ НОВ ПРОДУКТ (ако не съществува)
  const shopifyVariants = product.variants.map(variant => ({
    sku: variant.sku,
    barcode: variant.barcode,
    price: variant.price,
    inventory_quantity: parseInt(variant.quantity) || 0,
    inventory_management: 'shopify',
    option1: variant.attributes.find(a => a.attribute_name.includes('РАЗМЕР'))?.value || variant.model || null
  }));
  
  const shopifyProduct = {
    title: product.name,
    body_html: description,
    vendor: product.manufacturer || 'Filstar',
    product_type: product.categories?.[0]?.name || 'Fishing Equipment',
    images: product.images.map(url => ({ src: url })),
    variants: shopifyVariants
  };
  
  console.log(`Creating product with ${shopifyVariants.length} variants`);
  
  try {
    const response = await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/products.json`, {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': ACCESS_TOKEN,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ product: shopifyProduct })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      console.error(`Failed to create product "${product.name}":`, JSON.stringify(errorData, null, 2));
      return;
    }
    
    const result = await response.json();
    console.log(`? Successfully created product: ${result.product.title} (ID: ${result.product.id})`);
    
  } catch (error) {
    console.error(`ERROR creating product "${product.name}":`, error.message);
  }
}

// 3. КОРИГИРАНА ФУНКЦИЯ ЗА UPDATE
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
    
  
    
    
    
    
    
    
    // Обнови варианти (цена и наличност)
    for (const filstarVariant of filstarProduct.variants) {
      const existingVariant = existingProduct.variants.find(v => v.sku === filstarVariant.sku);
      
      if (existingVariant) {
        // 1. Update цена на вариант
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
                price: filstarVariant.price
              }
            })
          }
        );
        
        if (updateResponse.ok) {
          console.log(`  ? Updated price for SKU ${filstarVariant.sku}`);
        }
        
        await new Promise(resolve => setTimeout(resolve, 300));
        
      
        
        
        
        
        
    // 2. Update наличност през Inventory API
if (existingVariant.inventory_item_id) {
  const newQuantity = parseInt(filstarVariant.quantity) || 0;
  
  console.log(`  → Attempting inventory update for SKU ${filstarVariant.sku}`);
  console.log(`    inventory_item_id: ${existingVariant.inventory_item_id}`);
  console.log(`    new quantity: ${newQuantity}`);
  
  // Вземи текущата наличност
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
  
  console.log(`    inventory GET status: ${inventoryResponse.status}`);
  
  if (inventoryResponse.ok) {
    const inventoryData = await inventoryResponse.json();
    console.log(`    inventory data:`, JSON.stringify(inventoryData, null, 2));
    
    const inventoryLevel = inventoryData.inventory_levels[0];
    
    if (inventoryLevel) {
      console.log(`    location_id: ${inventoryLevel.location_id}`);
      console.log(`    current available: ${inventoryLevel.available}`);
      
      // Set новата наличност
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
      
      console.log(`    inventory SET status: ${setResponse.status}`);
      
      if (setResponse.ok) {
        const setData = await setResponse.json();
        console.log(`  ✓ Updated inventory for SKU ${filstarVariant.sku}: ${newQuantity} units`);
        console.log(`    response:`, JSON.stringify(setData, null, 2));
      } else {
        const errorText = await setResponse.text();
        console.error(`  ✗ Failed to update inventory for SKU ${filstarVariant.sku}`);
        console.error(`    error:`, errorText);
      }
    } else {
      console.error(`  ✗ No inventory level found for SKU ${filstarVariant.sku}`);
    }
  } else {
    const errorText = await inventoryResponse.text();
    console.error(`  ✗ Failed to get inventory levels`);
    console.error(`    error:`, errorText);
  }
  
  await new Promise(resolve => setTimeout(resolve, 300));
} else {
  console.error(`  ✗ No inventory_item_id for SKU ${filstarVariant.sku}`);
}





        
      }
    }
    
    console.log(`? Successfully updated product ID ${productId}`);
    
  } catch (error) {
    console.error(`ERROR updating product ID ${productId}:`, error.message);
  }
}




async function main() {
  try {
    console.log('Starting product import...');
    
    // 1. Fetch products from external API
    const externalProducts = await fetchExternalProducts();


// 2. Filter only allowed product SKU
  // Премахни филтъра по ID, защото вече филтрираме по SKU
  console.log(`Processing ${externalProducts.length} products`);
    



    
    // 3. Create each product in Shopify
    for (const product of externalProducts) {
      await createShopifyProduct(product);
      // Пауза между заявки (rate limiting)
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    console.log('Import completed!');
  } catch (error) {
    console.error('Import failed:', error);
    process.exit(1);
  }
}

main();

