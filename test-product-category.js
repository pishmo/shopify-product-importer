const FILSTAR_TOKEN = process.env.FILSTAR_API_TOKEN;
const FILSTAR_API_BASE = 'https://filstar.com/api';
const TEST_SKU = '52475';

async function testProductCategory() {
  console.log(`🔍 Searching for product with SKU: ${TEST_SKU}\n`);
  
  try {
    let allProducts = [];
    let page = 1;
    let hasMore = true;
    
    while (hasMore) {
      console.log(`📥 Fetching page ${page}...`);
      
      const response = await fetch(`${FILSTAR_API_BASE}/products?page=${page}&limit=1000`, {
        headers: { 'Authorization': `Bearer ${FILSTAR_TOKEN}` }
      });

      if (!response.ok) {
        throw new Error(`Filstar API error: ${response.status}`);
      }

      const products = await response.json();
      console.log(`  ✓ Page ${page}: ${products.length} products`);
      
      if (products.length === 0) {
        hasMore = false;
      } else {
        allProducts = allProducts.concat(products);
        page++;
      }
    }
    
    console.log(`\n✅ Total products fetched: ${allProducts.length}\n`);
    
    let foundProduct = null;
    
    for (const product of allProducts) {
      if (product.variants && product.variants.length > 0) {
        const hasMatchingSKU = product.variants.some(v => v.sku === TEST_SKU);
        if (hasMatchingSKU) {
          foundProduct = product;
          break;
        }
      }
    }
    
    if (!foundProduct) {
      console.log(`❌ Product with SKU "${TEST_SKU}" not found`);
      return;
    }
    
    console.log(`✅ Found product: ${foundProduct.name}\n`);
    console.log(`📦 Product ID: ${foundProduct.id}`);
    console.log(`📝 Product name: ${foundProduct.name}`);
    console.log(`🔗 SKU: ${TEST_SKU}\n`);
    
    if (foundProduct.categories && foundProduct.categories.length > 0) {
      console.log(`📂 Categories (${foundProduct.categories.length}):\n`);
      
      foundProduct.categories.forEach((cat, index) => {
        console.log(`${index + 1}. Category:`);
        console.log(`   - ID: ${cat.id}`);
        console.log(`   - Name: ${cat.name}`);
        console.log(`   - Parent ID: ${cat.parent_id || 'N/A'}`);
        console.log(`   - Slug: ${cat.slug || 'N/A'}`);
        console.log('');
      });
    } else {
      console.log('⚠️  No categories found for this product\n');
    }
    
    if (foundProduct.variants && foundProduct.variants.length > 0) {
      console.log(`🎯 Variants (${foundProduct.variants.length}):\n`);
      
      foundProduct.variants.forEach((variant, index) => {
        console.log(`${index + 1}. SKU: ${variant.sku}`);
        console.log(`   - Price: ${variant.price}`);
        console.log(`   - Quantity: ${variant.quantity}`);
        
        if (variant.attributes && variant.attributes.length > 0) {
          console.log(`   - Attributes:`);
          variant.attributes.forEach(attr => {
            console.log(`     • ${attr.name}: ${attr.value}`);
          });
        }
        console.log('');
      });
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('📄 Full product JSON:');
    console.log('='.repeat(60));
    console.log(JSON.stringify(foundProduct, null, 2));
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

testProductCategory();
