const SHOPIFY_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const FILSTAR_TOKEN = process.env.FILSTAR_API_TOKEN;
const FILSTAR_API_BASE = 'https://filstar.com/api';
const API_VERSION = '2024-01';

// ID-та на категориите влакна във Filstar
const FILSTAR_LINE_CATEGORY_IDS = {
  monofilament: ['41'],   // Монофилни
  braided: ['105'],       // Плетени
  fluorocarbon: ['107'],  // Fluorocarbon
  other: ['109']          // Други
};

// ID-та на колекциите в Shopify (за reference)
const SHOPIFY_COLLECTION_IDS = {
  monofilament: '738965946750',  // Влакно монофилно
  braided: '738965979518',       // Влакно плетено
  fluorocarbon: '738966044926',  // Влакно флуорокарбон
  other: '739068576126'          // Влакно Други
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

// Функция за извличане на всички влакна от Filstar по категории
async function fetchAllFishingLines() {
  console.log('Fetching fishing line products from Filstar API...');
  
  try {
    console.log(`Fetching all products (limit: 1000)...`);
    
    const response = await fetch(`${FILSTAR_API_BASE}/products?limit=1000`, {
      headers: { 'Authorization': `Bearer ${FILSTAR_TOKEN}` }
    });

    if (!response.ok) {
      throw new Error(`Filstar API error: ${response.status}`);
    }

    const allProducts = await response.json();
    console.log(`Total products fetched: ${allProducts.length}`);
    
    // Филтрирай по категории ID
    const lines = {
      monofilament: [],
      braided: [],
      fluorocarbon: [],
      other: []
    };
    
    allProducts.forEach(product => {
      // Провери дали има parent "Влакна и поводи" (ID: 4)
      const hasLineParent = product.categories?.some(c => 
        c.parent_id === '4' || c.parent_id === 4
      );
      
      if (!hasLineParent) return; // Пропусни ако не е влакно
      
      // Извлечи ID-тата на категориите
      const categoryIds = product.categories?.map(c => c.id.toString()) || [];
      
      // Провери в коя категория влакна спада
      if (categoryIds.some(id => FILSTAR_LINE_CATEGORY_IDS.monofilament.includes(id))) {
        lines.monofilament.push(product);
      } else if (categoryIds.some(id => FILSTAR_LINE_CATEGORY_IDS.braided.includes(id))) {
        lines.braided.push(product);
      } else if (categoryIds.some(id => FILSTAR_LINE_CATEGORY_IDS.fluorocarbon.includes(id))) {
        lines.fluorocarbon.push(product);
      } else if (categoryIds.some(id => FILSTAR_LINE_CATEGORY_IDS.other.includes(id))) {
        lines.other.push(product);
      }
    });
    
    console.log(`\nFound fishing lines:`);
    console.log(`  - Monofilament: ${lines.monofilament.length}`);
    console.log(`  - Braided: ${lines.braided.length}`);
    console.log(`  - Fluorocarbon: ${lines.fluorocarbon.length}`);
    console.log(`  - Other: ${lines.other.length}`);
    console.log(`  - Total: ${lines.monofilament.length + lines.braided.length + lines.fluorocarbon.length + lines.other.length}\n`);
    
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





async function createFishingLineProduct(filstarProduct, lineType) {
  console.log(`Creating new product: ${filstarProduct.name}`);
  
  try {
    const description = filstarProduct.description || filstarProduct.short_description || '';
    
    const shopifyVariants = filstarProduct.variants.map(variant => {
      const optionName = formatFishingLineOption(variant, lineType);

      
      return {
        sku: variant.sku,
        barcode: variant.barcode || null,
        price: variant.price,
        inventory_management: 'shopify',
        inventory_quantity: parseInt(variant.quantity) || 0,
        option1: optionName
      };
    });
    
 

    
 // Премахни дублиращи се снимки преди създаване
const uniqueImages = filstarProduct.images 
  ? [...new Set(filstarProduct.images)].map(url => ({ src: url }))
  : [];

const productData = {
  product: {
    title: filstarProduct.name,
    body_html: description,
    vendor: vendor,
    product_type: productType,
    variants: shopifyVariants,
    images: uniqueImages,
    status: 'active'
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
    
    if (!response.ok) {
      const error = await response.text();
      console.error(`✗ Failed to create product:`, error);
      return null;
    }
    
    const result = await response.json();
    console.log(`✅ Created product: ${result.product.title} (ID: ${result.product.id})`);
    console.log(`   Created ${result.product.variants.length} variants`);
    
    return result.product.id;
    
  } catch (error) {
    console.error(`ERROR creating product:`, error.message);
    return null;
  }
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
  console.log(`⚠️ Product not found in Shopify: ${filstarProduct.name}`);
  console.log(`Creating new product...`);
  const newProductId = await createFishingLineProduct(filstarProduct, lineType);
  if (newProductId) {
    console.log(`✅ Successfully created product with ID: ${newProductId}`);
  }
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
