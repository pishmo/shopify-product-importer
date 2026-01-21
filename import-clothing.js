// import-clothing.js
const fetch = require('node-fetch');

const SHOPIFY_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const FILSTAR_TOKEN = process.env.FILSTAR_API_TOKEN;
const API_VERSION = '2024-10';
const FILSTAR_API_BASE = 'https://filstar.com/api';
const FILSTAR_BASE_URL = 'https://filstar.com';

// Shopify колекции за облекло
const COLLECTION_MAPPING = {
  shoes: 'gid://shopify/Collection/739347595646',
  tshirts: 'gid://shopify/Collection/739347038590',
  pants: 'gid://shopify/Collection/739347136894',
  jackets: 'gid://shopify/Collection/739347235198',
  hats: 'gid://shopify/Collection/739347399038',
  gloves: 'gid://shopify/Collection/739347530110',
  sunglasses: 'gid://shopify/Collection/739347628414',
  other: 'gid://shopify/Collection/739347661182'
};

// Filstar категории за облекло
const FILSTAR_CLOTHING_CATEGORY_IDS = {
  shoes: ['90'],
  tshirts: ['84'],
  pants: ['85'],
  jackets: ['86'],
  hats: ['88'],
  gloves: ['89'],
  sunglasses: ['92'],
  other: ['95']
};

const CLOTHING_PARENT_ID = '10';

// Статистика
const stats = {
  shoes: { created: 0, updated: 0, images: 0 },
  tshirts: { created: 0, updated: 0, images: 0 },
  pants: { created: 0, updated: 0, images: 0 },
  jackets: { created: 0, updated: 0, images: 0 },
  hats: { created: 0, updated: 0, images: 0 },
  gloves: { created: 0, updated: 0, images: 0 },
  sunglasses: { created: 0, updated: 0, images: 0 },
  other: { created: 0, updated: 0, images: 0 }
};

// Helper функции
function getImageFilename(src) {
  if (!src) return '';
  const parts = src.split('/');
  const filename = parts[parts.length - 1];
  const cleanFilename = filename.split('?')[0];
  return cleanFilename.replace(/^_+/, '');
}

function extractSkuFromImageFilename(filename) {
  const match = filename.match(/^(\d+)/);
  return match ? match[1] : null;
}

function sortImagesBySku(imageUrls) {
  if (!imageUrls || imageUrls.length === 0) return [];
  
  return imageUrls.slice().sort((a, b) => {
    const filenameA = getImageFilename(a);
    const filenameB = getImageFilename(b);
    
    const skuA = extractSkuFromImageFilename(filenameA);
    const skuB = extractSkuFromImageFilename(filenameB);
    
    if (skuA && skuB) {
      return skuA.localeCompare(skuB, undefined, { numeric: true });
    }
    
    return filenameA.localeCompare(filenameB);
  });
}

function imageExists(existingImages, newImageUrl) {
  if (!existingImages || existingImages.length === 0) return false;
  
  const newFilename = getImageFilename(newImageUrl);
  
  return existingImages.some(img => {
    const existingFilename = getImageFilename(img.src);
    return existingFilename === newFilename;
  });
}

function formatVariantName(variant, categoryType) {
  if (!variant.attributes || variant.attributes.length === 0) {
    return variant.sku ? `SKU: ${variant.sku}` : (variant.model || 'Default');
  }
  
  const attributes = variant.attributes;
  
  // Търси модел, цвят, размер
  const model = attributes.find(a => 
    a.attribute_name.toLowerCase().includes('модел') || 
    a.attribute_name.toLowerCase().includes('model')
  )?.value;
  
  const color = attributes.find(a => 
    a.attribute_name.toLowerCase().includes('цвят') || 
    a.attribute_name.toLowerCase().includes('color')
  )?.value;
  
  const size = attributes.find(a => 
    a.attribute_name.toLowerCase().includes('размер') || 
    a.attribute_name.toLowerCase().includes('size')
  )?.value;
  
  // Комбинирай атрибутите
  const parts = [];
  if (model) parts.push(model);
  if (color) parts.push(color);
  if (size) parts.push(size);
  
  if (parts.length > 0) {
    return parts.join(' / ');
  }
  
  // Fallback към SKU
  return variant.sku ? `SKU: ${variant.sku}` : (variant.model || 'Default');
}

