// scan-subcategories.js
const fetch = require('node-fetch');

const FILSTAR_TOKEN = process.env.FILSTAR_API_TOKEN;
const FILSTAR_API_BASE = 'https://filstar.com/api';

async function fetchAllProducts() {
  console.log('📦 Fetching all products from Filstar (Pages 1-20 limit)...');
  let allProducts = [];
  let page = 1;
  let hasMore = true;
  
  // Слагам лимит 20 страници за тест, махни условието (page > 20), ако искаш всички
  while (hasMore) {
    process.stdout.write(`\r⏳ Page ${page}...`);
    try {
      const response = await fetch(
        `${FILSTAR_API_BASE}/products?page=${page}&limit=1000`, // По-голям лимит за по-бързо
        {
          headers: {
            'Authorization': `Bearer ${FILSTAR_TOKEN}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      const data = await response.json();
      if (data && data.length > 0) {
        allProducts = allProducts.concat(data);
        page++;
        // Предпазител: Спри след 200 страници или ако няма данни
        if (page > 200) hasMore = false; 
      } else {
        hasMore = false;
      }
      
      // Пауза да не гръмне API-то
      await new Promise(resolve => setTimeout(resolve, 200));
      
    } catch (error) {
      console.error(`Error fetching page ${page}:`, error);
      hasMore = false;
    }
  }
  
  console.log(`\n✅ Total products fetched: ${allProducts.length}\n`);
  return allProducts;
}

async function generateReport() {
  const products = await fetchAllProducts();
  
  // Структура: { "ИмеНаКатегория": Map("ИмеНаПодкатегория" => "AttributeID") }
  // Ползваме Map за подкатегориите, за да избегнем дубликати автоматично
  const reportData = {};

  console.log('🔍 Analyzing attributes...');

  for (const product of products) {
    if (!product.categories || !product.variants) continue;

    // Взимаме имената на категориите на продукта
    const categoryNames = product.categories.map(c => c.name);

    for (const variant of product.variants) {
      if (!variant.attributes) continue;

      for (const attribute of variant.attributes) {
        const attrNameClean = attribute.attribute_name.trim().toLowerCase();
        
        // Проверяваме дали името на атрибута съвпада с някоя от категориите на продукта
        for (const catName of categoryNames) {
          if (attrNameClean === catName.trim().toLowerCase()) {
            
            // СЪВПАДЕНИЕ! Това е подкатегория.
            
            // 1. Инициализираме категорията в репорта ако я няма
            if (!reportData[catName]) {
              reportData[catName] = new Map();
            }

            // 2. Добавяме подкатегорията (стойността на атрибута) и ID-то
            // Тъй като е Map, ако вече имаме "Инструменти", то няма да се дублира
            const subCatName = attribute.value.trim();
            const attrId = attribute.attribute_id;
            
            reportData[catName].set(subCatName, attrId);
          }
        }
      }
    }
  }

  // --- ИЗВЕЖДАНЕ НА РЕЗУЛТАТА ---
  console.log('\n' + '='.repeat(60));
  console.log('📊 REPORT: SUBCATEGORY MAPPING');
  console.log('='.repeat(60) + '\n');

  const sortedCategories = Object.keys(reportData).sort();

  if (sortedCategories.length === 0) {
    console.log('❌ No matching attribute/category pairs found.');
  }

  for (const category of sortedCategories) {
    console.log(`📂 ГЛАВНА КАТЕГОРИЯ: ${category.toUpperCase()}`);
    console.log('-'.repeat(40));
    
    const subCategories = reportData[category]; // Това е Map
    
    // Сортираме подкатегориите по азбучен ред
    const sortedSubCats = Array.from(subCategories.keys()).sort();

    for (const subCat of sortedSubCats) {
      const id = subCategories.get(subCat);
      console.log(`   ↳ ${subCat} (Attr ID: ${id})`);
    }
    console.log('\n');
  }
}

generateReport();
