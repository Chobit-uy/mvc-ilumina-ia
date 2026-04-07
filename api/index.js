'use strict';

// En desarrollo local, carga .env desde la raíz del monorepo
if (!process.env.VERCEL) {
  require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
}

const express = require('express');
const cors = require('cors');
const { getCatalog, getCatalogStats, refreshCatalog } = require('./_lib/catalog');
const { getAdvisorResponse } = require('./_lib/advisor');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── CORS ────────────────────────────────────────────────────────────────────
const rawOrigins = process.env.ALLOWED_ORIGINS || '*';
const allowAll = rawOrigins === '*';
const allowedOrigins = allowAll ? null : rawOrigins.split(',').map(s => s.trim());

app.use(
  cors({
    origin: allowAll
      ? '*'
      : (origin, cb) => {
          if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
          cb(new Error(`CORS: origen no permitido: ${origin}`));
        },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

app.use(express.json({ limit: '10kb' }));

// ─── STRIP /api PREFIX ────────────────────────────────────────────────────────
// En Vercel, el rewrite envia la URL completa (/api/health, /api/ask, etc.)
// al handler. Este middleware la normaliza para que las rutas de Express
// funcionen igual en dev local (donde el proxy de Vite ya quita /api) y prod.
app.use((req, _res, next) => {
  if (req.url.startsWith('/api')) {
    req.url = req.url.replace(/^\/api/, '') || '/';
  }
  next();
});

// ─── ENDPOINTS ───────────────────────────────────────────────────────────────

app.get('/health', (_, res) => {
  res.json({ status: 'ok', catalog: getCatalogStats() });
});

app.get('/catalog', (_, res) => {
  res.json(getCatalog());
});

// En producción (Vercel) el refresh en vivo no está disponible — el catálogo
// se construye en build time. El endpoint queda deshabilitado.
app.post('/catalog/refresh', async (req, res) => {
  if (process.env.VERCEL) {
    return res.status(503).json({
      error: 'El refresh en vivo no está disponible en producción. Realizá un nuevo deploy para actualizar el catálogo.',
    });
  }
  const secret = process.env.ADMIN_SECRET;
  if (secret && req.headers['x-admin-secret'] !== secret) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  try {
    await refreshCatalog();
    res.json({ ok: true, catalog: getCatalogStats() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/ask', async (req, res) => {
  const { query, history } = req.body || {};

  if (!query || typeof query !== 'string' || !query.trim()) {
    return res.status(400).json({ error: 'El campo "query" es requerido' });
  }

  if (query.trim().length > 2000) {
    return res.status(400).json({ error: 'La consulta es demasiado larga' });
  }

  try {
    const result = await getAdvisorResponse(query.trim(), history);
    res.json(result);
  } catch (err) {
    console.error('[/ask] Error:', err.message);
    res.status(500).json({
      answer: 'Hubo un error al procesar tu consulta. Por favor, intentá de nuevo en unos segundos.',
      products: [],
    });
  }
});

app.use((_, res) => res.status(404).json({ error: 'Ruta no encontrada' }));

// ─── INICIO LOCAL ─────────────────────────────────────────────────────────────
// En Vercel, el servidor no se inicia acá — Vercel invoca el handler por función.
// En desarrollo local, arranca normalmente.
if (!process.env.VERCEL) {
  const { initCatalog } = require('./_lib/catalog');

  async function start() {
    if (!process.env.GROQ_API_KEY) {
      console.error('❌ ERROR: Falta GROQ_API_KEY en el archivo .env');
      process.exit(1);
    }
    console.log('🔄 Inicializando catálogo de productos...');
    await initCatalog();
    app.listen(PORT, () => {
      console.log(`✅ Servidor corriendo en http://localhost:${PORT}`);
      console.log(`   POST http://localhost:${PORT}/ask`);
      console.log(`   GET  http://localhost:${PORT}/health`);
    });
  }

  start().catch(err => {
    console.error('Error fatal al iniciar:', err);
    process.exit(1);
  });
}

// Vercel importa el app como handler
module.exports = app;