function ensureUniqueVariantNames(variants, categoryType) {
  const nameCount = {};
  
  return variants.map(variant => {
    let name = formatVariantName(variant, categoryType);
    
    if (nameCount[name]) {
      nameCount[name]++;
      name = `${name} (${nameCount[name]})`;
    } else {
      nameCount[name] = 1;
    }
    
    return {
      ...variant,
      displayName: name
    };
  });
}

function getCategoryDisplayName(category) {
  const names = {
    shoes: 'Обувки, ботуши и гащеризони',
    tshirts: 'Тениски и блузи',
    pants: 'Панталони',
    jackets: 'Якета, суичъри и елеци',
    hats: 'Шапки и бандани',
    gloves: 'Ръкавици',
    sunglasses: 'Очила',
    other: 'Други'
  };
  return names[category] || category;
}

// API функции
async function fetchAllProducts() {
  console.log('Fetching all products from Filstar API with pagination...');
  
  let allProducts = [];
  let page = 1;
  let hasMore = true;
  
  while (hasMore) {
    console.log(`Fetching page ${page}...`);
    
    const response = await fetch(`${FILSTAR_API_BASE}/products?page=${page}&limit=1000`, {
      headers: { 'Authorization': `Bearer ${FILSTAR_TOKEN}` }
    });
    
    if (!response.ok) {
      throw new Error(`Filstar API error: ${response.status}`);
    }
    
    const products = await response.json();
    console.log(`Page ${page}: ${products.length} products`);
    
    if (products.length === 0) {
      hasMore = false;
      console.log('No more products, stopping pagination');
    } else {
      allProducts = allProducts.concat(products);
      page++;
    }
    
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  console.log(`Total products fetched: ${allProducts.length}`);
  return allProducts;
}

async function fetchAllClothing() {
  const allProducts = await fetchAllProducts();
  
  const categorizedClothing = {
    shoes: [],
    tshirts: [],
    pants: [],
    jackets: [],
    hats: [],
    gloves: [],
    sunglasses: [],
    other: []
  };
  
  for (const product of allProducts) {
    const category = getCategoryType(product);
    if (category && categorizedClothing[category]) {
      categorizedClothing[category].push(product);
    }
  }
  
  console.log('\nCategorized clothing:');
  for (const [category, items] of Object.entries(categorizedClothing)) {
    console.log(`  - ${category}: ${items.length}`);
  }
  
  return categorizedClothing;
}

function getCategoryType(filstarProduct) {
  if (!filstarProduct.categories || filstarProduct.categories.length === 0) {
    return null;
  }
  
  const hasClothingParent = filstarProduct.categories.some(c => 
    c.parent_id?.toString() === CLOTHING_PARENT_ID
  );
  
  if (!hasClothingParent) {
    return null;
  }
  
  for (const cat of filstarProduct.categories) {
    const catId = cat.id?.toString();
    
    if (FILSTAR_CLOTHING_CATEGORY_IDS.shoes.includes(catId)) {
      return 'shoes';
    }
    if (FILSTAR_CLOTHING_CATEGORY_IDS.tshirts.includes(catId)) {
      return 'tshirts';
    }
    if (FILSTAR_CLOTHING_CATEGORY_IDS.pants.includes(catId)) {
      return 'pants';
    }
    if (FILSTAR_CLOTHING_CATEGORY_IDS.jackets.includes(catId)) {
      return 'jackets';
    }
    if (FILSTAR_CLOTHING_CATEGORY_IDS.hats.includes(catId)) {
      return 'hats';
    }
    if (FILSTAR_CLOTHING_CATEGORY_IDS.gloves.includes(catId)) {
      return 'gloves';
    }
    if (FILSTAR_CLOTHING_CATEGORY_IDS.sunglasses.includes(catId)) {
      return 'sunglasses';
    }
    if (FILSTAR_CLOTHING_CATEGORY_IDS.other.includes(catId)) {
      return 'other';
    }
  }
  
  return null;
}

async function findShopifyProductBySku(sku) {
  const query = `
    query findProductBySku($query: String!) {
      products(first: 1, query: $query) {
        edges {
          node {
            id
            title
            variants(first: 100) {
              edges {
                node {
                  id
                  sku
                  inventoryQuantity
                  price
                }
              }
            }
            images(first: 250) {
              edges {
                node {
                  id
                  src
                }
              }
            }
          }
        }
      }
    }
  `;
  
  const response = await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: {
      'X-Shopify-Access-Token': ACCESS_TOKEN,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      query,
      variables: { query: `sku:${sku}` }
    })
  });
  
  if (!response.ok) {
    return null;
  }
  
  const result = await response.json();
  
  if (result.data?.products?.edges?.length > 0) {
    const product = result.data.products.edges[0].node;
    return {
      id: product.id.split('/').pop(),
      gid: product.id,
      title: product.title,
      variants: product.variants.edges.map(e => e.node),
      images: product.images.edges.map(e => e.node)
    };
  }
  
  return null;
}

