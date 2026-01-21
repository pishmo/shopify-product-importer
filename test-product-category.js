// fetch-filstar-products.js - Извличане на продукти по SKU от Filstar
const fetch = require('node-fetch');

const FILSTAR_TOKEN = process.env.FILSTAR_API_TOKEN;
const API_VERSION = '2024-10';
const FILSTAR_API_BASE = 'https://filstar.com/api';

// SKU номерата за търсене
const TARGET_SKUS = ['52475', '962013', '956532', '957231', '946238', '957900'];

// Функция за fetch на продукти по SKU с пагинация
async function fetchProductsBySKU(sku) {
  let allProducts = [];
  let page = 1;
  let hasMore = true;

  console.log(`🔍 Търсене на SKU: ${sku}`);

  while (hasMore) {
    const url = `${FILSTAR_API_BASE}/products?page=${page}&limit=1000&search=${sku}`;
    
    try {
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${FILSTAR_TOKEN}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const products = await response.json();
      
      if (products && products.length > 0) {
        allProducts = allProducts.concat(products);
        console.log(`  ✅ Намерени: ${products.length}`);
        
        if (products.length < 1000) {
          hasMore = false;
        } else {
          page++;
        }
      } else {
        hasMore = false;
      }

    } catch (error) {
      console.error(`  ❌ Грешка:`, error.message);
      hasMore = false;
    }
  }

  return allProducts;
}

// Главна функция
async function main() {
  console.log('🚀 Извличане на продукти от Filstar\n');

  let allFoundProducts = [];
  const categoriesMap = new Map();

  // Fetch на всички SKU
  for (const sku of TARGET_SKUS) {
    const products = await fetchProductsBySKU(sku);
    allFoundProducts = allFoundProducts.concat(products);
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log(`\n📊 Общо продукти: ${allFoundProducts.length}\n`);

  // Извличане на категории
  console.log(`📁 КАТЕГОРИИ:\n${'='.repeat(80)}`);
  
  allFoundProducts.forEach(product => {
    if (product.categories && product.categories.length > 0) {
      product.categories.forEach(cat => {
        const key = cat.id;
        if (!categoriesMap.has(key)) {
          categoriesMap.set(key, {
            id: cat.id,
            parent_id: cat.parent_id,
            name: cat.name,
            parent_name: cat.parent_name
          });
        }
      });
    }
  });

  categoriesMap.forEach((cat) => {
    console.log(`ID: ${cat.id.padEnd(4)} | Parent: ${(cat.parent_id || 'NULL').toString().padEnd(4)} | ${cat.name} (${cat.parent_name || 'ROOT'})`);
  });

  // Показване на продукти
  console.log(`\n🎣 ПРОДУКТИ:\n${'='.repeat(80)}`);

  allFoundProducts.forEach((product, index) => {
    console.log(`\n[${index + 1}] ${product.name}`);
    console.log(`    ID: ${product.id} | Manufacturer: ${product.manufacturer}`);
    
    // Категории
    if (product.categories && product.categories.length > 0) {
      product.categories.forEach(cat => {
        console.log(`    📁 Category: ${cat.name} (ID: ${cat.id}, Parent: ${cat.parent_id || 'NULL'})`);
      });
    }
    
    // Варианти
    console.log(`    📦 Варианти: ${product.variants?.length || 0}`);
    if (product.variants && product.variants.length > 0) {
      product.variants.forEach((variant, vIdx) => {
        console.log(`       [${vIdx + 1}] SKU: ${variant.sku} | Model: ${variant.model} | Price: ${variant.price} EUR | Qty: ${variant.quantity}`);
        
        // Атрибути
        if (variant.attributes && variant.attributes.length > 0) {
          variant.attributes.forEach(attr => {
            console.log(`           • ${attr.attribute_name}: ${attr.value}`);
          });
        }
      });
    }
  });

  console.log(`\n${'='.repeat(80)}`);
  console.log(`✅ Готово! Намерени ${allFoundProducts.length} продукта с ${categoriesMap.size} уникални категории`);
}

// Стартиране
main().catch(error => {
  console.error('❌ Фатална грешка:', error);
  process.exit(1);
});
