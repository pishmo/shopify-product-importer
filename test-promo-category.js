// test-promo-pagination.js - Пълно извличане на категория Промо с пагинация
const fetch = require('node-fetch');

const FILSTAR_TOKEN = process.env.FILSTAR_API_TOKEN;
const FILSTAR_API_BASE = 'https://filstar.com/api';
const PROMO_CATEGORY_ID = '117';

async function fetchAllPromoProducts() {
  let allPromoProducts = [];
  let page = 1;
  let hasMore = true;

  console.log(`🚀 Стартиране на извличане за категория ${PROMO_CATEGORY_ID}...`);

  while (hasMore) {
    console.log(`  Reading page ${page}...`);
    const url = `${FILSTAR_API_BASE}/products?category_id=${PROMO_CATEGORY_ID}&limit=1000&page=${page}`;
    
    try {
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${FILSTAR_TOKEN}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();

      if (data && data.length > 0) {
        allPromoProducts = allPromoProducts.concat(data);
        page++;
        // Ако върнатите продукти са по-малко от лимита, значи сме на последната страница
        if (data.length < 1000) hasMore = false;
      } else {
        hasMore = false;
      }
    } catch (error) {
      console.error(`❌ Грешка на страница ${page}:`, error.message);
      hasMore = false;
    }
  }

  console.log(`\n✅ Общо намерени продукти в Промо: ${allPromoProducts.length}`);
  
  // Да проверим SKU-тата, които търсихме по-рано
  const targetSkus = ['942156', '944055'];
  targetSkus.forEach(sku => {
    const found = allPromoProducts.find(p => p.variants.some(v => v.sku === sku));
    if (found) {
      const variant = found.variants.find(v => v.sku === sku);
      console.log(`\n📍 Анализ за SKU ${sku}:`);
      console.log(`   Име: ${found.name}`);
      console.log(`   Цена в API: ${variant.price}`);
      console.log(`   Всички полета във варианта: ${Object.keys(variant).join(', ')}`);
    } else {
      console.log(`\n❌ SKU ${sku} не беше намерено в категория Промо.`);
    }
  });
}

fetchAllPromoProducts();
