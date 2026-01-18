// import-fishing-reel.js - Универсален импорт на всички категории макари CARPLANDIA
const fetch = require('node-fetch');
const SHOPIFY_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const FILSTAR_TOKEN = process.env.FILSTAR_API_TOKEN;
const API_VERSION = '2024-10';
const FILSTAR_API_BASE = 'https://filstar.com/api';
const FILSTAR_BASE_URL = 'https://filstar.com';

const COLLECTION_MAPPING = {
&nbsp; front_drag: 'gid://shopify/Collection/739175301502',
&nbsp; rear_drag: 'gid://shopify/Collection/739175334270',
&nbsp; baitrunner: 'gid://shopify/Collection/739175399806',
&nbsp; multipliers: 'gid://shopify/Collection/739175432574',
&nbsp; other: 'gid://shopify/Collection/739175530878'
};

const FILSTAR_REEL_CATEGORY_IDS = {
&nbsp; front_drag: ['19'],
&nbsp; rear_drag: ['24'],
&nbsp; baitrunner: ['30'],
&nbsp; multipliers: ['34'],
&nbsp; other: ['43']
};

const REELS_PARENT_ID = '6';

const stats = {
&nbsp; front_drag: { created: 0, updated: 0, images: 0 },
&nbsp; rear_drag: { created: 0, updated: 0, images: 0 },
&nbsp; baitrunner: { created: 0, updated: 0, images: 0 },
&nbsp; multipliers: { created: 0, updated: 0, images: 0 },
&nbsp; other: { created: 0, updated: 0, images: 0 }
};

