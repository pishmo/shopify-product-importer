// cleanup-OTHER-accessories-variants.js - Почистване на варианти за Аксесоари други
const fetch = require('node-fetch');

const SHOPIFY_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const API_VERSION = '2024-10';

// Категорийни тагове за премахване (сортирани по дължина - най-дългите първи)
const CATEGORY_TAGS_TO_REMOVE = [
  'Aксесоари други Колчета, глави и стойки',
  'Aксесоари други Кукооткачвачи',
  'Aксесоари други Инструменти',
  'Aксесоари други Други'
];

const COLLECTION_ID = 'gid://shopify/Collection/739661447550'; // Аксесоари други

async function fetchAllProducts() {
  console.log('📦 Fetching all products from "Аксесоари други" collection...\n');
  let allProducts = [];
  let hasNextPage = true;
  let cursor = null;
  let page = 1;

  while (hasNextPage) {
    const query = `
      query ($cursor: String) {
        collection(id: "${COLLECTION_ID}") {
          products(first: 250, after: $cursor) {
            pageInfo {
              hasNextPage
              endCursor
            }
            edges {
              node {
                id
                title
                variants(first: 100) {
                  edges {
                    node {
                      id
                      title
                      sku
                    }
                  }
                }
              }
            }
          }
        }
      }
    `;

    const response = await fetch(
      `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/graphql.json`,
      {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': ACCESS_TOKEN,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query, variables: { cursor } })
      }
    );

    const { data } = await response.json();
    const products = data.collection.products.edges.map(e => e.node);
    allProducts.push(...products);

    console.log(` ✓ Page ${page}: ${products.length} products (Total: ${allProducts.length})`);
    hasNextPage = data.collection.products.pageInfo.hasNextPage;
    cursor = data.collection.products.pageInfo.endCursor;
    page++;
  }

  console.log(`\n✅ Total: ${allProducts.length} products\n`);
  return allProducts;
}

function cleanVariantTitle(title, sku) {
  if (!title || typeof title !== 'string') {
    return sku || 'Стандартен';
  }

  let cleaned = title;

  // Премахни всички категорийни тагове (вече сортирани по дължина)
  for (const tag of CATEGORY_TAGS_TO_REMOVE) {
    // Премахни тага с всички възможни заобикалящи символи
    cleaned = cleaned.replace(new RegExp(`\\s*\\/\\s*${tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\/\\s*`, 'g'), ' / ');
    cleaned = cleaned.replace(new RegExp(`\\s*\\/\\s*${tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'g'), '');
    cleaned = cleaned.replace(new RegExp(`^\\s*${tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\/\\s*`, 'g'), '');
    cleaned = cleaned.replace(tag, '');
  }

  // Премахни множество интервали
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  // Премахни водещи "/" или "-"
  cleaned = cleaned.replace(/^[\s\/\-]+/, '').trim();

  // Премахни "/" накрая
  cleaned = cleaned.replace(/[\s\/\-]+$/, '').trim();

  // Премахни самотни "/" в средата
  cleaned = cleaned.replace(/\s*\/\s*\/\s*/g, ' / ').trim();

  // Ако е празно → използвай SKU
  if (!cleaned || cleaned === '') {
    cleaned = sku || 'Стандартен';
  }

  return cleaned;
}

async function updateVariant(variantId, newTitle) {
  const numericId = variantId.split('/').pop();

  const response = await fetch(
    `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/variants/${numericId}.json`,
    {
      method: 'PUT',
      headers: {
        'X-Shopify-Access-Token': ACCESS_TOKEN,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        variant: {
          option1: newTitle
        }
      })
    }
  );

  const result = await response.json();

  if (!response.ok) {
    return { userErrors: [{ message: result.errors || 'Update failed' }] };
  }

  return { userErrors: [] };
}

async function cleanupVariants() {
  console.log('🧹 Starting variant cleanup for "Аксесоари други"...\n');
  console.log('======================================================================');
  console.log('Removing category tags:');
  CATEGORY_TAGS_TO_REMOVE.forEach((tag, i) => console.log(`  ${i + 1}. "${tag}"`));
  console.log('======================================================================\n');

  const products = await fetchAllProducts();
  let cleaned = 0;
  let skipped = 0;

  for (const product of products) {
    for (const variantEdge of product.variants.edges) {
      const variant = variantEdge.node;
      const originalTitle = variant.title;
      const cleanedTitle = cleanVariantTitle(originalTitle, variant.sku);

      if (originalTitle !== cleanedTitle) {
        console.log(`🔧 ${product.title}`);
        console.log(`   OLD: "${originalTitle}"`);
        console.log(`   NEW: "${cleanedTitle}"`);

        const result = await updateVariant(variant.id, cleanedTitle);

        if (result.userErrors.length === 0) {
          console.log(`   ✅ Updated\n`);
          cleaned++;
        } else {
          console.log(`   ❌ Error: ${result.userErrors[0].message}\n`);
        }

        await new Promise(r => setTimeout(r, 300));
      } else {
        skipped++;
      }
    }
  }

  console.log('\n======================================================================');
  console.log('📊 CLEANUP SUMMARY');
  console.log('======================================================================');
  console.log(`✅ Cleaned: ${cleaned} variants`);
  console.log(`⏭️  Skipped: ${skipped} variants (already clean)`);
  console.log('======================================================================');
}

cleanupVariants();