// Image функции
async function uploadProductImage(productId, imageUrl, existingImages) {
  if (imageExists(existingImages, imageUrl)) {
    console.log(`  ⏭️  Skipping duplicate: ${getImageFilename(imageUrl)}`);
    return null;
  }
  
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
  
  if (response.ok) {
    const result = await response.json();
    console.log(`  ✓ Uploaded: ${getImageFilename(imageUrl)}`);
    return result.image;
  } else {
    const error = await response.text();
    console.error(`  ✗ Failed to upload ${getImageFilename(imageUrl)}:`, error);
    return null;
  }
}

async function addProductImages(productId, filstarProduct, existingImages = []) {
  console.log(`Adding images to product ${productId}...`);
  let uploadedCount = 0;
  
  const sortedImages = sortImagesBySku(filstarProduct.images || []);
  console.log(` 🔄 Images sorted by SKU for upload`);
  
  const imagesToUpload = [];
  
  if (filstarProduct.image) {
    const imageUrl = filstarProduct.image.startsWith('http') 
      ? filstarProduct.image 
      : `${FILSTAR_BASE_URL}/${filstarProduct.image}`;
    imagesToUpload.push({ src: imageUrl, type: 'main' });
    console.log(` 🎯 Main image: ${getImageFilename(imageUrl)}`);
  }
  
  if (sortedImages && Array.isArray(sortedImages)) {
    for (const img of sortedImages) {
      const imageUrl = img.startsWith('http') ? img : `${FILSTAR_BASE_URL}/${img}`;
      imagesToUpload.push({ src: imageUrl, type: 'additional' });
      console.log(` 📸 Additional: ${getImageFilename(imageUrl)}`);
    }
  }
  
  if (filstarProduct.variants) {
    for (const variant of filstarProduct.variants) {
      if (variant.image) {
        const imageUrl = variant.image.startsWith('http') 
          ? variant.image 
          : `${FILSTAR_BASE_URL}/${variant.image}`;
        imagesToUpload.push({ src: imageUrl, type: 'variant' });
        console.log(` 🎨 Variant: ${getImageFilename(imageUrl)}`);
      }
    }
  }
  
  if (imagesToUpload.length === 0) {
    console.log(` ℹ️ No images found`);
    return 0;
  }
  
  const newImages = imagesToUpload.filter(img => {
    const exists = imageExists(existingImages, img.src);
    if (exists) {
      console.log(` ⏭️  Skipping duplicate: ${getImageFilename(img.src)}`);
    }
    return !exists;
  });
  
  console.log(` 📊 Total: ${imagesToUpload.length} images, ${newImages.length} new, ${imagesToUpload.length - newImages.length} duplicates skipped`);
  
  if (newImages.length === 0) {
    console.log(` ✅ All images already exist, skipping upload`);
    return 0;
  }
  
  for (let i = 0; i < newImages.length; i++) {
    const imageData = newImages[i];
    
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
            src: imageData.src,
            position: i + 1
          } 
        })
      }
    );
    
    if (response.ok) {
      console.log(`  ✓ Position ${i + 1}: ${getImageFilename(imageData.src)}`);
      uploadedCount++;
    } else {
      const error = await response.text();
      console.error(`  ✗ Failed:`, error);
    }
    
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  return uploadedCount;
}

