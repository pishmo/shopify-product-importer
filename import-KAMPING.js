// import-kamping.js - ПЪЛНОЕ КОПИЕ НА СТРУКТУРАТА ОТ BAIT (1100+ реда)
const fetch = require('node-fetch');
const sharp = require('sharp');
const fs = require('fs').promises;
const path = require('path');

const SHOPIFY_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const FILSTAR_TOKEN = process.env.FILSTAR_API_TOKEN;
const API_VERSION = '2025-01';
const FILSTAR_API_BASE = 'https://filstar.com/api';
const FILSTAR_BASE_URL = 'https://filstar.com';
const LOCATION_ID = 'gid://shopify/Location/109713850750';

// Shopify колекции за Къмпинг
const COLLECTION_MAPPING = {
  chairs: 'gid://shopify/Collection/739410837886', // Смени тези ID-та с твоите смарт колекции
  tents: 'gid://shopify/Collection/739410837886',
  beds: 'gid://shopify/Collection/739410837886',
  sleeping_bags: 'gid://shopify/Collection/739410837886',
  tables: 'gid://shopify/Collection/739410837886',
  other: 'gid://shopify/Collection/739410837886'
};

// Filstar категории за Къмпинг
const FILSTAR_CAMPING_CATEGORY_IDS = {
  chairs: ['63'], // Столове
  tents: ['63'],  // Палатки
  beds: ['63'],   // Легла
  sleeping_bags: ['63'],
  tables: ['63'],
  other: ['63']
};

// Ключови думи за тагове
const SUBCAT2_KEYWORDS = [
  { keyword: 'стол', tag: 'subcat2:стол' },
  { keyword: 'chair', tag: 'subcat2:стол' },
  { keyword: 'легло', tag: 'subcat2:легло' },
  { keyword: 'bed', tag: 'subcat2:легло' },
  { keyword: 'палат', tag: 'subcat2:палатка' },
  { keyword: 'tent', tag: 'subcat2:палатка' },
  { keyword: 'заслон', tag: 'subcat2:палатка' },
  { keyword: 'тента', tag: 'subcat2:палатка' },
  { keyword: 'чувал', tag: 'subcat2:чувал' },
  { keyword: 'bag', tag: 'subcat2:чувал' },
  { keyword: 'възглавница', tag: 'subcat2:чувал' },
  { keyword: 'чадър', tag: 'subcat2:чадър' },
  { keyword: 'umbrella', tag: 'subcat2:чадър' },
  { keyword: 'маса', tag: 'subcat2:маса' },
  { keyword: 'table', tag: 'subcat2:маса' }
];

const CAMPING_PARENT_ID = '11';

const stats = {
  chairs: { created: 0, updated: 0, images: 0 },
  tents: { created: 0, updated: 0, images: 0 },
  beds: { created: 0, updated: 0, images: 0 },
  sleeping_bags: { created: 0, updated: 0, images: 0 },
  tables: { created: 0, updated: 0, images: 0 },
  other: { created: 0, updated: 0, images: 0 }
};

// Функция за тагове
function generateCampingTags(filstarProduct) {
  let tags = ['Filstar', 'kamping', filstarProduct.manufacturer || 'Unknown'];
  const nameLower = filstarProduct.name.toLowerCase();
  let subcatFound = false;

  SUBCAT2_KEYWORDS.forEach(item => {
    if (nameLower.includes(item.keyword)) {
      if (!tags.includes(item.tag)) {
        tags.push(item.tag);
        subcatFound = true;
      }
    }
  });

  if (!subcatFound) {
    tags.push('subcat2:къмпинг');
  }
  return tags;
}

// 2 част - Помощни функции (ИДЕНТИЧНИ)

async function deleteShopifyProduct(productId) {
  const numericId = productId.replace('gid://shopify/Product/', '');
  const response = await fetch(
    `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/products/${numericId}.json`,
    {
      method: 'DELETE',
      headers: {
        'X-Shopify-Access-Token': ACCESS_TOKEN
      }
    }
  );
  if (!response.ok) {
    throw new Error(`Failed to delete product: ${response.status}`);
  }
  console.log(` ✅ Product deleted`);
}

function normalizeFilename(filename) {
  let clean = getImageFilename(filename);
  clean = clean.replace(/\.jpeg$/i, '.jpg');
  return clean;
}

