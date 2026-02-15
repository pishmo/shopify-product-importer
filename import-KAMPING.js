// import-fishing-BOX.js - Импорт на Къмпинг от Filstar API
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

// Filstar category IDs - само Къмпинг
const FILSTAR_ACCESSORIES_CATEGORY_IDS = {
    kamping: ['63']
};

// Shopify collection IDs - тук беше грешката с кавичката
const COLLECTION_MAPPING = {
    kamping: 'gid://shopify/Collection/739661414782'
};

// Статистика
const stats = {
    kamping: { created: 0, updated: 0, images: 0, errors: 0 }
};
// 2 част


// Изтриване на продукт
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

// нормализиране на името на снимките
function normalizeFilename(filename) {
  // Премахни hash и Shopify UUID
  let clean = getImageFilename(filename);
  // Нормализирай .jpeg → .jpg
  clean = clean.replace(/\.jpeg$/i, '.jpg');
  return clean;
}





// ===================================


// Функция за извличане на чист filename от URL
function getImageFilename(src) {
  if (!src || typeof src !== 'string') return null;
  
  // 1. Вземаме само името на файла от края на URL-а (напр. cbc138-fox-eos-bed-jpg_hash.jpeg)
  const filename = src.split('/').pop().split('?')[0];
  
  // 2. Махаме Shopify UUID-тата (_a1b2c3d4...)
  const uuidPattern = /_[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i;
  let clean = filename.replace(uuidPattern, '');
  
  // 3. Махаме Filstar хешовете (само ако са точно 32+ символа хекс)
  const parts = clean.split('_');
  const cleanParts = parts.filter(part => {
    const p = part.split('.')[0];
    const isHexHash = p.length >= 32 && /^[a-f0-9]+$/i.test(p);
    return !isHexHash;
  });
  
  // 4. Сглобяваме обратно. Запазва оригиналното разширение (.jpeg или .jpg)
  return cleanParts.join('_').replace(/^_+/, '');
}
//  ==========================================




function imageExists(existingImages, newImageUrl) {
  if (!existingImages || !Array.isArray(existingImages) || existingImages.length === 0) {
    return false;
  }
  
  const newFilename = getImageFilename(newImageUrl);
  if (!newFilename) {
    return false;
  }
  
  const newBase = newFilename.split('.')[0];
  
  return existingImages.some(img => {
    const imgSrc = img.src || img.url || img;
    const existingFilename = getImageFilename(imgSrc);
    const existingBase = existingFilename ? existingFilename.split('.')[0] : null;
    return existingBase && existingBase === newBase;
  });
}




// Функция за извличане на SKU от filename
function extractSkuFromImageFilename(filename) {
  if (!filename || typeof filename !== 'string') return '999999';
  
  const match = filename.match(/^(\d+)/);
  if (match && match[1]) return match[1];
  
  const altMatch = filename.match(/[-_](\d{6,})/);
  if (altMatch && altMatch[1]) return altMatch[1];
  
  return '999999';
}



// Функция за нормализация на изображения
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

// Функция за качване на изображение в Shopify
async function uploadImageToShopify(imageBuffer, filename) {
  try {
    const base64Image = imageBuffer.toString('base64');
    
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
  if (!productSlug) {
    return null;
  }
  
  try {
    const url = `${FILSTAR_BASE_URL}/${productSlug}`;
    const response = await fetch(url);
    if (!response.ok) {
      return null;
    }
    
    const html = await response.text();
    
    // Търси background-image URL в img_product елемента
    const bgMatch = html.match(/background-image:\s*url\(['"&quot;]*([^'"&)]+)['"&quot;]*\)/);
    
    if (bgMatch && bgMatch[1]) {
      console.log(`   ✅ Found main image: ${bgMatch[1]}`);
      return bgMatch[1];
    }
    
    console.log('   ⚠️  Main image not found');
    return null;
  } catch (error) {
    console.error(`   ❌ Error: ${error.message}`);
    return null;
  }
}

// FORMAT NAME

// Глобална променлива за кеширане на категории

let cachedCategoryNames = [];
function formatVariantName(variant, productName) { 
  const parts = [];  
  
  // Помощна функция за форматиране на име на атрибут 
  function formatAttributeName(name) { 
	  
    let formatted = name.charAt(0).toUpperCase() + name.slice(1).toLowerCase(); 
    if (formatted.includes(',')) { 
      if (!formatted.endsWith('.')) { 
        formatted = formatted + '. '; 
      } 
    } 
    return formatted;
  } 
  
  // 1. MODEL (ПЪРВИ - от variant.model или атрибут "АРТИКУЛ")
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
  
  // 2. АРТИКУЛ (само ако е различен от model)
  const artikulAttr = variant.attributes?.find(attr => 
    attr.attribute_name.toUpperCase() === 'АРТИКУЛ' 
  ); 
  if (artikulAttr && artikulAttr.value && artikulAttr.value !== model) { 
    parts.push(artikulAttr.value); 
  } 
  
  // 3. РАЗМЕР 
  const sizeAttr = variant.attributes?.find(attr => 
    attr.attribute_name.toUpperCase() === 'РАЗМЕР' 
  ); 
  if (sizeAttr && sizeAttr.value) { 
    parts.push(`${formatAttributeName(sizeAttr.attribute_name)} : ${sizeAttr.value}`); 
  } 
  
  // 4. ОСТАНАЛИТЕ АТРИБУТИ (без Артикул и Размер) 
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
  
  // Ако има форматиран резултат - върни го
  if (result && result.trim() !== '') {
    return result;
  }
  
  // Ако НЯМА нищо - върни празен стринг
  return '';

}



// Функция за определяне на типа на категорията
function getCategoryType(product) {
  if (!product.categories || product.categories.length === 0) {
    return null;
  }
  
  for (const category of product.categories) {
    const categoryId = category.id?.toString();
    
    for (const [type, ids] of Object.entries(FILSTAR_ACCESSORIES_CATEGORY_IDS)) {
      if (ids.includes(categoryId)) {
        return type;
      }
    }
  }
  
  return null;
}


// Функция за получаване на име на категория
function getCategoryName(categoryType) {
  const names = {
     kamping: 'Къмпинг',
   
  };
  
  return names[categoryType] || 'Къмпинг';
}






// 3 та част




// Функция за извличане на всички продукти от Filstar
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

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      if (data && data.length > 0) {
        allProducts = allProducts.concat(data);
        console.log(`  ✓ Page ${page}: ${data.length} products`);
        page++;
        hasMore = data.length > 0;
        
        if (page > 10) {
          console.log('  ⚠️  Safety limit reached (10 pages)');
          hasMore = false;
        }
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

// Функция за намиране на продукт в Shopify по SKU
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
              options {
                id
                name
              }
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
                    sku
                    inventoryItem {
                      id
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

    const data = await response.json();
    
    if (data.data?.products?.edges?.length > 0) {
      return data.data.products.edges[0].node;
    }
    
    return null;
  } catch (error) {
    console.error(`  ❌ Error finding product by SKU: ${error.message}`);
    return null;
  }
}


// Функция за добавяне на продукт в колекция
async function addProductToCollection(productId, categoryType) {
const collectionId = COLLECTION_MAPPING[categoryType];
  
  if (!collectionId) {
    console.log(`  ⚠️  No collection mapping for category: ${categoryType}`);
    return;
  }

  try {
    const mutation = `
      mutation {
        collectionAddProducts(
          id: \"${collectionId}\",
          productIds: [\"${productId}\"]
        ) {
          collection {
            id
          }
          userErrors {
            field
            message
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
        body: JSON.stringify({ query: mutation })
      }
    );

    const data = await response.json();
    
    if (data.data?.collectionAddProducts?.userErrors?.length > 0) {
      console.log(`  ⚠️  Collection errors:`, data.data.collectionAddProducts.userErrors);
    }
  } catch (error) {
    console.error(`  ❌ Error adding to collection: ${error.message}`);
  }
}

// Функция за пренареждане на изображенията
async function reorderProductImages(productGid, images) {
  try {
    const productId = productGid.replace('gid://shopify/Product/', '');
    
    const reorderedImages = images.map((img, index) => {
      const imageId = img.node?.id || img.id;
      const numericId = imageId.replace('gid://shopify/ProductImage/', '');
      
      return {
        id: numericId,
        position: index + 1
      };
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
          product: {
            id: productId,
            images: reorderedImages
          }
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.log(`  🐛 Reorder error: ${response.status} - ${errorText}`);
      return false;
    }
    
    console.log(`    ✅ Reordered ${images.length} images`);
    return true;
  } catch (error) {
    console.error(`  ❌ Error reordering images: ${error.message}`);
    return false;
  }
}




// CREATE =======================================================================================================================


async function createShopifyProduct(filstarProduct, categoryType) {
  try {
    console.log(`\n📦 Creating: ${filstarProduct.name}`);
    
    const vendor = filstarProduct.manufacturer || 'Unknown';
    const productType = getCategoryName(categoryType);
    
    // 1. ПОДГОТОВКА НА ВАРИАНТИ
    const needsOptions = filstarProduct.variants.length > 1 || 
      (filstarProduct.variants.length === 1 && formatVariantName(filstarProduct.variants[0], filstarProduct.name));
    
    const variants = filstarProduct.variants.map(variant => ({
      price: variant.price?.toString() || '0',
      sku: variant.sku,
      barcode: variant.barcode || variant.sku,
      inventory_quantity: parseInt(variant.quantity) || 0,
      inventory_management: 'shopify',
      ...(needsOptions && { option1: formatVariantName(variant, filstarProduct.name) || variant.sku })
    }));

    // 2. СЪЗДАВАНЕ НА ПРОДУКТ (REST API)
    const productData = {
      product: {
        title: filstarProduct.name,
        body_html: filstarProduct.description || '',
        vendor: vendor,
        product_type: productType,
        tags: ['Filstar', categoryType, vendor].join(', '),
        status: 'active',
        variants: variants,
        ...(needsOptions && { options: [{ name: 'Вариант' }] })
      }
    };

    const response = await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/products.json`, {
        method: 'POST',
        headers: { 'X-Shopify-Access-Token': ACCESS_TOKEN, 'Content-Type': 'application/json' },
        body: JSON.stringify(productData)
    });

    if (!response.ok) throw new Error(`Create failed: ${response.status}`);
    const result = await response.json();
    const productGid = `gid://shopify/Product/${result.product.id}`;
    const shopifyVariants = result.product.variants; // Вариантите от Shopify с техните ID-та
    
    console.log(`  ✅ Created product: ${productGid}`);
    stats.kamping.created++;
    
    await addProductToCollection(productGid, categoryType);
    
    // 3. КАЧВАНЕ НА СНИМКИ
    const imageMapping = new Map();
    const localUsedNames = new Set(); 

    if (filstarProduct.images && filstarProduct.images.length > 0) {
      console.log(`  🖼️  Uploading ${filstarProduct.images.length} images...`);
      
      for (let i = 0; i < filstarProduct.images.length; i++) {
        const imageUrl = filstarProduct.images[i];
        let cleanName = getImageFilename(imageUrl); 

        // ГАРАНТИРАНЕ НА УНИКАЛНОСТ (Име-1.jpg вместо -1Име)
        let finalFilename = cleanName;
        let counter = 1;
        while (localUsedNames.has(finalFilename)) {
          const lastDot = cleanName.lastIndexOf('.');
          if (lastDot !== -1) {
            finalFilename = `${cleanName.substring(0, lastDot)}-${counter}${cleanName.substring(lastDot)}`;
          } else {
            finalFilename = `${cleanName}-${counter}`;
          }
          counter++;
        }
        localUsedNames.add(finalFilename);

        const fullImageUrl = imageUrl.startsWith('http') ? imageUrl : `${FILSTAR_BASE_URL}/${imageUrl}`;
        const normalizedBuffer = await normalizeImage(fullImageUrl, filstarProduct.variants[0].sku);
        
        if (normalizedBuffer) {
          const resourceUrl = await uploadImageToShopify(normalizedBuffer, finalFilename);
          if (resourceUrl) {
            const attachMutation = `mutation { productCreateMedia(productId: "${productGid}", media: [{ originalSource: "${resourceUrl}", mediaContentType: IMAGE }]) { media { ... on MediaImage { id } } } }`;
            const attachRes = await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/graphql.json`, {
              method: 'POST',
              headers: { 'X-Shopify-Access-Token': ACCESS_TOKEN, 'Content-Type': 'application/json' },
              body: JSON.stringify({ query: attachMutation })
            });
            const attachData = await attachRes.json();
            const mediaId = attachData.data?.productCreateMedia?.media?.[0]?.id;
            
            if (mediaId) {
              console.log(`    ✓ Uploaded: ${finalFilename}`);
              imageMapping.set(finalFilename, mediaId);
              stats.kamping.images++;
            }
          }
        }
      }
    }

    // 4. СВЪРЗВАНЕ НА СНИМКИ КЪМ ВАРИАНТИТЕ
    console.log(`  🔗 Assigning images to variants...`);
    for (const variant of filstarProduct.variants) {
      const shopifyVar = shopifyVariants.find(sv => sv.sku === variant.sku);
      const varImgUrl = (variant.images && variant.images.length > 0) ? variant.images[0] : null;

      if (shopifyVar && varImgUrl) {
        const cleanVarName = getImageFilename(varImgUrl);
        // Търсим в мапинга по името
        const mediaId = imageMapping.get(cleanVarName); 
        
        if (mediaId) {
          const assignMutation = `mutation { variantUpdate(input: { id: "gid://shopify/ProductVariant/${shopifyVar.id}", mediaId: "${mediaId}" }) { variant { id } } }`;
          await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/graphql.json`, {
            method: 'POST',
            headers: { 'X-Shopify-Access-Token': ACCESS_TOKEN, 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: assignMutation })
          });
          console.log(`    ✅ Assigned ${cleanVarName} to SKU: ${variant.sku}`);
        }
      }
    }

    // 5. REORDER С ДЕТАЙЛЕН ЛОГ
    const ogImageUrl = await scrapeOgImage(filstarProduct.slug);
    const cleanOgName = ogImageUrl ? getImageFilename(ogImageUrl) : null;

    const allImagesQuery = `{ product(id: "${productGid}") { images(first: 50) { edges { node { id src } } } } }`;
    const imgRes = await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/graphql.json`, {
        method: 'POST',
        headers: { 'X-Shopify-Access-Token': ACCESS_TOKEN, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: allImagesQuery })
    });
    const imgData = await imgRes.json();
    const allImages = imgData.data?.product?.images?.edges || [];

    if (allImages.length > 0) {
      console.log(`\n  🔄 REORDER LIST (Total: ${allImages.length}):`);
      
      for (let idx = 0; idx < allImages.length; idx++) {
        const img = allImages[idx];
        const currentName = getImageFilename(img.node.src);
        let label = "Free Image";
        
        if (currentName === cleanOgName) label = "⭐ MAIN (OG)";
        // Проверка за вариант
        for (const variant of filstarProduct.variants) {
          if (variant.images?.[0] && getImageFilename(variant.images[0]) === currentName) {
            label = "📦 Variant Image";
            break;
          }
        }
        console.log(`    ${idx + 1}. [${label}] - ${currentName}`);
      }

      await reorderProductImages(productGid, allImages);
      console.log(`  ✅ Reorder complete.`);
    }
    
    return productGid;
  } catch (error) {
    console.error(`  ❌ Error: ${error.message}`);
    stats.kamping.errors++;
    return null;
  }
}

// =====================================================================







                //    UPDATE PRODUCT

//    UPDATE PRODUCT
async function updateShopifyProduct(shopifyProduct, filstarProduct, categoryType) {
 console.log(`🔄 Updating: ${filstarProduct.name}`);
  
  // НОВА ПРОВЕРКА: Брой варианти
  const shopifyVariantsCount = shopifyProduct.variants?.edges?.length || 0;
  const filstarVariantsCount = filstarProduct.variants?.length || 0;
  
  console.log(`📊 Variants check:`);
  console.log(`  - Shopify variants: ${shopifyVariantsCount}`);
  console.log(`  - Filstar variants: ${filstarVariantsCount}`);
  
  if (shopifyVariantsCount !== filstarVariantsCount) {
  console.log(`  ⚠️ VARIANTS MISMATCH! Shopify has ${shopifyVariantsCount} but Filstar has ${filstarVariantsCount}`);
      
  await deleteShopifyProduct(shopifyProduct.id);  // ⬅️ Използвай shopifyProduct.id
  await createShopifyProduct(filstarProduct, categoryType);
  
  return;   
  }
	
// край на проверката за опции и варианти
	
	try {
    const productGid = shopifyProduct.id;
    const productId = productGid.replace('gid://shopify/Product/', '');

    console.log(`\n📝 Updating product: ${filstarProduct.name}`);
    console.log(`  Shopify ID: ${productId}`);

    // Fetch full product data
    const productQuery = `
      query getProduct($id: ID!) {
        product(id: $id) {
          id
          title
          descriptionHtml
          vendor
          productType
          tags
          status
          variants(first: 100) {
            edges {
              node {
                id
                sku
                price
                inventoryQuantity
                barcode
                inventoryItem { id  }                            
                selectedOptions {
                  name
                  value
                }
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
          media(first: 250) {
            edges {
              node {
                ... on MediaImage {
                  id
                  image {
                    url
                  }
                }
              }
            }
          }
        }
      }
    `;

    const productResponse = await fetch(
      `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/graphql.json`,
      {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': ACCESS_TOKEN,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          query: productQuery,
          variables: { id: productGid }
        })
      }
    );

    const productData = await productResponse.json();
    const fullProduct = productData.data.product;
    
    // Check if variants structure changed
const shopifyVariants = fullProduct.variants.edges.map(e => ({
  ...e.node,
  inventoryItemId: e.node.inventoryItem?.id.replace('gid://shopify/InventoryItem/', '')
}));

const filstarVariants = filstarProduct.variants || [];

// Провери дали има dropdown меню САМО ако е 1 вариант
let dropdownMismatch = false;

if (filstarVariants.length === 1) {
 const variantName = formatVariantName(filstarVariants[0], filstarProduct.name);
const shouldHaveDropdown = !!(variantName && variantName.trim() !== '');

const hasDropdown = shopifyVariants.some(v => 
  v.selectedOptions?.some(opt => opt.name !== 'Title')
);

console.log(`  🐛 Single variant - Has dropdown: ${hasDropdown}, Should have: ${shouldHaveDropdown}`);

  
  dropdownMismatch = hasDropdown !== shouldHaveDropdown;
}

const variantsChanged = 
  shopifyVariants.length !== filstarVariants.length ||
  dropdownMismatch ||  // ⬅️ ПРОВЕРКА ЗА DROPDOWN
  shopifyVariants.some((sv, idx) => {
    const fv = filstarVariants[idx];
    return !fv || sv.sku !== fv.sku;
  });

if (variantsChanged) {
  console.log(`  ⚠️  Variants changed - recreating product`);
  await deleteShopifyProduct(productGid);
  await createShopifyProduct(filstarProduct, categoryType); 
  return;
}

    
    // Update product fields
    const updateMutation = `
      mutation productUpdate($input: ProductInput!) {
        productUpdate(input: $input) {
          product {
            id
            title
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

// --- ТУК СМЯТАМЕ ТАГОВЕТЕ (Поправката е тук) ---

    // 1. Първо вземаме всички текущи тагове от Shopify, за да не ги изтрием
    let finalTags = fullProduct.tags ? [...fullProduct.tags] : [];
    
    // 2. Добавяме таговете, които идват от Filstar (ако ги има)
    if (filstarProduct.tags) {
        let filstarTags = [];
        if (Array.isArray(filstarProduct.tags)) {
            filstarTags = filstarProduct.tags;
        } else if (typeof filstarProduct.tags === 'string') {
            filstarTags = filstarProduct.tags.split(',').map(t => t.trim());
        }
        
        filstarTags.forEach(tag => {
            if (!finalTags.includes(tag)) finalTags.push(tag);
        });
    }

    // 3. Добавяме тага за подкатегория
    const subcatTag = getSubcategoryTag(filstarProduct);
    if (subcatTag) {
        if (!finalTags.includes(subcatTag)) {
            finalTags.push(subcatTag);
            console.log(`    🏷️  Adding subcategory tag: ${subcatTag}`);
        }
    }

// --- ТУК ГИ ИЗПРАЩАМЕ ---

    const productInput = {
      id: productGid,
      title: filstarProduct.name,
      descriptionHtml: filstarProduct.description || '',
      vendor: filstarProduct.manufacturer || 'Unknown',
      productType: filstarProduct.category || '',
      
      tags: finalTags, // ✅ Вече съдържа старите + новите
      
      status: 'ACTIVE'
    };
		
    const updateResponse = await fetch(
      `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/graphql.json`,
      {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': ACCESS_TOKEN,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          query: updateMutation,
          variables: { input: productInput }
        })
      }
    );

    const updateResult = await updateResponse.json();
    if (updateResult.data?.productUpdate?.userErrors?.length > 0) {
      console.log(`  ❌ Update errors:`, updateResult.data.productUpdate.userErrors);
      return;
    }

    console.log(`  ✅ Updated product fields`);
      
// Update variants

for (let i = 0; i < filstarVariants.length; i++) {
  const filstarVariant = filstarVariants[i];
  const shopifyVariant = shopifyVariants[i];
  if (!shopifyVariant) continue;

  console.log(`  🐛 Updating variant ${i}: SKU ${filstarVariant.sku}`);
  console.log(`  🐛 New price: ${filstarVariant.price}, New quantity: ${filstarVariant.quantity}`);

  const variantId = shopifyVariant.id.replace('gid://shopify/ProductVariant/', '');

  // Update price via REST API
  const variantResponse = await fetch(
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
          price: String(filstarVariant.price),
          barcode: filstarVariant.barcode || ''
        }
      })
    }
  );

  const variantResult = await variantResponse.json();

  // Update inventory via REST API
  const inventoryItemId = shopifyVariant.inventoryItemId;

  if (inventoryItemId) {
  const locationIdNumeric = LOCATION_ID.replace('gid://shopify/Location/', '');
  
  const inventoryResponse = await fetch(
    `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/inventory_levels/set.json`,
    {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': ACCESS_TOKEN,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        location_id: locationIdNumeric,
        inventory_item_id: inventoryItemId,
        available: parseInt(filstarVariant.quantity) || 0
      })
    }
  );

  const inventoryResult = await inventoryResponse.json();
 }

  await new Promise(resolve => setTimeout(resolve, 500));
}
    
