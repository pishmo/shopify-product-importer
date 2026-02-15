const FormData = require('form-data');
const fetch = require('node-fetch');

const SHOPIFY_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const API_VERSION = '2025-01';

const TARGET_SKU = "963810";
// ИЗПОЛЗВАМЕ ДИРЕКТЕН ЛИНК, КОЙТО НЕ Е 404
const IMAGE_URL = "https://filstar.com/images/963811.jpg"; 
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

        console.log(`2. 📥 Сваляне на реална снимка...`);
        const imgRes = await fetch(IMAGE_URL, {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });

        if (imgRes.status !== 200) {
            throw new Error(`Филстар пак върна статус ${imgRes.status}. Пробвай с друг линк.`);
        }

        const buffer = Buffer.from(await imgRes.arrayBuffer());
        console.log(`📊 Успех! Свалени: ${(buffer.length / 1024).toFixed(2)} KB`);

        console.log(`3. 🔍 Резервиране в Shopify...`);
        const sMutation = `mutation { stagedUploadsCreate(input: [{ resource: IMAGE, filename: "${FILENAME}", mimeType: "image/jpeg", httpMethod: POST }]) { stagedTargets { url resourceUrl parameters { name value } } } }`;
        const sRes = await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/graphql.json`, {
            method: 'POST',
            headers: { 'X-Shopify-Access-Token': ACCESS_TOKEN, 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: sMutation })
        });
        const sData = await sRes.json();
        const target = sData.data.stagedUploadsCreate.stagedTargets[0];

        // ТОВА НИ ТРЯБВА ЗА ИМЕТО
        console.log(`📂 Reserved Path (Key): ${target.parameters.find(p => p.name === 'key').value}`);

        const formData = new FormData();
        target.parameters.forEach(p => formData.append(p.name, p.value));
        formData.append('file', buffer, { filename: FILENAME, contentType: 'image/jpeg' });

        console.log(`4. 📤 Качване...`);
        await fetch(target.url, { method: 'POST', body: formData, headers: formData.getHeaders() });

        console.log(`5. 🔗 Регистриране...`);
        const regMutation = `mutation { productCreateMedia(productId: "${productId}", media: [{ originalSource: "${target.resourceUrl}", mediaContentType: IMAGE, alt: "Final Test" }]) { media { id status } } }`;
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
