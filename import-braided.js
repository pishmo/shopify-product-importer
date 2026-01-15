// update-braided.js - Пълна версия с create и update
const fetch = require('node-fetch');

const SHOPIFY_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const FILSTAR_TOKEN = process.env.FILSTAR_API_TOKEN;
const API_VERSION = '2024-10';
const FILSTAR_API_BASE = 'https://filstar.com/api';

const BRAIDED_CATEGORY_ID = '105';
const SHOPIFY_COLLECTION_ID = '738965979518'; // Плетено влакно колекция

// 1. FETCH ПРОДУКТИ ОТ FILSTAR
async function fetchBraidedProducts() {
  console.log('Fetching braided line products from Filstar (Category ID: 105)...');
  
  let allProducts = [];
  
  for (let page = 1; page <= 25; page++) {
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
      
      const isBraided = p.categories.some(cat => cat.id === BRAIDED_CATEGORY_ID);
      
      if (isBraided) {
        console.log(`  ✓ Found: ${p.name} (ID: ${p.id})`);
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

// 2. FETCH ЦЕНА И НАЛИЧНОСТ
async function fetchPriceAndQuantity(filstarProduct) {
  const firstVariant = filstarProduct.variants?.[0];
  if (!firstVariant) return null;
  
  const searchValue = firstVariant.sku || firstVariant.code || filstarProduct.id;
  
  console.log(`  Fetching price for: ${searchValue}`);
  
  const priceUrl = `${FILSTAR_API_BASE}/price-quantity?search=${searchValue}`;
  
  const response = await fetch(priceUrl, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${FILSTAR_TOKEN}`,
      'Content-Type': 'application/json'
    }
  });
  
  if (!response.ok) {
    console.error(`  Error fetching price: ${response.status}`);
    return null;
  }
  
  const priceData = await response.json();
  return priceData;
}

// 3. ТЪРСИ ПРОДУКТ В SHOPIFY ПО SKU
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

// 4. ФОРМАТИРАНЕ НА ВАРИАНТ ИМЕ
function formatBraidedVariantName(variant) {
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
    parts.push(`#${japaneseSize}`);
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

// 5. СЪЗДАВАНЕ НА НОВ ПРОДУКТ
async function createBraidedProduct(filstarProduct, priceData) {
  console.log(`\n📦 Creating new product: ${filstarProduct.name}`);
  
  if (!priceData || priceData.length === 0) {
    console.log('  ⚠️  No price data, skipping creation');
    return;
  }
  
  // Подготви варианти
  const variants = priceData.map(priceVariant => {
    const filstarVariant = filstarProduct.variants?.find(v => v.sku === priceVariant.sku);
    
    const variantName = filstarVariant 
      ? formatBraidedVariantName(filstarVariant)
      : `SKU: ${priceVariant.sku}`;
    
    return {
      option1: variantName,
      price: priceVariant.price || '0.00',
      sku: priceVariant.sku,
      barcode: priceVariant.barcode || '',
      inventory_management: 'shopify',
      inventory_quantity: parseInt(priceVariant.quantity) || 0
    };
  });
  
  const productData = {
    product: {
      title: filstarProduct.name,
      body_html: filstarProduct.description || filstarProduct.short_description || '',
      vendor: filstarProduct.manufacturer || 'Filstar',
      product_type: 'Плетено влакно',
      status: 'active',
      variants: variants,
      options: [
        {
          name: 'Вариант',
          values: variants.map(v => v.option1)
        }
      ],
      images: filstarProduct.images ? filstarProduct.images.map(url => ({ src: url })) : []
    }
  };
  
  try {
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
    
    if (!response.ok) {
      const error = await response.text();
      console.error(`  ❌ Failed to create product:`, error);
      return;
    }
    
    const result = await response.json();
    const newProductId = result.product.id;
    
    console.log(`  ✅ Product created! ID: ${newProductId}`);
    
    // Добави към колекция
    await addProductToCollection(newProductId, SHOPIFY_COLLECTION_ID);
    
  } catch (error) {
    console.error(`  ❌ Error creating product:`, error.message);
  }
}

// 6. ДОБАВЯНЕ КЪМ КОЛЕКЦИЯ
async function addProductToCollection(productId, collectionId) {
  console.log(`  Adding product to collection ${collectionId}...`);
  
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
            collection_id: collectionId
          }
        })
      }
    );
    
    if (response.ok) {
      console.log(`  ✅ Added to collection`);
    } else {
      console.error(`  ⚠️  Failed to add to collection`);
    }
  } catch (error) {
    console.error(`  ⚠️  Error adding to collection:`, error.message);
  }
}

