const fetch = require('node-fetch');
const sharp = require('sharp');
const fs = require('fs').promises;
const path = require('path');
const FormData = require('form-data');

const SHOPIFY_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const FILSTAR_TOKEN = process.env.FILSTAR_API_TOKEN;
const API_VERSION = '2025-01';
const FILSTAR_API_BASE = 'https://filstar.com/api';
const FILSTAR_BASE_URL = 'https://filstar.com';
const LOCATION_ID = 'gid://shopify/Location/109713850750';

// САМО ЕДНА КАТЕГОРИЯ
const CAMPING_CATEGORY_ID = '48'; // Сложи тук ID-то на Къмпинг от Filstar
const CAMPING_COLLECTION_ID = 'gid://shopify/Collection/YOUR_ID_HERE';

const stats = {
    camping: { created: 0, updated: 0, images: 0, errors: 0 }
};

let cachedCategoryNames = ['КЪМПИНГ'];

// --- ПОМОЩНИ ФУНКЦИИ ---

function getImageFilename(src) {
    if (!src || typeof src !== 'string') return null;
    const filename = src.split('/').pop().split('?')[0];
    const uuidPattern = /_[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i;
    let clean = filename.replace(uuidPattern, '');
    const parts = clean.split('_');
    const cleanParts = parts.filter(part => {
        const p = part.split('.')[0];
        return !(p.length >= 32 && /^[a-f0-9]+$/i.test(p));
    });
    return cleanParts.join('_').replace(/^_+/, '');
}

async function normalizeImage(imageUrl, sku) {
    try {
        const response = await fetch(imageUrl);
        if (!response.ok) return null;
        const buffer = await response.buffer();
        return await sharp(buffer)
            .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 90 })
            .toBuffer();
    } catch (e) { return null; }
}

async function uploadImageToShopify(imageBuffer, filename) {
    try {
        const mutation = `mutation { stagedUploadsCreate(input: [{ resource: IMAGE, filename: "${filename}", mimeType: "image/jpeg", httpMethod: POST }]) { stagedTargets { url resourceUrl parameters { name value } } } }`;
        const res = await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/graphql.json`, {
            method: 'POST',
            headers: { 'X-Shopify-Access-Token': ACCESS_TOKEN, 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: mutation })
        });
        const data = await res.json();
        const target = data.data.stagedUploadsCreate.stagedTargets[0];
        const formData = new FormData();
        target.parameters.forEach(p => formData.append(p.name, p.value));
        formData.append('file', imageBuffer, { filename });
        await fetch(target.url, { method: 'POST', body: formData });
        return target.resourceUrl;
    } catch (e) { return null; }
}

// --- ОСНОВНА ЛОГИКА ЗА СЪЗДАВАНЕ ---

async function createShopifyProduct(filstarProduct) {
    try {
        console.log(`\n📦 Creating: ${filstarProduct.name}`);
        
        const productData = {
            product: {
                title: filstarProduct.name,
                body_html: filstarProduct.description || '',
                vendor: filstarProduct.manufacturer || 'Unknown',
                product_type: "Къмпинг",
                status: 'active',
                variants: filstarProduct.variants.map(v => ({
                    price: v.price?.toString(),
                    sku: v.sku,
                    inventory_quantity: parseInt(v.quantity),
                    inventory_management: 'shopify',
                    option1: v.sku // За по-сигурно при първи импорт
                })),
                options: [{ name: 'Вариант' }]
            }
        };

        const res = await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/products.json`, {
            method: 'POST',
            headers: { 'X-Shopify-Access-Token': ACCESS_TOKEN, 'Content-Type': 'application/json' },
            body: JSON.stringify(productData)
        });

        const result = await res.json();
        const productGid = `gid://shopify/Product/${result.product.id}`;
        stats.camping.created++;

        // Добавяне в колекция
        await addProductToCollection(productGid, CAMPING_COLLECTION_ID);

        // Снимки
        const imageMapping = new Map();
        if (filstarProduct.images) {
            for (let i = 0; i < filstarProduct.images.length; i++) {
                const imageUrl = filstarProduct.images[i].startsWith('http') ? filstarProduct.images[i] : `${FILSTAR_BASE_URL}/${filstarProduct.images[i]}`;
                const cleanName = getImageFilename(imageUrl);
                const buffer = await normalizeImage(imageUrl, filstarProduct.variants[0].sku);
                const resourceUrl = await uploadImageToShopify(buffer, cleanName);

                if (resourceUrl) {
                    const attachMutation = `mutation { productCreateMedia(productId: "${productGid}", media: {originalSource: "${resourceUrl}", mediaContentType: IMAGE}) { media { ... on MediaImage { id } } } }`;
                    const attachRes = await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/graphql.json`, {
                        method: 'POST', headers: { 'X-Shopify-Access-Token': ACCESS_TOKEN, 'Content-Type': 'application/json' },
                        body: JSON.stringify({ query: attachMutation })
                    });
                    const attachData = await attachRes.json();
                    const mediaId = attachData.data?.productCreateMedia?.media?.[0]?.id;
                    if (mediaId) {
                        imageMapping.set(cleanName, mediaId);
                        stats.camping.images++;
                    }
                }
            }
        }

        return productGid;
    } catch (error) {
        console.error(`  ❌ Error: ${error.message}`);
        stats.camping.errors++;
        return null;
    }
}

// --- ПУСКАНЕ ---

async function main() {
    console.log('🚀 Starting Filstar CAMPING Import\n');
    try {
        const allProducts = await fetchAllProducts();
        
        // Филтрираме само за Къмпинг
        const campingProducts = allProducts.filter(p => 
            p.categories?.some(c => c.id.toString() === CAMPING_CATEGORY_ID)
        );

        console.log(`🎯 Found ${campingProducts.length} camping products\n`);
        
        for (const product of campingProducts) {
            const firstSku = product.variants[0].sku;
            const existingProduct = await findProductBySku(firstSku);
            
            if (existingProduct) {
                await updateShopifyProduct(existingProduct, product, 'camping');
            } else {
                await createShopifyProduct(product);
            }
            await new Promise(r => setTimeout(r, 1000));
        }
        
        console.log(`\n📊 FINAL STATS: Created: ${stats.camping.created}, Updated: ${stats.camping.updated}`);
    } catch (e) { console.error(e); }
}

// Твоите функции addProductToCollection, findProductBySku, fetchAllProducts, updateShopifyProduct...
main();
