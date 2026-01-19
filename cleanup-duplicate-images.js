async function getAllProducts() {
  console.log('Fetching all products from Shopify...');
  
  let allProducts = [];
  let hasNextPage = true;
  let nextPageUrl = `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/products.json?fields=id,title,images&limit=250`;
  
  while (hasNextPage) {
    const response = await fetch(nextPageUrl, {
      method: 'GET',
      headers: {
        'X-Shopify-Access-Token': ACCESS_TOKEN,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      console.error(`Failed to fetch products: ${response.status}`);
      break;
    }
    
    const data = await response.json();
    allProducts = allProducts.concat(data.products);
    
    console.log(`Fetched ${data.products.length} products (total: ${allProducts.length})`);
    
    // Провери за следваща страница
    const linkHeader = response.headers.get('Link');
    
    if (linkHeader && linkHeader.includes('rel="next"')) {
      // Извлечи URL-а за следващата страница
      const nextLinkMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
      
      if (nextLinkMatch && nextLinkMatch[1]) {
        nextPageUrl = nextLinkMatch[1];
        hasNextPage = true;
      } else {
        hasNextPage = false;
      }
    } else {
      hasNextPage = false;
    }
    
    // Пауза между заявки
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  console.log(`Total products fetched: ${allProducts.length}`);
  return allProducts;
}
