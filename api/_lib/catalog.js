'use strict';

const { scrapeAllProducts, enrichCatalogWithSpecs } = require('./scraper');

let catalog = [];
let lastUpdate = null;
let isRefreshing = false;

const REFRESH_HOURS = parseInt(process.env.CATALOG_REFRESH_HOURS || '6', 10);

async function refreshCatalog() {
  if (isRefreshing) {
    console.log('[catalog] Ya hay un refresh en curso, saltando...');
    return;
  }

  isRefreshing = true;
  try {
    const products = await scrapeAllProducts();
    if (products.length > 0) {
      catalog = products;
      lastUpdate = new Date();
      console.log(
        `[catalog] ✅ ${catalog.length} productos cargados (${lastUpdate.toLocaleString('es-AR')})`
      );
      console.log('[catalog] Enriqueciendo specs en background...');
      enrichCatalogWithSpecs(catalog).catch(err =>
        console.error('[catalog] Error enriqueciendo specs:', err.message)
      );
    } else {
      console.warn('[catalog] ⚠️  Scraping devolvió 0 productos — manteniendo catálogo anterior');
    }
  } catch (err) {
    console.error('[catalog] ❌ Error en refresh:', err.message);
  } finally {
    isRefreshing = false;
  }
}

async function initCatalog() {
  // En Vercel: carga el catálogo pre-construido en build time
  if (process.env.VERCEL) {
    try {
      const prebuilt = require('../catalog.json');
      catalog = prebuilt;
      lastUpdate = new Date();
      console.log(`[catalog] ✅ ${catalog.length} productos cargados desde catálogo pre-construido`);
    } catch (e) {
      console.warn('[catalog] ⚠️  catalog.json no encontrado — catálogo vacío');
    }
    return;
  }

  // En desarrollo local: scraping en vivo
  await refreshCatalog();

  const intervalMs = REFRESH_HOURS * 60 * 60 * 1000;
  setInterval(refreshCatalog, intervalMs);
  console.log(`[catalog] Auto-refresh configurado cada ${REFRESH_HOURS}h`);
}

function getCatalog() {
  return catalog;
}

function getLastUpdate() {
  return lastUpdate;
}

function getCatalogStats() {
  return {
    count: catalog.length,
    lastUpdate: lastUpdate?.toISOString() ?? null,
    isRefreshing,
  };
}

module.exports = { initCatalog, getCatalog, getLastUpdate, getCatalogStats, refreshCatalog };
