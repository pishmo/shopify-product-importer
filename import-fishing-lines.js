const SHOPIFY_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const FILSTAR_TOKEN = process.env.FILSTAR_API_TOKEN;
const FILSTAR_API_BASE = 'https://filstar.com/api';
const API_VERSION = '2024-01';


// Дефиниция на категориите влакна
const LINE_CATEGORIES = {
  braided: ['Плетени'],
  monofilament: ['Монофилни'],
  fluorocarbon: ['Флуорокарбон', 'Fluorocarbon'],
  other: ['Други']  // ✅ Вече добавено
};





// Функция за извличане на filename от URL (без hash)
function getImageFilename(src) {
  if (!src || typeof src !== 'string') {
    console.log('⚠️ Invalid image src:', src);
    return null;
  }
  
  const urlParts = src.split('/').pop();
  const withoutQuery = urlParts.split('?')[0];
  
  const parts = withoutQuery.split('_');
  if (parts.length > 1) {
    const lastPart = parts[parts.length - 1];
    if (lastPart.length >= 32 && /^[a-f0-9]+/.test(lastPart)) {
      parts.pop();
    }
  }
  
  return parts.join('_');
}

// Функция за проверка дали снимка съществува
function imageExists(existingImages, newImageUrl) {
  const newFilename = getImageFilename(newImageUrl);
  if (!newFilename) return false;
  
  return existingImages.some(img => {
    const existingFilename = getImageFilename(img.src);
    return existingFilename && existingFilename === newFilename;
  });
}

// Функция за upload на снимка
async function uploadProductImage(productId, imageUrl, existingImages) {
  const filename = getImageFilename(imageUrl);
  
  if (!filename) {
    console.log('  ⚠️ Skipping invalid image URL');
    return false;
  }
  
  if (imageExists(existingImages, imageUrl)) {
    console.log(`  ⏭️  Image already exists, skipping: ${filename}`);
    return false;
  }
  
  console.log(`  📸 Uploading new image: ${filename}`);
  
  const response = await fetch(
    `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/products/${productId}/images.json`,
    {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': ACCESS_TOKEN,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        image: { src: imageUrl }
      })
    }
  );
  
  if (!response.ok) {
    const error = await response.text();
    console.error(`  ✗ Failed to upload image:`, error);
    return false;
  }
  
  console.log(`  ✓ Image uploaded successfully`);
  await new Promise(resolve => setTimeout(resolve, 300));
  return true;
}

// Функция за извличане на всички влакна от Filstar
async function fetchAllFishingLines() {
  console.log('Fetching all products from Filstar API...');
  
  try {
    const response = await fetch(`${FILSTAR_API_BASE}/products`, {
      headers: { 'Authorization': `Bearer ${FILSTAR_TOKEN}` }
    });

    if (!response.ok) {
      throw new Error(`Filstar API error: ${response.status}`);
    }

    const allProducts = await response.json();
    console.log(`Total products fetched: ${allProducts.length}`);
    
   
  // Филтрирай по категории
const lines = {
  braided: [],
  monofilament: [],
  fluorocarbon: [],
  other: []  // ← Добави това
};



allProducts.forEach(product => {
  const categoryNames = product.categories?.map(c => c.name) || [];
  
  // Проверка дали има parent категория "Влакна и поводи"
  const hasLineParent = product.categories?.some(c => 
    c.parent_name === 'Влакна и поводи' || c.parent_id === '4'
  );
  
  if (categoryNames.some(name => LINE_CATEGORIES.braided.includes(name))) {
    lines.braided.push(product);
  } else if (categoryNames.some(name => LINE_CATEGORIES.monofilament.includes(name))) {
    lines.monofilament.push(product);
  } else if (categoryNames.some(name => LINE_CATEGORIES.fluorocarbon.some(fc => name.includes(fc)))) {
    lines.fluorocarbon.push(product);
  } else if (hasLineParent && categoryNames.some(name => LINE_CATEGORIES.other.includes(name))) {
    // Само "Други" които са под "Влакна и поводи"
    lines.other.push(product);
  }
});


    
console.log(`\nFound fishing lines:`);
console.log(`  - Braided: ${lines.braided.length}`);
console.log(`  - Monofilament: ${lines.monofilament.length}`);
console.log(`  - Fluorocarbon: ${lines.fluorocarbon.length}`);
console.log(`  - Other: ${lines.other.length}`);  // ← Добави това
console.log(`  - Total: ${lines.braided.length + lines.monofilament.length + lines.fluorocarbon.length + lines.other.length}\n`);  // ← Обнови total

    return lines;
    
  } catch (error) {
    console.error('Error fetching products:', error.message);
    throw error;
  }
}

