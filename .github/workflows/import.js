,const fetch = require('node-fetch');

const SHOPIFY_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const FILSTAR_TOKEN = process.env.FILSTAR_API_TOKEN;
const API_VERSION = '2024-10';

const FILSTAR_API_BASE = 'https://filstar.com/api';

const PRODUCT_SKUS = [
  // Добавете SKU кодовете тук, например:
  // 'ABC123',
  // 'XYZ789',
  // 'CARP-001'
947828,943215
 
];

async function fetchExternalProducts() {
  console.log('Fetching products from Filstar API by SKU...');
  
  let allProducts = [];
  
  for (const sku of PRODUCT_SKUS) {
    const url = `${FILSTAR_API_BASE}/products?search=${sku}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${FILSTAR_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      console.error(`Error fetching SKU ${sku}: ${response.status}`);
      continue;
    }
    
    const data = await response.json();
    
    if (data && data.length > 0) {
      allProducts = allProducts.concat(data);
      console.log(`Found ${data.length} product(s) with SKU: ${sku}`);
    } else {
      console.log(`No product found with SKU: ${sku}`);
    }
    
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  console.log(`Total products fetched: ${allProducts.length}`);
  return allProducts;
}





async function createShopifyProduct(productData) {
  const mutation = `
    mutation {
      productCreate(input: {
        title: "${productData.title}",
        descriptionHtml: "${productData.description || ''}",
        vendor: "${productData.vendor || ''}",
        productType: "${productData.type || ''}"
      }) {
        product {
          id
          title
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const response = await fetch(
    `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/graphql.json`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': ACCESS_TOKEN
      },
      body: JSON.stringify({ query: mutation })
    }
  );

  const result = await response.json();
  
  if (result.data.productCreate.userErrors.length > 0) {
    console.error('Error creating product:', result.data.productCreate.userErrors);
  } else {
    console.log('Created product:', result.data.productCreate.product.title);
  }
  
  return result;
}

async function main() {
  try {
    console.log('Starting product import...');
    
    // 1. Fetch products from external API
    const externalProducts = await fetchExternalProducts();


// 2. Filter only allowed product IDs
    const filteredProducts = externalProducts.filter(product => {
      return ALLOWED_PRODUCT_IDS.includes(product.id);
    });
    
    console.log(`Filtered to ${filteredProducts.length} allowed products`);


    
    // 3. Create each product in Shopify
    for (const product of externalProducts) {
      await createShopifyProduct(product);
      // Пауза между заявки (rate limiting)
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    console.log('Import completed!');
  } catch (error) {
    console.error('Import failed:', error);
    process.exit(1);
  }
}

main();

