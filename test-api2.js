async function debugCategories() {
  const response = await fetch(`${FILSTAR_API_BASE}/products?limit=1000`, {
    headers: { 'Authorization': `Bearer ${FILSTAR_TOKEN}` }
  });
  
  const products = await response.json();
  
  const categoryMap = {};
  
  products.forEach(p => {
    p.categories?.forEach(cat => {
      const key = `${cat.id}`;
      if (!categoryMap[key]) {
        categoryMap[key] = {
          id: cat.id,
          name: cat.name,
          parent_id: cat.parent_id,
          count: 0
        };
      }
      categoryMap[key].count++;
    });
  });
  
  const sorted = Object.values(categoryMap).sort((a, b) => b.count - a.count);
  
  console.log('All categories:\n');
  sorted.forEach(cat => {
    console.log(`${cat.name} (ID: ${cat.id}, Parent: ${cat.parent_id}) - ${cat.count} products`);
  });
}
