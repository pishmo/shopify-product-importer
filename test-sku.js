// ============================================
// IMAGE HELPER FUNCTIONS (FIXED)
// ============================================

function normalizeFilename(url) {
  if (!url || typeof url !== 'string') return null;
  
  const filename = url.split('/').pop().split('?')[0];
  
  // ВАЖНО: Премахни extension ПРЕДИ нормализация
  const withoutExt = filename.replace(/\.(jpg|jpeg|png|gif|webp)$/i, '');
  
  // Премахни Shopify UUID и MD5 hash
  return withoutExt
    .replace(/_[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/g, '')
    .replace(/_[a-f0-9]{32}/g, '');
}

function getImageFilename(src) {
  return normalizeFilename(src);
}

function extractFilename(url) {
  const filename = url.split('/').pop();
  return filename.replace(/\.(jpg|jpeg|png|gif|webp)$/i, '');
}
