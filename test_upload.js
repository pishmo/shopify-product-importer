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
        const pRes = await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/graphql.json`, {
            method: 'POST',
            headers: { 'X-Shopify-Access-Token': ACCESS_TOKEN, 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: `mutation { productCreate(input: { title: "Log Test ${TARGET_SKU}" }) { product { id } } }` })
        });
        const pData = await pRes.json();
        const productId = pData.data?.productCreate?.product?.id;

        console.log(`2. 📥 Сваляне на снимка...`);
        const imgRes = await fetch(IMAGE_URL, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const buffer = Buffer.from(await imgRes.arrayBuffer());

        console.log(`3. 🔍 Резервиране на Staged Upload...`);
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

        console.log(`\n--- 🛠 ДИАГНОСТИКА НА ПАКЕТА ---`);
        const formData = new FormData();
        target.parameters.forEach(p => {
            console.log(`🔹 Param: ${p.name} = ${p.value}`);
            formData.append(p.name, p.value);
        });
        
        // Тук е критичният момент
        formData.append('file', buffer, { filename: FILENAME });
        
        console.log(`🔹 File field name: file`);
        console.log(`🔹 File original name: ${FILENAME}`);
        console.log(`🔹 Buffer size: ${buffer.length} bytes`);
        console.log(`-------------------------------\n`);

        console.log(`4. 📤 Качване към GCS...`);
        const uploadRes = await fetch(target.url, {
            method: 'POST',
            body: formData,
            headers: formData.getHeaders()
        });

        if (uploadRes.ok) {
            console.log(`5. 🔗 Регистриране към продукт ${productId}...`);
            const regMutation = `mutation {
              productCreateMedia(productId: "${productId}", media: [{
                originalSource: "${target.resourceUrl}",
                mediaContentType: IMAGE
              }]) {
                media { id status }
                userErrors { message }
              }
            }`;
            
            const finalRes = await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/graphql.json`, {
                method: 'POST',
                headers: { 'X-Shopify-Access-Token': ACCESS_TOKEN, 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: regMutation })
            });
            const finalData = await finalRes.json();
            console.log(`\n✨ ГОТОВО. Провери името.`);
        } else {
            console.log(`❌ Грешка при качване: ${uploadRes.status} ${uploadRes.statusText}`);
        }
    } catch (err) {
        console.error("💥 Грешка:", err.message);
    }
}

run();
