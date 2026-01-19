const fetch = require('node-fetch');

const FILSTAR_TOKEN = process.env.FILSTAR_API_TOKEN;
const FILSTAR_API_BASE = 'https://filstar.com/api';
const FILSTAR_BASE_URL = 'https://filstar.com';

async function fetchAllProducts() {
  let allProducts = [];
  let page = 1;
  
  while (true) {
    const response = await fetch(
      `${FILSTAR_API_BASE}/products?page=${page}&limit=1000`,
      { headers: { 'Authorization': `Bearer ${FILSTAR_TOKEN}` } }
    );
    
    const pageProducts = await response.json();
    if (pageProducts.length === 0) break;
    
    allProducts = allProducts.concat(pageProducts);
    page++;
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  
  return allProducts;
}

function analyzeProduct(product) {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📦 PRODUCT: ${product.name}`);
  console.log(`   SKU: ${product.sku || 'N/A'}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  // Главна снимка
  if (product.image) {
    console.log('🎯 MAIN IMAGE:');
    console.log(`   ${product.image}`);
    console.log('');
  }
  
  // Допълнителни снимки
  if (product.images && product.images.length > 0) {
    console.log(`📸 ADDITIONAL IMAGES (${product.images.length}):`);
    product.images.forEach((img, i) => {
      console.log(`   ${i + 1}. ${img}`);
    });
    console.log('');
  }
  
  // Варианти
  if (product.variants && product.variants.length > 0) {
    console.log(`🎨 VARIANTS (${product.variants.length}):`);
    product.variants.forEach((variant, i) => {
      console.log(`   ${i + 1}. SKU: ${variant.sku} | Model: ${variant.model || 'N/A'}`);
      if (variant.image) {
        console.log(`      Image: ${variant.image}`);
      }
      if (variant.attributes && variant.attributes.length > 0) {
        variant.attributes.forEach(attr => {
          console.log(`      - ${attr.attribute_name}: ${attr.value}`);
        });
      }
      console.log('');
    });
  }
  
  // Пълен JSON за дебъг
  console.log('📋 FULL JSON:');
  console.log(JSON.stringify(product, null, 2));
  console.log('\n');
}

async function main() {
  console.log('🔍 Fetching all products from Filstar...\n');
  
  const allProducts = await fetchAllProducts();
  console.log(`✅ Fetched ${allProducts.length} products\n`);
  
  // Търси двата продукта
  const proSpinAir = allProducts.find(p => 
    p.name && p.name.includes('Pro Spin Air')
  );
  
  const blackCarp = allProducts.find(p => 
    p.name && p.name.includes('Black Carp 8000')
  );
  
  if (proSpinAir) {
    analyzeProduct(proSpinAir);
  } else {
    console.log('❌ Pro Spin Air not found');
  }
  
  if (blackCarp) {
    analyzeProduct(blackCarp);
  } else {
    console.log('❌ Black Carp 8000 not found');
  }
}

main();
