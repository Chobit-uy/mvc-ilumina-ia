'use strict';

const axios = require('axios');
const cheerio = require('cheerio');

/**
 * URLs de las categorías a scrapear.
 * Agregar más URLs de categorías acá para ampliar el catálogo.
 */
const CATALOG_URLS = [
  'https://www.mvcequipamientos.com/c/iluminacion/focos-street/focos-solares-de-calle/',
  'https://www.mvcequipamientos.com/c/seguridad/reflectores-solares/',
  'https://www.mvcequipamientos.com/c/todos-los-productos-solares-iluminacion-solar-camaras-solares-reflectores-solares-parlantes-solares-bateria-solar/artefactos-exteriores-solares/',
  'https://www.mvcequipamientos.com/c/todos-los-productos-solares-iluminacion-solar-camaras-solares-reflectores-solares-parlantes-solares-bateria-solar/artefactos-exteriores-solares/page/3/',
  'https://www.mvcequipamientos.com/c/todos-los-productos-solares-iluminacion-solar-camaras-solares-reflectores-solares-parlantes-solares-bateria-solar/artefactos-exteriores-solares/page/4/',
  'https://www.mvcequipamientos.com/c/todos-los-productos-solares-iluminacion-solar-camaras-solares-reflectores-solares-parlantes-solares-bateria-solar/artefactos-exteriores-solares/page/5/',
  'https://www.mvcequipamientos.com/c/todos-los-productos-solares-iluminacion-solar-camaras-solares-reflectores-solares-parlantes-solares-bateria-solar/artefactos-exteriores-solares/page/6/',
  'https://www.mvcequipamientos.com/c/todos-los-productos-solares-iluminacion-solar-camaras-solares-reflectores-solares-parlantes-solares-bateria-solar/artefactos-exteriores-solares/page/2/',
];

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept-Language': 'es-AR,es;q=0.9',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
};

/**
 * Intenta extraer productos del HTML usando varias estrategias.
 * Primero prueba selectores WooCommerce estándar, luego selectores genéricos.
 */
function extractProducts($, baseUrl) {
  const products = [];

  // Strategy 1: WooCommerce standard
  $('ul.products li.product, .products .product').each((_, el) => {
    const $el = $(el);
    const name = $el
      .find('.woocommerce-loop-product__title, .product-title, h2, h3')
      .first()
      .text()
      .trim();
    const rawPrice = $el.find('.price .amount, .price').first().text().trim().replace(/\s+/g, ' ');
    const href = $el.find('a.woocommerce-LoopProduct-link, a').first().attr('href');
    const image =
      $el.find('img').first().attr('src') ||
      $el.find('img').first().attr('data-src') ||
      $el.find('img').first().attr('data-lazy-src');

    if (name && href) {
      products.push({
        name,
        price: rawPrice || undefined,
        url: href.startsWith('http') ? href : new URL(href, baseUrl).href,
        image: image || undefined,
      });
    }
  });

  if (products.length > 0) return products;

  // Strategy 2: Generic product grid cards
  const cardSelectors = [
    '[class*="product-card"]',
    '[class*="product-item"]',
    '[class*="product-grid"] > *',
    '[class*="product-list"] > *',
    'article[class*="product"]',
  ];

  for (const selector of cardSelectors) {
    $(selector).each((_, el) => {
      const $el = $(el);
      const name = $el
        .find('[class*="title"], [class*="name"], h1, h2, h3, h4')
        .first()
        .text()
        .trim();
      const rawPrice = $el.find('[class*="price"], [class*="cost"]').first().text().trim();
      const href = $el.find('a').first().attr('href');
      const image =
        $el.find('img').first().attr('src') ||
        $el.find('img').first().attr('data-src');

      if (name && href && name.length > 3) {
        products.push({
          name,
          price: rawPrice || undefined,
          url: href.startsWith('http') ? href : new URL(href, baseUrl).href,
          image: image || undefined,
        });
      }
    });

    if (products.length > 0) break;
  }

  return products;
}

/**
 * Verifica si hay página siguiente en la paginación.
 */
function hasNextPage($) {
  return (
    $('a.next, a.next-page, a.next.page-numbers, [rel="next"], .pagination .next').length > 0
  );
}

/**
 * Raspa todas las páginas de una URL de categoría.
 */
