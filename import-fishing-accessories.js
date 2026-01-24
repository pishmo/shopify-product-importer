// import-fishing-accessories.js - РРјРїРѕСЂС‚ РЅР° Р°РєСЃРµСЃРѕР°СЂРё РѕС‚ Filstar API
const fetch = require('node-fetch');
const sharp = require('sharp');
const fs = require('fs').promises;
const path = require('path');

const SHOPIFY_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const FILSTAR_TOKEN = process.env.FILSTAR_API_TOKEN;
const API_VERSION = '2025-01';

const FILSTAR_API_BASE = 'https://filstar.com/api';

// Filstar category IDs Р·Р° Р°РєСЃРµСЃРѕР°СЂРё - РЎРђРњРћ 4 РљРђРўР•Р“РћР РР
const FILSTAR_ACCESSORIES_CATEGORY_IDS = {
  pike_and_catfish: ['45'],
  pole_and_match: ['50'],
  knives: ['59'],
  chairs_umbrellas_tents: ['63']
};

const ACCESSORIES_PARENT_ID = '11';

// Shopify collection IDs - РЎРђРњРћ 4 РљРђРўР•Р“РћР РР
const SHOPIFY_ACCESSORIES_COLLECTIONS = {
  pike_and_catfish: 'gid://shopify/Collection/739661185406',
  pole_and_match: 'gid://shopify/Collection/739661218174',
  knives: 'gid://shopify/Collection/739661250942',
  chairs_umbrellas_tents: 'gid://shopify/Collection/739661414782'
};

// РЎС‚Р°С‚РёСЃС‚РёРєР° - РЎРђРњРћ 4 РљРђРўР•Р“РћР РР
const stats = {
  pike_and_catfish: { created: 0, updated: 0, images: 0 },
  pole_and_match: { created: 0, updated: 0, images: 0 },
  knives: { created: 0, updated: 0, images: 0 },
  chairs_umbrellas_tents: { created: 0, updated: 0, images: 0 }
};

// TEST MODE
const TEST_MODE = false;
const TEST_CATEGORY = 'knives';



// 2 С‡Р°СЃС‚




// Р¤СѓРЅРєС†РёСЏ Р·Р° РЅРѕСЂРјР°Р»РёР·Р°С†РёСЏ РЅР° РёР·РѕР±СЂР°Р¶РµРЅРёСЏ
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
    console.error(`  вќЊ Error normalizing image: ${error.message}`);
    return null;
  }
}

// Р¤СѓРЅРєС†РёСЏ Р·Р° РєР°С‡РІР°РЅРµ РЅР° РёР·РѕР±СЂР°Р¶РµРЅРёРµ РІ Shopify
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
    console.error(`  вќЊ Error uploading image: ${error.message}`);
    return null;
  }
}

