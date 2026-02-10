
// update-alt-texts.js   Слагане на ALT текст на всички снимки

require('dotenv').config();
// Проверка дали имаме fetch (за Node 18+ е вграден, за по-стари го зареждаме)
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const SHOP = process.env.SHOPIFY_SHOP_URL;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const API_VERSION = '2024-01'; 

const DELAY_MS = 300; // Пауза да не товарим API-то

// Помощна функция за пауза
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Основна функция за заявки към Shopify
async function shopifyRequest(query, variables = {}) {
  const response = await fetch(`https://${SHOP}/admin/api/${API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': ACCESS_TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  });

  const json = await response.json();
  if (json.errors) {
    throw new Error(JSON.stringify(json.errors));
  }
  return json.data;
}

// Функция за обновяване на един продукт
async function updateAltTextForProduct(product) {
  const productId = product.id;
  const productTitle = product.title;
  
  // Взимаме само картинките (media nodes)
  const mediaNodes = product.media.edges.map(edge => edge.node);

  if (mediaNodes.length === 0) return;

  // Подготвяме масива за update
  const mediaInput = mediaNodes.map(media => ({
    id: media.id,
    alt: productTitle // Слагаме заглавието като Alt текст
  }));

  const mutation = `
    mutation productUpdateMedia($media: [UpdateMediaInput!]!, $productId: ID!) {
      productUpdateMedia(media: $media, productId: $productId) {
        media {
          id
          alt
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  try {
    const result = await shopifyRequest(mutation, {
      media: mediaInput,
      productId: productId
    });

    const errors = result.productUpdateMedia.userErrors;
    if (errors && errors.length > 0) {
      console.error(`❌ Грешка при продукт "${productTitle}":`, errors);
    } else {
      console.log(`✅ Обновени ${mediaInput.length} снимки за: "${productTitle}"`);
    }
  } catch (error) {
    console.error(`❌ API Грешка за "${productTitle}":`, error.message);
  }
}

// Основна функция, която върти цикъла
async function runBatchUpdate() {
  console.log("🚀 Започва обновяване на ALT текстовете...");
  
  let cursor = null;
  let hasNextPage = true;
  let totalProcessed = 0;

  while (hasNextPage) {
    // Взимаме продуктите на порции по 10
    const query = `
      query ($cursor: String) {
        products(first: 10, after: $cursor) {
          pageInfo {
            hasNextPage
            endCursor
          }
          edges {
            node {
              id
              title
              media(first: 50) {
                edges {
                  node {
                    id
                    alt
                  }
                }
              }
            }
          }
        }
      }
    `;

    try {
      const data = await shopifyRequest(query, { cursor });
      const products = data.products.edges.map(edge => edge.node);
      
      if (products.length === 0) break;

      // Обхождаме всеки продукт в тази порция
      for (const product of products) {
        await updateAltTextForProduct(product);
        await sleep(DELAY_MS);
      }

      totalProcessed += products.length;
      console.log(`--- Обработени до момента: ${totalProcessed} продукта ---`);

      // Подготовка за следващата страница
      cursor = data.products.pageInfo.endCursor;
      hasNextPage = data.products.pageInfo.hasNextPage;

    } catch (error) {
      console.error("❌ Критична грешка при взимане на продукти:", error);
      break; 
    }
  }

  console.log("🏁 Готово! Всички снимки са с нови ALT текстове.");
}

// Стартиране
runBatchUpdate();
