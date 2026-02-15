const FormData = require('form-data');
const fetch = require('node-fetch');
const sharp = require('sharp');

// Твоите константи
const SHOPIFY_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const API_VERSION = '2025-01';

// --- КОНФИГУРАЦИЯ ЗА ТЕСТА ---
const TEST_PRODUCT_ID = 'gid://shopify/Product/15781295554942'; // Сложи ID на продукта, който току-що създаде
const TEST_IMAGE_URL = 'https://filstar.com/media/cache/product_view_default/images/963811.jpg';
const FILENAME = '963811.jpg'; 
// -----------------------------

async function uploadImageToShopify(imageBuffer, filename) {
    try {
        console.log(`1. 🔍 Изискване на URL за качване за: ${filename}...`);
        
        const stagedUploadMutation = `
          mutation {
            stagedUploadsCreate(input: [{
              resource: IMAGE,
              filename: "${filename}",
              mimeType: "image/jpeg",
              httpMethod: POST
            }]) {
              stagedTargets {
                url
                resourceUrl
                parameters { name value }
              }
            }
          }
        `;

        const stagedResponse = await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/graphql.json`, {
            method: 'POST',
            headers: { 'X-Shopify-Access-Token': ACCESS_TOKEN, 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: stagedUploadMutation })
        });

        const stagedData = await stagedResponse.json();
        const target = stagedData.data.stagedUploadsCreate.stagedTargets[0];

        // ЛОГВАМЕ ПАРАМЕТРИТЕ ЗА ДИАГНОСТИКА
        const keyParam = target.parameters.find(p => p.name === 'key');
        console.log(`   📂 Път в Google Storage (Key): ${keyParam ? keyParam.value : 'Не е намерен'}`);

        const formData = new FormData();
        // Първо всички параметри
        target.parameters.forEach(param => {
            formData.append(param.name, param.value);
        });

        // Файлът - точно както браузъра го прави
        formData.append('file', imageBuffer, { 
            filename: filename,
            contentType: 'image/jpeg'
        });

        console.log(`2. 📤 Физическо качване към Google Storage...`);
        const uploadResponse = await fetch(target.url, {
            method: 'POST',
            body: formData,
            headers: formData.getHeaders()
        });

        if (!uploadResponse.ok) {
            const errText = await uploadResponse.text();
            throw new Error(`Upload failed: ${errText}`);
        }

        console.log(`3. ✅ Успешно качено. ResourceURL: ${target.resourceUrl}`);
        return target.resourceUrl;
    } catch (error) {
        console.error(`  ❌ Error in upload: ${error.message}`);
        return null;
    }
}

async function runSingleTest() {
    try {
        console.log(`🚀 Сваляне на снимка от: ${TEST_IMAGE_URL}`);
        const res = await fetch(TEST_IMAGE_URL);
        const buffer = Buffer.from(await res.arrayBuffer());

        const resourceUrl = await uploadImageToShopify(buffer, FILENAME);

        if (resourceUrl) {
            console.log(`4. 🔗 Свързване на снимката с продукт ID: ${TEST_PRODUCT_ID}...`);
            
            const mediaMutation = `
              mutation {
                productCreateMedia(productId: "${TEST_PRODUCT_ID}", media: [{
                  originalSource: "${resourceUrl}",
                  mediaContentType: IMAGE,
                  alt: "Test Clean Name"
                }]) {
                  media { id status }
                  userErrors { field message }
                }
              }
            `;

            const regResponse = await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/graphql.json`, {
                method: 'POST',
                headers: { 'X-Shopify-Access-Token': ACCESS_TOKEN, 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: mediaMutation })
            });

            const regData = await regResponse.json();
            
            if (regData.data.productCreateMedia.userErrors.length > 0) {
                console.log("❌ Грешки при регистрация:", regData.data.productCreateMedia.userErrors);
            } else {
                console.log("\n✨ ГОТОВО! Провери сега името в Shopify Admin.");
            }
        }
    } catch (err) {
        console.error("Грешка в теста:", err);
    }
}

runSingleTest();
