// test-sku.js - Тестване на конкретни SKU-та с image sync анализ
const fetch = require('node-fetch');

const SHOPIFY_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const FILSTAR_TOKEN = process.env.FILSTAR_API_TOKEN;
const API_VERSION = '2024-10';
const FILSTAR_API_BASE = 'https://filstar.com/api';

// SKU-та за тестване
const TEST_SKUS = [
  '963102',
  // Добави още SKU-та тук ако искаш да тестваш повече
];

// ============================================
// IMAGE HELPER FUNCTIONS
// ============================================

function normalizeFilename(url) {
  if (!url || typeof url !== 'string') return null;
  
  const filename = url.split('/').pop().split('?')[0];
  return filename
    .replace(/_[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/g, '')
    .replace(/_[a-f0-9]{32}/g, '');
}

function getImageFilename(src) {
  return normalizeFilename(src);
}

function extractFilename(url) {
  const filename = url.split('/').pop();
  return filename.replace(/\.[^/.]+$/, '');
}

// ============================================
// IMAGE SYNC ANALYSIS (COMPACT VERSION)
// ============================================

function analyzeImageSync(shopifyProduct, filstarProduct) {
  console.log('\n🖼️  IMAGE SYNC ANALYSIS');
  console.log('═'.repeat(60));
  
  const shopifyImages = shopifyProduct.images || [];
  const filstarImages = filstarProduct.images || [];
  
  // Build ordered Filstar image list (product + variants)
  const orderedFilstarImages = [];
  let position = 1;
  
  // Product images first
  filstarImages.forEach(imgUrl => {
    orderedFilstarImages.push({
      src: imgUrl,
      filename: normalizeFilename(imgUrl),
      position: position++,
      type: 'product'
    });
  });
  
  // Variant images after (if any)
  if (filstarProduct.variants?.length > 0) {
    filstarProduct.variants.forEach((variant, idx) => {
      if (variant.images?.length > 0) {
        variant.images.forEach(imgUrl => {
          orderedFilstarImages.push({
            src: imgUrl,
            filename: normalizeFilename(imgUrl),
            position: position++,
            type: `variant-${idx + 1}`,
            variantSku: variant.sku
          });
        });
      }
    });
  }
  
  // Create map of existing Shopify images
  const existingImageMap = new Map();
  shopifyImages.forEach(img => {
    const normalized = normalizeFilename(img.src);
    if (!existingImageMap.has(normalized)) {
      existingImageMap.set(normalized, []);
    }
    existingImageMap.get(normalized).push({
      id: img.id,
      position: img.position,
      created: img.created_at
    });
  });
  
  // Categorize images
  const imagesToUpload = [];
  const imagesToKeep = [];
  const imagesToDelete = [];
  
  orderedFilstarImages.forEach(filstarImg => {
    if (existingImageMap.has(filstarImg.filename)) {
      const existing = existingImageMap.get(filstarImg.filename);
      // Keep first occurrence
      imagesToKeep.push({
        id: existing[0].id,
        pos: existing[0].position,
        target: filstarImg.position,
        name: filstarImg.filename.substring(0, 35),
        type: filstarImg.type
      });
      
      // Mark duplicates for deletion
      if (existing.length > 1) {
        existing.slice(1).forEach(dup => {
          imagesToDelete.push({
            id: dup.id,
            pos: dup.position,
            name: filstarImg.filename.substring(0, 35),
            created: dup.created,
            reason: 'duplicate'
          });
        });
      }
      
      existingImageMap.delete(filstarImg.filename);
    } else {
      imagesToUpload.push({
        pos: filstarImg.position,
        name: filstarImg.filename.substring(0, 35),
        type: filstarImg.type
      });
    }
  });
  
  // Remaining images = obsolete
  existingImageMap.forEach((imgs, filename) => {
    imgs.forEach(img => {
      imagesToDelete.push({
        id: img.id,
        pos: img.position,
        name: filename.substring(0, 35),
        created: img.created,
        reason: 'obsolete'
      });
    });
  });
  
  // Summary
  console.log(`Filstar: ${orderedFilstarImages.length} | Shopify: ${shopifyImages.length}`);
  console.log(`✅ Keep: ${imagesToKeep.length} | ⬆️  Upload: ${imagesToUpload.length} | 🗑️  Delete: ${imagesToDelete.length}`);
  
  // Expected order
  if (orderedFilstarImages.length > 0) {
    console.log('\n📋 Expected order (Filstar):');
    orderedFilstarImages.forEach(img => {
      console.log(`  ${img.position}. ${img.filename.substring(0, 40)}... [${img.type}]`);
    });
  }
  
  // New images
  if (imagesToUpload.length > 0) {
    console.log('\n⬆️  NEW IMAGES TO UPLOAD:');
    imagesToUpload.forEach(img => 
      console.log(`  Pos ${img.pos}: ${img.name}... [${img.type}]`)
    );
  }
  
  // Duplicates/obsolete
  if (imagesToDelete.length > 0) {
    console.log('\n🗑️  IMAGES TO DELETE:');
    const duplicates = imagesToDelete.filter(i => i.reason === 'duplicate');
    const obsolete = imagesToDelete.filter(i => i.reason === 'obsolete');
    
    if (duplicates.length > 0) {
      console.log(`  Duplicates (${duplicates.length}):`);
      duplicates.forEach(img => 
        console.log(`    Pos ${img.pos}: ${img.name}... (ID: ${img.id})`)
      );
    }
    
    if (obsolete.length > 0) {
      console.log(`  Obsolete (${obsolete.length}):`);
      obsolete.forEach(img => 
        console.log(`    Pos ${img.pos}: ${img.name}... (ID: ${img.id})`)
      );
    }
  }
  
  // Position updates
  const needsReorder = imagesToKeep.some(img => img.pos !== img.target);
  if (needsReorder) {
    console.log('\n🔄 POSITION UPDATES NEEDED:');
    imagesToKeep
      .filter(img => img.pos !== img.target)
      .forEach(img => 
        console.log(`  ${img.name}... ${img.pos} → ${img.target}`)
      );
  }
  
  console.log('═'.repeat(60));
  
  return {
    kept: imagesToKeep.length,
    uploaded: imagesToUpload.length,
    deleted: imagesToDelete.length,
    reordered: needsReorder,
    deleteIds: imagesToDelete.map(i => i.id)
  };
}

// ============================================
// SHOPIFY & FILSTAR FUNCTIONS
// ============================================

async function findShopifyProductBySku(sku) {
  console.log(`\n🔍 Searching in Shopify for SKU: ${sku}...`);
  
  let allProducts = [];
  let hasNextPage = true;
  let pageInfo = null;
  
  while (hasNextPage) {
    let url = `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/products.json?fields=id,title,variants,images&limit=250`;
    
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
      console.error('Failed to fetch Shopify products:', response.status);
      return null;
    }
    
    const data = await response.json();
    allProducts = allProducts.concat(data.products);
    
    const linkHeader = response.headers.get('Link');
    if (linkHeader && linkHeader.includes('rel="next"')) {
      const nextMatch = linkHeader.match(/<[^>]*page_info=([^>&]+)[^>]*>;\s*rel="next"/);
      pageInfo = nextMatch ? nextMatch[1] : null;
      hasNextPage = !!pageInfo;
    } else {
      hasNextPage = false;
    }
    
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  console.log(`  📊 Total products fetched: ${allProducts.length}`);
  
  for (const product of allProducts) {
    const hasVariant = product.variants.some(v => v.sku === sku);
    if (hasVariant) {
      return product;
    }
  }
  
  return null;
}

function formatVariantName(variant, categoryType) {
  if (!variant.attributes || variant.attributes.length === 0) {
    return variant.model || `SKU: ${variant.sku}`;
  }
  
  const attributes = variant.attributes;
  let parts = [];
  
  if (variant.model && variant.model.trim() && variant.model !== 'N/A') {
    parts.push(variant.model.trim());
  }
  
  const length = attributes.find(a => a.attribute_name.includes('ДЪЛЖИНА'))?.value;
  if (length) parts.push(`${length}м`);
  
  const diameter = attributes.find(a => 
    a.attribute_name.includes('РАЗМЕР') && a.attribute_name.includes('MM')
  )?.value;
  if (diameter) parts.push(`⌀${diameter}мм`);
  
  if (categoryType === 'braided') {
    const japaneseSize = attributes.find(a => 
      a.attribute_name.includes('ЯПОНСКА НОМЕРАЦИЯ')
    )?.value;
    if (japaneseSize) {
      const formattedSize = japaneseSize.startsWith('#') ? japaneseSize : `#${japaneseSize}`;
      parts.push(formattedSize);
    }
  }
  
  const testKg = attributes.find(a => 
    a.attribute_name.includes('ТЕСТ') && a.attribute_name.includes('KG')
  )?.value;
  if (testKg) parts.push(`${testKg}кг`);
  
  return parts.length > 0 ? parts.join(' / ') : `SKU: ${variant.sku}`;
}

// ============================================
// MAIN TEST FUNCTION
// ============================================

async function testSku(sku) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`🔍 Testing SKU: ${sku}`);
  console.log('='.repeat(70));
  
  let filstarProduct = null;
  
  // Search in Filstar
  for (let page = 1; page <= 10; page++) {
    const url = `${FILSTAR_API_BASE}/products?page=${page}&limit=1000`;
    
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${FILSTAR_TOKEN}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        console.error(`❌ Error on page ${page}: ${response.status}`);
        break;
      }
      
      const data = await response.json();
      
      if (!data || data.length === 0) break;
      
      for (const product of data) {
        let hasSku = false;
        
        if (product.variants && product.variants.length > 0) {
          hasSku = product.variants.some(v => v.sku === sku);
        }
        
        if (hasSku || product.id === sku) {
          filstarProduct = product;
          
          console.log(`\n✅ FOUND in Filstar (page ${page})!`);
          console.log(`\n📦 Filstar Product:`);
          console.log(`  ID: ${product.id} | Name: ${product.name}`);
          console.log(`  Variants: ${product.variants?.length || 0} | Images: ${product.images?.length || 0}`);
          console.log(`  Manufacturer: ${product.manufacturer || 'N/A'}`);
          
          break;
        }
      }
      
      if (filstarProduct) break;
      
      if (page % 5 === 0) {
        console.log(`📄 Searched ${page} pages...`);
      }
      
      await new Promise(resolve => setTimeout(resolve, 300));
      
    } catch (error) {
      console.error(`❌ Error on page ${page}:`, error.message);
      break;
    }
  }
  
  if (!filstarProduct) {
    console.log(`\n❌ SKU ${sku} NOT FOUND in Filstar`);
    return;
  }
  
  // Search in Shopify
  const shopifyProduct = await findShopifyProductBySku(sku);
  
  if (shopifyProduct) {
    console.log(`\n✅ FOUND in Shopify!`);
    console.log(`\n🛍️  Shopify Product:`);
    console.log(`  ID: ${shopifyProduct.id} | Title: ${shopifyProduct.title}`);
    console.log(`  Variants: ${shopifyProduct.variants.length} | Images: ${shopifyProduct.images?.length || 0}`);
    
    // Run image sync analysis
    const syncResult = analyzeImageSync(shopifyProduct, filstarProduct);
    
    console.log(`\n📊 SUMMARY: ${syncResult.kept} kept | ${syncResult.uploaded} new | ${syncResult.deleted} remove`);
    if (syncResult.reordered) console.log('⚠️  Positions need update');
    
  } else {
    console.log(`\n❌ NOT FOUND in Shopify`);
  }
}

async function main() {
  console.log('🚀 Starting SKU test with image sync analysis...\n');
  
  for (const sku of TEST_SKUS) {
    await testSku(sku);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log(`\n${'='.repeat(70)}`);
  console.log('✅ Test completed!');
  console.log('='.repeat(70));
}

main();