function getImageFilename(src) {
  if (!src || typeof src !== 'string') return null;
  const urlParts = src.split('/').pop();
  const withoutQuery = urlParts.split('?')[0];
  const uuidPattern = /_[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}(\.[a-z]+)?$/i;
  let cleanFilename = withoutQuery.replace(uuidPattern, '$1');
  const parts = cleanFilename.split('_');
  const cleanParts = parts.filter(part => {
    const partWithoutExt = part.split('.')[0];
    const isHex = partWithoutExt.length >= 32 && /^[a-f0-9]+$/i.test(partWithoutExt);
    return !isHex;
  });
  const extension = cleanFilename.split('.').pop();
  cleanFilename = cleanParts.join('_') + '.' + extension;
  cleanFilename = cleanFilename.replace(/^_+/, '');
  return cleanFilename;
}

function imageExists(existingImages, newImageUrl) {
  if (!existingImages || !Array.isArray(existingImages) || existingImages.length === 0) return false;
  const newFilename = getImageFilename(newImageUrl);
  if (!newFilename) return false;
  const newBase = newFilename.split('.')[0];
  return existingImages.some(img => {
    const imgSrc = img.src || img.url || img;
    const existingFilename = getImageFilename(imgSrc);
    const existingBase = existingFilename ? existingFilename.split('.')[0] : null;
    return existingBase && existingBase === newBase;
  });
}

function extractSkuFromImageFilename(filename) {
  if (!filename || typeof filename !== 'string') return '999999';
  const match = filename.match(/^(\d+)/);
  if (match && match[1]) return match[1];
  const altMatch = filename.match(/[-_](\d{6,})/);
  if (altMatch && altMatch[1]) return altMatch[1];
  return '999999';
}

async function normalizeImage(imageUrl, sku) {
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) throw new Error(`Failed to fetch image: ${response.status}`);
    const buffer = await response.buffer();
    const tempDir = path.join(__dirname, 'temp');
    try {
      await fs.access(tempDir);
    } catch {
      await fs.mkdir(tempDir, { recursive: true });
    }
    const filename = `${sku}_${Date.now()}.jpg`;
    const outputPath = path.join(tempDir, filename);
    await sharp(buffer)
      .resize(1200, 1000, {
        fit: 'contain',
        background: { r: 255, g: 255, b: 255, alpha: 1 }
      })
      .jpeg({ quality: 90 })
      .toFile(outputPath);
    const normalizedBuffer = await fs.readFile(outputPath);
    await fs.unlink(outputPath);
    return normalizedBuffer;
  } catch (error) {
    console.error(`  ❌ Error normalizing image: ${error.message}`);
    return null;
  }
}

async function uploadImageToShopify(imageBuffer, filename) {
  try {
    const stagedUploadMutation = `
      mutation {
        stagedUploadsCreate(input: [{
          resource: IMAGE,
          filename: \"${filename}\",
          mimeType: \"image/jpeg\",
          httpMethod: POST
        }]) {
          stagedTargets {
            url
            resourceUrl
            parameters {
              name
              value
            }
          }
        }
      }
    `;
    const stagedResponse = await fetch(
      `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/graphql.json`,
      {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': ACCESS_TOKEN,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query: stagedUploadMutation })
      }
    );
    const stagedData = await stagedResponse.json();
    const stagedTarget = stagedData.data.stagedUploadsCreate.stagedTargets[0];
    const formData = new (require('form-data'))();
    stagedTarget.parameters.forEach(param => {
      formData.append(param.name, param.value);
    });
    formData.append('file', imageBuffer, { filename });
    await fetch(stagedTarget.url, {
      method: 'POST',
      body: formData
    });
    return stagedTarget.resourceUrl;
  } catch (error) {
    console.error(`  ❌ Error uploading image: ${error.message}`);
    return null;
  }
}

async function scrapeOgImage(productSlug) {
  if (!productSlug) return null;
  try {
    const url = `${FILSTAR_BASE_URL}/${productSlug}`;
    const response = await fetch(url);
    if (!response.ok) return null;
    const html = await response.text();
    const bgMatch = html.match(/background-image:\s*url\(['"&quot;]*([^'"&)]+)['"&quot;]*\)/);
    if (bgMatch && bgMatch[1]) {
      console.log(`    ✅ Found main image: ${bgMatch[1]}`);
      return bgMatch[1];
    }
    console.log('    ⚠️  Main image not found');
    return null;
  } catch (error) {
    console.error(`    ❌ Error: ${error.message}`);
    return null;
  }
}