// РџРћРџР РђР’Р•РќРђ С„СѓРЅРєС†РёСЏ Р·Р° С„РѕСЂРјР°С‚РёСЂР°РЅРµ РЅР° РёРјРµ РЅР° РІР°СЂРёР°РЅС‚
function formatVariantName(attributes, sku) {
  if (!attributes || attributes.length === 0) {
    return sku || 'РЎС‚Р°РЅРґР°СЂС‚РµРЅ';
  }
  
  // Р¤РёР»С‚СЂРёСЂР°Р№ Р°С‚СЂРёР±СѓС‚Рё Р·Р°РїРѕС‡РІР°С‰Рё СЃ "РђРєСЃРµСЃРѕР°СЂРё" РёР»Рё РґСЂСѓРіРё РєР°С‚РµРіРѕСЂРёР№РЅРё РёРјРµРЅР°
  const filtered = attributes.filter(attr => {
    const name = attr.attribute_name || '';
    
    // РџСЂРµРјР°С…РЅРё РІСЃРёС‡РєРё Р°С‚СЂРёР±СѓС‚Рё Р·Р°РїРѕС‡РІР°С‰Рё СЃ "РђРєСЃРµСЃРѕР°СЂРё"
    if (name.startsWith('РђРєСЃРµСЃРѕР°СЂРё') || name.startsWith('РђРљРЎР•РЎРћРђР Р')) {
      return false;
    }
    
    // РџСЂРµРјР°С…РЅРё РґСЂСѓРіРё РєР°С‚РµРіРѕСЂРёР№РЅРё РёРјРµРЅР°
    const excludeList = [
      'Р–РР’РђР РќРР¦Р Р РљР•РџР§Р•РўРђ',
      'РџР РђРЁРљР',
      'РќРћР–РћР’Р•',
      'РљРЈРўРР, РљРћРЁР§Р•РўРђ Р РљРђР›РЄР¤Р',
      'Р Р°РЅРёС†Рё, С‡Р°РЅС‚Рё, РєРѕС€С‡РµС‚Р° Рё РєРѕС„Рё',
      'РЎРўРћР›РћР’Р• Р РџРђР›РђРўРљР',
      'Р”Р РЈР“Р', 'Р”СЂСѓРіРё',
      'РњРЈРҐРђР РЎРљР Р РЈР‘РћР›РћР’',
      'РЁРђР РђРќРЎРљР Р РР‘РћР›РћР’', 'Р¤РёРґРµСЂРё',
      'Р РР‘РћР›РћР’ РЎ Р©Р•РљРђ Р РњРђР§',  // в†ђ Р”РћР‘РђР’Р•РќРћ
      'Р©Р•РљРђ Р РњРђР§'              // в†ђ Р”РћР‘РђР’Р•РќРћ (РІР°СЂРёР°С†РёСЏ)
    ];
    
    return !excludeList.includes(name);
  });
  
  if (filtered.length === 0) {
    return sku || 'РЎС‚Р°РЅРґР°СЂС‚РµРЅ';
  }
  
  // РўСЉСЂСЃРё "РњРћР”Р•Р›" Р°С‚СЂРёР±СѓС‚
  const modelAttr = filtered.find(attr => attr.attribute_name?.toUpperCase().includes('РњРћР”Р•Р›'));
  const otherAttrs = filtered.filter(attr => !attr.attribute_name?.toUpperCase().includes('РњРћР”Р•Р›'));
  
  const parts = [];
  if (modelAttr) {
    parts.push(`${modelAttr.attribute_name} ${modelAttr.value}`);
  }
  otherAttrs.forEach(attr => {
    parts.push(`${attr.attribute_name} ${attr.value}`);
  });
  
  // РЎСЉРµРґРёРЅРё С‡Р°СЃС‚РёС‚Рµ
  let result = parts.join(' / ');
  
  // РџСЂРµРјР°С…РЅРё "/" РѕС‚ РЅР°С‡Р°Р»РѕС‚Рѕ Рё РєСЂР°СЏ
  result = result.replace(/^\/+|\/+$/g, '').trim();
  
  // РђРєРѕ Рµ РїСЂР°Р·РЅРѕ СЃР»РµРґ С„РёР»С‚СЉСЂР°, РёР·РїРѕР»Р·РІР°Р№ SKU
  if (!result || result === '') {
    return sku || 'РЎС‚Р°РЅРґР°СЂС‚РµРЅ';
  }
  
  return result;
}



// Р¤СѓРЅРєС†РёСЏ Р·Р° РѕРїСЂРµРґРµР»СЏРЅРµ РЅР° С‚РёРїР° Р°РєСЃРµСЃРѕР°СЂ
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

// Р¤СѓРЅРєС†РёСЏ Р·Р° РїРѕР»СѓС‡Р°РІР°РЅРµ РЅР° РёРјРµ РЅР° РєР°С‚РµРіРѕСЂРёСЏ
function getCategoryName(categoryType) {
  const names = {
    pike_and_catfish: 'РђРєСЃРµСЃРѕР°СЂРё С‰СѓРєР° Рё СЃРѕРј',
    pole_and_match: 'РђРєСЃРµСЃРѕР°СЂРё С‰РµРєР° Рё РјР°С‡',
    knives: 'РќРѕР¶РѕРІРµ',
    chairs_umbrellas_tents: 'РЎС‚РѕР»РѕРІРµ Рё РїР°Р»Р°С‚РєРё'
  };
  
  return names[categoryType] || 'РђРєСЃРµСЃРѕР°СЂРё';
}





