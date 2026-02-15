async function createShopifyProduct(filstarProduct, categoryType) {
  try {
    console.log(`\n📦 Creating: ${filstarProduct.name}`);
    
    // 1. СЪЗДАВАНЕ НА ПРОДУКТА
    const productData = {
      product: {
        title: filstarProduct.name,
        body_html: filstarProduct.description || '',
        vendor: filstarProduct.manufacturer || 'Unknown',
        product_type: getCategoryName(categoryType),
        status: 'active',
        variants: filstarProduct.variants.map(v => ({
          price: v.price?.toString(),
          sku: v.sku,
          inventory_quantity: parseInt(v.quantity),
          inventory_management: 'shopify',
          option1: formatVariantName(v, filstarProduct.name) || v.sku
        })),
        options: [{ name: 'Вариант' }]
      }
    };

    const res = await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/products.json`, {
      method: 'POST',
      headers: { 'X-Shopify-Access-Token': ACCESS_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify(productData)
    });

    const result = await res.json();
    const productGid = `gid://shopify/Product/${result.product.id}`;
    const shopifyVariants = result.product.variants;
    
    stats.kamping.created++;

    // 2. КАЧВАНЕ НА СНИМКИ
    const imageMapping = new Map();
    if (filstarProduct.images) {
      for (let i = 0; i < filstarProduct.images.length; i++) {
        const imageUrl = filstarProduct.images[i];
        const cleanName = getImageFilename(imageUrl);
        // Добавяме индекс само при качване, за да няма дубликати в Shopify
        const finalName = i === 0 ? cleanName : cleanName.replace('.', `-${i}.`);

        const normalizedBuffer = await normalizeImage(imageUrl, filstarProduct.variants[0].sku);
        const resourceUrl = await uploadImageToShopify(normalizedBuffer, finalName);
        
        if (resourceUrl) {
          const attachMutation = `mutation { productCreateMedia(productId: "${productGid}", media: {originalSource: "${resourceUrl}", mediaContentType: IMAGE}) { media { ... on MediaImage { id } } } }`;
          const attachRes = await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/graphql.json`, {
            method: 'POST',
            headers: { 'X-Shopify-Access-Token': ACCESS_TOKEN, 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: attachMutation })
          });
          const attachData = await attachRes.json();
          const mediaId = attachData.data?.productCreateMedia?.media?.[0]?.id;
          if (mediaId) {
            console.log(`    ✓ Uploaded: ${finalName}`);
            imageMapping.set(cleanName, mediaId);
            stats.kamping.images++;
          }
        }
      }
    }

    // 3. ЗАКАЧАНЕ ЗА ВАРИАНТИТЕ
    for (const variant of filstarProduct.variants) {
      const shopifyVar = shopifyVariants.find(sv => sv.sku === variant.sku);
      if (shopifyVar && variant.images?.[0]) {
        const varImgName = getImageFilename(variant.images[0]);
        const mediaId = imageMapping.get(varImgName);

        if (mediaId) {
          const assignMutation = `mutation { variantUpdate(input: { id: "gid://shopify/ProductVariant/${shopifyVar.id}", mediaId: "${mediaId}" }) { variant { id } } }`;
          await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/graphql.json`, {
            method: 'POST', headers: { 'X-Shopify-Access-Token': ACCESS_TOKEN, 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: assignMutation })
          });
          console.log(`    ✅ Assigned: ${variant.sku}`);
        }
      }
    }

    // 4. REORDER
    const imgDataRes = await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/graphql.json`, {
      method: 'POST', headers: { 'X-Shopify-Access-Token': ACCESS_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: `{ product(id: "${productGid}") { images(first: 20) { edges { node { id src } } } } }` })
    });
    const imgData = await imgDataRes.json();
    const allImages = imgData.data?.product?.images?.edges || [];
    if (allImages.length > 0) {
      await reorderProductImages(productGid, allImages);
      console.log(`  🔄 Reordered ${allImages.length} images.`);
    }

    return productGid;
  } catch (error) {
    console.error(`  ❌ Error: ${error.message}`);
    stats.kamping.errors++;
    return null;
  }
}
