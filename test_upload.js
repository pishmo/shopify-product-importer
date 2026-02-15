const FormData = require('form-data');
const fetch = require('node-fetch');

const SHOPIFY_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const API_VERSION = '2025-01';

// Данни за теста
const TARGET_SKU = "963810";
const IMAGE_URL = "https://filstar.com/media/cache/product_view_default/images/963811.jpg";
const FILENAME = "963810.jpg";

async function createTestProduct(sku) {
    console.log(`1. 📦 Създаване на нов тестов продукт със SKU: ${sku}...`);
    const mutation = `mutation {
        productCreate(input: { title: "Test Product ${sku}", variants: [{ sku: "${sku}" }] }) {
            product { id }
            userErrors { field message }
        }
    }`;

    const res = await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/graphql.json`, {
        method: 'POST',
        headers: { 'X-Shopify-Access-Token': ACCESS_TOKEN, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: mutation })
    });
    const data = await res.json();
    if (data.data.productCreate.userErrors.length > 0) {
        throw new Error(data.data.productCreate.userErrors[0].message);
    }
    return data.data.productCreate.product.id;
}

async function uploadImage(imageBuffer, filename) {
    console.log(`2. 🔍 Изискване на URL за: ${filename}`);
    const mutation = `mutation { stagedUploadsCreate(input: [{ resource: IMAGE, filename: "${filename}", mimeType: "image/jpeg", httpMethod: POST }]) { stagedTargets { url resourceUrl parameters { name value } } } }`;

    const res = await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/graphql.json`, {
        method: 'POST',
        headers: { 'X-Shopify-Access-Token': ACCESS_TOKEN, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: mutation })
    });

    const data = await res.json();
    const target = data.data.stagedUploadsCreate.stagedTargets[0];
    
    // ЛОГ ЗА ПРОВЕРКА
    const keyParam = target.parameters.find(p => p.name === 'key');
    console.log(`📂 Reserved Path (Key): ${keyParam.value}`);

    const formData = new FormData();
    target.parameters.forEach(p => formData.append(p.name, p.value));
    formData.append('file', imageBuffer, { filename, contentType: 'image/jpeg' });

    const upRes = await fetch(target.url, { method: 'POST', body: formData, headers: formData.getHeaders() });
    if (!upRes.ok) throw new Error("Upload failed");

    return target.resourceUrl;
}

async function run() {
    try {
        const productId = await createTestProduct(TARGET_SKU);
        console.log(`✅ Продукт създаден: ${productId}`);

        const imgRes = await fetch(IMAGE_URL);
        const buffer = Buffer.from(await imgRes.arrayBuffer());

        const resourceUrl = await uploadImage(buffer, FILENAME);

        if (resourceUrl) {
            console.log(`3. 🔗 Регистриране на медия...`);
            const regMutation = `mutation { productCreateMedia(productId: "${productId}", media: [{ originalSource: "${resourceUrl}", mediaContentType: IMAGE, alt: "Test" }]) { media { id } userErrors { message } } }`;
            const regRes = await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/graphql.json`, {
                method: 'POST',
                headers: { 'X-Shopify-Access-Token': ACCESS_TOKEN, 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: regMutation })
            });
            const regData = await regRes.json();
            console.log("\n✨ ГОТОВО. Виж продукта 'Test Product 963810' в админа.");
        }
    } catch (err) {
        console.error("💥 Грешка:", err.message);
    }
}

run();
