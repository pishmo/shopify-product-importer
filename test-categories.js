// Функция за извличане на всички монофилни влакна от Filstar с пагинация
async function fetchMonofilamentProducts() {
  console.log('Fetching all products from Filstar API with pagination...');
  
  let allProducts = [];
  let page = 1;
  let hasMorePages = true;
  
  try {
    while (hasMorePages && page <= 5) { // Лимит от 5 страници за тест
      console.log(`Fetching page ${page}...`);
      
      const response = await fetch(`${FILSTAR_API_BASE}/products?page=${page}&limit=1000`, {
        headers: {
          'Authorization': `Bearer ${FILSTAR_TOKEN}`
        }
      });

      if (!response.ok) {
        throw new Error(`Filstar API error: ${response.status}`);
      }

      // Провери headers за total count
      console.log('Response headers:', {
        'x-total-count': response.headers.get('x-total-count'),
        'x-total-pages': response.headers.get('x-total-pages'),
        'link': response.headers.get('link')
      });

      const pageProducts = await response.json();
      console.log(`Page ${page}: ${pageProducts.length} products`);
      
      if (pageProducts.length === 0) {
        console.log('No more products, stopping pagination');
        hasMorePages = false;
      } else {
        allProducts = allProducts.concat(pageProducts);
        
        // Винаги опитай следващата страница, дори ако е под 1000
        page++;
      }
    }
