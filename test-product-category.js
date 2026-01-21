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

  console.log(`\n🔍 Търсене на SKU: ${sku}`);

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

      const products = await response.json(); // Директно array!
      
      console.log(`  📄 Страница ${page}: ${products.length} продукта`);

      if (products && products.length > 0) {
        allProducts = allProducts.concat(products);
        
        // Ако има по-малко от 1000, няма повече страници
        if (products.length < 1000) {
          hasMore = false;
        } else {
          page++;
        }
      } else {
        hasMore = false;
      }

    } catch (error) {
      console.error(`  ❌ Грешка при страница ${page}:`, error.message);
      hasMore = false;
    }
  }

  console.log(`  ✅ Общо намерени: ${allProducts.length} продукта`);
  return allProducts;
}

// Главна функция
async function main() {
  console.log('🚀 Стартиране на извличане на продукти от Filstar...\n');
  console.log(`📋 Търсене на ${TARGET_SKUS.length} SKU номера`);

  let allFoundProducts = [];
  const categoriesMap = new Map();

  // Fetch на всички SKU
  for (const sku of TARGET_SKUS) {
    const products = await fetchProductsBySKU(sku);
    allFoundProducts = allFoundProducts.concat(products);
    
    // Малко delay между заявките
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log(`\n\n📊 ОБОБЩЕНИЕ:`);
  console.log(`════════════════════════════════════════`);
  console.log(`Общо намерени продукти: ${allFoundProducts.length}`);

  // Извличане на категории
  console.log(`\n\n📁 КАТЕГОРИИ (ID + Parent ID):`);
  console.log(`════════════════════════════════════════`);
  
  allFoundProducts.forEach(product => {
    // Проверяваме различни възможни имена на полетата
    const categoryId = product.category_id || product.categoryId || product.category?.id;
    const parentId = product.parent_category_id || product.parentCategoryId || product.category?.parent_id;
    const categoryName = product.category_name || product.categoryName || product.category?.name;
    
    if (categoryId) {
      const key = `${categoryId}`;
      if (!categoriesMap.has(key)) {
        categoriesMap.set(key, {
          id: categoryId,
          parent_id: parentId || null,
          name: categoryName || 'N/A'
        });
      }
    }
  });

  if (categoriesMap.size > 0) {
    categoriesMap.forEach((cat) => {
      console.log(`  ID: ${cat.id} | Parent ID: ${cat.parent_id} | Name: ${cat.name}`);
    });
  } else {
    console.log(`  ⚠️  Няма открити категории (проверете структурата на продуктите)`);
  }

  // Показване на всички атрибути за всеки продукт
  console.log(`\n\n🎣 ПРОДУКТИ И ТЕХНИТЕ АТРИБУТИ:`);
  console.log(`════════════════════════════════════════`);

  allFoundProducts.forEach((product, index) => {
    console.log(`\n[${index + 1}] SKU: ${product.sku || product.code || product.id} | ${product.name}`);
    console.log(JSON.stringify(product, null, 2));
    console.log(`────────────────────────────────────────`);
  });

  console.log(`\n✅ Готово!`);
}

// Стартиране
main().catch(error => {
  console.error('❌ Фатална грешка:', error);
  process.exit(1);
});