async function scrapeCategoryUrl(baseUrl) {
  const products = [];
  let page = 1;

  while (page <= 20) {
    const url = page === 1 ? baseUrl : `${baseUrl}page/${page}/`;

    try {
      const { data } = await axios.get(url, {
        headers: HEADERS,
        timeout: 15000,
      });

      const $ = cheerio.load(data);
      const pageProducts = extractProducts($, baseUrl);

      if (pageProducts.length === 0) {
        if (page === 1) {
          console.warn(`[scraper] Sin productos en ${url} — revisar selectores`);
        }
        break;
      }

      products.push(...pageProducts);
      console.log(`[scraper] Página ${page}: ${pageProducts.length} productos de ${baseUrl}`);

      if (!hasNextPage($)) break;
      page++;

      // Pequeña pausa para no sobrecargar el servidor
      await new Promise(r => setTimeout(r, 500));
    } catch (err) {
      if (page === 1) {
        console.error(`[scraper] Error al raspar ${url}:`, err.message);
      }
      break;
    }
  }

  return products;
}

/**
 * Raspa las especificaciones técnicas de la página individual de un producto.
 * Extrae pares clave/valor de la tabla de specs y la descripción corta.
 *
 * @param {string} url - URL del producto
 * @returns {{ specs: Object, description: string }}
 */
async function scrapeProductSpecs(url) {
  try {
    const { data } = await axios.get(url, { headers: HEADERS, timeout: 15000 });
    const $ = cheerio.load(data);

    // Extraer specs desde tabla (pares clave → valor)
    const specs = {};
    $('table tr').each((_, row) => {
      const cells = $(row).find('td');
      if (cells.length >= 2) {
        const key = $(cells[0]).text().trim();
        const value = $(cells[1]).text().trim();
        if (key && value) {
          specs[key] = value;
        }
      }
    });

    // Extraer descripción corta (primer párrafo con contenido útil)
    let description = '';
    const descSelectors = [
      '.woocommerce-product-details__short-description',
      '.short-description',
      '.product-short-description',
      '.woocommerce-Tabs-panel--description p',
      '.entry-summary p',
    ];
    for (const sel of descSelectors) {
      const text = $(sel).first().text().trim();
      if (text && text.length > 20) {
        description = text.slice(0, 300);
        break;
      }
    }

    return { specs, description };
  } catch (err) {
    // Falla silenciosa — el producto queda sin specs pero no rompe el catálogo
    return { specs: {}, description: '' };
  }
}

/**
 * Enriquece el catálogo con specs técnicas scrapeando cada página de producto.
 * Procesa en lotes de 3 simultáneos con pausa entre lotes para evitar rate limiting.
 * NO bloquea el servidor — se llama en background después de cargar el catálogo básico.
 *
 * @param {Array} products - Array de productos con { name, price, url, image }
 */
async function enrichCatalogWithSpecs(products) {
  const BATCH_SIZE = 3;
  const PAUSE_MS = 600;
  let enriched = 0;

  for (let i = 0; i < products.length; i += BATCH_SIZE) {
    const batch = products.slice(i, i + BATCH_SIZE);

    await Promise.all(
      batch.map(async product => {
        const { specs, description } = await scrapeProductSpecs(product.url);
        product.specs = specs;
        if (description) product.description = description;
        enriched++;
      })
    );

    // Pausa entre lotes (no aplica al último)
    if (i + BATCH_SIZE < products.length) {
      await new Promise(r => setTimeout(r, PAUSE_MS));
    }
  }

  console.log(`[scraper] Specs enriquecidas: ${enriched} productos`);
}

/**
 * Raspa todos los productos de todas las categorías configuradas.
 */
async function scrapeAllProducts() {
  const allProducts = [];

  for (const url of CATALOG_URLS) {
    try {
      const products = await scrapeCategoryUrl(url);
      allProducts.push(...products);
    } catch (err) {
      console.error(`[scraper] Error general en ${url}:`, err.message);
    }
  }

  // Deduplicar por URL
  const seen = new Set();
  const unique = allProducts.filter(p => {
    if (seen.has(p.url)) return false;
    seen.add(p.url);
    return true;
  });

  console.log(`[scraper] Total: ${unique.length} productos únicos`);
  return unique;
}

module.exports = { scrapeAllProducts, enrichCatalogWithSpecs, CATALOG_URLS };
