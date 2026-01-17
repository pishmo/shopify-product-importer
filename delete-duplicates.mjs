import fetch from 'node-fetch';

const SHOPIFY_DOMAIN = process.env.SHOPIFY_DOMAIN;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const API_VERSION = '2024-10';

// Fetch всички продукти с пагинация
async function fetchAllProducts() {
  console.log('📥 Fetching all products...');
  
  let allProducts = [];
  let hasNextPage = true;
  let pageInfo = null;
  
  while (hasNextPage) {
    const url = pageInfo 
      ? `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/products.json?fields=id,title&limit=250&page_info=${pageInfo}`
      : `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/products.json?fields=id,title&limit=250`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-Shopify-Access-Token': ACCESS_TOKEN,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error('Failed to fetch products');
    }
    
    const data = await response.json();
    allProducts = allProducts.concat(data.products);
    
    const linkHeader = response.headers.get('Link');
    if (linkHeader && linkHeader.includes('rel="next"')) {
      const nextMatch = linkHeader.match(/<[^>]*page_info=([^>&]+)[^>]*>;\s*rel="next"/);
      if (nextMatch) {
        pageInfo = nextMatch[1];
      } else {
        hasNextPage = false;
      }
    } else {
      hasNextPage = false;
    }
    
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  
  console.log(`✅ Fetched ${allProducts.length} products`);
  return allProducts;
}

// Намери дубликати
function findDuplicates(products) {
  console.log('\n🔍 Finding duplicates...');
  
  const productsByTitle = {};
  
  // Групирай по заглавие
  for (const product of products) {
    if (!productsByTitle[product.title]) {
      productsByTitle[product.title] = [];
    }
    productsByTitle[product.title].push(product);
  }
  
  // Намери само тези с дубликати
  const duplicates = {};
  for (const [title, prods] of Object.entries(productsByTitle)) {
    if (prods.length > 1) {
      // Сортирай по ID (най-новият има най-голямо ID)
      prods.sort((a, b) => b.id - a.id);
      duplicates[title] = prods;
    }
  }
  
  return duplicates;
}

// Изтрий продукт
async function deleteProduct(productId) {
  const url = `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/products/${productId}.json`;
  
  const response = await fetch(url, {
    method: 'DELETE',
    headers: {
      'X-Shopify-Access-Token': ACCESS_TOKEN
    }
  });
  
  if (!response.ok) {
    throw new Error(`Failed to delete product ${productId}`);
  }
  
  await new Promise(resolve => setTimeout(resolve, 500));
}

// Главна функция
async function main() {
  try {
    console.log('🗑️  DUPLICATE PRODUCT CLEANER');
    console.log('======================================================================\n');
    
    // Fetch всички продукти
    const allProducts = await fetchAllProducts();
    
    // Намери дубликати
    const duplicates = findDuplicates(allProducts);
    
    const duplicateCount = Object.keys(duplicates).length;
    
    if (duplicateCount === 0) {
      console.log('✅ No duplicates found!');
      return;
    }
    
    console.log(`\n⚠️  Found ${duplicateCount} products with duplicates:\n`);
    
    let totalToDelete = 0;
    
    // Покажи дубликатите
    for (const [title, prods] of Object.entries(duplicates)) {
      console.log(`📦 ${title}`);
      console.log(`   Total: ${prods.length} copies`);
      console.log(`   ✅ Keep: ID ${prods[0].id} (newest)`);
      for (let i = 1; i < prods.length; i++) {
        console.log(`   ❌ Delete: ID ${prods[i].id}`);
        totalToDelete++;
      }
      console.log('');
    }
    
    console.log(`\n📊 Summary: Will delete ${totalToDelete} duplicate products\n`);
    console.log('⏳ Starting deletion...\n');
    
    let deleted = 0;
    
    // Изтрий дубликатите (запази само първия - най-новия)
    for (const [title, prods] of Object.entries(duplicates)) {
      for (let i = 1; i < prods.length; i++) {
        try {
          await deleteProduct(prods[i].id);
          deleted++;
          console.log(`✓ Deleted: ${title} (ID: ${prods[i].id}) [${deleted}/${totalToDelete}]`);
        } catch (error) {
          console.error(`✗ Failed to delete ${title} (ID: ${prods[i].id}):`, error.message);
        }
      }
    }
    
    console.log('\n======================================================================');
    console.log(`✅ Cleanup completed! Deleted ${deleted} duplicate products`);
    console.log('======================================================================\n');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
