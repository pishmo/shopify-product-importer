const FormData = require('form-data');
const fetch = require('node-fetch');

const SHOPIFY_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const API_VERSION = '2025-01';

const TARGET_SKU = "963810";
// Използваме работещия линк от Филстар
const IMAGE_URL = "https://filstar.com/media/cache/product_view_default/images/963811-jpg_b54b0d75fc055cea5f9bf8c7c33961a5.jpeg";
const FILENAME = "963810.jpg";

async function run() {
    try {
        console.log(`1. 📦 Създаване на тестов продукт...`);
        const pMutation = `mutation { productCreate(input: { title: "Test Original Logic ${TARGET_SKU}" }) { product { id } } }`;
        const pRes = await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/graphql.json`, {
            method: 'POST',
            headers: { 'X-Shopify-Access-Token': ACCESS_TOKEN, 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: pMutation })
        });
        const pData = await pRes.json();
        const productId = pData.data?.productCreate?.product?.id;

        console.log(`2. 📥 Сваляне на снимка...`);
        const imgRes = await fetch(IMAGE_URL, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const buffer = Buffer.from(await imgRes.arrayBuffer());

        console.log(`3. 🔍 Резервиране на staged upload...`);
        const stagedMutation = `mutation {
            stagedUploadsCreate(input: [{
                resource: IMAGE,
                filename: "${FILENAME}",
                mimeType: "image/jpeg",
                httpMethod: POST
            }]) {
                stagedTargets {
                    url
                    resourceUrl
                    parameters { name value }
                }
            }
        }`;

        const sRes = await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/graphql.json`, {
            method: 'POST',
            headers: { 'X-Shopify-Access-Token': ACCESS_TOKEN, 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: stagedMutation })
        });
        const sData = await sRes.json();
        const target = sData.data.stagedUploadsCreate.stagedTargets[0];

        console.log(`4. 📤 Качване на файла...`);
        const formData = new FormData();
        // ВАЖНО: Параметрите се добавят точно в този ред
        target.parameters.forEach(p => formData.append(p.name, p.value));
        formData.append('file', buffer, { filename: FILENAME, contentType: 'image/jpeg' });

        const upRes = await fetch(target.url, {
            method: 'POST',
            body: formData,
            headers: formData.getHeaders()
        });

        if (upRes.ok) {
            console.log(`5. 🔗 Свързване с продукта...`);
            const regMutation = `mutation {
                productCreateMedia(productId: "${productId}", media: [{
                    originalSource: "${target.resourceUrl}",
                    mediaContentType: IMAGE,
                    alt: "${FILENAME}"
                }]) {
                    media { id }
                    userErrors { message }
                }
            }`;
            const regRes = await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/graphql.json`, {
                method: 'POST',
                headers: { 'X-Shopify-Access-Token': ACCESS_TOKEN, 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: regMutation })
            });
            const regData = await regRes.json();
            console.log("\n✨ ГОТОВО! Провери продукта в админа.");
        }
    } catch (err) {
        console.error("💥 Грешка:", err.message);
    }
}

run();
