// import-rods.js - Автоматично извличане на пръчки от колекция
const SHOPIFY_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const FILSTAR_TOKEN = process.env.FILSTAR_API_TOKEN;
const API_VERSION = '2024-10';
const FILSTAR_API_BASE = 'https://filstar.com/api';

// ID на колекцията "Въдици"
const COLLECTION_ID = '738867413374';

async function getSkusFromCollection(collectionId) {
  console.log(`Fetching all SKUs from collection ${collectionId}...`);
  
  const response = await fetch(
    `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/collections/${collectionId}/products.json?fields=id,title,variants&limit=250`,
    {
      method: 'GET',
      headers: {
        'X-Shopify-Access-Token': ACCESS_TOKEN,
        'Content-Type': 'application/json'
      }
    }
  );
  
  if (!response.ok) {
    throw new Error('Failed to fetch collection products');
  }
  
  const data = await response.json();
  
  // Извлечи SKU от ВСИЧКИ варианти на всички продукти
  const skus = [];
  
  for (const product of data.products) {
    console.log(`Product: ${product.title}`);
    
    if (!product.variants || product.variants.length === 0) {
      console.log(`  No variants found`);
      continue;
    }
    
    console.log(`  Variants: ${product.variants.length}`);
    
    for (const variant of product.variants) {
      if (variant.sku && variant.sku.trim()) {
        skus.push(variant.sku);
        console.log(`  Found SKU: ${variant.sku}`);
      } else {
        console.log(`  Variant has no SKU`);
      }
    }
  }
  
  console.log(`Total SKUs found: ${skus.length}`);
  return skus;
}



async function fetchRodProducts(skus) {
  console.log('Fetching rod products from Filstar...');
  
  let allProducts = [];
  
  for (const sku of skus) {
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

async function updateRodProduct(productId, filstarProduct) {
  console.log(`Updating rod product ID: ${productId}`);
  
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
    
    // Автоматично извличане на SKU-та от колекцията
    const skus = await getSkusFromCollection(COLLECTION_ID);
    
    // Извличане от Filstar
    const filstarProducts = await fetchRodProducts(skus);
    console.log(`Total rod products fetched from Filstar: ${filstarProducts.length}`);
    
    // Update в Shopify
    for (const filstarProduct of filstarProducts) {
      const firstSku = filstarProduct.variants?.[0]?.sku;
      
      if (!firstSku) {
        console.log('No SKU found in variants, skipping...');
        continue;
      }
      
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
