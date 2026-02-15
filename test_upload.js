const fetch = require('node-fetch');

const SHOPIFY_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const API_VERSION = '2025-01';

// ТЕСТОВИ ДАННИ
const TARGET_SKU = "963810";
// Използваме директния линк, който ми прати - Shopify ще го изтегли сам
const IMAGE_URL = "https://filstar.com/media/cache/product_view_default/images/963811-jpg_b54b0d75fc055cea5f9bf8c7c33961a5.jpeg";

async function run() {
    try {
        console.log(`1. 📦 Създаване на нов продукт за тест...`);
        const pMutation = `mutation {
            productCreate(input: { title: "Test URL Upload ${TARGET_SKU}" }) {
                product { id }
                userErrors { message }
            }
        }`;

        const pRes = await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/graphql.json`, {
            method: 'POST',
            headers: { 'X-Shopify-Access-Token': ACCESS_TOKEN, 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: pMutation })
        });
        const pData = await pRes.json();
        const productId = pData.data?.productCreate?.product?.id;
        
        if (!productId) {
            console.log("❌ Грешка при създаване:", pData.data?.productCreate?.userErrors);
            return;
        }
        console.log(`✅ Продукт създаден: ${productId}`);

        console.log(`2. 🚀 Изпращане на команда към Shopify да изтегли снимката...`);
        // Тук казваме на Shopify: "Вземи снимката от този линк"
        // Трикът е в 'alt', понякога Shopify го ползва за име, ако линкът е сложен
        const regMutation = `mutation {
            productCreateMedia(productId: "${productId}", media: [{
                originalSource: "${IMAGE_URL}",
                mediaContentType: IMAGE,
                alt: "${TARGET_SKU}.jpg"
            }]) {
                media {
                    id
                    status
                    ... on MediaImage {
                        image { url }
                    }
                }
                userErrors { field message }
            }
        }`;

        const regRes = await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/graphql.json`, {
            method: 'POST',
            headers: { 'X-Shopify-Access-Token': ACCESS_TOKEN, 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: regMutation })
        });

        const regData = await regRes.json();
        const errors = regData.data?.productCreateMedia?.userErrors || [];

        if (errors.length > 0) {
            console.log("❌ Грешки при регистрация:", errors);
        } else {
            console.log("\n✨ ГОТОВО! Shopify започна да тегли снимката.");
            console.log("Изчакай 10 секунди и провери името в админ панела.");
        }

    } catch (err) {
        console.error("💥 Критична грешка:", err.message);
    }
}

run();
