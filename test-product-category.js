// fetch-filstar-products.js - DEBUG версия с различни URL варианти
const fetch = require('node-fetch');

const FILSTAR_TOKEN = process.env.FILSTAR_API_TOKEN;
const API_VERSION = '2024-10';
const FILSTAR_API_BASE = 'https://filstar.com/api';
const FILSTAR_BASE_URL = 'https://filstar.com';

const TARGET_SKUS = ['52475', '962013', '956532', '957231', '946238', '957900'];

async function testAPICall(url, authMethod) {
  console.log(`\n🧪 Тестване: ${url}`);
  console.log(`   Auth: ${authMethod}`);

  const headers = {
    'Content-Type': 'application/json'
  };

  if (authMethod === 'Bearer') {
    headers['Authorization'] = `Bearer ${FILSTAR_TOKEN}`;
  } else if (authMethod === 'Token') {
    headers['Authorization'] = `Token ${FILSTAR_TOKEN}`;
  } else if (authMethod === 'ApiKey') {
    headers['X-API-Key'] = FILSTAR_TOKEN;
  }

  try {
    const response = await fetch(url, { headers });
    
    console.log(`   📡 Status: ${response.status}`);
    
    const text = await response.text();
    console.log(`   📦 Response (first 300 chars): ${text.substring(0, 300)}`);
    
    try {
      const json = JSON.parse(text);
      console.log(`   ✅ Valid JSON - Keys:`, Object.keys(json));
      return json;
    } catch (e) {
      console.log(`   ⚠️  Not JSON`);
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
  }
  
  return null;
}

async function main() {
  console.log('🚀 DEBUG - Тестване на различни API варианти\n');
  console.log(`🔑 Token налице: ${FILSTAR_TOKEN ? 'ДА' : 'НЕ'}\n`);

  const sku = TARGET_SKUS[0]; // Тестваме с първия SKU

  // Вариант 1: /api/products
  await testAPICall(
    `${FILSTAR_API_BASE}/products?page=1&limit=10&search=${sku}`,
    'Bearer'
  );

  // Вариант 2: без /api
  await testAPICall(
    `${FILSTAR_BASE_URL}/products?page=1&limit=10&search=${sku}`,
    'Bearer'
  );

  // Вариант 3: с Token вместо Bearer
  await testAPICall(
    `${FILSTAR_API_BASE}/products?page=1&limit=10&search=${sku}`,
    'Token'
  );

  // Вариант 4: с API version
  await testAPICall(
    `${FILSTAR_API_BASE}/${API_VERSION}/products?page=1&limit=10&search=${sku}`,
    'Bearer'
  );

  // Вариант 5: без search параметър - всички продукти
  await testAPICall(
    `${FILSTAR_API_BASE}/products?page=1&limit=10`,
    'Bearer'
  );

  console.log('\n✅ Тестване завършено');
}

main().catch(error => {
  console.error('❌ Фатална грешка:', error);
  process.exit(1);
});
