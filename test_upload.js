async function addImageByUrl(productId, imageUrl, sku) {
  try {
    // Дефинираме чистото име, което искаме
    const cleanFilename = `${sku}.jpg`;
    
    const mutation = `
      mutation {
        productCreateMedia(productId: "${productId}", media: [{
          originalSource: "${imageUrl}",
          mediaContentType: IMAGE,
          alt: "${cleanFilename}"
        }]) {
          media {
            id
            ... on MediaImage {
              image { url }
            }
          }
          userErrors { field message }
        }
      }
    `;

    const response = await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/graphql.json`, {
      method: 'POST',
      headers: { 
        'X-Shopify-Access-Token': ACCESS_TOKEN, 
        'Content-Type': 'application/json' 
      },
      body: JSON.stringify({ query: mutation })
    });

    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Грешка:", error);
  }
}