console.log(` ✅ Updated ${filstarVariants.length} variants`);
  } catch (error) {
    console.error(`❌ Error updating product: ${error.message}`);
  }

if (categoryType && stats[categoryType]) {
  stats[categoryType].updated++;
}

}
// MAIN функция

  async function main() {
  console.log('🚀 Starting Filstar КЪМПИНГ Import\n');
  console.log('📋 Categories to import:');
  console.log('  -  Къмпинг - Категория Id - (63)');
     
  try {
    // Fetch всички продукти от Filstar
    const allProducts = await fetchAllProducts();
    
    // Филтрирай само аксесоарите от 4-те категории
    let accessoryProducts = allProducts.filter(product => {
      const categoryType = getCategoryType(product);
      return categoryType !== null;
    });



 // Филтър за конкретни SKU (ако е нужно)
    const targetSkus = ['963810']; // Замени с реалните SKU-та
    accessoryProducts = accessoryProducts.filter(product => 
      product.variants && product.variants.some(v => targetSkus.includes(v.sku))
    );


	  

    console.log(`🎯 Found ${accessoryProducts.length} products to process\n`);
    
    // Групирай по категория
const productsByCategory = {
 kamping: []
	  
    };
    
    accessoryProducts.forEach(product => {
      const categoryType = getCategoryType(product);
      if (categoryType) {
        productsByCategory[categoryType].push(product);
      }
    });

    // Покажи разпределението
    console.log('📊 Products by category:');
    Object.entries(productsByCategory).forEach(([type, products]) => {
      console.log(`  ${getCategoryName(type)}: ${products.length} products`);
    });
    console.log('');
    
    // Обработи всяка категория
    
    for (const [categoryType, products] of Object.entries(productsByCategory)) {
      if (products.length === 0) continue;
      
      console.log(`\n${'='.repeat(60)}`);
      console.log(`📂 Processing category: ${getCategoryName(categoryType)}`);
      console.log(`${'='.repeat(60)}\n`);
      
      const totalInCategory = products.length;
      
for (let i = 0; i < products.length; i++) {
  const product = products[i];
  const productNumber = i + 1;
         
  console.log(`\n${'-'.repeat(60)}`);
  console.log(`[${productNumber}/${totalInCategory}] Processing: ${product.name}`);
  console.log(`${'-'.repeat(60)}`);
  
  if (!product.variants || product.variants.length === 0) {
    console.log(`⏭️  Skipping - no variants`);
    continue;
  }
  
  const firstSku = product.variants[0].sku;
  const existingProduct = await findProductBySku(firstSku);
  
  if (existingProduct) {
    console.log(` ✓ Found existing product (ID: ${existingProduct.id})`);
    await updateShopifyProduct(existingProduct, product, categoryType);
  } else {
    console.log(` ✓ Product not found, creating new...`);
    await createShopifyProduct(product, categoryType);
  }
  
  await new Promise(resolve => setTimeout(resolve, 1000));
}
    
    }
    
    // Финална статистика
    console.log(`\n${'='.repeat(60)}`);
    console.log('📊 FINAL STATISTICS');
    console.log(`${'='.repeat(60)}\n`);
    
    Object.entries(stats).forEach(([category, data]) => {
      console.log(`${getCategoryName(category)}:`);
      console.log(`  Created: ${data.created}`);
      console.log(`  Updated: ${data.updated}`);
      console.log(`  Images: ${data.images}\n`);
    });
    
    console.log('✅ Import completed successfully!');
    
  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

main();
