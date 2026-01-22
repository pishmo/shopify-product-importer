// fetch-filstar-products.js - Извличане на продукти по SKU от Filstar
const fetch = require('node-fetch');const FILSTAR_TOKEN = process.env.FILSTAR_API_TOKEN;
const API_VERSION = '2024-10';
const FILSTAR_API_BASE = 'https://filstar.com/api';// SKU номерата за търсене
const TARGET_SKUS = ['957383'];// Функция за fetch на продукти по SKU с пагинация
async function fetchProductsBySKU(sku) {
let allProducts = [];
let page = 1;
let hasMore = true; console.log(`🔍 Търсене на SKU: ${sku}`); while (hasMore) {
const url = `${FILSTAR_API_BASE}/products?page=${page}&limit=1000&search=${sku}`;

try {
const response = await fetch(url, {
headers: {
'Authorization': `Bearer ${FILSTAR_TOKEN}`,
'Content-Type': 'application/json'
}
}); if (!response.ok) {
throw new Error(`HTTP ${response.status}: ${response.statusText}`);
} const products = await response.json();

if (products && products.length > 0) {
allProducts = allProducts.concat(products);
console.log(` ✅ Намерени: ${products.length}`);

if (products.length < 1000) {
hasMore = false;
} else {
page++;
}
} else {
hasMore = false;
}
} catch (error) {
console.error(` ❌ Грешка:`, error.message);
hasMore = false;
}
} return allProducts;
}// Главна функция
async function main() {
console.log('🚀 Извличане на продукти от Filstar\n'); let allFoundProducts = [];
const categoriesMap = new Map(); // Fetch на всички SKU
for (const sku of TARGET_SKUS) {
const products = await fetchProductsBySKU(sku);
allFoundProducts = allFoundProducts.concat(products);
await new Promise(resolve => setTimeout(resolve, 500));
} console.log(`\n📊 Общо продукти: ${allFoundProducts.length}\n`); // Извличане на категории
console.log(`📁 КАТЕГОРИИ:\n${'='.repeat(100)}`);
console.log(`${'CAT_ID'.padEnd(8)} | ${'PARENT_ID'.padEnd(10)} | ${'CATEGORY NAME'.padEnd(40)} | PARENT NAME`);
console.log('='.repeat(100));

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
}); // Сортирай по parent_id и после по id
const sortedCategories = Array.from(categoriesMap.values()).sort((a, b) => {
const parentA = a.parent_id || 0;
const parentB = b.parent_id || 0;
if (parentA !== parentB) return parentA - parentB;
return a.id - b.id;
}); sortedCategories.forEach((cat) => {
const catId = cat.id.toString().padEnd(8);
const parentId = (cat.parent_id || 'NULL').toString().padEnd(10);
const catName = cat.name.padEnd(40);
const parentName = cat.parent_name || 'ROOT';
console.log(`${catId} | ${parentId} | ${catName} | ${parentName}`);
}); console.log('='.repeat(100));
console.log(`\n🔍 АНАЛИЗ НА КАТЕГОРИЯ "КОМПЛЕКТИ":\n${'='.repeat(100)}`);

// Търси категория "Комплекти" или подобни
const komplektiCategories = sortedCategories.filter(cat =>
cat.name.toLowerCase().includes('комплект') ||
cat.name.toLowerCase().includes('костюм') ||
cat.name.toLowerCase().includes('set')
);

if (komplektiCategories.length > 0) {
console.log(`Намерени ${komplektiCategories.length} категории за комплекти:\n`);
komplektiCategories.forEach(cat => {
console.log(` 📦 ${cat.name}`);
console.log(` Category ID: ${cat.id}`);
console.log(` Parent ID: ${cat.parent_id || 'NULL'}`);
console.log(` Parent Name: ${cat.parent_name || 'ROOT'}`);
console.log(``);
});
} else {
console.log(`❌ Не са намерени категории за комплекти!\n`);
} // Показване на продукти
console.log(`\n🎣 ПРОДУКТИ:\n${'='.repeat(100)}`); allFoundProducts.forEach((product, index) => {
console.log(`\n[${index + 1}] ${product.name}`);
console.log(` ID: ${product.id} | Manufacturer: ${product.manufacturer}`);

// Категории
if (product.categories && product.categories.length > 0) {
console.log(` 📁 Категории (${product.categories.length}):`);
product.categories.forEach(cat => {
console.log(` • ${cat.name}`);
console.log(` └─ CAT_ID: ${cat.id} | PARENT_ID: ${cat.parent_id || 'NULL'} | PARENT: ${cat.parent_name || 'ROOT'}`);
});
} else {
console.log(` ⚠️ БЕЗ КАТЕГОРИИ!`);
}

// Варианти
console.log(` 📦 Варианти: ${product.variants?.length || 0}`);
if (product.variants && product.variants.length > 0) {
product.variants.forEach((variant, vIdx) => {
console.log(` [${vIdx + 1}] SKU: ${variant.sku} | Model: ${variant.model} | Price: ${variant.price} EUR | Qty: ${variant.quantity}`);

// Атрибути
if (variant.attributes && variant.attributes.length > 0) {
variant.attributes.forEach(attr => {
console.log(` • ${attr.attribute_name}: ${attr.value}`);
});
}
});
}
}); console.log(`\n${'='.repeat(100)}`);
console.log(`✅ Готово! Намерени ${allFoundProducts.length} продукта с ${categoriesMap.size} уникални категории`);
console.log(`${'='.repeat(100)}`);
}// Стартиране
main().catch(error => {
console.error('❌ Фатална грешка:', error);
process.exit(1);
});
