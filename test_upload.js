const FormData = require('form-data');
const fetch = require('node-fetch');

const SHOPIFY_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const API_VERSION = '2025-01';

const TARGET_SKU = "963810";
// Използваме оригиналната снимка от Филстар
const IMAGE_URL = "https://filstar.com/media/cache/product_view_default/images/963811.jpg";
const FILENAME = "963810.jpg";

async function run() {
    try {
        console.log(`1. 📦 Създаване на тестов продукт...`);
        const pMutation = `mutation { productCreate(input: { title: "Test Product ${TARGET_SKU}" }) { product { id } } }`;
        const pRes = await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/graphql.json`, {
            method: 'POST',
            headers: { 'X-Shopify-Access-Token': ACCESS_TOKEN, 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: pMutation })
        });
        const pData = await pRes.json();
        const productId = pData.data?.productCreate?.product?.id;
        if (!productId) throw new Error("Неуспешно създаване на продукт.");

        console.log(`2. 📥 Сваляне на снимка от Филстар...`);
        const imgRes = await fetch(IMAGE_URL, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });

        const contentType = imgRes.headers.get('content-type');
        const buffer = Buffer.from(await imgRes.arrayBuffer());
        
        console.log(`📊 Статус: ${imgRes.status}, Тип: ${contentType}, Размер: ${(buffer.length / 1024).toFixed(2)} KB`);

        if (contentType.includes('text/html') || buffer.length < 1000) {
            throw new Error(`Сървърът на Филстар върна HTML/Грешка вместо снимка. Статус: ${imgRes.status}`);
        }

        console.log(`3. 🔍 Резервиране на място в Shopify...`);
        const sMutation = `mutation { stagedUploadsCreate(input: [{ resource: IMAGE, filename: "${FILENAME}", mimeType: "image/jpeg", httpMethod: POST }]) { stagedTargets { url resourceUrl parameters { name value } } } }`;
        const sRes = await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/graphql.json`, {
            method: 'POST',
            headers: { 'X-Shopify-Access-Token': ACCESS_TOKEN, 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: sMutation })
        });
        const sData = await sRes.json();
        const target = sData.data.stagedUploadsCreate.stagedTargets[0];

        const keyParam = target.parameters.find(p => p.name === 'key');
        console.log(`📂 Reserved Path (Key): ${keyParam.value}`);

        const formData = new FormData();
        target.parameters.forEach(p => formData.append(p.name, p.value));
        formData.append('file', buffer, { filename: FILENAME, contentType: 'image/jpeg' });

        console.log(`4. 📤 Качване към Google Storage...`);
        const upRes = await fetch(target.url, { method: 'POST', body: formData, headers: formData.getHeaders() });

        if (upRes.ok) {
            console.log(`5. 🔗 Регистриране към продукта...`);
            const regMutation = `mutation { productCreateMedia(productId: "${productId}", media: [{ originalSource: "${target.resourceUrl}", mediaContentType: IMAGE, alt: "Test Clean Name" }]) { media { id } } }`;
            await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/graphql.json`, {
                method: 'POST',
                headers: { 'X-Shopify-Access-Token': ACCESS_TOKEN, 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: regMutation })
            });
            console.log(`\n✨ ГОТОВО! Провери продукт ${TARGET_SKU} в админа.`);
        }
    } catch (err) {
        console.error(`💥 Грешка: ${err.message}`);
    }
}

run();
