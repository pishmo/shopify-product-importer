// import-kamping.js - ПЪЛНО КОПИЕ НА СТРУКТУРАТА ОТ BAIT
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

// САМО ЕДНА КОЛЕКЦИЯ - КЪМПИНГ
const COLLECTION_MAPPING = {
  kamping: 'gid://shopify/Collection/739661414782'
};

// Filstar категория (63 - Столове, чадъри и палатки)
const FILSTAR_CAMPING_CATEGORY_IDS = {
  kamping: ['63']
};

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

const stats = {
  kamping: { created: 0, updated: 0, images: 0 }
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

// --- ВСИЧКИ ФУНКЦИИ ОТ ТВОЯ КОД (2, 3, 4 ЧАСТ) ---

async function deleteShopifyProduct(productId) {
  const numericId = productId.replace('gid://shopify/Product/', '');
  const response = await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/products/${numericId}.json`, {
    method: 'DELETE',
    headers: { 'X-Shopify-Access-Token': ACCESS_TOKEN }
  });
  if (!response.ok) throw new Error(`Delete failed: ${response.status}`);
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
    const p = part.split('.')[0];
    return !(p.length >= 32 && /^[a-f0-9]+$/i.test(p));
  });
  return (cleanParts.join('_') + '.' + cleanFilename.split('.').pop()).replace(/^_+/, '');
}

function imageExists(existingImages, newImageUrl) {
  if (!existingImages || !Array.isArray(existingImages) || existingImages.length === 0) return false;
  const newFilename = getImageFilename(newImageUrl);
  if (!newFilename) return false;
  const newBase = newFilename.split('.')[0];
  return existingImages.some(img => {
    const imgSrc = img.src || img.url || img;
    const existingFilename = getImageFilename(imgSrc);
    return existingFilename && existingFilename.split('.')[0] === newBase;
  });
}

async function normalizeImage(imageUrl, sku) {
  try {
    const response = await fetch(imageUrl);
    const buffer = await response.buffer();
    const tempDir = path.join(__dirname, 'temp');
    try { await fs.access(tempDir); } catch { await fs.mkdir(tempDir, { recursive: true }); }
    const filename = `${sku}_${Date.now()}.jpg`;
    const outputPath = path.join(tempDir, filename);
    await sharp(buffer)
      .resize(1200, 1000, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .jpeg({ quality: 90 }).toFile(outputPath);
    const data = await fs.readFile(outputPath);
    await fs.unlink(outputPath);
    return data;
  } catch (error) { return null; }
}

async function uploadImageToShopify(imageBuffer, filename) {
  try {
    const mutation = `mutation { stagedUploadsCreate(input: [{ resource: IMAGE, filename: \"${filename}\", mimeType: \"image/jpeg\", httpMethod: POST }]) { stagedTargets { url resourceUrl parameters { name value } } } }`;
    const res = await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/graphql.json`, {
      method: 'POST',
      headers: { 'X-Shopify-Access-Token': ACCESS_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: mutation })
    });
    const data = await res.json();
    const target = data.data.stagedUploadsCreate.stagedTargets[0];
    const formData = new (require('form-data'))();
    target.parameters.forEach(p => formData.append(p.name, p.value));
    formData.append('file', imageBuffer, { filename });
    await fetch(target.url, { method: 'POST', body: formData });
    return target.resourceUrl;
  } catch (error) { return null; }
}

async function scrapeOgImage(productSlug) {
  if (!productSlug) return null;
  try {
    const response = await fetch(`${FILSTAR_BASE_URL}/${productSlug}`);
    const html = await response.text();
    const bgMatch = html.match(/background-image:\s*url\(['"&quot;]*([^'"&)]+)['"&quot;]*\)/);
    return bgMatch ? bgMatch[1] : null;
  } catch (error) { return null; }
}

function formatVariantName(variant, productName) { 
  const parts = [];  
  function formatAttributeName(name) { 
    let f = name.charAt(0).toUpperCase() + name.slice(1).toLowerCase(); 
    if (f.includes(',') && !f.endsWith('.')) f += '. '; 
    return f;
  } 
  let model = variant.model || variant.attributes?.find(a => a.attribute_name.toUpperCase() === 'АРТИКУЛ')?.value;
  if (model && model !== productName) parts.push(model); 
  const size = variant.attributes?.find(a => a.attribute_name.toUpperCase() === 'РАЗМЕР'); 
  if (size?.value) parts.push(`${formatAttributeName(size.attribute_name)} : ${size.value}`); 
  const others = variant.attributes?.filter(a => !['АРТИКУЛ', 'РАЗМЕР'].includes(a.attribute_name.toUpperCase()) && a.value)
    .map(a => `${formatAttributeName(a.attribute_name)}: ${a.value}`); 
  if (others) parts.push(...others);
  return parts.join(' / ');
}

async function findProductBySku(sku) {
  const query = `{ products(first: 1, query: \"sku:${sku}\") { edges { node { id title variants(first: 100) { edges { node { id sku inventoryItem { id } } } } images(first: 50) { edges { node { id src } } } } } } }`;
  const response = await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: { 'X-Shopify-Access-Token': ACCESS_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query })
  });
  const data = await response.json();
  return data.data?.products?.edges?.[0]?.node || null;
}

async function addProductToCollection(productId, categoryType) {
  const collectionId = COLLECTION_MAPPING[categoryType];
  if (!collectionId) return;
  const mutation = `mutation { collectionAddProducts(id: \"${collectionId}\", productIds: [\"${productId}\"]) { collection { id } } }`;
  await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: { 'X-Shopify-Access-Token': ACCESS_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: mutation })
  });
}

async function reorderProductImages(productGid, images) {
  const productId = productGid.replace('gid://shopify/Product/', '');
  const reorderedImages = images.map((img, index) => ({ id: (img.node?.id || img.id).replace('gid://shopify/ProductImage/', ''), position: index + 1 }));
  await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/products/${productId}.json`, {
    method: 'PUT',
    headers: { 'X-Shopify-Access-Token': ACCESS_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ product: { id: productId, images: reorderedImages } })
  });
}

// 4 част - CREATE / UPDATE

async function createShopifyProduct(filstarProduct, categoryType) {
  console.log(`\n📦 Creating: ${filstarProduct.name}`);
  const needsOptions = filstarProduct.variants.length > 1 || formatVariantName(filstarProduct.variants[0], filstarProduct.name);
  const variants = filstarProduct.variants.map(v => ({
    price: v.price?.toString() || '0',
    sku: v.sku,
    barcode: v.barcode || v.sku,
    inventory_quantity: parseInt(v.quantity) || 0,
    inventory_management: 'shopify',
    ...(needsOptions && { option1: formatVariantName(v, filstarProduct.name) || v.sku })
  }));

  const payload = { product: { title: filstarProduct.name, body_html: filstarProduct.description || '', vendor: filstarProduct.manufacturer || 'Unknown', product_type: 'Къмпинг', tags: generateCampingTags(filstarProduct), status: 'active', variants } };
  if (needsOptions) payload.product.options = [{ name: 'Вариант' }];

  const res = await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/products.json`, {
    method: 'POST',
    headers: { 'X-Shopify-Access-Token': ACCESS_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const result = await res.json();
  const productGid = `gid://shopify/Product/${result.product.id}`;
  
  // Image handling
  if (filstarProduct.images) {
    for (const imageUrl of filstarProduct.images) {
      const fullUrl = imageUrl.startsWith('http') ? imageUrl : `${FILSTAR_BASE_URL}/${imageUrl}`;
      const buffer = await normalizeImage(fullUrl, filstarProduct.variants[0].sku);
      if (buffer) {
        const resUrl = await uploadImageToShopify(buffer, imageUrl.split('/').pop());
        if (resUrl) {
          const attach = `mutation { productCreateMedia(productId: \"${productGid}\", media: [{ originalSource: \"${resUrl}\", mediaContentType: IMAGE }]) { media { ... on MediaImage { id } } } }`;
          await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/graphql.json`, {
            method: 'POST',
            headers: { 'X-Shopify-Access-Token': ACCESS_TOKEN, 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: attach })
          });
        }
      }
    }
  }
  stats[categoryType].created++;
  await addProductToCollection(productGid, categoryType);
  return productGid;
}

async function updateShopifyProduct(shopifyProduct, filstarProduct, categoryType) {
  console.log(`🔄 Updating: ${filstarProduct.name}`);
  if (shopifyProduct.variants.edges.length !== filstarProduct.variants.length) {
    await deleteShopifyProduct(shopifyProduct.id);
    await createShopifyProduct(filstarProduct, categoryType);
    return;
  }
  const input = { id: shopifyProduct.id, title: filstarProduct.name, tags: generateCampingTags(filstarProduct) };
  await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: { 'X-Shopify-Access-Token': ACCESS_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: `mutation productUpdate($input: ProductInput!) { productUpdate(input: $input) { product { id } } }`, variables: { input } })
  });

  for (let i = 0; i < filstarProduct.variants.length; i++) {
    const fv = filstarProduct.variants[i];
    const sv = shopifyProduct.variants.edges[i].node;
    const vId = sv.id.replace('gid://shopify/ProductVariant/', '');
    await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/variants/${vId}.json`, { method: 'PUT', headers: { 'X-Shopify-Access-Token': ACCESS_TOKEN, 'Content-Type': 'application/json' }, body: JSON.stringify({ variant: { id: vId, price: String(fv.price) } }) });
    await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/inventory_levels/set.json`, { method: 'POST', headers: { 'X-Shopify-Access-Token': ACCESS_TOKEN, 'Content-Type': 'application/json' }, body: JSON.stringify({ location_id: LOCATION_ID.replace('gid://shopify/Location/', ''), inventory_item_id: sv.inventoryItem.id.replace('gid://shopify/InventoryItem/', ''), available: parseInt(fv.quantity) || 0 }) });
  }
  stats[categoryType].updated++;
}

// 5 част - MAIN

async function main() {
  console.log('🚀 Starting Filstar KAMPING Пълен Импорт\n');
  const response = await fetch(`${FILSTAR_API_BASE}/products?limit=1000`, { headers: { 'Authorization': `Bearer ${FILSTAR_TOKEN}` } });
  const allProducts = await response.json();
  const campingProducts = allProducts.filter(p => p.categories?.some(c => FILSTAR_CAMPING_CATEGORY_IDS.kamping.includes(c.id.toString())));

  console.log(`🎯 Found ${campingProducts.length} products to process\n`);

  for (const p of campingProducts) {
    const existing = await findProductBySku(p.variants[0].sku);
    existing ? await updateShopifyProduct(existing, p, 'kamping') : await createShopifyProduct(p, 'kamping');
    await new Promise(r => setTimeout(r, 1000));
  }
  console.log('\n✅ Completed!', stats);
}

main();