// Функция за търсене на продукт в Shopify по SKU
async function findShopifyProductBySKU(sku) {
  const query = `
    query {
      productVariants(first: 1, query: "sku:${sku}") {
        edges {
          node {
            id
            sku
            product {
              id
              legacyResourceId
              title
              images(first: 50) {
                edges {
                  node {
                    id
                    src
                  }
                }
              }
              variants(first: 100) {
                edges {
                  node {
                    id
                    legacyResourceId
                    sku
                    price
                    inventoryQuantity
                  }
                }
              }
            }
          }
        }
      }
    }
  `;

  const response = await fetch(
    `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/graphql.json`,
    {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': ACCESS_TOKEN,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ query })
    }
  );

  const result = await response.json();
  
  if (result.data?.productVariants?.edges?.length > 0) {
    const product = result.data.productVariants.edges[0].node.product;
    return {
      id: product.legacyResourceId,
      title: product.title,
      images: product.images.edges.map(e => ({ src: e.node.src })),
      variants: product.variants.edges.map(e => ({
        id: e.node.legacyResourceId,
        sku: e.node.sku,
        price: e.node.price,
        inventoryQuantity: e.node.inventoryQuantity
      }))
    };
  }
  
  return null;
}

// Функция за update на вариант
async function updateVariant(variantId, price, inventoryQuantity) {
  const updateData = {
    variant: {
      id: variantId,
      price: price.toString()
    }
  };

  const response = await fetch(
    `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/variants/${variantId}.json`,
    {
      method: 'PUT',
      headers: {
        'X-Shopify-Access-Token': ACCESS_TOKEN,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(updateData)
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to update variant: ${error}`);
  }

  return await response.json();
}

// Функция за update на продукт
async function updateFishingLineProduct(shopifyProduct, filstarProduct, lineType) {
  console.log(`\n[${lineType.toUpperCase()}] Updating: ${shopifyProduct.title}`);
  
  const productId = shopifyProduct.id;
  let imagesUploaded = 0;
  let imagesSkipped = 0;
  
  // Upload снимки
  if (filstarProduct.images && filstarProduct.images.length > 0) {
    console.log(`Processing ${filstarProduct.images.length} images from Filstar...`);
    
    for (const imageUrl of filstarProduct.images) {
      const uploaded = await uploadProductImage(productId, imageUrl, shopifyProduct.images);
      if (uploaded) {
        imagesUploaded++;
      } else {
        imagesSkipped++;
      }
    }
    
    console.log(`Images: ${imagesUploaded} uploaded, ${imagesSkipped} skipped (already exist)`);
  }
  
  // Update варианти
  if (filstarProduct.variants && filstarProduct.variants.length > 0) {
    console.log(`Updating ${filstarProduct.variants.length} variants...`);
    
    for (const filstarVariant of filstarProduct.variants) {
      const shopifyVariant = shopifyProduct.variants.find(v => v.sku === filstarVariant.sku);
      
      if (shopifyVariant) {
        const attributes = filstarVariant.attributes || [];
        const variantTitle = attributes.map(a => a.value).join(' / ');
        
        try {
          await updateVariant(
            shopifyVariant.id,
            filstarVariant.price,
            filstarVariant.quantity
          );
          console.log(`  ✓ Updated variant: ${variantTitle}`);
          await new Promise(resolve => setTimeout(resolve, 300));
        } catch (error) {
          console.error(`  ✗ Failed to update variant ${filstarVariant.sku}:`, error.message);
        }
      }
    }
  }
  
  console.log(`✅ Finished updating product`);
}

// Главна функция
async function main() {
  try {
    console.log('Starting fishing lines import...\n');
    
    // Fetch всички влакна от Filstar
    const fishingLines = await fetchAllFishingLines();
    
    // Обработи всяка категория
    for (const [lineType, products] of Object.entries(fishingLines)) {
      if (products.length === 0) {
        console.log(`\n=== Skipping ${lineType} (no products) ===\n`);
        continue;
      }
      
      console.log(`\n=== Processing ${lineType} (${products.length} products) ===\n`);
      
      for (const filstarProduct of products) {
        const mainSKU = filstarProduct.variants?.[0]?.sku;
        
        if (!mainSKU) {
          console.log(`⚠️ Skipping product without SKU: ${filstarProduct.name}`);
          continue;
        }
        
        console.log(`Searching for product with SKU: ${mainSKU}...`);
        const shopifyProduct = await findShopifyProductBySKU(mainSKU);
        
        if (shopifyProduct) {
          console.log(`Found existing product: ${shopifyProduct.title} (ID: ${shopifyProduct.id})`);
          await updateFishingLineProduct(shopifyProduct, filstarProduct, lineType);
        } else {
          console.log(`⚠️ Product not found in Shopify, skipping: ${filstarProduct.name}`);
        }
        
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    console.log('\n✅ Fishing lines import completed!');
    
  } catch (error) {
    console.error('❌ Import failed:', error);
    process.exit(1);
  }
}

main();