function formatVariantName(variant, productName) { 
  const parts = [];  
  function formatAttributeName(name) { 
    let formatted = name.charAt(0).toUpperCase() + name.slice(1).toLowerCase(); 
    if (formatted.includes(',')) {
      if (!formatted.endsWith('.')) {
        formatted = formatted + '. ';
      }
    } 
    return formatted;
  } 
  let model = variant.model; 
  if (!model) { 
    const artikulAttr = variant.attributes?.find(attr => 
      attr.attribute_name.toUpperCase() === 'АРТИКУЛ' 
    ); 
    if (artikulAttr) {
      model = artikulAttr.value;
    } 
  } 
  if (model && model !== productName) {
    parts.push(model);
  } 
  const artikulAttr = variant.attributes?.find(attr => 
    attr.attribute_name.toUpperCase() === 'АРТИКУЛ' 
  ); 
  if (artikulAttr && artikulAttr.value && artikulAttr.value !== model) {
    parts.push(artikulAttr.value);
  } 
  const sizeAttr = variant.attributes?.find(attr => 
    attr.attribute_name.toUpperCase() === 'РАЗМЕР' 
  ); 
  if (sizeAttr && sizeAttr.value) {
    parts.push(`${formatAttributeName(sizeAttr.attribute_name)} : ${sizeAttr.value}`); 
  } 
  if (variant.attributes && variant.attributes.length > 0) { 
    const otherAttrs = variant.attributes 
      .filter(attr => { 
        const name = attr.attribute_name.toUpperCase(); 
        return name !== 'АРТИКУЛ' && name !== 'РАЗМЕР' && attr.value; 
      }) 
      .map(attr => `${formatAttributeName(attr.attribute_name)}: ${attr.value}`); 
    parts.push(...otherAttrs); 
  } 
  const result = parts.join(' / '); 
  if (result && result.trim() !== '') {
    return result;
  }
  return '';
}

function getCategoryType(product) {
  if (!product.categories || product.categories.length === 0) return null;
  for (const category of product.categories) {
    const categoryId = category.id?.toString();
    for (const [type, ids] of Object.entries(FILSTAR_CAMPING_CATEGORY_IDS)) {
      if (ids.includes(categoryId)) return type;
    }
  }
  return null;
}

function getCategoryName(categoryType) {
  const names = {
    chairs: 'Столове',
    tents: 'Палатки',
    beds: 'Легла',
    sleeping_bags: 'Спални чували',
    tables: 'Маси',
    other: 'Други къмпинг'
  };
  return names[categoryType] || 'Къмпинг';
}

// 3 част - API Функции

async function fetchAllProducts() {
  console.log('📦 Fetching all products from Filstar API with pagination...\n');
  let allProducts = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    console.log(`Fetching page ${page}...`);
    try {
      const response = await fetch(
        `${FILSTAR_API_BASE}/products?page=${page}&limit=1000`,
        {
          headers: {
            'Authorization': `Bearer ${FILSTAR_TOKEN}`,
            'Content-Type': 'application/json'
          }
        }
      );
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      if (data && data.length > 0) {
        allProducts = allProducts.concat(data);
        console.log(`  ✓ Page ${page}: ${data.length} products`);
        page++;
        hasMore = data.length > 0;
        if (page > 15) hasMore = false;
      } else {
        hasMore = false;
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      console.error(`  ❌ Error fetching page ${page}:`, error.message);
      hasMore = false;
    }
  }
  console.log(`\n✅ Total products fetched: ${allProducts.length}\n`);
  return allProducts;
}

