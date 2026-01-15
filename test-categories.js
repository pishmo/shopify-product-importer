// test-categories.js - Проверка за pagination
const fetch = require('node-fetch');

const FILSTAR_TOKEN = process.env.FILSTAR_API_TOKEN;
const FILSTAR_API_BASE = 'https://filstar.com/api';

async function checkPagination() {
  console.log('🔍 Checking for pagination...\n');
  
  try {
    // Опитай с page параметър
    console.log('Fetching page 1...');
    const response1 = await fetch(`${FILSTAR_API_BASE}/products?page=1&limit=100`, {
      headers: { 'Authorization': `Bearer ${FILSTAR_TOKEN}` }
    });
    
    console.log('Fetching page 2...');
    const response2 = await fetch(`${FILSTAR_API_BASE}/products?page=2&limit=100`, {
      headers: { 'Authorization': `Bearer ${FILSTAR_TOKEN}` }
    });
    
    if (response1.ok && response2.ok) {
      const page1 = await response1.json();
      const page2 = await response2.json();
      
      console.log(`\nPage 1: ${page1.length} products`);
      console.log(`Page 2: ${page2.length} products`);
      
      if (page1.length > 0 && page2.length > 0) {
        console.log(`\nFirst product page 1: ${page1[0]?.name} (ID: ${page1[0]?.id})`);
        console.log(`First product page 2: ${page2[0]?.name} (ID: ${page2[0]?.id})`);
        
        if (page1[0]?.id !== page2[0]?.id) {
          console.log('\n✅ Pagination WORKS! Pages have different products.');
          console.log('Need to fetch ALL pages to get all products!');
        } else {
          console.log('\n❌ Pagination might not work - same products on both pages.');
        }
      }
    } else {
      console.log(`\n❌ API error - Page 1: ${response1.status}, Page 2: ${response2.status}`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

checkPagination();
