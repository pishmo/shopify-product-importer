// test-promo-category.js - Тест за извличане на продукти от категория Промо (ID 117)
const fetch = require('node-fetch');

// Твоите данни за достъп (увери се, че са в environment variables или ги попълни за теста)
const FILSTAR_TOKEN = process.env.FILSTAR_API_TOKEN;
const FILSTAR_API_BASE = 'https://filstar.com/api';

const PROMO_CATEGORY_ID = '117'; // ID-то на категория "Промо"

async function testPromoCategory() {
  console.log(`🔍 1. Опит за извличане на продукти от категория ID: ${PROMO_CATEGORY_ID}...`);

  try {
    // Опитваме да подадем категорията като параметър
    const url = `${FILSTAR_API_BASE}/products?category_id=${PROMO_CATEGORY_ID}&limit=50`;
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${FILSTAR_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Грешка при заявката: ${response.status}`);
    }

    const data = await response.json();

    if (!data || data.length === 0) {
      console.log('⚠️ Не бяха върнати продукти за тази категория или филтърът не работи.');
      return;
    }

    console.log(`✅ Намерени ${data.length} продукта в заявката.\n`);
    console.log('--- 📊 АНАЛИЗ НА ПЪРВИТЕ 3 ПРОДУКТА ---');

    // Анализираме първите няколко продукта за цени
    data.slice(0, 3).forEach((product, index) => {
      console.log(`\n📦 [${index + 1}] Име: ${product.name}`);
      
      product.variants.forEach((v) => {
        console.log(`   🔹 SKU: ${v.sku}`);
        console.log(`   🔹 Цена в API: ${v.price}`);
        
        // Търсим дали тук няма да се появят нови полета, които липсваха в общия списък
        const keys = Object.keys(v);
        if (keys.length > 9) {
          console.log(`   ⚠️ Открити допълнителни полета: ${keys.filter(k => !['id', 'sku', 'barcode', 'price', 'quantity', 'model', 'position', 'image', 'attributes'].includes(k))}`);
        }
      });
    });

  } catch (error) {
    console.error(`❌ Възникна грешка: ${error.message}`);
  }
}

testPromoCategory();
