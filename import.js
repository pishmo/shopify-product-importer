const fetch = require('node-fetch');

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
    // 1. Fetch product info (name, description, images)
    const productUrl = `${FILSTAR_API_BASE}/products?search=${sku}`;
    
    const productResponse = await fetch(productUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${FILSTAR_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!productResponse.ok) {
      console.error(`Error fetching product SKU ${sku}: ${productResponse.status}`);
      continue;
    }
    
    const productData = await productResponse.json();
    
    if (productData && productData.length > 0) {
      // 2. Fetch price and quantity info
      const priceUrl = `${FILSTAR_API_BASE}/price-quantity?search=${sku}`;
      
      const priceResponse = await fetch(priceUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${FILSTAR_TOKEN}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (priceResponse.ok) {
        const priceData = await priceResponse.json();
        
        // 3. Комбинирай product info + price info
        for (const product of productData) {
          // Намери съответстващия вариант по SKU
          const variant = priceData.find(v => v.sku === sku);
          
          if (variant) {
            product.sku = variant.sku;
            product.barcode = variant.barcode;
            product.price = variant.price;
            product.quantity = variant.quantity;
          }
          
          allProducts.push(product);
        }
        
        console.log(`Found ${productData.length} product(s) with SKU: ${sku}`);
      } else {
        console.error(`Error fetching price for SKU ${sku}: ${priceResponse.status}`);
      }
    } else {
      console.log(`No product found with SKU: ${sku}`);
    }
    
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  console.log(`Total products fetched: ${allProducts.length}`);
  return allProducts;
}


// създаване на продуктите

async function createShopifyProduct(product) {
  console.log(`Processing product: ${product.name}`);
  
  // Вземи description (short_description е с HTML вече)
  const description = product.description || product.short_description || '';
  
  // Създай Shopify варианти от Filstar варианти
  const shopifyVariants = product.variants.map(variant => ({
    sku: variant.sku,
    barcode: variant.barcode,
    price: variant.price,
    inventoryQuantity: parseInt(variant.quantity) || 0,
    inventoryManagement: 'shopify',
    option1: variant.attributes.find(a => a.attribute_name.includes('РАЗМЕР'))?.value || variant.model || null
  }));
  
  const shopifyProduct = {
    title: product.name,
    descriptionHtml: description,
    vendor: product.manufacturer || 'Filstar',
    productType: product.categories?.[0]?.name || 'Fishing Equipment',
    images: product.images.map(url => ({ src: url })),
    variants: shopifyVariants
  };
  
  console.log(`Creating product with ${shopifyVariants.length} variants`);
  
  // ... останалия код за Shopify API заявка
}







async function main() {
  try {
    console.log('Starting product import...');
    
    // 1. Fetch products from external API
    const externalProducts = await fetchExternalProducts();


// 2. Filter only allowed product SKU
  // Премахни филтъра по ID, защото вече филтрираме по SKU
  console.log(`Processing ${externalProducts.length} products`);
    



    
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