function getImageFilename(src) {
&nbsp; if (!src || typeof src !== 'string') {
&nbsp; &nbsp; console.log('⚠️ Invalid image src:', src);
&nbsp; &nbsp; return null;
&nbsp; }
&nbsp; const urlParts = src.split('/').pop();
&nbsp; const withoutQuery = urlParts.split('?')[0];
&nbsp; const uuidPattern = /_[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/g;
&nbsp; let cleanFilename = withoutQuery.replace(uuidPattern, '');
&nbsp; const parts = cleanFilename.split('_');
&nbsp; const extension = cleanFilename.split('.').pop();
&nbsp; const filteredParts = parts.filter(part =&gt; {
&nbsp; &nbsp; const partWithoutExt = part.split('.')[0];
&nbsp; &nbsp; return !(partWithoutExt.length &gt;= 32 &amp;&amp; /^[a-f0-9]+$/i.test(partWithoutExt));
&nbsp; });
&nbsp; cleanFilename = filteredParts.join('_');
&nbsp; if (!cleanFilename.endsWith('.' + extension)) {
&nbsp; &nbsp; cleanFilename += '.' + extension;
&nbsp; }
&nbsp; cleanFilename = cleanFilename.replace(/^_+/, '');
&nbsp; cleanFilename = cleanFilename.replace(/\.jpeg$/i, '.jpg');
&nbsp; return cleanFilename;
}

function imageExists(existingImages, newImageUrl) {
&nbsp; const newFilename = getImageFilename(newImageUrl);
&nbsp; if (!newFilename) return false;
&nbsp; return existingImages.some(img =&gt; {
&nbsp; &nbsp; const existingFilename = getImageFilename(img.src);
&nbsp; &nbsp; return existingFilename &amp;&amp; existingFilename === newFilename;
&nbsp; });
}

// 🆕 Функция за пренареждане на снимките в правилния ред
async function reorderProductImages(productId, filstarProduct, existingImages) {
&nbsp; console.log(` 🔄 Reordering images for product ${productId}...`);
&nbsp;&nbsp;
&nbsp; const desiredOrder = [];
&nbsp;&nbsp;
&nbsp; // 1️⃣ Главна снимка на продукта (макарата)
&nbsp; if (filstarProduct.image) {
&nbsp; &nbsp; const imageUrl = filstarProduct.image.startsWith('http')&nbsp;
&nbsp; &nbsp; &nbsp; ? filstarProduct.image&nbsp;
&nbsp; &nbsp; &nbsp; : `${FILSTAR_BASE_URL}/${filstarProduct.image}`;
&nbsp; &nbsp; desiredOrder.push(imageUrl);
&nbsp; }
&nbsp;&nbsp;
&nbsp; // 2️⃣ Допълнителни снимки
&nbsp; if (filstarProduct.images &amp;&amp; Array.isArray(filstarProduct.images)) {
&nbsp; &nbsp; for (const img of filstarProduct.images) {
&nbsp; &nbsp; &nbsp; const imageUrl = img.startsWith('http') ? img : `${FILSTAR_BASE_URL}/${img}`;
&nbsp; &nbsp; &nbsp; desiredOrder.push(imageUrl);
&nbsp; &nbsp; }
&nbsp; }
&nbsp;&nbsp;
&nbsp; // 3️⃣ Снимки на варианти (шпули)
&nbsp; if (filstarProduct.variants) {
&nbsp; &nbsp; for (const variant of filstarProduct.variants) {
&nbsp; &nbsp; &nbsp; if (variant.image) {
&nbsp; &nbsp; &nbsp; &nbsp; const imageUrl = variant.image.startsWith('http')&nbsp;
&nbsp; &nbsp; &nbsp; &nbsp; &nbsp; ? variant.image&nbsp;
&nbsp; &nbsp; &nbsp; &nbsp; &nbsp; : `${FILSTAR_BASE_URL}/${variant.image}`;
&nbsp; &nbsp; &nbsp; &nbsp; desiredOrder.push(imageUrl);
&nbsp; &nbsp; &nbsp; }
&nbsp; &nbsp; }
&nbsp; }
&nbsp;&nbsp;
&nbsp; // Намери съответните Shopify image IDs
&nbsp; const reorderedImages = [];
&nbsp; for (let i = 0; i &lt; desiredOrder.length; i++) {
&nbsp; &nbsp; const desiredUrl = desiredOrder[i];
&nbsp; &nbsp; const desiredFilename = getImageFilename(desiredUrl);
&nbsp; &nbsp;&nbsp;
&nbsp; &nbsp; const existingImage = existingImages.find(img =&gt; {
&nbsp; &nbsp; &nbsp; const existingFilename = getImageFilename(img.src);
&nbsp; &nbsp; &nbsp; return existingFilename === desiredFilename;
&nbsp; &nbsp; });
&nbsp; &nbsp;&nbsp;
&nbsp; &nbsp; if (existingImage) {
&nbsp; &nbsp; &nbsp; reorderedImages.push({
&nbsp; &nbsp; &nbsp; &nbsp; id: existingImage.id,
&nbsp; &nbsp; &nbsp; &nbsp; position: i + 1
&nbsp; &nbsp; &nbsp; });
&nbsp; &nbsp; &nbsp; console.log(` &nbsp; 📍 Position ${i + 1}: ${desiredFilename}`);
&nbsp; &nbsp; }
&nbsp; }
&nbsp;&nbsp;
&nbsp; // Update позициите
&nbsp; if (reorderedImages.length &gt; 0) {
&nbsp; &nbsp; const response = await fetch(
&nbsp; &nbsp; &nbsp; `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/products/${productId}.json`,
&nbsp; &nbsp; &nbsp; {
&nbsp; &nbsp; &nbsp; &nbsp; method: 'PUT',
&nbsp; &nbsp; &nbsp; &nbsp; headers: {
&nbsp; &nbsp; &nbsp; &nbsp; &nbsp; 'X-Shopify-Access-Token': ACCESS_TOKEN,
&nbsp; &nbsp; &nbsp; &nbsp; &nbsp; 'Content-Type': 'application/json'
&nbsp; &nbsp; &nbsp; &nbsp; },
&nbsp; &nbsp; &nbsp; &nbsp; body: JSON.stringify({
&nbsp; &nbsp; &nbsp; &nbsp; &nbsp; product: {
&nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; id: productId,
&nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; images: reorderedImages
&nbsp; &nbsp; &nbsp; &nbsp; &nbsp; }
&nbsp; &nbsp; &nbsp; &nbsp; })
&nbsp; &nbsp; &nbsp; }
&nbsp; &nbsp; );
&nbsp; &nbsp;&nbsp;
&nbsp; &nbsp; if (response.ok) {
&nbsp; &nbsp; &nbsp; console.log(` &nbsp; ✅ Images reordered successfully`);
&nbsp; &nbsp; &nbsp; return true;
&nbsp; &nbsp; } else {
&nbsp; &nbsp; &nbsp; const error = await response.text();
&nbsp; &nbsp; &nbsp; console.error(` &nbsp; ❌ Failed to reorder:`, error);
&nbsp; &nbsp; &nbsp; return false;
&nbsp; &nbsp; }
&nbsp; }
&nbsp;&nbsp;
&nbsp; return false;
}

async function fetchAllProducts() {
&nbsp; console.log('Fetching all products from Filstar API with pagination...');
&nbsp; let allProducts = [];
&nbsp; let page = 1;
&nbsp; let hasMorePages = true;
&nbsp; try {
&nbsp; &nbsp; while (hasMorePages) {
&nbsp; &nbsp; &nbsp; console.log(`Fetching page ${page}...`);
&nbsp; &nbsp; &nbsp; const response = await fetch(`${FILSTAR_API_BASE}/products?page=${page}&amp;limit=1000`, {
&nbsp; &nbsp; &nbsp; &nbsp; headers: { 'Authorization': `Bearer ${FILSTAR_TOKEN}` }
&nbsp; &nbsp; &nbsp; });
&nbsp; &nbsp; &nbsp; if (!response.ok) {
&nbsp; &nbsp; &nbsp; &nbsp; throw new Error(`Filstar API error: ${response.status}`);
&nbsp; &nbsp; &nbsp; }
&nbsp; &nbsp; &nbsp; const pageProducts = await response.json();
&nbsp; &nbsp; &nbsp; console.log(`Page ${page}: ${pageProducts.length} products`);
&nbsp; &nbsp; &nbsp; if (pageProducts.length === 0) {
&nbsp; &nbsp; &nbsp; &nbsp; console.log('No more products, stopping pagination');
&nbsp; &nbsp; &nbsp; &nbsp; hasMorePages = false;
&nbsp; &nbsp; &nbsp; } else {
&nbsp; &nbsp; &nbsp; &nbsp; allProducts = allProducts.concat(pageProducts);
&nbsp; &nbsp; &nbsp; &nbsp; page++;
&nbsp; &nbsp; &nbsp; }
&nbsp; &nbsp; }
&nbsp; &nbsp; console.log(`\nTotal products fetched: ${allProducts.length}\n`);
&nbsp; &nbsp; return allProducts;
&nbsp; } catch (error) {
&nbsp; &nbsp; console.error('Error fetching products:', error.message);
&nbsp; &nbsp; throw error;
&nbsp; }
}

async function fetchAllFishingLines() {
&nbsp; const allProducts = await fetchAllProducts();
&nbsp; const lines = {
&nbsp; &nbsp; front_drag: [],
&nbsp; &nbsp; rear_drag: [],
&nbsp; &nbsp; baitrunner: [],
&nbsp; &nbsp; multipliers: [],
&nbsp; &nbsp; other: []
&nbsp; };
&nbsp; allProducts.forEach(product =&gt; {
&nbsp; &nbsp; const categoryIds = product.categories?.map(c =&gt; c.id.toString()) || [];
&nbsp; &nbsp; if (categoryIds.some(id =&gt; FILSTAR_REEL_CATEGORY_IDS.front_drag.includes(id))) {
&nbsp; &nbsp; &nbsp; lines.front_drag.push(product);
&nbsp; &nbsp; } else if (categoryIds.some(id =&gt; FILSTAR_REEL_CATEGORY_IDS.rear_drag.includes(id))) {
&nbsp; &nbsp; &nbsp; lines.rear_drag.push(product);
&nbsp; &nbsp; } else if (categoryIds.some(id =&gt; FILSTAR_REEL_CATEGORY_IDS.baitrunner.includes(id))) {
&nbsp; &nbsp; &nbsp; lines.baitrunner.push(product);
&nbsp; &nbsp; } else if (categoryIds.some(id =&gt; FILSTAR_REEL_CATEGORY_IDS.multipliers.includes(id))) {
&nbsp; &nbsp; &nbsp; lines.multipliers.push(product);
&nbsp; &nbsp; } else if (categoryIds.some(id =&gt; FILSTAR_REEL_CATEGORY_IDS.other.includes(id))) {
&nbsp; &nbsp; &nbsp; lines.other.push(product);
&nbsp; &nbsp; }
&nbsp; });
&nbsp; console.log(`\nCategorized fishing lines:`);
&nbsp; console.log(` - front_drag: ${lines.front_drag.length}`);
&nbsp; console.log(` - rear_drag: ${lines.rear_drag.length}`);
&nbsp; console.log(` - baitrunner: ${lines.baitrunner.length}`);
&nbsp; console.log(` - multipliers: ${lines.multipliers.length}`);
&nbsp; console.log(` - other: ${lines.other.length}\n`);
&nbsp; return lines;
}

async function findShopifyProductBySku(sku) {
&nbsp; let allProducts = [];
&nbsp; let pageInfo = null;
&nbsp; let hasNextPage = true;
&nbsp; while (hasNextPage) {
&nbsp; &nbsp; let url = `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/products.json?limit=250`;
&nbsp; &nbsp; if (pageInfo) {
&nbsp; &nbsp; &nbsp; url += `&amp;page_info=${pageInfo}`;
&nbsp; &nbsp; }
&nbsp; &nbsp; const response = await fetch(url, {
&nbsp; &nbsp; &nbsp; method: 'GET',
&nbsp; &nbsp; &nbsp; headers: {
&nbsp; &nbsp; &nbsp; &nbsp; 'X-Shopify-Access-Token': ACCESS_TOKEN,
&nbsp; &nbsp; &nbsp; &nbsp; 'Content-Type': 'application/json'
&nbsp; &nbsp; &nbsp; }
&nbsp; &nbsp; });
&nbsp; &nbsp; if (!response.ok) {
&nbsp; &nbsp; &nbsp; console.error('Failed to fetch Shopify products');
&nbsp; &nbsp; &nbsp; return null;
&nbsp; &nbsp; }
&nbsp; &nbsp; const data = await response.json();
&nbsp; &nbsp; allProducts = allProducts.concat(data.products);
&nbsp; &nbsp; const linkHeader = response.headers.get('Link');
&nbsp; &nbsp; if (linkHeader &amp;&amp; linkHeader.includes('rel=\"next\"')) {
&nbsp; &nbsp; &nbsp; const nextMatch = linkHeader.match(/&lt;[^&gt;]*[?&amp;]page_info=([^&gt;&amp;]+)[^&gt;]*&gt;;\s*rel=\"next\"/);
&nbsp; &nbsp; &nbsp; if (nextMatch) {
&nbsp; &nbsp; &nbsp; &nbsp; pageInfo = nextMatch[1];
&nbsp; &nbsp; &nbsp; } else {
&nbsp; &nbsp; &nbsp; &nbsp; hasNextPage = false;
&nbsp; &nbsp; &nbsp; }
&nbsp; &nbsp; } else {
&nbsp; &nbsp; &nbsp; hasNextPage = false;
&nbsp; &nbsp; }
&nbsp; &nbsp; await new Promise(resolve =&gt; setTimeout(resolve, 300));
&nbsp; }
&nbsp; console.log(` Searched ${allProducts.length} products for SKU: ${sku}`);
&nbsp; for (const product of allProducts) {
&nbsp; &nbsp; const hasVariant = product.variants.some(v =&gt; v.sku === sku);
&nbsp; &nbsp; if (hasVariant) {
&nbsp; &nbsp; &nbsp; return product;
&nbsp; &nbsp; }
&nbsp; }
&nbsp; return null;
}

function formatVariantName(variant, categoryType) {
&nbsp; if (!variant.attributes || variant.attributes.length === 0) {
&nbsp; &nbsp; return variant.model || `SKU: ${variant.sku}`;
&nbsp; }
&nbsp; const attributes = variant.attributes;
&nbsp; const size = attributes.find(a =&gt; a.attribute_name.includes('РАЗМЕР'))?.value;
&nbsp; if (size) {
&nbsp; &nbsp; return `Размер ${size}`;
&nbsp; }
&nbsp; return variant.model || `SKU: ${variant.sku}`;
}

// 🆕 Подобрена функция за добавяне на снимки с правилна подредба
async function addProductImages(productId, filstarProduct) {
&nbsp; console.log(`Adding images to product ${productId}...`);
&nbsp; let uploadedCount = 0;
&nbsp;&nbsp;
&nbsp; const imagesToUpload = [];
&nbsp;&nbsp;
&nbsp; // 1️⃣ Главна снимка (макарата)
&nbsp; if (filstarProduct.image) {
&nbsp; &nbsp; const imageUrl = filstarProduct.image.startsWith('http')&nbsp;
&nbsp; &nbsp; &nbsp; ? filstarProduct.image&nbsp;
&nbsp; &nbsp; &nbsp; : `${FILSTAR_BASE_URL}/${filstarProduct.image}`;
&nbsp; &nbsp; imagesToUpload.push({ src: imageUrl, type: 'main' });
&nbsp; &nbsp; console.log(` 🎯 Main image: ${getImageFilename(imageUrl)}`);
&nbsp; }
&nbsp;&nbsp;
&nbsp; // 2️⃣ Допълнителни снимки
&nbsp; if (filstarProduct.images &amp;&amp; Array.isArray(filstarProduct.images)) {
&nbsp; &nbsp; for (const img of filstarProduct.images) {
&nbsp; &nbsp; &nbsp; const imageUrl = img.startsWith('http') ? img : `${FILSTAR_BASE_URL}/${img}`;
&nbsp; &nbsp; &nbsp; imagesToUpload.push({ src: imageUrl, type: 'additional' });
&nbsp; &nbsp; &nbsp; console.log(` 📸 Additional: ${getImageFilename(imageUrl)}`);
&nbsp; &nbsp; }
&nbsp; }
&nbsp;&nbsp;
&nbsp; // 3️⃣ Снимки на варианти (шпули)
&nbsp; if (filstarProduct.variants) {
&nbsp; &nbsp; for (const variant of filstarProduct.variants) {
&nbsp; &nbsp; &nbsp; if (variant.image) {
&nbsp; &nbsp; &nbsp; &nbsp; const imageUrl = variant.image.startsWith('http')&nbsp;
&nbsp; &nbsp; &nbsp; &nbsp; &nbsp; ? variant.image&nbsp;
&nbsp; &nbsp; &nbsp; &nbsp; &nbsp; : `${FILSTAR_BASE_URL}/${variant.image}`;
&nbsp; &nbsp; &nbsp; &nbsp; imagesToUpload.push({ src: imageUrl, type: 'variant' });
&nbsp; &nbsp; &nbsp; &nbsp; console.log(` 🎨 Variant: ${getImageFilename(imageUrl)}`);
&nbsp; &nbsp; &nbsp; }
&nbsp; &nbsp; }
&nbsp; }
&nbsp;&nbsp;
&nbsp; if (imagesToUpload.length === 0) {
&nbsp; &nbsp; console.log(` ℹ️ No images found`);
&nbsp; &nbsp; return 0;
&nbsp; }
&nbsp;&nbsp;
&nbsp; // Upload в правилния ред
&nbsp; for (let i = 0; i &lt; imagesToUpload.length; i++) {
&nbsp; &nbsp; const imageData = imagesToUpload[i];
&nbsp; &nbsp;&nbsp;
&nbsp; &nbsp; const response = await fetch(
&nbsp; &nbsp; &nbsp; `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/products/${productId}/images.json`,
&nbsp; &nbsp; &nbsp; {
&nbsp; &nbsp; &nbsp; &nbsp; method: 'POST',
&nbsp; &nbsp; &nbsp; &nbsp; headers: {
&nbsp; &nbsp; &nbsp; &nbsp; &nbsp; 'X-Shopify-Access-Token': ACCESS_TOKEN,
&nbsp; &nbsp; &nbsp; &nbsp; &nbsp; 'Content-Type': 'application/json'
&nbsp; &nbsp; &nbsp; &nbsp; },
&nbsp; &nbsp; &nbsp; &nbsp; body: JSON.stringify({&nbsp;
&nbsp; &nbsp; &nbsp; &nbsp; &nbsp; image: {&nbsp;
&nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; src: imageData.src,
&nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; position: i + 1
&nbsp; &nbsp; &nbsp; &nbsp; &nbsp; }&nbsp;
&nbsp; &nbsp; &nbsp; &nbsp; })
&nbsp; &nbsp; &nbsp; }
&nbsp; &nbsp; );
&nbsp; &nbsp;&nbsp;
&nbsp; &nbsp; if (response.ok) {
&nbsp; &nbsp; &nbsp; console.log(` ✓ Position ${i + 1}: ${getImageFilename(imageData.src)}`);
&nbsp; &nbsp; &nbsp; uploadedCount++;
&nbsp; &nbsp; } else {
&nbsp; &nbsp; &nbsp; const error = await response.text();
&nbsp; &nbsp; &nbsp; console.error(` ✗ Failed:`, error);
&nbsp; &nbsp; }
&nbsp; &nbsp;&nbsp;
&nbsp; &nbsp; await new Promise(resolve =&gt; setTimeout(resolve, 500));
&nbsp; }
&nbsp;&nbsp;
&nbsp; return uploadedCount;
}

function ensureUniqueVariantNames(variants, categoryType) {
&nbsp; const formattedVariants = variants.map(v =&gt; ({
&nbsp; &nbsp; original: v,
&nbsp; &nbsp; name: formatVariantName(v, categoryType),
&nbsp; &nbsp; sku: v.sku
&nbsp; }));
&nbsp; const nameCounts = {};
&nbsp; formattedVariants.forEach(v =&gt; {
&nbsp; &nbsp; nameCounts[v.name] = (nameCounts[v.name] || 0) + 1;
&nbsp; });
&nbsp; const hasDuplicates = Object.values(nameCounts).some(count =&gt; count &gt; 1);
&nbsp; if (hasDuplicates) {
&nbsp; &nbsp; console.log(' ⚠️ Duplicates detected - adding SKU to all variant names');
&nbsp; &nbsp; return formattedVariants.map(v =&gt; `SKU ${v.sku}: ${v.name}`);
&nbsp; }
&nbsp; return formattedVariants.map(v =&gt; v.name);
}

async function createShopifyProduct(filstarProduct, category) {
&nbsp; console.log(`\n🆕 Creating new product: ${filstarProduct.name}`);
&nbsp; try {
&nbsp; &nbsp; const vendor = filstarProduct.manufacturer || 'Unknown';
&nbsp; &nbsp; console.log(` 🏷️ Vendor: ${vendor}`);
&nbsp; &nbsp; const variantNames = ensureUniqueVariantNames(filstarProduct.variants, category);
&nbsp; &nbsp; const productData = {
&nbsp; &nbsp; &nbsp; product: {
&nbsp; &nbsp; &nbsp; &nbsp; title: filstarProduct.name,
&nbsp; &nbsp; &nbsp; &nbsp; body_html: filstarProduct.description || '',
&nbsp; &nbsp; &nbsp; &nbsp; vendor: vendor,
&nbsp; &nbsp; &nbsp; &nbsp; product_type: getCategoryName(category),
&nbsp; &nbsp; &nbsp; &nbsp; tags: ['Filstar', category, vendor],
&nbsp; &nbsp; &nbsp; &nbsp; status: 'active',
&nbsp; &nbsp; &nbsp; &nbsp; variants: filstarProduct.variants.map((variant, index) =&gt; ({
&nbsp; &nbsp; &nbsp; &nbsp; &nbsp; sku: variant.sku,
&nbsp; &nbsp; &nbsp; &nbsp; &nbsp; price: variant.price,
&nbsp; &nbsp; &nbsp; &nbsp; &nbsp; inventory_quantity: parseInt(variant.quantity) || 0,
&nbsp; &nbsp; &nbsp; &nbsp; &nbsp; inventory_management: 'shopify',
&nbsp; &nbsp; &nbsp; &nbsp; &nbsp; option1: variantNames[index],
&nbsp; &nbsp; &nbsp; &nbsp; &nbsp; barcode: variant.barcode || null,
&nbsp; &nbsp; &nbsp; &nbsp; &nbsp; weight: parseFloat(variant.weight) || 0,
&nbsp; &nbsp; &nbsp; &nbsp; &nbsp; weight_unit: 'kg'
&nbsp; &nbsp; &nbsp; &nbsp; })),
&nbsp; &nbsp; &nbsp; &nbsp; options: [
&nbsp; &nbsp; &nbsp; &nbsp; &nbsp; { name: 'Вариант', values: variantNames }
&nbsp; &nbsp; &nbsp; &nbsp; ]
&nbsp; &nbsp; &nbsp; }
&nbsp; &nbsp; };
&nbsp; &nbsp; const response = await fetch(
&nbsp; &nbsp; &nbsp; `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/products.json`,
&nbsp; &nbsp; &nbsp; {
&nbsp; &nbsp; &nbsp; &nbsp; method: 'POST',
&nbsp; &nbsp; &nbsp; &nbsp; headers: {
&nbsp; &nbsp; &nbsp; &nbsp; &nbsp; 'X-Shopify-Access-Token': ACCESS_TOKEN,
&nbsp; &nbsp; &nbsp; &nbsp; &nbsp; 'Content-Type': 'application/json'
&nbsp; &nbsp; &nbsp; &nbsp; },
&nbsp; &nbsp; &nbsp; &nbsp; body: JSON.stringify(productData)
&nbsp; &nbsp; &nbsp; }
&nbsp; &nbsp; );
&nbsp; &nbsp; if (!response.ok) {
&nbsp; &nbsp; &nbsp; const errorText = await response.text();
&nbsp; &nbsp; &nbsp; throw new Error(`Failed to create product: ${response.status} - ${errorText}`);
&nbsp; &nbsp; }
&nbsp; &nbsp; const result = await response.json();
&nbsp; &nbsp; const productId = result.product.id;
&nbsp; &nbsp; console.log(` ✅ Product created with ID: ${productId}`);
&nbsp; &nbsp; console.log(` 📦 Created ${filstarProduct.variants.length} variants`);
&nbsp; &nbsp; const uploadedImages = await addProductImages(productId, filstarProduct);
&nbsp; &nbsp; await addProductToCollection(productId, category);
&nbsp; &nbsp; stats[category].created++;
&nbsp; &nbsp; stats[category].images += uploadedImages;
&nbsp; &nbsp; return result.product;
&nbsp; } catch (error) {
&nbsp; &nbsp; console.error(` ❌ Error creating product:`, error.message);
&nbsp; &nbsp; throw error;
&nbsp; }
}

async function addProductToCollection(productId, category) {
&nbsp; const collectionId = COLLECTION_MAPPING[category];
&nbsp; if (!collectionId) {
&nbsp; &nbsp; console.log(` ⚠️ No collection mapping for category: ${category}`);
&nbsp; &nbsp; return;
&nbsp; }
&nbsp; try {
&nbsp; &nbsp; const numericCollectionId = collectionId.split('/').pop();
&nbsp; &nbsp; const response = await fetch(
&nbsp; &nbsp; &nbsp; `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/collects.json`,
&nbsp; &nbsp; &nbsp; {
&nbsp; &nbsp; &nbsp; &nbsp; method: 'POST',
&nbsp; &nbsp; &nbsp; &nbsp; headers: {
&nbsp; &nbsp; &nbsp; &nbsp; &nbsp; 'X-Shopify-Access-Token': ACCESS_TOKEN,
&nbsp; &nbsp; &nbsp; &nbsp; &nbsp; 'Content-Type': 'application/json'
&nbsp; &nbsp; &nbsp; &nbsp; },
&nbsp; &nbsp; &nbsp; &nbsp; body: JSON.stringify({
&nbsp; &nbsp; &nbsp; &nbsp; &nbsp; collect: {
&nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; product_id: productId,
&nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; collection_id: numericCollectionId
&nbsp; &nbsp; &nbsp; &nbsp; &nbsp; }
&nbsp; &nbsp; &nbsp; &nbsp; })
&nbsp; &nbsp; &nbsp; }
&nbsp; &nbsp; );
&nbsp; &nbsp; if (response.ok) {
&nbsp; &nbsp; &nbsp; console.log(` ✅ Added to collection: ${getCategoryName(category)}`);
&nbsp; &nbsp; }
&nbsp; } catch (error) {
&nbsp; &nbsp; console.error(` ⚠️ Error adding to collection:`, error.message);
&nbsp; }
}

async function uploadProductImage(productId, imageUrl, existingImages) {
&nbsp; if (imageExists(existingImages, imageUrl)) {
&nbsp; &nbsp; console.log(` &nbsp;⏭️ &nbsp;Image already exists, skipping: ${getImageFilename(imageUrl)}`);
&nbsp; &nbsp; return false;
&nbsp; }
&nbsp; console.log(` 📸 Uploading new image: ${getImageFilename(imageUrl)}`);
&nbsp; const response = await fetch(
&nbsp; &nbsp; `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/products/${productId}/images.json`,
&nbsp; &nbsp; {
&nbsp; &nbsp; &nbsp; method: 'POST',
&nbsp; &nbsp; &nbsp; headers: {
&nbsp; &nbsp; &nbsp; &nbsp; 'X-Shopify-Access-Token': ACCESS_TOKEN,
&nbsp; &nbsp; &nbsp; &nbsp; 'Content-Type': 'application/json'
&nbsp; &nbsp; &nbsp; },
&nbsp; &nbsp; &nbsp; body: JSON.stringify({ image: { src: imageUrl } })
&nbsp; &nbsp; }
&nbsp; );
&nbsp; if (!response.ok) {
&nbsp; &nbsp; const error = await response.text();
&nbsp; &nbsp; console.error(` ✗ Failed to upload image:`, error);
&nbsp; &nbsp; return false;
&nbsp; }
&nbsp; console.log(` ✓ Image uploaded successfully`);
&nbsp; await new Promise(resolve =&gt; setTimeout(resolve, 300));
&nbsp; return true;
}

// 🆕 Подобрена функция за update с пренареждане
async function updateProduct(shopifyProduct, filstarProduct, categoryType) {
&nbsp; let imagesUploaded = 0;
&nbsp; let imagesSkipped = 0;
&nbsp;&nbsp;
&nbsp; console.log(`\n🔄 Updating product: ${shopifyProduct.title}`);
&nbsp; const productId = shopifyProduct.id;
&nbsp;&nbsp;
&nbsp; // Upload нови снимки (ако има)
&nbsp; const allImages = [];
&nbsp;&nbsp;
&nbsp; if (filstarProduct.image) {
&nbsp; &nbsp; const imageUrl = filstarProduct.image.startsWith('http')&nbsp;
&nbsp; &nbsp; &nbsp; ? filstarProduct.image&nbsp;
&nbsp; &nbsp; &nbsp; : `${FILSTAR_BASE_URL}/${filstarProduct.image}`;
&nbsp; &nbsp; allImages.push(imageUrl);
&nbsp; }
&nbsp;&nbsp;
&nbsp; if (filstarProduct.images &amp;&amp; Array.isArray(filstarProduct.images)) {
&nbsp; &nbsp; for (const img of filstarProduct.images) {
&nbsp; &nbsp; &nbsp; const imageUrl = img.startsWith('http') ? img : `${FILSTAR_BASE_URL}/${img}`;
&nbsp; &nbsp; &nbsp; allImages.push(imageUrl);
&nbsp; &nbsp; }
&nbsp; }
&nbsp;&nbsp;
&nbsp; if (filstarProduct.variants) {
&nbsp; &nbsp; for (const variant of filstarProduct.variants) {
&nbsp; &nbsp; &nbsp; if (variant.image) {
&nbsp; &nbsp; &nbsp; &nbsp; const imageUrl = variant.image.startsWith('http')&nbsp;
&nbsp; &nbsp; &nbsp; &nbsp; &nbsp; ? variant.image&nbsp;
&nbsp; &nbsp; &nbsp; &nbsp; &nbsp; : `${FILSTAR_BASE_URL}/${variant.image}`;
&nbsp; &nbsp; &nbsp; &nbsp; allImages.push(imageUrl);
&nbsp; &nbsp; &nbsp; }
&nbsp; &nbsp; }
&nbsp; }
&nbsp;&nbsp;
&nbsp; if (allImages.length &gt; 0) {
&nbsp; &nbsp; console.log(`Processing ${allImages.length} images from Filstar...`);
&nbsp; &nbsp; for (const imageUrl of allImages) {
&nbsp; &nbsp; &nbsp; const uploaded = await uploadProductImage(productId, imageUrl, shopifyProduct.images);
&nbsp; &nbsp; &nbsp; if (uploaded) {
&nbsp; &nbsp; &nbsp; &nbsp; imagesUploaded++;
&nbsp; &nbsp; &nbsp; &nbsp; shopifyProduct.images.push({ src: imageUrl, id: null });
&nbsp; &nbsp; &nbsp; } else {
&nbsp; &nbsp; &nbsp; &nbsp; imagesSkipped++;
&nbsp; &nbsp; &nbsp; }
&nbsp; &nbsp; }
&nbsp; }
&nbsp;&nbsp;
&nbsp; // 🆕 Пренареди снимките в правилния ред
&nbsp; await reorderProductImages(productId, filstarProduct, shopifyProduct.images);
&nbsp;&nbsp;
&nbsp; stats[categoryType].updated++;
&nbsp; stats[categoryType].images += imagesUploaded;
&nbsp;&nbsp;
&nbsp; console.log(` ✅ Updated | Images: ${imagesUploaded} new, ${imagesSkipped} skipped`);
}

async function processProduct(filstarProduct, category) {
&nbsp; const firstVariantSku = filstarProduct.variants?.[0]?.sku;
&nbsp; if (!firstVariantSku) {
&nbsp; &nbsp; console.log(` ⚠️ No SKU found, skipping: ${filstarProduct.name}`);
&nbsp; &nbsp; return;
&nbsp; }
&nbsp; console.log(`\nProcessing: ${filstarProduct.name}`);
&nbsp; console.log(` Searching for SKU: ${firstVariantSku}...`);
&nbsp; const existingProduct = await findShopifyProductBySku(firstVariantSku);
&nbsp; if (existingProduct) {
&nbsp; &nbsp; console.log(` ✓ Found existing product (ID: ${existingProduct.id})`);
&nbsp; &nbsp; await updateProduct(existingProduct, filstarProduct, category);
&nbsp; } else {
&nbsp; &nbsp; console.log(` ℹ️ Product not found in Shopify`);
&nbsp; &nbsp; await createShopifyProduct(filstarProduct, category);
&nbsp; }
}

function getCategoryName(category) {
&nbsp; const names = {
&nbsp; &nbsp; front_drag: 'Макари с преден аванс',
&nbsp; &nbsp; rear_drag: 'Макари с заден аванс',
&nbsp; &nbsp; baitrunner: 'Байтрънър',
&nbsp; &nbsp; multipliers: 'Мултиплокатори',
&nbsp; &nbsp; other: 'Други'
&nbsp; };
&nbsp; return names[category] || category;
}

function printFinalStats() {
&nbsp; console.log('\n' + '='.repeat(70));
&nbsp; console.log('📊 IMPORT SUMMARY');
&nbsp; console.log('='.repeat(70));
&nbsp; let totalCreated = 0;
&nbsp; let totalUpdated = 0;
&nbsp; let totalImages = 0;
&nbsp; for (const [category, data] of Object.entries(stats)) {
&nbsp; &nbsp; if (data.created === 0 &amp;&amp; data.updated === 0) continue;
&nbsp; &nbsp; console.log(`\n${getCategoryName(category)}:`);
&nbsp; &nbsp; console.log(` ✨ Created: ${data.created} products`);
&nbsp; &nbsp; console.log(` 🔄 Updated: ${data.updated} products`);
&nbsp; &nbsp; console.log(` 🖼️ Images: ${data.images} uploaded`);
&nbsp; &nbsp; totalCreated += data.created;
&nbsp; &nbsp; totalUpdated += data.updated;
&nbsp; &nbsp; totalImages += data.images;
&nbsp; }
&nbsp; console.log('\n' + '-'.repeat(70));
&nbsp; console.log(`TOTAL: ${totalCreated} created | ${totalUpdated} updated | ${totalImages} images`);
&nbsp; console.log('='.repeat(70) + '\n');
}

async function main() {
&nbsp; console.log('Starting import...\n');
&nbsp; const categorizedReels = await fetchAllFishingLines();
&nbsp; const allReels = [
&nbsp; &nbsp; ...(categorizedReels.front_drag || []),
&nbsp; &nbsp; ...(categorizedReels.rear_drag || []),
&nbsp; &nbsp; ...(categorizedReels.baitrunner || []),
&nbsp; &nbsp; ...(categorizedReels.multipliers || []),
&nbsp; &nbsp; ...(categorizedReels.other || [])
&nbsp; ];
&nbsp; console.log(`\n📊 Found ${allReels.length} fishing reels total\n`);
&nbsp; for (const reel of allReels) {
&nbsp; &nbsp; const categoryType = getCategoryName(reel) || 'other';
&nbsp; &nbsp; await processProduct(reel, categoryType);
&nbsp; }
&nbsp; printFinalStats();
}

main();
