// ============================================
// FILSTAR BAIT IMPORT SCRIPT - PART 1/3
// ============================================

const axios = require('axios');
const sharp = require('sharp');
const fs = require('fs').promises;
const path = require('path');

// ============================================
// КОНФИГУРАЦИЯ
// ============================================

const CONFIG = {
  shopify: {
    domain: 'carplandia.myshopify.com',
    accessToken: 'YOUR_SHOPIFY_ACCESS_TOKEN',
    apiVersion: '2024-01'
  },
  filstar: {
    baseUrl: 'https://www.filstar.bg/api',
    apiKey: 'YOUR_FILSTAR_API_KEY'
  },
  image: {
    targetWidth: 1200,
    targetHeight: 1000,
    background: { r: 255, g: 255, b: 255, alpha: 1 }
  }
};

// ============================================
// МАПИНГ КАТЕГОРИИ
// ============================================

const COLLECTION_MAPPING = {
  66: 'gid://shopify/Collection/YOUR_COLLECTION_ID', // Захранка
  69: 'gid://shopify/Collection/YOUR_COLLECTION_ID', // Бойли и пелети
  71: 'gid://shopify/Collection/YOUR_COLLECTION_ID', // Добавки
  73: 'gid://shopify/Collection/YOUR_COLLECTION_ID', // Семена
  75: 'gid://shopify/Collection/YOUR_COLLECTION_ID', // Пасти
  77: 'gid://shopify/Collection/YOUR_COLLECTION_ID'  // Други Захранки
};

const FILSTAR_CATEGORIES = [66, 69, 71, 73, 75, 77];

// ============================================
// СТАТИСТИКА
// ============================================

const stats = {
  productsCreated: 0,
  productsUpdated: 0,
  productsSkipped: 0,
  imagesUploaded: 0,
  errors: []
};

// ============================================
// HELPER FUNCTIONS
// ============================================

function formatCategoryName(categoryId) {
  const names = {
    66: 'Захранка',
    69: 'Бойли и пелети',
    71: 'Добавки',
    73: 'Семена',
    75: 'Пасти',
    77: 'Други Захранки'
  };
  return names[categoryId] || 'Неизвестна категория';
}

function cleanFilename(filename) {
  if (!filename) return '';
  return filename
    .replace(/\.(jpg|jpeg|png|gif|webp)$/i, '')
    .replace(/[_-]/g, ' ')
    .trim();
}

function extractSkuFromFilename(filename) {
  if (!filename) return null;
  const match = filename.match(/(\d{6,})/);
  return match ? match[1] : null;
}

// ============================================
// ФОРМАТ НА ВАРИАНТИ
// ============================================

function formatVariantTitle(variant) {
  const parts = [variant.sku];
  
  if (variant.attributes && variant.attributes.length > 0) {
    variant.attributes.forEach(attr => {
      if (attr.attribute_name && attr.value) {
        parts.push(`${attr.attribute_name}: ${attr.value}`);
      }
    });
  }
  
  return parts.join(' / ');
}
