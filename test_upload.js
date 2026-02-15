const FormData = require('form-data');
// Тук сложи твоите константи
const ACCESS_TOKEN = 'ТВОЯ_ТОКЕН';
const SHOPIFY_DOMAIN = 'ТВОЯ_ДОМЕЙН.myshopify.com';
const API_VERSION = '2024-01'; // или твоята версия

// 1. Твоята функция за качване (копирана)
async function uploadImageToShopify(imageBuffer, filename) {
    try {
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

        // ТОВА Е ВАЖНО ЗА ТЕСТА: Виж какво казва Shopify още тук
        console.log("--- DEBUG PARAMETERS ---");
        target.parameters.forEach(p => {
            if (p.name === 'key') console.log("Key (Path in Google):", p.value);
        });
        console.log("Resource URL:", target.resourceUrl);

        const formData = new FormData();
        target.parameters.forEach(param => {
            formData.append(param.name, param.value);
        });

        formData.append('file', imageBuffer, { filename });

        const uploadResponse = await fetch(target.url, {
            method: 'POST',
            body: formData,
            headers: formData.getHeaders()
        });

        if (!uploadResponse.ok) throw new Error("Upload failed");
        return target.resourceUrl;
    } catch (error) {
        console.error(`  ❌ Error: ${error.message}`);
        return null;
    }
}

// 2. Тестова логика
async function runTest() {
    const productId = "gid://shopify/Product/123456789"; // СЛОЖИ ID НА СЪЩЕСТВУВАЩ ТЕСТОВ ПРОДУКТ
    const testImageUrl = "https://filstar.com/media/cache/product_view_default/images/963811.jpg";
    const filename = "963811.jpg";

    console.log("📥 Сваляне на тестова снимка...");
    const res = await fetch(testImageUrl);
    const buffer = Buffer.from(await res.arrayBuffer());

    console.log("📤 Качване към Shopify...");
    const resourceUrl = await uploadImageToShopify(buffer, filename);

    if (resourceUrl) {
        console.log("🔗 Регистриране на снимката към продукта...");
        const mediaMutation = `
      mutation {
        productCreateMedia(productId: "${productId}", media: [{
          originalSource: "${resourceUrl}",
          mediaContentType: IMAGE,
          alt: "Test Image"
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
        console.log("Готово! Провери продукта в Shopify Admin.");
    }
}

runTest();