// 7. UPDATE НА СЪЩЕСТВУВАЩ ПРОДУКТ
async function updateBraidedProduct(productId, filstarProduct, priceData) {
  console.log(`\n🔄 Updating product ID: ${productId}`);
  
  try {
    // Вземи текущите данни
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
      console.error('  ❌ Failed to get product details');
      return;
    }
    
    const existingData = await getResponse.json();
    const existingProduct = existingData.product;
    
    console.log(`  Current product has ${existingProduct.variants.length} variants`);
    
    // Update всеки вариант
    for (const priceVariant of priceData) {
      const existingVariant = existingProduct.variants.find(v => v.sku === priceVariant.sku);
      
      if (existingVariant) {
        const filstarVariant = filstarProduct.variants?.find(v => v.sku === priceVariant.sku);
        const newOptionName = filstarVariant 
          ? formatBraidedVariantName(filstarVariant)
          : existingVariant.option1;
        
        console.log(`  Updating variant SKU ${priceVariant.sku}:`);
        console.log(`    Old: ${existingVariant.option1}`);
        console.log(`    New: ${newOptionName}`);
        console.log(`    Price: ${priceVariant.price}`);
        
        // Update вариант (име и цена)
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
                price: priceVariant.price
              }
            })
          }
        );
        
        if (updateResponse.ok) {
          console.log(`    ✓ Updated variant`);
        } else {
          const error = await updateResponse.text();
          console.error(`    ✗ Failed to update variant:`, error);
        }
        
        await new Promise(resolve => setTimeout(resolve, 300));
        
        // Update наличност
        if (existingVariant.inventory_item_id) {
          const newQuantity = parseInt(priceVariant.quantity) || 0;
          
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
                console.log(`    ✓ Updated inventory: ${newQuantity} units`);
              } else {
                console.error(`    ✗ Failed to update inventory`);
              }
            }
          }
          
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      } else {
        console.log(`  ⚠️  Variant with SKU ${priceVariant.sku} not found in Shopify`);
      }
    }
    
    console.log(`  ✅ Finished updating product`);
    
  } catch (error) {
    console.error(`  ❌ Error updating product:`, error.message);
  }
}

// 8. MAIN ФУНКЦИЯ
async function main() {
  try {
    console.log('Starting braided line import/update...\n');
    
    // Fetch всички плетени влакна от Filstar
    const filstarProducts = await fetchBraidedProducts();
    
    console.log(`\n${'='.repeat(70)}`);
    console.log(`Processing ${filstarProducts.length} braided products...`);
    console.log('='.repeat(70));
    
    for (const filstarProduct of filstarProducts) {
      console.log(`\n--- Processing: ${filstarProduct.name} ---`);
      
      // Fetch цени и наличности
      const priceData = await fetchPriceAndQuantity(filstarProduct);
      
      if (!priceData || priceData.length === 0) {
        console.log('No price data, skipping...');
        continue;
      }
      
      // Вземи първия SKU за търсене
      const firstSku = priceData[0].sku;
      
      // Провери дали съществува в Shopify
      const productId = await findShopifyProductBySku(firstSku);
      
      if (productId) {
        // UPDATE съществуващ продукт
        await updateBraidedProduct(productId, filstarProduct, priceData);
      } else {
        // CREATE нов продукт
        await createBraidedProduct(filstarProduct, priceData);
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log(`\n${'='.repeat(70)}`);
    console.log('✅ Braided line import/update completed!');
    console.log('='.repeat(70));
    
  } catch (error) {
    console.error('Import/update failed:', error);
    process.exit(1);
  }
}

main();
