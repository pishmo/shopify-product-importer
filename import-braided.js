name: Import Braided Lines

on:
  workflow_dispatch:
  schedule:
    - cron: '0 4 * * *'

jobs:
  import-braided:
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: npm install node-fetch
      
      - name: Run braided line import
        env:
          SHOPIFY_ACCESS_TOKEN: ${{ secrets.SHOPIFY_ACCESS_TOKEN }}
          SHOPIFY_SHOP_DOMAIN: ${{ secrets.SHOPIFY_SHOP_DOMAIN }}
          FILSTAR_API_TOKEN: ${{ secrets.FILSTAR_API_TOKEN }}
        run: node import-braided.js