async function reorderProductImages(productId, filstarProduct, existingImages) {
  if (!existingImages || existingImages.length === 0) {
    return;
  }
  
  console.log(`  🔄 Reordering images...`);
  
  const sortedFilenames = [];
  
  if (filstarProduct.image) {
    sortedFilenames.push(getImageFilename(filstarProduct.image));
  }
  
  const sortedImages = sortImagesBySku(filstarProduct.images || []);
  for (const img of sortedImages) {
    sortedFilenames.push(getImageFilename(img));
  }
  
  if (filstarProduct.variants) {
    for (const variant of filstarProduct.variants) {
      if (variant.image) {
        sortedFilenames.push(getImageFilename(variant.image));
      }
    }
  }
  
  const reorderedImages = [];
  
  for (const filename of sortedFilenames) {
    const image = existingImages.find(img => getImageFilename(img.src) === filename);
    if (image && !reorderedImages.find(ri => ri.id === image.id)) {
      reorderedImages.push(image);
    }
  }
  
  for (const image of existingImages) {
    if (!reorderedImages.find(ri => ri.id === image.id)) {
      reorderedImages.push(image);
    }
  }
  
  for (let i = 0; i < reorderedImages.length; i++) {
    const image = reorderedImages[i];
    const newPosition = i + 1;
    
    const imageId = image.id.split('/').pop();
    
    await fetch(
      `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/products/${productId}/images/${imageId}.json`,
      {
        method: 'PUT',
        headers: {
          'X-Shopify-Access-Token': ACCESS_TOKEN,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          image: { id: imageId, position: newPosition }
        })
      }
    );
    
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  
  console.log(`    ✅ Reordered ${reorderedImages.length} images`);
}

// Product операции
async function addProductToCollection(productId, category) {
  const collectionId = COLLECTION_MAPPING[category];
  
  if (!collectionId) {
    console.log(`  ⚠️ No collection mapping for category: ${category}`);
    return false;
  }

  try {
    const numericCollectionId = collectionId.split('/').pop();
    
    console.log(`  📂 Adding to collection: ${getCategoryDisplayName(category)}`);

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
            collection_id: numericCollectionId
          }
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`  ❌ Failed to add to collection: ${response.status} - ${errorText}`);
      return false;
    }

    const result = await response.json();
    console.log(`  ✅ Added to collection: ${getCategoryDisplayName(category)}`);
    
    await new Promise(resolve => setTimeout(resolve, 300));
    return true;

  } catch (error) {
    console.error(`  ❌ Error adding to collection:`, error.message);
    return false;
  }
}

