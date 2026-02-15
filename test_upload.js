const FormData = require('form-data');
const fetch = require('node-fetch');

const SHOPIFY_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const API_VERSION = '2025-01';

const TARGET_SKU = "963810";
const IMAGE_URL = "https://filstar.com/media/cache/product_view_default/images/963811-jpg_b54b0d75fc055cea5f9bf8c7c33961a5.jpeg";
const FILENAME = "963810.jpg";

async function run() {
    try {
        console.log(`1. 📦 Създаване на продукт...`);
        const pMutation = `mutation {
            productCreate(input: { title: "Test Product ${TARGET_SKU}" }) {
                product { id }
            }
        }`;

        const pRes = await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/graphql.json`, {
            method: 'POST',
            headers: { 'X-Shopify-Access-Token': ACCESS_TOKEN, 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: pMutation })
        });
        const pData = await pRes.json();
        const productId = pData.data?.productCreate?.product?.id;
        console.log(`✅ ID: ${productId}`);

        console.log(`2. 📥 Сваляне на снимка...`);
        const imgRes = await fetch(IMAGE_URL, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const buffer = Buffer.from(await imgRes.arrayBuffer());

        console.log(`3. 🔍 Генериране на Staged Target...`);
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

        console.log(`4. 📤 Качване към Google Storage (Multipart)...`);
        const formData = new FormData();
        // Параметрите трябва да са точно в този ред преди файла
        target.parameters.forEach(p => formData.append(p.name, p.value));
        formData.append('file', buffer, { filename: FILENAME });

        const uploadRes = await fetch(target.url, {
            method: 'POST',
            body: formData,
            headers: formData.getHeaders()
        });

        if (uploadRes.ok) {
            console.log(`5. 🔗 Регистриране на медия към продукта...`);
            const regMutation = `mutation {
              productCreateMedia(productId: "${productId}", media: [{
                originalSource: "${target.resourceUrl}",
                mediaContentType: IMAGE
              }]) {
                media { id status }
                userErrors { message }
              }
            }`;
            
            await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/graphql.json`, {
                method: 'POST',
                headers: { 'X-Shopify-Access-Token': ACCESS_TOKEN, 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: regMutation })
            });
            console.log(`\n✨ ГОТОВО! Провери името на файла в админа.`);
        }
    } catch (err) {
        console.error("💥 Грешка:", err.message);
    }
}

run();
