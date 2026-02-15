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
        console.log(`1. 📦 Създаване на продукт...`);
        const productMutation = `mutation { productCreate(input: { title: "Test Product ${TARGET_SKU}" }) { product { id } } }`;
        const pRes = await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/graphql.json`, {
            method: 'POST',
            headers: { 'X-Shopify-Access-Token': ACCESS_TOKEN, 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: productMutation })
        });
        const pData = await pRes.json();
        const productId = pData.data.productCreate.product.id;

        console.log(`2. 📥 Сваляне на снимка...`);
        const imgRes = await fetch(IMAGE_URL);
        const buffer = Buffer.from(await imgRes.arrayBuffer());
        
        // Вземаме реалния Content-Type от сървъра на Филстар
        const contentType = imgRes.headers.get('content-type') || 'image/jpeg';

        console.log(`3. 🔍 Резервиране на място в Shopify (MIME: ${contentType})...`);
        const stagedMutation = `mutation { stagedUploadsCreate(input: [{ resource: IMAGE, filename: "${FILENAME}", mimeType: "${contentType}", httpMethod: POST }]) { stagedTargets { url resourceUrl parameters { name value } } } }`;
        const sRes = await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/graphql.json`, {
            method: 'POST',
            headers: { 'X-Shopify-Access-Token': ACCESS_TOKEN, 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: stagedMutation })
        });
        const sData = await sRes.json();
        const target = sData.data.stagedUploadsCreate.stagedTargets[0];

        console.log(`📂 Reserved Path (Key): ${target.parameters.find(p => p.name === 'key').value}`);

        const formData = new FormData();
        target.parameters.forEach(p => formData.append(p.name, p.value));
        
        // ВАЖНО: Тук подаваме буфера с точните метаданни
        formData.append('file', buffer, { 
            filename: FILENAME, 
            contentType: contentType 
        });

        console.log(`4. 📤 Качване към Google...`);
        const upRes = await fetch(target.url, { 
            method: 'POST', 
            body: formData, 
            headers: formData.getHeaders() 
        });

        if (upRes.ok) {
            console.log(`5. 🔗 Регистриране на медия...`);
            const regMutation = `mutation { productCreateMedia(productId: "${productId}", media: [{ originalSource: "${target.resourceUrl}", mediaContentType: IMAGE, alt: "Test" }]) { media { id status } } }`;
            await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/graphql.json`, {
                method: 'POST',
                headers: { 'X-Shopify-Access-Token': ACCESS_TOKEN, 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: regMutation })
            });
            console.log("\n✨ ГОТОВО. Провери сега дали снимката се вижда в админа.");
        }
    } catch (err) {
        console.error("💥 Грешка:", err.message);
    }
}

run();
