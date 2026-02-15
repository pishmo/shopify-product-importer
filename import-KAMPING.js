const FILSTAR_BASE_URL = 'https://filstar.com';
const SHOPIFY_DOMAIN = 'your-shop.myshopify.com';
const ACCESS_TOKEN = 'shpat_your_token';
const API_VERSION = '2024-01';

// 📊 СТАТИСТИКА
const stats = {
    kamping: { created: 0, updated: 0, images: 0, errors: 0 }
};

// 🛠️ ПОМОЩНИ ФУНКЦИИ
function getImageFilename(src) {
    if (!src || typeof src !== 'string') return null;
    const filename = src.split('/').pop().split('?')[0];
    const uuidPattern = /_[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i;
    let clean = filename.replace(uuidPattern, '');
    const parts = clean.split('_');
    const cleanParts = parts.filter(part => {
        const p = part.split('.')[0];
        return !(p.length >= 32 && /^[a-f0-9]+$/i.test(p));
    });
    // Връщаме името + оригиналното разширение
    return cleanParts.join('_').replace(/^_+/, '');
}

// 📦 СЪЗДАВАНЕ НА НОВ ПРОДУКТ (CREATE)
async function createShopifyProduct(filstarProduct, categoryType) {
    try {
        console.log(`\n📦 Creating: ${filstarProduct.name}`);
        
        const productData = {
            product: {
                title: filstarProduct.name,
                body_html: filstarProduct.description || '',
                vendor: filstarProduct.manufacturer || 'Unknown',
                product_type: "Camping",
                status: 'active',
                variants: filstarProduct.variants.map(v => ({
                    price: v.price?.toString(),
                    sku: v.sku,
                    inventory_quantity: parseInt(v.quantity),
                    inventory_management: 'shopify',
                    option1: v.name || v.sku
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
        if (!result.product) throw new Error(`Shopify Error: ${JSON.stringify(result)}`);
        
        const productGid = `gid://shopify/Product/${result.product.id}`;
        const shopifyVariants = result.product.variants;
        stats.kamping.created++;

        // СНИМКИ
        const imageMapping = new Map();
        if (filstarProduct.images) {
            for (let i = 0; i < filstarProduct.images.length; i++) {
                const imageUrl = filstarProduct.images[i];
                const cleanName = getImageFilename(imageUrl);
                const finalName = i === 0 ? cleanName : cleanName.replace('.', `-${i}.`);

                const normalizedBuffer = await normalizeImage(imageUrl, filstarProduct.variants[0].sku);
                const resourceUrl = await uploadImageToShopify(normalizedBuffer, finalName);

                if (resourceUrl) {
                    const attachMutation = `mutation { productCreateMedia(productId: "${productGid}", media: {originalSource: "${resourceUrl}", mediaContentType: IMAGE}) { media { ... on MediaImage { id } } } }`;
                    const attachRes = await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/graphql.json`, {
                        method: 'POST',
                        headers: { 'X-Shopify-Access-Token': ACCESS_TOKEN, 'Content-Type': 'application/json' },
                        body: JSON.stringify({ query: attachMutation })
                    });
                    const attachData = await attachRes.json();
                    const mediaId = attachData.data?.productCreateMedia?.media?.[0]?.id;
                    if (mediaId) {
                        console.log(`    ✓ Uploaded: ${finalName}`);
                        imageMapping.set(cleanName, mediaId);
                        stats.kamping.images++;
                    }
                }
            }
        }

        // ВАРИАНТИ
        for (const variant of filstarProduct.variants) {
            const shopifyVar = shopifyVariants.find(sv => sv.sku === variant.sku);
            if (shopifyVar && variant.images?.[0]) {
                const varImgName = getImageFilename(variant.images[0]);
                const mediaId = imageMapping.get(varImgName);
                if (mediaId) {
                    const assignMutation = `mutation { variantUpdate(input: { id: "gid://shopify/ProductVariant/${shopifyVar.id}", mediaId: "${mediaId}" }) { variant { id } } }`;
                    await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/graphql.json`, {
                        method: 'POST',
                        headers: { 'X-Shopify-Access-Token': ACCESS_TOKEN, 'Content-Type': 'application/json' },
                        body: JSON.stringify({ query: assignMutation })
                    });
                    console.log(`    ✅ Assigned: ${variant.sku} -> ${varImgName}`);
                }
            }
        }

        // ПОДРЕДБА (REORDER)
        const imgDataRes = await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/graphql.json`, {
            method: 'POST',
            headers: { 'X-Shopify-Access-Token': ACCESS_TOKEN, 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: `{ product(id: "${productGid}") { images(first: 20) { edges { node { id src } } } } }` })
        });
        const imgData = await imgDataRes.json();
        const allImages = imgData.data?.product?.images?.edges || [];
        if (allImages.length > 0) {
            await reorderProductImages(productGid, allImages);
            console.log(`  🔄 Reordered ${allImages.length} images.`);
        }

        return productGid;
    } catch (error) {
        console.error(`  ❌ Create Error: ${error.message}`);
        stats.kamping.errors++;
        return null;
    }
}

// 🔄 ОБНОВЯВАНЕ (UPDATE)
async function updateShopifyProduct(shopifyProductId, filstarProduct, categoryType) {
    try {
        const productGid = `gid://shopify/Product/${shopifyProductId}`;
        console.log(`\n🔄 Updating: ${filstarProduct.name} (${productGid})`);

        // Тук добавяш логиката за обновяване на цени/наличности
        // ... (твоят код за update) ...

        stats.kamping.updated++;
        return productGid;
    } catch (error) {
        console.error(`  ❌ Update Error: ${error.message}`);
        stats.kamping.errors++;
        return null;
    }
}

// 🏁 ФИНАЛ
function printFinalStats() {
    console.log(`\n${'='.repeat(30)}`);
    console.log('📊 FINAL STATISTICS');
    console.log(`✅ Created: ${stats.kamping.created}`);
    console.log(`🔄 Updated: ${stats.kamping.updated}`);
    console.log(`🖼️  Images:  ${stats.kamping.images}`);
    console.log(`❌ Errors:  ${stats.kamping.errors}`);
    console.log(`${'='.repeat(30)}\n`);
}
