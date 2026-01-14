const fetch = require('node-fetch');

const SHOPIFY_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const FILSTAR_TOKEN = process.env.FILSTAR_API_TOKEN;
const API_VERSION = '2025-01';

const FILSTAR_API_BASE = 'https://filstar.com/api';
const COLLECTION_ID = '738965946750'; // Влакно монофилно


// ФУНКЦИЯ 1 - Замени цялата fetchFilstarMonofilamentProducts функция
async function fetchFilstarMonofilamentProducts() {
  console.log('Fetching monofilament products from Filstar...');
  
  let allProducts = [];
  
  // Опитай с различни search термини
  const searchTerms = ['монофилно', 'monofilament', 'mono'];
  
  for (const term of searchTerms) {
    console.log(`Searching for: ${term}`);
    
    for (let page = 1; page <= 2; page++) {
      const url = `${FILSTAR_API_BASE}/products?page=${page}&search=${encodeURIComponent(term)}`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${FILSTAR_TOKEN}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        console.error(`Error fetching page ${page}: ${response.status}`);
        continue;
      }
      
      const data = await response.json();
      
      if (data && data.length > 0) {
        // Филтрирай само монофилни влакна
        const filtered = data.filter(p => 
          p.name && (
            p.name.toLowerCase().includes('монофилно') ||
            p.name.toLowerCase().includes('monofilament') ||
            p.name.toLowerCase().includes('mono')
          )
        );
        
        allProducts = allProducts.concat(filtered);
        console.log(`  Found ${filtered.length} monofilament products on page ${page}`);
      }
      
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  // Премахни дубликати по ID
  const uniqueProducts = Array.from(
    new Map(allProducts.map(p => [p.id, p])).values()
  );
  
  console.log(`Total unique products: ${uniqueProducts.length}`);
  return uniqueProducts;
}

// ФУНКЦИЯ 2 - Замени цялата fetchPriceAndQuantity функция
async function fetchPriceAndQuantity(product) {
  // Опитай с различни полета за SKU
  const searchValue = product.sku || product.code || product.id;
  
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
  
  // Опитай да намериш по различни полета
  let variant = priceData.find(v => 
    v.sku == searchValue || 
    v.code == searchValue || 
    v.id == searchValue
  );
  
  // Ако не намери, вземи първия
  if (!variant && priceData.length > 0) {
    variant = priceData[0];
  }
  
  return variant;
}









// Функция за проверка дали продукт съществува в Shopify
async function findProductBySku(sku) {
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
    return null;
  }
  
  const data = await response.json();
  
  for (const product of data.products) {
    for (const variant of product.variants) {
      if (variant.sku === sku) {
        return {
          productId: product.id,
          variantId: variant.id,
          inventoryItemId: variant.inventory_item_id,
          title: product.title
        };
      }
    }
  }
  
  return null;
}

// Функция за update на цена и наличност
async function updatePriceAndInventory(variantId, inventoryItemId, price, quantity) {
  console.log(`  Updating: price=${price}, quantity=${quantity}`);
  
  // Update price
  const priceResponse = await fetch(
    `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/variants/${variantId}.json`,
    {
      method: 'PUT',
      headers: {
        'X-Shopify-Access-Token': ACCESS_TOKEN,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        variant: {
          id: variantId,
          price: price.toString()
        }
      })
    }
  );
  
  if (!priceResponse.ok) {
    console.error(`  Failed to update price`);
    return false;
  }
  
  // Get inventory level
  const inventoryResponse = await fetch(
    `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/inventory_levels.json?inventory_item_ids=${inventoryItemId}`,
    {
      method: 'GET',
      headers: {
        'X-Shopify-Access-Token': ACCESS_TOKEN,
        'Content-Type': 'application/json'
      }
    }
  );
  
  if (!inventoryResponse.ok) {
    console.error(`  Failed to get inventory`);
    return false;
  }
  
  const inventoryData = await inventoryResponse.json();
  
  if (inventoryData.inventory_levels.length === 0) {
    console.error(`  No inventory location found`);
    return false;
  }
  
  const locationId = inventoryData.inventory_levels[0].location_id;
  
  // Update inventory
  const updateInventoryResponse = await fetch(
    `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/inventory_levels/set.json`,
    {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': ACCESS_TOKEN,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        location_id: locationId,
        inventory_item_id: inventoryItemId,
        available: quantity
      })
    }
  );
  
  if (!updateInventoryResponse.ok) {
    console.error(`  Failed to update inventory`);
    return false;
  }
  
  console.log(`  ✅ Updated successfully`);
  return true;
}

// Функция за създаване на нов продукт
async function createProduct(product, variant) {
  console.log(`  Creating new product: ${product.name}`);
  
  const shopifyProduct = {
    title: product.name,
    body_html: product.description || '',
    vendor: 'Filstar',
    product_type: 'Влакно монофилно',
    variants: [{
      sku: variant.sku,
      barcode: variant.barcode || '',
      price: variant.price.toString(),
      inventory_management: 'shopify',
      inventory_quantity: variant.quantity || 0
    }],
    images: product.images ? product.images.map(img => ({ src: img.url })) : []
  };
  
  const response = await fetch(
    `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/products.json`,
    {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': ACCESS_TOKEN,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ product: shopifyProduct })
    }
  );
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error(`  Failed to create product: ${errorText}`);
    return null;
  }
  
  const result = await response.json();
  console.log(`  ✅ Created product ID: ${result.product.id}`);
  
  // Add to collection
  await addToCollection(result.product.id);
  
  return result.product;
}

// Функция за добавяне в колекция
async function addToCollection(productId) {
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
    console.log(`  ✅ Added to collection`);
    return true;
  }
  
  return false;
}

// Main функция
async function main() {
  console.log('Starting monofilament line import/update...\n');
  
  try {
    // 1. Fetch всички монофилни влакна от Filstar
    const filstarProducts = await fetchFilstarMonofilamentProducts();
    
    if (filstarProducts.length === 0) {
      console.log('No products found on Filstar');
      return;
    }
    
    console.log(`\n--- Processing ${filstarProducts.length} products ---\n`);
    
    let created = 0;
    let updated = 0;
    let skipped = 0;
    
    // 2. Обработка на всеки продукт
    for (const product of filstarProducts) {
      console.log(`Processing: ${product.name}`);
      
      // Вземи първия SKU от продукта (или всички варианти ако има)
     const priceData = await fetchPriceAndQuantity(product);

      
      if (!priceData) {
        console.log(`  ⚠️ No price data found, skipping`);
        skipped++;
        continue;
      }
      
      // Провери дали съществува в Shopify
      const existingProduct = await findProductBySku(priceData.sku);
      
      if (existingProduct) {
        // Update съществуващ продукт
        console.log(`  Found existing: ${existingProduct.title}`);
        const success = await updatePriceAndInventory(
          existingProduct.variantId,
          existingProduct.inventoryItemId,
          priceData.price,
          priceData.quantity
        );
        if (success) updated++;
      } else {
        // Създай нов продукт
        const newProduct = await createProduct(product, priceData);
        if (newProduct) created++;
      }
      
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    console.log('\n=== Summary ===');
    console.log(`✅ Created: ${created}`);
    console.log(`🔄 Updated: ${updated}`);
    console.log(`⚠️ Skipped: ${skipped}`);
    console.log(`📦 Total processed: ${filstarProducts.length}`);
    
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
