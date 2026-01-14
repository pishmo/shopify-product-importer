// import-rods.js - Специален импорт за шаранските пръчки
const SHOPIFY_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const FILSTAR_TOKEN = process.env.FILSTAR_API_TOKEN;
const API_VERSION = '2024-10';
const FILSTAR_API_BASE = 'https://filstar.com/api';

// SKU-та само на пръчките
const ROD_SKUS = [
  '943215'  // Шаранска въдица FilStar F-Carp 2
  // Добави други пръчки тук
];

async function fetchRodProducts() {
  console.log('Fetching rod products from Filstar...');
  
  let allProducts = [];
  
  for (const sku of ROD_SKUS) {
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
      
      // DEBUG - покажи структурата на вариантите
      console.log('=== VARIANT STRUCTURE ===');
      if (data[0].variants) {
        data[0].variants.forEach((v, i) => {
          console.log(`Variant ${i}:`, JSON.stringify(v, null, 2));
        });
      }
      console.log('=== END ===');
    }
    
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  return allProducts;
}

async function createRodProduct(filstarProduct) {
  console.log(`Creating rod product: ${filstarProduct.title || filstarProduct.name}`);
  
  // Форматирай вариантите с атрибути
  const variants = filstarProduct.variants.map(variant => {
    // TODO: Адаптирай според реалната структура от Filstar
    // Примерен формат - ще коригираме след като видим данните
    const optionName = formatRodOption(variant);
    
    return {
      option1: optionName,
      price: variant.price || '0.00',
      sku: variant.sku,
      barcode: variant.barcode || variant.ean,
      inventory_quantity: parseInt(variant.quantity) || 0,
      inventory_management: 'shopify'
    };
  });
  
  const productData = {
    product: {
      title: filstarProduct.title || filstarProduct.name,
      body_html: filstarProduct.description || filstarProduct.desc || '',
      vendor: 'Filstar',
      product_type: 'Шаранска въдица',
      variants: variants,
      options: [
        {
          name: 'Вариант',
          values: variants.map(v => v.option1)
        }
      ]
    }
  };
  
  console.log('Product data:', JSON.stringify(productData, null, 2));
  
  const response = await fetch(
    `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/products.json`,
    {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': ACCESS_TOKEN,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(productData)
    }
  );
  
  if (response.ok) {
    const result = await response.json();
    console.log(`✅ Created product: ${result.product.title}`);
  } else {
    const error = await response.text();
    console.error(`❌ Failed to create product:`, error);
  }
}

function formatRodOption(variant) {
  // TODO: Адаптирай според структурата от Filstar
  // Примерен формат - ще коригираме
  
  // Ако атрибутите са в variant.attributes:
  // return `РАЗМЕР: ${variant.attributes.size} - ${variant.attributes.length}м, АКЦИЯ: ${variant.attributes.action}`;
  
  // Засега връщаме само SKU за debug
  return variant.sku || variant.option1 || 'Unknown';
}

async function main() {
  try {
    console.log('Starting rod import...');
    
    const products = await fetchRodProducts();
    console.log(`Total rod products fetched: ${products.length}`);
    
    for (const product of products) {
      await createRodProduct(product);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log('Rod import completed!');
  } catch (error) {
    console.error('Import failed:', error);
    process.exit(1);
  }
}

main();