// 3 С‚Р° С‡Р°СЃС‚




// Р¤СѓРЅРєС†РёСЏ Р·Р° РёР·РІР»РёС‡Р°РЅРµ РЅР° РІСЃРёС‡РєРё РїСЂРѕРґСѓРєС‚Рё РѕС‚ Filstar
async function fetchAllProducts() {
  console.log('рџ“¦ Fetching all products from Filstar API with pagination...\n');
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
        console.log(`  вњ“ Page ${page}: ${data.length} products`);
        page++;
        hasMore = data.length > 0;
        
        if (page > 10) {
          console.log('  вљ пёЏ  Safety limit reached (10 pages)');
          hasMore = false;
        }
      } else {
        hasMore = false;
      }

      await new Promise(resolve => setTimeout(resolve, 500));
      
    } catch (error) {
      console.error(`  вќЊ Error fetching page ${page}:`, error.message);
      hasMore = false;
    }
  }

  console.log(`\nвњ… Total products fetched: ${allProducts.length}\n`);
  return allProducts;
}

// Р¤СѓРЅРєС†РёСЏ Р·Р° РЅР°РјРёСЂР°РЅРµ РЅР° РїСЂРѕРґСѓРєС‚ РІ Shopify РїРѕ SKU
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
    console.error(`  вќЊ Error finding product by SKU: ${error.message}`);
    return null;
  }
}

// Р¤СѓРЅРєС†РёСЏ Р·Р° РґРѕР±Р°РІСЏРЅРµ РЅР° РїСЂРѕРґСѓРєС‚ РІ РєРѕР»РµРєС†РёСЏ
async function addProductToCollection(productId, categoryType) {
  const collectionId = SHOPIFY_ACCESSORIES_COLLECTIONS[categoryType];
  
  if (!collectionId) {
    console.log(`  вљ пёЏ  No collection mapping for category: ${categoryType}`);
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
      console.log(`  вљ пёЏ  Collection errors:`, data.data.collectionAddProducts.userErrors);
    }
  } catch (error) {
    console.error(`  вќЊ Error adding to collection: ${error.message}`);
  }
}

