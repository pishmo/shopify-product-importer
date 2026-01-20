const SHOPIFY_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const FILSTAR_TOKEN = process.env.FILSTAR_API_TOKEN;
const FILSTAR_API_BASE = 'https://filstar.com/api';
const API_VERSION = '2024-01';

// Filstar категории за влакна
const FILSTAR_LINE_CATEGORY_IDS = {
  monofilament: ['41'],
  braided: ['105'],
  fluorocarbon: ['107'],
  other: ['109']
};

const LINES_PARENT_ID = '4';

// ============================================
// FILSTAR API - Извличане на всички влакна
// ============================================

async function fetchAllFilstarProducts() {
  console.log('📡 Fetching ALL products from Filstar API...\n');
  
  let allProducts = [];
  let page = 1;
  let hasMore = true;
  
  while (hasMore) {
    try {
      const response = await fetch(
        `${FILSTAR_API_BASE}/products?page=${page}&per_page=100`,
        {
          headers: { 'Authorization': `Bearer ${FILSTAR_TOKEN}` }
        }
      );

      if (!response.ok) {
        throw new Error(`Filstar API error: ${response.status}`);
      }

      const products = await response.json();
      
      if (products.length === 0) {
        hasMore = false;
      } else {
        allProducts = allProducts.concat(products);
        console.log(`  Page ${page}: ${products.length} products (total: ${allProducts.length})`);
        page++;
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      
    } catch (error) {
      console.error(`Error fetching page ${page}:`, error.message);
      hasMore = false;
    }
  }
  
  console.log(`\n✅ Total Filstar products fetched: ${allProducts.length}\n`);
  return allProducts;
}

function categorizeFilstarLines(allProducts) {
  const lines = {
    monofilament: [],
    braided: [],
    fluorocarbon: [],
    other: []
  };
  
  for (const product of allProducts) {
    const categoryIds = product.categories?.map(c => c.id.toString()) || [];
    
    // Провери дали е влакно (има parent категория 4)
    const hasLinesParent = product.categories?.some(c => 
      c.parent_id?.toString() === LINES_PARENT_ID || 
      c.id.toString() === LINES_PARENT_ID
    );
    
    if (!hasLinesParent) {
      continue; // Не е влакно, пропусни
    }
    
    // Категоризирай по конкретна категория
    if (categoryIds.some(id => FILSTAR_LINE_CATEGORY_IDS.monofilament.includes(id))) {
      lines.monofilament.push(product);
    } else if (categoryIds.some(id => FILSTAR_LINE_CATEGORY_IDS.braided.includes(id))) {
      lines.braided.push(product);
    } else if (categoryIds.some(id => FILSTAR_LINE_CATEGORY_IDS.fluorocarbon.includes(id))) {
      lines.fluorocarbon.push(product);
    } else if (categoryIds.some(id => FILSTAR_LINE_CATEGORY_IDS.other.includes(id))) {
      lines.other.push(product);
    }
  }
  
  return lines;
}

// ============================================
// SHOPIFY API - Извличане на всички влакна
// ============================================

async function fetchAllShopifyProducts() {
  console.log('📡 Fetching ALL products from Shopify...');
  
  let allProducts = [];
  let pageInfo = null;
  let hasNextPage = true;
  let pageCount = 0;
  
  while (hasNextPage) {
    pageCount++;
    
    let url = `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/products.json?limit=250&fields=id,title,variants`;
    
    if (pageInfo) {
      url += `&page_info=${pageInfo}`;
    }
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-Shopify-Access-Token': ACCESS_TOKEN,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      console.error(`Failed to fetch Shopify products: ${response.status}`);
      throw new Error(`Shopify API error: ${response.status}`);
    }
    
    const data = await response.json();
    allProducts = allProducts.concat(data.products);
    
    console.log(`  Page ${pageCount}: ${data.products.length} products (total: ${allProducts.length})`);
    
    // Провери за следваща страница
    const linkHeader = response.headers.get('Link');
    if (linkHeader && linkHeader.includes('rel="next"')) {
      const nextMatch = linkHeader.match(/<[^>]*[?&]page_info=([^>&]+)[^>]*>;\s*rel="next"/);
      if (nextMatch) {
        pageInfo = nextMatch[1];
      } else {
        hasNextPage = false;
      }
    } else {
      hasNextPage = false;
    }
    
    // Пауза между заявките - увеличена на 1 секунда
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log(`✅ Total Shopify products fetched: ${allProducts.length}\n`);
  return allProducts;
}


function categorizeShopifyLines(allProducts) {
  const lines = {
    monofilament: [],
    braided: [],
    fluorocarbon: [],
    other: []
  };
  
  for (const product of allProducts) {
    const type = product.productType?.toLowerCase() || '';
    const tags = product.tags || [];
    
    // Филтрирай само влакна (по productType или tags)
    const isLine = type.includes('влакн') || 
                   type.includes('line') ||
                   tags.some(t => t.toLowerCase().includes('line') || t.toLowerCase().includes('влакн'));
    
    if (!isLine) {
      continue; // Не е влакно
    }
    
    // Категоризирай по productType или tags
    if (type.includes('монофилн') || tags.includes('monofilament')) {
      lines.monofilament.push(product);
    } else if (type.includes('плетен') || tags.includes('braided')) {
      lines.braided.push(product);
    } else if (type.includes('fluorocarbon') || type.includes('флуорокарбон')) {
      lines.fluorocarbon.push(product);
    } else {
      lines.other.push(product);
    }
  }
  
  return lines;
}

// ============================================
// СРАВНЕНИЕ И АНАЛИЗ
// ============================================

function compareProducts(filstarLines, shopifyLines) {
  console.log('\n' + '='.repeat(80));
  console.log('📊 COMPARISON REPORT');
  console.log('='.repeat(80) + '\n');
  
  const categories = ['monofilament', 'braided', 'fluorocarbon', 'other'];
  const report = {
    matched: [],
    missingInShopify: [],
    extraInShopify: []
  };
  
  for (const category of categories) {
    const categoryName = {
      monofilament: 'Монофилни',
      braided: 'Плетени',
      fluorocarbon: 'Флуорокарбон',
      other: 'Други'
    }[category];
    
    console.log(`\n${'─'.repeat(80)}`);
    console.log(`📦 ${categoryName.toUpperCase()}`);
    console.log('─'.repeat(80));
    
    const filstarProducts = filstarLines[category] || [];
    const shopifyProducts = shopifyLines[category] || [];
    
    console.log(`\n  Filstar:  ${filstarProducts.length} products`);
    console.log(`  Shopify:  ${shopifyProducts.length} products`);
    
    // Създай map на Shopify продукти по SKU
    const shopifySKUs = new Map();
    for (const product of shopifyProducts) {
      for (const variant of product.variants) {
        if (variant.sku) {
          shopifySKUs.set(variant.sku, {
            productTitle: product.title,
            variantTitle: variant.title,
            productId: product.id
          });
        }
      }
    }
    
    // Създай map на Filstar продукти по SKU
    const filstarSKUs = new Map();
    for (const product of filstarProducts) {
      if (product.variants) {
        for (const variant of product.variants) {
          if (variant.sku) {
            filstarSKUs.set(variant.sku, {
              productName: product.name,
              variantAttributes: variant.attributes
            });
          }
        }
      }
    }
    
    // Намери съвпадения
    const matched = [];
    const missingInShopify = [];
    
    for (const [sku, filstarData] of filstarSKUs) {
      if (shopifySKUs.has(sku)) {
        matched.push({ sku, ...filstarData, ...shopifySKUs.get(sku) });
      } else {
        missingInShopify.push({ sku, ...filstarData });
      }
    }
    
    // Намери излишни в Shopify
    const extraInShopify = [];
    for (const [sku, shopifyData] of shopifySKUs) {
      if (!filstarSKUs.has(sku)) {
        extraInShopify.push({ sku, ...shopifyData });
      }
    }
    
    // Покажи резултати
    console.log(`\n  ✅ Matched:           ${matched.length} SKUs`);
    console.log(`  ⚠️  Missing in Shopify: ${missingInShopify.length} SKUs`);
    console.log(`  ❌ Extra in Shopify:   ${extraInShopify.length} SKUs`);
    
    // Детайли за липсващи
    if (missingInShopify.length > 0) {
      console.log(`\n  📋 Missing in Shopify (${category}):`);
      for (const item of missingInShopify.slice(0, 10)) {
        console.log(`     - ${item.sku}: ${item.productName}`);
      }
      if (missingInShopify.length > 10) {
        console.log(`     ... and ${missingInShopify.length - 10} more`);
      }
    }
    
    // Детайли за излишни
    if (extraInShopify.length > 0) {
      console.log(`\n  📋 Extra in Shopify (${category}):`);
      for (const item of extraInShopify.slice(0, 10)) {
        console.log(`     - ${item.sku}: ${item.productTitle}`);
      }
      if (extraInShopify.length > 10) {
        console.log(`     ... and ${extraInShopify.length - 10} more`);
      }
    }
    
    // Запази в report
    report.matched.push(...matched.map(m => ({ ...m, category })));
    report.missingInShopify.push(...missingInShopify.map(m => ({ ...m, category })));
    report.extraInShopify.push(...extraInShopify.map(e => ({ ...e, category })));
  }
  
  return report;
}

// В края на скрипта, промени printComparison функцията:

function printComparison(matched, missingInShopify, extraInShopify) {
  console.log('\n' + '='.repeat(70));
  console.log('📊 COMPARISON RESULTS');
  console.log('='.repeat(70));
  
  // Брой уникални продукти (не варианти)
  const uniqueFilstarProducts = new Set(missingInShopify.map(sku => sku.split('-')[0])).size;
  const uniqueShopifyProducts = new Set(extraInShopify.map(sku => sku.split('-')[0])).size;
  const uniqueMatchedProducts = new Set(matched.map(sku => sku.split('-')[0])).size;
  
  console.log(`✅ Matched products:        ${uniqueMatchedProducts}`);
  console.log(`⚠️  Missing in Shopify:     ${uniqueFilstarProducts} products`);
  console.log(`❌ Extra in Shopify:        ${uniqueShopifyProducts} products`);
  console.log('='.repeat(70) + '\n');
}


// ============================================
// MAIN
// ============================================


function printFinalSummary(filstarProducts, shopifyProducts, matched, missingInShopify, extraInShopify) {
  console.log('\n' + '='.repeat(70));
  console.log('📊 AUDIT SUMMARY');
  console.log('='.repeat(70));
  
  // Брой продукти (не варианти)
  const uniqueFilstar = new Set(filstarProducts.map(p => p.variants[0].sku.split('-')[0])).size;
  const uniqueShopify = shopifyProducts.length;
  const uniqueMatched = new Set(matched.map(sku => sku.split('-')[0])).size;
  const uniqueMissing = new Set(missingInShopify.map(sku => sku.split('-')[0])).size;
  const uniqueExtra = new Set(extraInShopify.map(sku => sku.split('-')[0])).size;
  
  console.log(`Filstar:  ${uniqueFilstar} products`);
  console.log(`Shopify:  ${uniqueShopify} products`);
  console.log(`✅ Matched:           ${uniqueMatched} products`);
  console.log(`⚠️  Missing in Shopify: ${uniqueMissing} products`);
  console.log(`❌ Extra in Shopify:   ${uniqueExtra} products`);
  console.log('='.repeat(70) + '\n');
}









async function main() {
  try {
    console.log('🔍 Starting Fishing Lines Audit...\n');
    
    // Fetch от Filstar
    const allFilstarProducts = await fetchAllFilstarProducts();
    const filstarLines = categorizeFilstarLines(allFilstarProducts);
    
    console.log('📦 Filstar fishing lines by category:');
    console.log(`  - Monofilament:  ${filstarLines.monofilament.length}`);
    console.log(`  - Braided:       ${filstarLines.braided.length}`);
    console.log(`  - Fluorocarbon:  ${filstarLines.fluorocarbon.length}`);
    console.log(`  - Other:         ${filstarLines.other.length}`);
    console.log(`  - Total:         ${filstarLines.monofilament.length + filstarLines.braided.length + filstarLines.fluorocarbon.length + filstarLines.other.length}\n`);
    
    // Fetch от Shopify
    const allShopifyProducts = await fetchAllShopifyProducts();
    const shopifyLines = categorizeShopifyLines(allShopifyProducts);
    
    console.log('📦 Shopify fishing lines by category:');
    console.log(`  - Monofilament:  ${shopifyLines.monofilament.length}`);
    console.log(`  - Braided:       ${shopifyLines.braided.length}`);
    console.log(`  - Fluorocarbon:  ${shopifyLines.fluorocarbon.length}`);
    console.log(`  - Other:         ${shopifyLines.other.length}`);
    console.log(`  - Total:         ${shopifyLines.monofilament.length + shopifyLines.braided.length + shopifyLines.fluorocarbon.length + shopifyLines.other.length}\n`);
    
    // Сравни
    const report = compareProducts(filstarLines, shopifyLines);
    
    // Финален summary
    printFinalSummary(report);
    
    console.log('\n✅ Audit completed!\n');
    
  } catch (error) {
    console.error('❌ Audit failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