async function createShopifyProduct(filstarProduct, category) {
  console.log(`Creating new product: ${filstarProduct.name}`);
  
  const uniqueVariants = ensureUniqueVariantNames(filstarProduct.variants || [], category);
  
  const variants = uniqueVariants.map(variant => ({
    sku: variant.sku,
    price: variant.price || '0.00',
    inventory_quantity: variant.quantity || 0,
    inventory_management: 'shopify',
    title: variant.displayName
  }));
  
  const productData = {
    product: {
      title: filstarProduct.name,
      body_html: filstarProduct.description || '',
      vendor: filstarProduct.brand || 'FilStar',
      product_type: 'Облекло',
      variants: variants
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
    console.error(`Failed to create product:`, error);
    return null;
  }
  
  const result = await response.json();
  const productId = result.product.id;
  
  console.log(`  ✓ Created product ID: ${productId}`);
  
  await addProductToCollection(productId, category);
  
  const imagesUploaded = await addProductImages(productId, filstarProduct, []);
  
  stats[category].created++;
  stats[category].images += imagesUploaded;
  
  await new Promise(resolve => setTimeout(resolve, 500));
  
  return productId;
}

async function updateProduct(shopifyProduct, filstarProduct, categoryType) {
  console.log(`Updating product: ${filstarProduct.name}`);
  
  const productId = shopifyProduct.id;
  const existingVariants = shopifyProduct.variants || [];
  const existingImages = shopifyProduct.images || [];
  
  const uniqueVariants = ensureUniqueVariantNames(filstarProduct.variants || [], categoryType);
  
  for (const filstarVariant of uniqueVariants) {
    const existingVariant = existingVariants.find(v => v.sku === filstarVariant.sku);
    
    if (existingVariant) {
      const variantId = existingVariant.id.split('/').pop();
      
      await fetch(
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
              price: filstarVariant.price || '0.00',
              inventory_quantity: filstarVariant.quantity || 0,
              title: filstarVariant.displayName
            }
          })
        }
      );
      
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }
  
  const imagesUploaded = await addProductImages(productId, filstarProduct, existingImages);
  
  const allImages = [...existingImages];
  if (imagesUploaded > 0) {
    const updatedProduct = await findShopifyProductBySku(filstarProduct.variants[0]?.sku);
    if (updatedProduct) {
      allImages.push(...updatedProduct.images);
    }
  }
  
  await reorderProductImages(productId, filstarProduct, allImages);
  
  stats[categoryType].updated++;
  stats[categoryType].images += imagesUploaded;
  
  console.log(`  ✓ Updated product`);
}

async function processProduct(filstarProduct, categoryType) {
  console.log(`\n📦 Processing: ${filstarProduct.name}`);
  
  if (!filstarProduct.variants || filstarProduct.variants.length === 0) {
    console.log(`  ⚠️ No variants, skipping`);
    return;
  }
  
  const firstSku = filstarProduct.variants[0].sku;
  const shopifyProduct = await findShopifyProductBySku(firstSku);
  
  if (shopifyProduct) {
    console.log(`  ✓ Found existing product (ID: ${shopifyProduct.id})`);
    await updateProduct(shopifyProduct, filstarProduct, categoryType);
  } else {
    console.log(`  ✨ Creating new product`);
    await createShopifyProduct(filstarProduct, categoryType);
  }
}

function printFinalStats() {
  console.log('\n' + '='.repeat(70));
  console.log('📊 IMPORT SUMMARY');
  console.log('='.repeat(70));
  
  for (const [category, stat] of Object.entries(stats)) {
    if (stat.created > 0 || stat.updated > 0) {
      console.log(`${getCategoryDisplayName(category)}:`);
      console.log(`  ✨ Created: ${stat.created} products`);
      console.log(`  🔄 Updated: ${stat.updated} products`);
      console.log(`  🖼️  Images: ${stat.images} uploaded`);
    }
  }
  
  const totalCreated = Object.values(stats).reduce((sum, s) => sum + s.created, 0);
  const totalUpdated = Object.values(stats).reduce((sum, s) => sum + s.updated, 0);
  const totalImages = Object.values(stats).reduce((sum, s) => sum + s.images, 0);
  
  console.log('-'.repeat(70));
  console.log(`TOTAL: ${totalCreated} created | ${totalUpdated} updated | ${totalImages} images`);
  console.log('='.repeat(70));
  console.log('✅ Import completed!');
}

async function main() {
  console.log('Starting clothing import...\n');
  
  const categorizedClothing = await fetchAllClothing();
  
  const allClothing = [
    ...categorizedClothing.shoes,
    ...categorizedClothing.tshirts,
    ...categorizedClothing.pants,
    ...categorizedClothing.jackets,
    ...categorizedClothing.hats,
    ...categorizedClothing.gloves,
    ...categorizedClothing.sunglasses,
    ...categorizedClothing.other
  ];
  
  console.log(`\n📊 Processing ${allClothing.length} clothing items total\n`);
  
  for (const item of allClothing) {
    const categoryType = getCategoryType(item);
    if (categoryType) {
      await processProduct(item, categoryType);
    }
  }
  
  printFinalStats();
}

main();
