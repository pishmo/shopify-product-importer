// import-clothing.js - Импорт на облекло с нормализация на снимки
const fetch = require('node-fetch');
const sharp = require('sharp');

const SHOPIFY_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const FILSTAR_TOKEN = process.env.FILSTAR_API_TOKEN;
const API_VERSION = '2024-10';
const FILSTAR_API_BASE = 'https://filstar.com/api';
const FILSTAR_BASE_URL = 'https://filstar.com';

// Конфигурация за нормализация на снимки
const TARGET_WIDTH = 1200;
const TARGET_HEIGHT = 1000;
const BACKGROUND_COLOR = { r: 255, g: 255, b: 255, alpha: 1 };

// Колекции за облекло (TODO: добави GID-овете на колекциите)
const COLLECTION_MAPPING = {
  shoes: null,
  tshirts: null,
  pants: null,
  jackets: null,
  hats: null,
  gloves: null,
  sunglasses: null,
  sets: null,
  other: null
};

// Filstar категории за облекло
const FILSTAR_CLOTHING_CATEGORY_IDS = {
  shoes: ['90'],
  tshirts: ['84'],
  pants: ['85'],
  jackets: ['86'],
  hats: ['88'],
  gloves: ['89'],
  sunglasses: ['92'],
  sets: ['91'],
  other: ['95']
};

const CLOTHING_PARENT_ID = '10';

// Статистика
const stats = {
  shoes: { created: 0, updated: 0, images: 0 },
  tshirts: { created: 0, updated: 0, images: 0 },
  pants: { created: 0, updated: 0, images: 0 },
  jackets: { created: 0, updated: 0, images: 0 },
  hats: { created: 0, updated: 0, images: 0 },
  gloves: { created: 0, updated: 0, images: 0 },
  sunglasses: { created: 0, updated: 0, images: 0 },
  sets: { created: 0, updated: 0, images: 0 },
  other: { created: 0, updated: 0, images: 0 }
};

// Имена на категориите
function getCategoryName(category) {
  const names = {
    shoes: 'Обувки',
    tshirts: 'Тениски',
    pants: 'Панталони',
    jackets: 'Якета',
    hats: 'Шапки',
    gloves: 'Ръкавици',
    sunglasses: 'Слънчеви очила',
    sets: 'Комплекти и костюми',
    other: 'Друго облекло'
  };
  return names[category] || category;
}

async function getAllShopifyProducts() {
  console.log('📦 Fetching all Shopify products...');
  
  let allProducts = [];
  let hasNextPage = true;
  let pageInfo = null;
  let pageCount = 0;
  
  while (hasNextPage) {
    pageCount++;
    let url = `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/products.json?fields=id,title,variants,images&limit=250`;
    
    if (pageInfo) {
      url += `&page_info=${pageInfo}`;
    }
    
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'X-Shopify-Access-Token': ACCESS_TOKEN,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        console.error(`  ❌ Failed to fetch products (page ${pageCount}): ${response.status}`);
        break;
      }
      
      const data = await response.json();
      allProducts = allProducts.concat(data.products);
      
      console.log(`  ✓ Page ${pageCount}: ${data.products.length} products (Total: ${allProducts.length})`);
      
      const linkHeader = response.headers.get('Link');
      if (linkHeader && linkHeader.includes('rel="next"')) {
        const nextMatch = linkHeader.match(/<[^>]*page_info=([^>&]+)[^>]*>;\s*rel="next"/);
        pageInfo = nextMatch ? nextMatch[1] : null;
        hasNextPage = !!pageInfo;
      } else {
        hasNextPage = false;
      }
      
      await new Promise(resolve => setTimeout(resolve, 500));
      
    } catch (error) {
      console.error(`  ❌ Error fetching products (page ${pageCount}):`, error.message);
      break;
    }
  }
  
  console.log(`✅ Fetched ${allProducts.length} products from ${pageCount} pages`);
  return allProducts;
}

async function deleteExtraProducts(filstarProducts, shopifyProducts) {
  const filstarSKUs = new Set();
  
  filstarProducts.forEach(p => {
    if (p.sku) filstarSKUs.add(p.sku.toString());
    if (p.variants) {
      p.variants.forEach(v => {
        if (v.sku) filstarSKUs.add(v.sku.toString());
      });
    }
  });
  
  for (const shopifyProduct of shopifyProducts) {
    const hasMatchingSKU = shopifyProduct.variants.some(v => 
      filstarSKUs.has(v.sku?.toString())
    );
    
    if (!hasMatchingSKU) {
      console.log(`🗑️  Deleting extra product: ${shopifyProduct.title} (ID: ${shopifyProduct.id})`);
      
      await fetch(
        `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/products/${shopifyProduct.id}.json`,
        {
          method: 'DELETE',
          headers: { 'X-Shopify-Access-Token': ACCESS_TOKEN }
        }
      );
      
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
}

async function fetchAllProducts() {
  console.log('📦 Fetching all products from Filstar API with pagination...');
  
  let allProducts = [];
  let page = 1;
  let hasMorePages = true;

  try {
    while (hasMorePages) {
      console.log(`Fetching page ${page}...`);
      
      const response = await fetch(
        `${FILSTAR_API_BASE}/products?page=${page}&limit=1000`,
        {
          headers: {
            'Authorization': `Bearer ${FILSTAR_TOKEN}`
          }
        }
      );

      if (!response.ok) {
        throw new Error(`Filstar API error: ${response.status}`);
      }

      const pageProducts = await response.json();
      console.log(`  ✓ Page ${page}: ${pageProducts.length} products`);

      if (pageProducts.length === 0) {
        console.log('  ℹ️ No more products, stopping pagination');
        hasMorePages = false;
      } else {
        allProducts = allProducts.concat(pageProducts);
        page++;
        
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }

    console.log(`\n✅ Total products fetched: ${allProducts.length}\n`);
    return allProducts;

  } catch (error) {
    console.error('❌ Error fetching products:', error.message);
    throw error;
  }
}

function getCategoryType(filstarProduct) {
  if (!filstarProduct.categories || filstarProduct.categories.length === 0) {
    return null;
  }
  
  const hasClothingParent = filstarProduct.categories.some(c => c.parent_id?.toString() === CLOTHING_PARENT_ID);
  
  if (!hasClothingParent) {
    return null;
  }
  
  for (const cat of filstarProduct.categories) {
    const catId = cat.id?.toString();
    
    if (FILSTAR_CLOTHING_CATEGORY_IDS.shoes.includes(catId)) {
      return 'shoes';
    }
    if (FILSTAR_CLOTHING_CATEGORY_IDS.tshirts.includes(catId)) {
      return 'tshirts';
    }
    if (FILSTAR_CLOTHING_CATEGORY_IDS.pants.includes(catId)) {
      return 'pants';
    }
    if (FILSTAR_CLOTHING_CATEGORY_IDS.jackets.includes(catId)) {
      return 'jackets';
    }
    if (FILSTAR_CLOTHING_CATEGORY_IDS.hats.includes(catId)) {
      return 'hats';
    }
    if (FILSTAR_CLOTHING_CATEGORY_IDS.gloves.includes(catId)) {
      return 'gloves';
    }
    if (FILSTAR_CLOTHING_CATEGORY_IDS.sunglasses.includes(catId)) {
      return 'sunglasses';
    }
    if (FILSTAR_CLOTHING_CATEGORY_IDS.sets.includes(catId)) {
      return 'sets';
    }
    if (FILSTAR_CLOTHING_CATEGORY_IDS.other.includes(catId)) {
      return 'other';
    }
  }
  
  return null;
}
