'use strict';

/**
 * Script de pre-construcción del catálogo para Vercel.
 * Se ejecuta como parte del build: "node scripts/build-catalog.js && vite build"
 *
 * Scrapea todos los productos de mvcequipamientos.com (incluyendo specs)
 * y guarda el resultado en api/catalog.json, que luego la función serverless
 * carga estáticamente en producción (sin scraping en runtime).
 */

const path = require('path');
const fs = require('fs');
const { scrapeAllProducts, enrichCatalogWithSpecs } = require('../api/_lib/scraper');

const OUTPUT_PATH = path.join(__dirname, '../api/catalog.json');

async function main() {
  console.log('📦 Construyendo catálogo de productos...');
  const start = Date.now();

  let products;
  try {
    products = await scrapeAllProducts();
    console.log(`✅ ${products.length} productos raspados`);
  } catch (err) {
    console.error('❌ Error al scrapear productos:', err.message);
    // Guardar catálogo vacío para que el build no falle
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify([], null, 2));
    console.warn('⚠️  Se guardó catálogo vacío. El sitio funcionará sin productos.');
    return;
  }

  try {
    console.log('🔍 Enriqueciendo specs de cada producto...');
    await enrichCatalogWithSpecs(products);
    console.log(`✅ Specs enriquecidas`);
  } catch (err) {
    console.warn('⚠️  Error al enriquecer specs (continuando sin specs completas):', err.message);
  }

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(products, null, 2));
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`✅ catalog.json guardado con ${products.length} productos en ${elapsed}s`);
}

main().catch(err => {
  console.error('Error fatal en build-catalog:', err);
  // Exit 0 para que el build de Vercel no falle por el scraping
  process.exit(0);
});
