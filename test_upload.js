const FormData = require('form-data');
const fetch = require('node-fetch');

const SHOPIFY_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const API_VERSION = '2025-01';

const TARGET_SKU = "963810";
const IMAGE_URL = "https://filstar.com/media/cache/product_view_default/images/963811.jpg";
const FILENAME = "963810.jpg";

async function run() {
    try {
        console.log(`1. 📦 Създаване на нов тестов продукт...`);
        // Опростена мутация за версия 2025-01
        const productMutation = `mutation {
            productCreate(input: { title: "Test Product ${TARGET_SKU}" }) {
                product { id }
                userErrors { field message }
            }
        }`;

        const pRes = await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/graphql.json`, {
            method: 'POST',
            headers: { 'X-Shopify-Access-Token': ACCESS_TOKEN, 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: productMutation })
        });

        const pData = await pRes.json();
        
        if (pData.errors) {
            console.log("❌ API Error:", JSON.stringify(pData.errors, null, 2));
            return;
        }

        const productId = pData.data?.productCreate?.product?.id;
        if (!productId) {
            console.log("❌ User Errors:", pData.data?.productCreate?.userErrors);
            return;
        }
        console.log(`✅ Продукт създаден: ${productId}`);

        const imgRes = await fetch(IMAGE_URL);
        const buffer = Buffer.from(await imgRes.arrayBuffer());

        console.log(`2. 🔍 Изискване на URL за: ${FILENAME}`);
        const stagedMutation = `mutation { stagedUploadsCreate(input: [{ resource: IMAGE, filename: "${FILENAME}", mimeType: "image/jpeg", httpMethod: POST }]) { stagedTargets { url resourceUrl parameters { name value } } } }`;

        const sRes = await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/graphql.json`, {
            method: 'POST',
            headers: { 'X-Shopify-Access-Token': ACCESS_TOKEN, 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: stagedMutation })
        });

        const sData = await sRes.json();
        const target = sData.data.stagedUploadsCreate.stagedTargets[0];
        
        const keyParam = target.parameters.find(p => p.name === 'key');
        console.log(`📂 Reserved Path (Key): ${keyParam.value}`);

        const formData = new FormData();
        target.parameters.forEach(p => formData.append(p.name, p.value));
        formData.append('file', buffer, { filename: FILENAME, contentType: 'image/jpeg' });

        const upRes = await fetch(target.url, { method: 'POST', body: formData, headers: formData.getHeaders() });
        
        if (upRes.ok) {
            console.log(`3. 🔗 Регистриране на медия...`);
            const regMutation = `mutation { productCreateMedia(productId: "${productId}", media: [{ originalSource: "${target.resourceUrl}", mediaContentType: IMAGE, alt: "Test" }]) { media { id } userErrors { message } } }`;
            const regRes = await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/graphql.json`, {
                method: 'POST',
                headers: { 'X-Shopify-Access-Token': ACCESS_TOKEN, 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: regMutation })
            });
            const regData = await regRes.json();
            console.log("\n✨ ГОТОВО. Виж продукта в админа.");
        }
    } catch (err) {
        console.error("💥 Грешка:", err.message);
    }
}

run();
