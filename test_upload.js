const FormData = require('form-data');
const fetch = require('node-fetch');

const SHOPIFY_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const API_VERSION = '2025-01';

const TARGET_SKU = "963810";
// Твоят нов директен линк
const IMAGE_URL = "https://filstar.com/media/cache/product_view_default/images/963811-jpg_b54b0d75fc055cea5f9bf8c7c33961a5.jpeg"; 
const FILENAME = "963810.jpg";

async function run() {
    try {
        console.log(`1. 📦 Създаване на продукт...`);
        const pMutation = `mutation { productCreate(input: { title: "Test Final Name ${TARGET_SKU}" }) { product { id } } }`;
        const pRes = await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/graphql.json`, {
            method: 'POST',
            headers: { 'X-Shopify-Access-Token': ACCESS_TOKEN, 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: pMutation })
        });
        const pData = await pRes.json();
        const productId = pData.data?.productCreate?.product?.id;

        console.log(`2. 📥 Сваляне на реалната снимка...`);
        const imgRes = await fetch(IMAGE_URL, {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });

        if (imgRes.status !== 200) throw new Error(`Статус: ${imgRes.status}`);

        const buffer = Buffer.from(await imgRes.arrayBuffer());
        console.log(`📊 Успех! Размер: ${(buffer.length / 1024).toFixed(2)} KB`);

        console.log(`3. 🔍 Резервиране в Shopify...`);
        const sMutation = `mutation { stagedUploadsCreate(input: [{ resource: IMAGE, filename: "${FILENAME}", mimeType: "image/jpeg", httpMethod: POST }]) { stagedTargets { url resourceUrl parameters { name value } } } }`;
        const sRes = await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/graphql.json`, {
            method: 'POST',
            headers: { 'X-Shopify-Access-Token': ACCESS_TOKEN, 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: sMutation })
        });
        const sData = await sRes.json();
        const target = sData.data.stagedUploadsCreate.stagedTargets[0];

        // Гледаме внимателно този лог в GitHub
        const keyParam = target.parameters.find(p => p.name === 'key');
        console.log(`📂 Reserved Path (Key): ${keyParam.value}`);

        const formData = new FormData();
        target.parameters.forEach(p => formData.append(p.name, p.value));
        formData.append('file', buffer, { filename: FILENAME, contentType: 'image/jpeg' });

        console.log(`4. 📤 Качване към Google Storage...`);
        await fetch(target.url, { method: 'POST', body: formData, headers: formData.getHeaders() });

        console.log(`5. 🔗 Регистриране на медия...`);
        const regMutation = `mutation { productCreateMedia(productId: "${productId}", media: [{ originalSource: "${target.resourceUrl}", mediaContentType: IMAGE, alt: "Final Test" }]) { media { id } } }`;
        await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/graphql.json`, {
            method: 'POST',
            headers: { 'X-Shopify-Access-Token': ACCESS_TOKEN, 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: regMutation })
        });

        console.log(`\n✨ ГОТОВО! Провери продукт 'Test Final Name 963810'.`);
    } catch (err) {
        console.error(`💥 Грешка: ${err.message}`);
    }
}

run();