// Р¤СѓРЅРєС†РёСЏ Р·Р° РїСЂРµРЅР°СЂРµР¶РґР°РЅРµ РЅР° РёР·РѕР±СЂР°Р¶РµРЅРёСЏС‚Р°
async function reorderProductImages(productGid, images) {
  try {
    const mutation = `
      mutation {
        productReorderImages(
          id: \"${productGid}\",
          moves: [${images.map((img, index) => `{
            id: \"${img.id}\",
            newPosition: \"${index}\"
          }`).join(', ')}]
        ) {
          product {
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
    
    if (data.data?.productReorderImages?.userErrors?.length > 0) {
      console.log(`  вљ пёЏ  Reorder errors:`, data.data.productReorderImages.userErrors);
      return false;
    }
    
    console.log(`    вњ… Reordered ${images.length} images`);
    return true;
  } catch (error) {
    console.error(`  вќЊ Error reordering images: ${error.message}`);
    return false;
  }
}

// Р¤СѓРЅРєС†РёСЏ Р·Р° СЃСЉР·РґР°РІР°РЅРµ РЅР° РЅРѕРІ РїСЂРѕРґСѓРєС‚
async function createShopifyProduct(filstarProduct, categoryType) {
  console.log(`\nрџ†• Creating: ${filstarProduct.name}`);
  
  try {
    const vendor = filstarProduct.manufacturer || 'Unknown';
    console.log(` рџЏ·пёЏ Manufacturer: ${filstarProduct.manufacturer} в†’ Vendor: ${vendor}`);
    
    const productType = getCategoryName(categoryType);
    
    // РџРѕРґРіРѕС‚РІРё РІР°СЂРёР°РЅС‚Рё СЃ РїРѕРїСЂР°РІРµРЅРѕ С„РѕСЂРјР°С‚РёСЂР°РЅРµ
    const variants = filstarProduct.variants.map(variant => {
      const variantName = formatVariantName(variant.attributes, variant.sku);
      
      return {
        option1: variantName,
        price: variant.price?.toString() || '0',
        sku: variant.sku,
        barcode: variant.barcode || variant.sku,
        inventory_quantity: parseInt(variant.quantity) || 0,
        inventory_management: 'shopify'
      };
    });

    // РЎСЉР·РґР°Р№ РїСЂРѕРґСѓРєС‚Р°
    const productData = {
      product: {
        title: filstarProduct.name,
        body_html: filstarProduct.description || filstarProduct.short_description || '',
        vendor: vendor,
        product_type: productType,
        tags: ['Filstar', categoryType, vendor],
        status: 'active',
        variants: variants,
        options: [
          { name: 'Р’Р°СЂРёР°РЅС‚' }
        ]
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
      const errorText = await response.text();
      throw new Error(`Failed to create product: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    const productId = result.product.id;
    const productGid = `gid://shopify/Product/${productId}`;
    
    console.log(`  вњ… Created product ID: ${productId}`);
    console.log(`  рџ“¦ Created ${variants.length} variants`);

    // Р”РѕР±Р°РІРё РІ РєРѕР»РµРєС†РёСЏ
    await addProductToCollection(productGid, categoryType);

    // РљР°С‡Рё Рё РЅРѕСЂРјР°Р»РёР·РёСЂР°Р№ РёР·РѕР±СЂР°Р¶РµРЅРёСЏ
    if (filstarProduct.images && filstarProduct.images.length > 0) {
      console.log(`  рџ–јпёЏ  Processing ${filstarProduct.images.length} images...`);
      
      const uploadedImages = [];
      
      for (const imageUrl of filstarProduct.images) {
        const filename = imageUrl.split('/').pop();
        const normalizedBuffer = await normalizeImage(imageUrl, filstarProduct.variants[0].sku);
        
        if (normalizedBuffer) {
          const resourceUrl = await uploadImageToShopify(normalizedBuffer, filename);
          
          if (resourceUrl) {
            const attachMutation = `
              mutation {
                productCreateMedia(
                  productId: \"${productGid}\",
                  media: [{
                    originalSource: \"${resourceUrl}\",
                    mediaContentType: IMAGE
                  }]
                ) {
                  media {
                    ... on MediaImage {
                      id
                      image {
                        url
                      }
                    }
                  }
                  mediaUserErrors {
                    field
                    message
                  }
                }
              }
            `;
            
            const attachResponse = await fetch(
              `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/graphql.json`,
              {
                method: 'POST',
                headers: {
                  'X-Shopify-Access-Token': ACCESS_TOKEN,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({ query: attachMutation })
              }
            );
            
            const attachData = await attachResponse.json();
            
            if (attachData.data?.productCreateMedia?.media?.[0]) {
              uploadedImages.push(attachData.data.productCreateMedia.media[0]);
              console.log(`    вњ“ Uploaded: ${filename}`);
              stats[categoryType].images++;
            }
          }
        }
        
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      console.log(`  вњ… Uploaded ${uploadedImages.length} images`);
    }

    stats[categoryType].created++;
    return result.product;

  } catch (error) {
    console.error(`  вќЊ Error creating product: ${error.message}`);
    return null;
  }
}

// Р¤СѓРЅРєС†РёСЏ Р·Р° РѕР±РЅРѕРІСЏРІР°РЅРµ РЅР° СЃСЉС‰РµСЃС‚РІСѓРІР°С‰ РїСЂРѕРґСѓРєС‚
async function updateShopifyProduct(shopifyProduct, filstarProduct, categoryType) {
  console.log(`\nрџ”„ Updating: ${filstarProduct.name}`);
  
  try {
    const productId = shopifyProduct.id.replace('gid://shopify/Product/', '');
    const productGid = shopifyProduct.id;
    
    // Р’Р·РµРјРё СЃСЉС‰РµСЃС‚РІСѓРІР°С‰РёС‚Рµ РёР·РѕР±СЂР°Р¶РµРЅРёСЏ
    const existingImages = shopifyProduct.images?.edges?.map(edge => ({
      id: edge.node.id,
      src: edge.node.src
    })) || [];
    
    const existingFilenames = existingImages.map(img => {
      const url = img.src;
      const filename = url.split('/').pop().split('?')[0];
      return filename;
    });
    
    // РћР±СЂР°Р±РѕС‚Рё РЅРѕРІРё РёР·РѕР±СЂР°Р¶РµРЅРёСЏ
    if (filstarProduct.images && filstarProduct.images.length > 0) {
      console.log(`  рџ–јпёЏ  Processing ${filstarProduct.images.length} images from Filstar...`);
      
      let newImagesUploaded = 0;
      
      for (const imageUrl of filstarProduct.images) {
        const filename = imageUrl.split('/').pop();
        
        // РџСЂРѕРІРµСЂРё РґР°Р»Рё РёР·РѕР±СЂР°Р¶РµРЅРёРµС‚Рѕ РІРµС‡Рµ СЃСЉС‰РµСЃС‚РІСѓРІР°
        if (existingFilenames.includes(filename)) {
          console.log(`  вЏ­пёЏ  Image already exists, skipping: ${filename}`);
          continue;
        }
        
        // РќРѕСЂРјР°Р»РёР·РёСЂР°Р№ Рё РєР°С‡Рё РЅРѕРІРѕС‚Рѕ РёР·РѕР±СЂР°Р¶РµРЅРёРµ
        const normalizedBuffer = await normalizeImage(imageUrl, filstarProduct.variants[0].sku);
        
        if (normalizedBuffer) {
          const resourceUrl = await uploadImageToShopify(normalizedBuffer, filename);
          
          if (resourceUrl) {
            const attachMutation = `
              mutation {
                productCreateMedia(
                  productId: \"${productGid}\",
                  media: [{
                    originalSource: \"${resourceUrl}\",
                    mediaContentType: IMAGE
                  }]
                ) {
                  media {
                    ... on MediaImage {
                      id
                      image {
                        url
                      }
                    }
                  }
                  mediaUserErrors {
                    field
                    message
                  }
                }
              }
            `;
            
            const attachResponse = await fetch(
              `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/graphql.json`,
              {
                method: 'POST',
                headers: {
                  'X-Shopify-Access-Token': ACCESS_TOKEN,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({ query: attachMutation })
              }
            );
            
            const attachData = await attachResponse.json();
            
            if (attachData.data?.productCreateMedia?.media?.[0]) {
              console.log(`    вњ“ Uploaded new image: ${filename}`);
              newImagesUploaded++;
              stats[categoryType].images++;
            }
          }
        }
        
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      if (newImagesUploaded > 0) {
        console.log(`  вњ… Uploaded ${newImagesUploaded} new images`);
        
        // РџСЂРµРЅР°СЂРµРґРё РёР·РѕР±СЂР°Р¶РµРЅРёСЏС‚Р°
        const updatedProductQuery = `
          {
            product(id: \"${productGid}\") {
              images(first: 50) {
                edges {
                  node {
                    id
                    src
                  }
                }
              }
            }
          }
        `;
        
        const updatedResponse = await fetch(
          `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/graphql.json`,
          {
            method: 'POST',
            headers: {
              'X-Shopify-Access-Token': ACCESS_TOKEN,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ query: updatedProductQuery })
          }
        );
        
        const updatedData = await updatedResponse.json();
        const allImages = updatedData.data?.product?.images?.edges?.map(edge => ({
          id: edge.node.id,
          src: edge.node.src
        })) || [];
        
        if (allImages.length > 0) {
          console.log(`  рџ”„ Reordering images...`);
          await reorderProductImages(productGid, allImages);
        }
      } else {
        console.log(`  в„№пёЏ  No new images to upload`);
      }
    }
    
    stats[categoryType].updated++;
    return true;

  } catch (error) {
    console.error(`  вќЊ Error updating product: ${error.message}`);
    return false;
  }
}

// MAIN С„СѓРЅРєС†РёСЏ
async function main() {
  console.log('рџљЂ Starting Filstar Accessories Import\n');
  console.log('рџ“‹ Categories to import:');
  console.log('  - РђРєСЃРµСЃРѕР°СЂРё С‰СѓРєР° Рё СЃРѕРј (45)');
  console.log('  - РђРєСЃРµСЃРѕР°СЂРё С‰РµРєР° Рё РјР°С‡ (50)');
  console.log('  - РќРѕР¶РѕРІРµ (59)');
  console.log('  - РЎС‚РѕР»РѕРІРµ Рё РїР°Р»Р°С‚РєРё (63)\n');
  
  try {
    // Fetch РІСЃРёС‡РєРё РїСЂРѕРґСѓРєС‚Рё РѕС‚ Filstar
    const allProducts = await fetchAllProducts();
    
    // Р¤РёР»С‚СЂРёСЂР°Р№ СЃР°РјРѕ Р°РєСЃРµСЃРѕР°СЂРёС‚Рµ РѕС‚ 4-С‚Рµ РєР°С‚РµРіРѕСЂРёРё
    const accessoryProducts = allProducts.filter(product => {
      const categoryType = getCategoryType(product);
      return categoryType !== null;
    });
    
    console.log(`рџЋЇ Found ${accessoryProducts.length} accessory products to process\n`);
    
    // Р“СЂСѓРїРёСЂР°Р№ РїРѕ РєР°С‚РµРіРѕСЂРёСЏ
    const productsByCategory = {
      pike_and_catfish: [],
      pole_and_match: [],
      knives: [],
      chairs_umbrellas_tents: []
    };
    
    accessoryProducts.forEach(product => {
      const categoryType = getCategoryType(product);
      if (categoryType) {
        productsByCategory[categoryType].push(product);
      }
    });
    
    // РџРѕРєР°Р¶Рё СЂР°Р·РїСЂРµРґРµР»РµРЅРёРµС‚Рѕ
    console.log('рџ“Љ Products by category:');
    Object.entries(productsByCategory).forEach(([type, products]) => {
      console.log(`  ${getCategoryName(type)}: ${products.length} products`);
    });
    console.log('');
    
    // TEST MODE РїСЂРѕРІРµСЂРєР°
    const categoriesToProcess = TEST_MODE 
      ? { [TEST_CATEGORY]: productsByCategory[TEST_CATEGORY] }
      : productsByCategory;
    
    // РћР±СЂР°Р±РѕС‚Рё РІСЃСЏРєР° РєР°С‚РµРіРѕСЂРёСЏ
    for (const [categoryType, products] of Object.entries(categoriesToProcess)) {
      if (products.length === 0) continue;
      
      console.log(`\n${'='.repeat(60)}`);
      console.log(`рџ“‚ Processing category: ${getCategoryName(categoryType)}`);
      console.log(`${'='.repeat(60)}\n`);
      
      for (const product of products) {
        if (!product.variants || product.variants.length === 0) {
          console.log(`вЏ­пёЏ  Skipping ${product.name} - no variants`);
          continue;
        }
        
        const firstSku = product.variants[0].sku;
        const existingProduct = await findProductBySku(firstSku);
        
        if (existingProduct) {
          await updateShopifyProduct(existingProduct, product, categoryType);
        } else {
          await createShopifyProduct(product, categoryType);
        }
        
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    // Р¤РёРЅР°Р»РЅР° СЃС‚Р°С‚РёСЃС‚РёРєР°
    console.log(`\n${'='.repeat(60)}`);
    console.log('рџ“Љ FINAL STATISTICS');
    console.log(`${'='.repeat(60)}\n`);
    
    Object.entries(stats).forEach(([category, data]) => {
      console.log(`${getCategoryName(category)}:`);
      console.log(`  Created: ${data.created}`);
      console.log(`  Updated: ${data.updated}`);
      console.log(`  Images: ${data.images}\n`);
    });
    
    console.log('вњ… Import completed successfully!');
    
  } catch (error) {
    console.error('вќЊ Fatal error:', error);
    process.exit(1);
  }
}

main();






