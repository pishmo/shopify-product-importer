const FormData = require('form-data');
const fetch = require('node-fetch');

// Константите идват директно от средата (env)
const SHOPIFY_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const API_VERSION = '2025-01';

const PRODUCT_ID = process.env.TEST_PRODUCT_ID;
const IMAGE_URL = process.env.TEST_IMAGE_URL;
const FILENAME = process.env.TEST_FILENAME;

async function uploadImageToShopify(imageBuffer, filename) {
    try {
        console.log(`\n1. 🔍 Изискване на URL за: ${filename}`);
        const mutation = `mutation { stagedUploadsCreate(input: [{ resource: IMAGE, filename: "${filename}", mimeType: "image/jpeg", httpMethod: POST }]) { stagedTargets { url resourceUrl parameters { name value } } } }`;

        const res = await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/graphql.json`, {
            method: 'POST',
            headers: { 'X-Shopify-Access-Token': ACCESS_TOKEN, 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: mutation })
        });

        const data = await res.json();
        const target = data.data.stagedUploadsCreate.stagedTargets[0];

        // ДИАГНОСТИКА - Виж какво пише тук в лога на GitHub
        const keyParam = target.parameters.find(p => p.name === 'key');
        console.log(`📂 Reserved Path (Key): ${keyParam ? keyParam.value : 'N/A'}`);

        const formData = new FormData();
        target.parameters.forEach(p => formData.append(p.name, p.value));
        formData.append('file', imageBuffer, { filename, contentType: 'image/jpeg' });

        console.log(`2. 📤 Качване към Google Storage...`);
        const upRes = await fetch(target.url, { method: 'POST', body: formData, headers: formData.getHeaders() });
        if (!upRes.ok) throw new Error(await upRes.text());

        return target.resourceUrl;
    } catch (error) {
        console.error(`❌ Грешка при качване: ${error.message}`);
        return null;
    }
}

async function runTest() {
    try {
        console.log(`🚀 Старт на тест за продукт: ${PRODUCT_ID}`);
        const res = await fetch(IMAGE_URL);
        const buffer = Buffer.from(await res.arrayBuffer());

        const resourceUrl = await uploadImageToShopify(buffer, FILENAME);

        if (resourceUrl) {
            console.log(`3. 🔗 Регистриране към продукта...`);
            const regMutation = `mutation { productCreateMedia(productId: "${PRODUCT_ID}", media: [{ originalSource: "${resourceUrl}", mediaContentType: IMAGE, alt: "Test" }]) { media { id } userErrors { message } } }`;
            const regRes = await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/graphql.json`, {
                method: 'POST',
                headers: { 'X-Shopify-Access-Token': ACCESS_TOKEN, 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: regMutation })
            });
            const regData = await regRes.json();
            const errors = regData.data?.productCreateMedia?.userErrors || [];
            
            if (errors.length > 0) console.log("❌ Грешки:", errors);
            else console.log("\n✨ ГОТОВО. Провери името в Shopify Admin.");
        }
    } catch (err) {
        console.error("💥 Критична грешка:", err);
    }
}

runTest();
