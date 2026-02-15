// test-respond-sku.js - Дълбок анализ на атрибути и скрити полета
const fetch = require('node-fetch');

const FILSTAR_TOKEN = process.env.FILSTAR_API_TOKEN;
const FILSTAR_API_BASE = 'https://filstar.com/api';

const TEST_SKUS = ['963810']; // Можеш да добавиш и '944055' за сравнение

async function fetchAllProducts() {
    console.log('📦 Извличане на продукти от Filstar за анализ...\n');
    let allProducts = [];
    let page = 1;
    let hasMore = true;

    while (hasMore && page <= 15) { // Увеличихме обхвата на страниците
        const response = await fetch(
            `${FILSTAR_API_BASE}/products?page=${page}&limit=1000`,
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
        } else {
            hasMore = false;
        }
    }
    return allProducts;
}

async function runDeepAnalysis() {
    const allProducts = await fetchAllProducts();

    for (const sku of TEST_SKUS) {
        console.log(`\n📍 Търсене на SKU: ${sku}`);
        const product = allProducts.find(p => p.variants?.some(v => v.sku === sku));

        if (product) {
            console.log(`✅ НАМЕРЕН: ${product.name}`);
            
            // 1. Анализ на ниво продукт (дали няма общо поле за отстъпка)
            console.log('\n--- 🧩 КЛЮЧОВЕ НА НИВО ПРОДУКТ ---');
            console.log(Object.keys(product).join(', '));

            // 2. Анализ на вариантите (където обикновено са цените)
            product.variants.forEach((v, i) => {
                if (v.sku === sku) {
                    console.log(`\n--- 🔧 ДЪЛБОК АНАЛИЗ НА ВАРИАНТ [${i}] ---`);
                    
                    // Показваме абсолютно всички ключове
                    const keys = Object.keys(v);
                    console.log('Всички налични полета:', keys.join(', '));

                    // Търсим специфични ключове, които съдържат "price" или "discount"
                    const interestingKeys = keys.filter(k => 
                        k.toLowerCase().includes('price') || 
                        k.toLowerCase().includes('disc') ||
                        k.toLowerCase().includes('promo') ||
                        k.toLowerCase().includes('old')
                    );

                    console.log('Открити ценови/промо полета:', interestingKeys);
                    
                    // Изписваме пълния обект на варианта за финален преглед
                    console.log('\nПълен обект на варианта:');
                    console.log(JSON.stringify(v, null, 2));
                }
            });
        } else {
            console.log(`❌ SKU ${sku} не беше намерено в първите 15 страници.`);
        }
    }
}

runDeepAnalysis();
