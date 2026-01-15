const fetch = require('node-fetch');

const SHOPIFY_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const FILSTAR_TOKEN = process.env.FILSTAR_API_TOKEN;
const API_VERSION = '2024-10';

const FILSTAR_API_BASE = 'https://filstar.com/api';

const PRODUCT_SKUS = [
  // Добавете SKU кодовете тук, например:
  
947828,943215,957595,
955941,
955940,
953744,
942354,
962878,
959007,
955788,
952365,
956838,
955249,
948255,
942307,
935747,
930213,


  // Въдици   
925922,962694,922792,961494,961206,961204,962400,961494,
962386,960556,959361,956192,956195,955859,953618,953622,
955079,948701,948710,948707,948759,948724,948727,943217,
943214,928448,927235,927234,922775,942200,944981,
  
963460,961475,961471,962156,957910,961912,961911,957796,961356,961018,
961020,961022,961037,961035,960755,960723,957927,960260,961916,957514,
958561,957518,957846,956155,956049,953505,951476,951512,950665,949661,
949586,947342,945825,946818,940187,942702,940445,
  

 
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

// 3. ФУНКЦИЯ ЗА UPDATE - само цени и наличности (clean version)
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
    
    // Обнови варианти (само цена и наличност)
    for (const filstarVariant of filstarProduct.variants) {
      const existingVariant = existingProduct.variants.find(v => v.sku === filstarVariant.sku);
      
      if (existingVariant) {
        // Update цена
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
          console.log(`  ✓ Updated price for SKU ${filstarVariant.sku}`);
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
              } else {
                console.error(`  ✗ Failed to update inventory for SKU ${filstarVariant.sku}`);
              }
            }
          } else {
            console.error(`  ✗ Failed to get inventory levels for SKU ${filstarVariant.sku}`);
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