async function findProductBySku(sku) {
  try {
    const query = `
      {
        products(first: 1, query: \"sku:${sku}\") {
          edges {
            node {
              id
              title
              handle
              options { id name }
              images(first: 50) { edges { node { id src } } }
              variants(first: 100) {
                edges {
                  node {
                    id
                    sku
                    inventoryItem { id }
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
    const data = await response.json();
    if (data.data?.products?.edges?.length > 0) return data.data.products.edges[0].node;
    return null;
  } catch (error) {
    console.error(`  ❌ Error finding product by SKU: ${error.message}`);
    return null;
  }
}

async function addProductToCollection(productId, categoryType) {
  const collectionId = COLLECTION_MAPPING[categoryType];
  if (!collectionId) return;
  try {
    const mutation = `
      mutation {
        collectionAddProducts(
          id: \"${collectionId}\",
          productIds: [\"${productId}\"]
        ) {
          collection { id }
          userErrors { field message }
        }
      }
    `;
    const response = await fetch(
      `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/graphql.json`,
      {
        method: 'POST',
        headers: { 'X-Shopify-Access-Token': ACCESS_TOKEN, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: mutation })
      }
    );
    const data = await response.json();
    if (data.data?.collectionAddProducts?.userErrors?.length > 0) {
      console.log(`  ⚠️ Collection errors:`, data.data.collectionAddProducts.userErrors);
    }
  } catch (error) {
    console.error(`  ❌ Error adding to collection: ${error.message}`);
  }
}

async function reorderProductImages(productGid, images) {
  try {
    const productId = productGid.replace('gid://shopify/Product/', '');
    const reorderedImages = images.map((img, index) => {
      const imageId = img.node?.id || img.id;
      const numericId = imageId.replace('gid://shopify/ProductImage/', '');
      return { id: numericId, position: index + 1 };
    });
    const response = await fetch(
      `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/products/${productId}.json`,
      {
        method: 'PUT',
        headers: {
          'X-Shopify-Access-Token': ACCESS_TOKEN,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          product: { id: productId, images: reorderedImages }
        })
      }
    );
    if (!response.ok) return false;
    console.log(`    ✅ Reordered ${images.length} images`);
    return true;
  } catch (error) {
    console.error(`  ❌ Error reordering images: ${error.message}`);
    return false;
  }
}

// 4 част - CREATE / UPDATE

async function createShopifyProduct(filstarProduct, categoryType) {
  try {
    console.log(`\n📦 Creating: ${filstarProduct.name}`);
    const vendor = filstarProduct.manufacturer || 'Unknown';
    const productType = getCategoryName(categoryType);
    const categoryNames = filstarProduct.categories?.map(c => c.name) || [];
    
    const needsOptions = filstarProduct.variants.length > 1 || 
      (filstarProduct.variants.length === 1 && formatVariantName(filstarProduct.variants[0], filstarProduct.name));
    
    const variants = filstarProduct.variants.map(variant => {
      const variantName = formatVariantName(variant, filstarProduct.name);
      const variantData = {
        price: variant.price?.toString() || '0',
        sku: variant.sku,
        barcode: variant.barcode || variant.sku,
        inventory_quantity: parseInt(variant.quantity) || 0,
        inventory_management: 'shopify'
      };
      if (needsOptions) variantData.option1 = variantName || variant.sku;
      return variantData;
    });

    const productData = {
      product: {
        title: filstarProduct.name,
        body_html: filstarProduct.description || filstarProduct.short_description || '',
        vendor: vendor,
        product_type: productType,
        tags: generateCampingTags(filstarProduct),
        status: 'active',
        variants: variants
      }
    };
    if (needsOptions) productData.product.options = [{ name: 'Вариант' }];

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
      const errorText = await response.text();
      console.log(`  ❌ Failed to create: ${response.status} - ${errorText}`);
      return null;
    }
    
    const result = await response.json();
    const productGid = `gid://shopify/Product/${result.product.id}`;
    console.log(`  ✅ Created product: ${productGid}`);
    stats[categoryType].created++;
    await addProductToCollection(productGid, categoryType);

    // IMAGES (1:1 Logic)
    const imageMapping = new Map();
    if (filstarProduct.images && filstarProduct.images.length > 0) {
      console.log(`  🖼️ Uploading ${filstarProduct.images.length} images...`);
      for (const imageUrl of filstarProduct.images) {
        const fullImageUrl = imageUrl.startsWith('http') ? imageUrl : `${FILSTAR_BASE_URL}/${imageUrl}`;
        const normalizedBuffer = await normalizeImage(fullImageUrl, filstarProduct.variants[0].sku);
        if (normalizedBuffer) {
          const resourceUrl = await uploadImageToShopify(normalizedBuffer, imageUrl.split('/').pop());
          if (resourceUrl) {
            const attachMutation = `
              mutation {
                productCreateMedia(productId: \"${productGid}\", media: [{ originalSource: \"${resourceUrl}\", mediaContentType: IMAGE }]) {
                  media { ... on MediaImage { id image { url } } }
                }
              }
            `;
            const attachRes = await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/graphql.json`, {
              method: 'POST',
              headers: { 'X-Shopify-Access-Token': ACCESS_TOKEN, 'Content-Type': 'application/json' },
              body: JSON.stringify({ query: attachMutation })
            });
            const attachData = await attachRes.json();
            if (attachData.data?.productCreateMedia?.media?.[0]) {
              const shopifyImageId = attachData.data.productCreateMedia.media[0].id;
              imageMapping.set(getImageFilename(fullImageUrl), shopifyImageId);
              console.log(`    ✓ Uploaded: ${imageUrl.split('/').pop()}`);
            }
          }
        }
      }
    }
    stats[categoryType].images += imageMapping.size;
    return productGid;
  } catch (error) {
    console.error(`  ❌ Error creating product: ${error.message}`);
    return null;
  }
}

async function updateShopifyProduct(shopifyProduct, filstarProduct, categoryType) {
  console.log(`🔄 Updating: ${filstarProduct.name}`);
  const shopifyVariantsCount = shopifyProduct.variants?.edges?.length || 0;
  const filstarVariantsCount = filstarProduct.variants?.length || 0;
  
  if (shopifyVariantsCount !== filstarVariantsCount) {
    console.log(`  ⚠️ VARIANTS MISMATCH! Recreating product...`);
    await deleteShopifyProduct(shopifyProduct.id);
    await createShopifyProduct(filstarProduct, categoryType);
    return;
  }
  
  try {
    const productGid = shopifyProduct.id;
    const updateMutation = `
      mutation productUpdate($input: ProductInput!) {
        productUpdate(input: $input) {
          product { id }
          userErrors { field message }
        }
      }
    `;
    const productInput = {
      id: productGid,
      title: filstarProduct.name,
      descriptionHtml: filstarProduct.description || '',
      tags: generateCampingTags(filstarProduct),
      status: 'ACTIVE'
    };
    const updateResponse = await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/graphql.json`, {
      method: 'POST',
      headers: { 'X-Shopify-Access-Token': ACCESS_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: updateMutation, variables: { input: productInput } })
    });

    const shopifyVariants = shopifyProduct.variants.edges.map(e => ({
      id: e.node.id,
      sku: e.node.sku,
      inventoryItemId: e.node.inventoryItem?.id.replace('gid://shopify/InventoryItem/', '')
    }));

    for (let i = 0; i < filstarProduct.variants.length; i++) {
      const fv = filstarProduct.variants[i];
      const sv = shopifyVariants[i];
      const variantId = sv.id.replace('gid://shopify/ProductVariant/', '');
      
      await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/variants/${variantId}.json`, {
        method: 'PUT',
        headers: { 'X-Shopify-Access-Token': ACCESS_TOKEN, 'Content-Type': 'application/json' },
        body: JSON.stringify({ variant: { id: variantId, price: String(fv.price) } })
      });

      if (sv.inventoryItemId) {
        await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/inventory_levels/set.json`, {
          method: 'POST',
          headers: { 'X-Shopify-Access-Token': ACCESS_TOKEN, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            location_id: LOCATION_ID.replace('gid://shopify/Location/', ''),
            inventory_item_id: sv.inventoryItemId,
            available: parseInt(fv.quantity) || 0
          })
        });
      }
    }
    stats[categoryType].updated++;
    console.log(` ✅ Updated product and variants`);
  } catch (error) {
    console.error(`❌ Error updating product: ${error.message}`);
  }
}

// 5 част - MAIN

async function main() {
  console.log('🚀 Starting Filstar KAMPING Import\n');
  try {
    const allProducts = await fetchAllProducts();
    let accessoryProducts = allProducts.filter(product => getCategoryType(product) !== null);

    console.log(`🎯 Found ${accessoryProducts.length} products to process\n`);
    
    const productsByCategory = {
      chairs: [], tents: [], beds: [], sleeping_bags: [], tables: [], other: []
    };
    
    accessoryProducts.forEach(product => {
      const categoryType = getCategoryType(product);
      if (categoryType) productsByCategory[categoryType].push(product);
    });

    for (const [categoryType, products] of Object.entries(productsByCategory)) {
      if (products.length === 0) continue;
      console.log(`\n${'='.repeat(60)}`);
      console.log(`📂 Processing category: ${getCategoryName(categoryType)}`);
      console.log(`${'='.repeat(60)}\n`);
      
      for (let i = 0; i < products.length; i++) {
        const product = products[i];
        console.log(`\n[${i+1}/${products.length}] Processing: ${product.name}`);
        if (!product.variants || product.variants.length === 0) continue;
        const existing = await findProductBySku(product.variants[0].sku);
        if (existing) {
          await updateShopifyProduct(existing, product, categoryType);
        } else {
          await createShopifyProduct(product, categoryType);
        }
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log('📊 FINAL STATISTICS');
    console.log(`${'='.repeat(60)}\n`);
    Object.entries(stats).forEach(([cat, data]) => {
      console.log(`${getCategoryName(cat)}: Created: ${data.created}, Updated: ${data.updated}, Images: ${data.images}`);
    });
    console.log('\n✅ Import completed successfully!');
  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

main();
