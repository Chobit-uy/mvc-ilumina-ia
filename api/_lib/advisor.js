'use strict';

const Groq = require('groq-sdk');
const { getCatalog } = require('./catalog');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const DEFAULT_MODEL = 'llama-3.3-70b-versatile';

const SYSTEM_PROMPT = `Sos un asesor experto de iluminación y seguridad de MVC Equipamientos, empresa argentina especializada en focos LED, solares y reflectores.

Tu objetivo: ayudar al cliente a encontrar el producto más adecuado para su necesidad específica.

REGLAS GENERALES:
- Usá español rioplatense (tuteo, "vos", "che")
- Solo recomendá productos que existen en el catálogo provisto
- Si la consulta es vaga o no tenés suficiente info, hacé UNA sola pregunta breve
- Explicá en 1-2 oraciones por qué cada producto se adapta a la necesidad
- Sé directo y útil, sin texto de relleno
- Máximo 3 productos recomendados

FILTRADO POR PRECIO (CRÍTICO):
- Los precios en el catálogo están en formato "USD X.XX" con punto como separador decimal
- USD 127.13 = ciento veintisiete dólares con trece centavos
- Cuando el cliente pida un rango de precios, SOLO recomendá productos dentro de ese rango
- NUNCA incluyas en product_indices un producto cuyo precio supere el máximo pedido
- Si ningún producto cumple el rango, decilo claramente y no fuerces recomendaciones

CUANDO EL CLIENTE QUIERE ILUMINAR UNA ZONA O ÁREA:
Si pregunta cuántos artefactos necesita para iluminar un espacio, seguí estos pasos:

1. Si no tenés las dimensiones, preguntá UNA sola cosa: "¿Cuánto mide el área que querés iluminar (largo y ancho)?" y el tipo de espacio si no está claro.

2. Con las dimensiones, calculá usando el MÉTODO DEL LUMEN:
   N = (E × A) / (Φ × FU × FM)
   Donde:
   - E = iluminancia requerida en lux según el tipo de espacio:
     * Calle pública / vial: 15-20 lux
     * Estacionamiento / playa: 50 lux
     * Jardín / parque / plaza: 30-50 lux
     * Área peatonal / acceso: 50-75 lux
     * Cancha fútbol 5 / paddle / mini cancha (hasta 400m²): 150-200 lux | ángulo de haz recomendado: 60°
     * Cancha deportiva estándar / fútbol 11 (>400m²): 300-500 lux | ángulo de haz recomendado: 30-45°
   - A = superficie total en m² (largo × ancho)
   - Φ = lúmenes del artefacto. Usá el valor de la ficha si aparece.
     Si no está, estimá según el tipo de luminaria:
     * Foco vial / street light de red eléctrica: watts × 150 lm/W
     * Stadium / alta potencia (≥200W): watts × 150 lm/W
     * Reflector LED solar (todo en uno, sin brazo): watts × 120 lm/W
     * Foco solar con panel y brazo separado: watts × 100 lm/W
   - FU = factor de utilización = 0.6 (valor estándar para exterior)
   - FM = factor de mantenimiento = 0.8

3. Mostrá el cálculo paso a paso de forma clara:
   - Lúmenes totales necesarios: E × A / (FU × FM)
   - Lúmenes por artefacto: según ficha o estimación
   - Cantidad de artefactos: redondeá hacia arriba

4. Recomendá los productos del catálogo más adecuados con la cantidad exacta.

5. Al final, mencioná brevemente: "Para un diseño preciso con planos y verificación de luxes, podés usar DIALux evo (software gratuito en dialux.com)."

UNIFORMIDAD (Uo) PARA CANCHAS:
- Uo = E_min / E_avg → target ≥ 0.5 para canchas recreativas, ≥ 0.7 para competición
- Para mejorar Uo: preferir MÁS focos de MENOR potencia distribuidos en los 4 laterales/esquinas
- Cuando el cliente pregunte por canchas, mostrá DOS opciones:
  * Opción 1: menos focos de mayor potencia (menor costo inicial, Uo ~0.4-0.5)
  * Opción 2: más focos de menor potencia distribuidos (mejor uniformidad Uo ~0.6-0.7)
- Recomendá la opción con mejor relación Uo / costo

FORMATO DE RESPUESTA (JSON estricto):
{
  "answer": "Tu respuesta en texto para el cliente",
  "product_indices": [0, 2, 5]
}

- "answer": texto completo de tu respuesta, sin URLs (las tarjetas de producto se muestran aparte)
- "product_indices": array con los índices [N] de los productos recomendados. Máximo 3. Si no hay adecuados: []`;

function parsePriceUSD(priceStr) {
  if (!priceStr) return { min: null, max: null };
  const matches = [...priceStr.matchAll(/USD\s*(\d+)[,\.](\d{2})/g)];
  if (matches.length === 0) return { min: null, max: null };
  const values = matches.map(m => parseFloat(`${m[1]}.${m[2]}`));
  return { min: Math.min(...values), max: Math.max(...values) };
}

function detectPriceFilter(query) {
  const q = query.toLowerCase();
  const parseNum = s => parseFloat(s.replace(',', '.'));
  let min = null, max = null;

  const rangeMatch = q.match(
    /(?:entre|de)\s+(?:usd\s*)?([\d,\.]+)\s+(?:y|a|hasta)\s+(?:usd\s*)?([\d,\.]+)/
  );
  if (rangeMatch) {
    return { min: parseNum(rangeMatch[1]), max: parseNum(rangeMatch[2]) };
  }

  const maxMatch = q.match(
    /(?:menos de|hasta|por debajo de|no m[aá]s de|m[aá]ximo)\s+(?:usd\s*)?([\d,\.]+)/
  );
  if (maxMatch) max = parseNum(maxMatch[1]);

  const minMatch = q.match(
    /(?:m[aá]s de|desde|m[ií]nimo|a partir de)\s+(?:usd\s*)?([\d,\.]+)/
  );
  if (minMatch) min = parseNum(minMatch[1]);

  return min !== null || max !== null ? { min, max } : null;
}

function buildCatalogContext(catalog) {
  return catalog
    .map((p, i) => {
      const parts = [`[${i}] ${p.name}`];

      const { min, max } = parsePriceUSD(p.price);
      if (min !== null) {
        const priceStr =
          max !== null && max !== min
            ? `USD ${min.toFixed(2)}-${max.toFixed(2)}`
            : `USD ${min.toFixed(2)}`;
        parts.push(priceStr);
      }

      if (p.specs && Object.keys(p.specs).length > 0) {
        const specKeys = [
          'Consumo', 'Potencia', 'Lúmenes', 'Lumenes', 'Lúmenes (LM)',
          'Temperatura', 'Temp', 'IP', 'Sensor', 'Sensor Movimiento',
          'Fotocélula', 'Fotocelula', 'Panel', 'Batería', 'Bateria',
        ];
        const relevantSpecs = [];
        for (const key of specKeys) {
          if (p.specs[key]) {
            relevantSpecs.push(`${key}: ${p.specs[key]}`);
          }
        }
        if (relevantSpecs.length > 0) {
          parts.push(relevantSpecs.join(', '));
        }
      }

      return parts.join(' | ');
    })
    .join('\n');
}

function buildMessages(query, history, catalogContext) {
  const systemContent = `${SYSTEM_PROMPT}\n\nCATÁLOGO DISPONIBLE:\n${catalogContext}`;
  const messages = [{ role: 'system', content: systemContent }];

  if (Array.isArray(history) && history.length > 0) {
    const recent = history.slice(-6);
    for (const msg of recent) {
      if (msg.role && msg.content) {
        messages.push({ role: msg.role, content: String(msg.content) });
      }
    }
  }

  messages.push({ role: 'user', content: query });
  return messages;
}

async function getAdvisorResponse(query, history = []) {
  const catalog = getCatalog();

  if (catalog.length === 0) {
    return {
      answer: 'El catálogo de productos está cargando. Por favor, intentá de nuevo en unos segundos.',
      products: [],
    };
  }

  const catalogContext = buildCatalogContext(catalog);
  const messages = buildMessages(query, history, catalogContext);

  let raw;
  try {
    const response = await groq.chat.completions.create({
      model: process.env.GROQ_MODEL || DEFAULT_MODEL,
      temperature: 0.5,
      max_tokens: 1024,
      messages,
      response_format: { type: 'json_object' },
    });
    raw = response.choices[0]?.message?.content || '{}';
  } catch (err) {
    console.error('[advisor] Error Groq:', err.message);
    throw err;
  }

  try {
    const parsed = JSON.parse(raw);
    const indices = Array.isArray(parsed.product_indices) ? parsed.product_indices : [];

    const priceFilter = detectPriceFilter(query);

    const products = indices
      .filter(i => typeof i === 'number' && i >= 0 && i < catalog.length)
      .filter(i => {
        if (!priceFilter) return true;
        const { min: pMin, max: pMax } = parsePriceUSD(catalog[i].price);
        if (pMin === null) return true;
        const { min: fMin, max: fMax } = priceFilter;
        if (fMax !== null && pMin > fMax) return false;
        if (fMin !== null && pMax !== null && pMax < fMin) return false;
        return true;
      })
      .map(i => catalog[i]);

    return {
      answer: parsed.answer || 'No pude procesar tu consulta.',
      products,
    };
  } catch {
    console.warn('[advisor] Respuesta no-JSON del LLM, usando texto directo');
    return { answer: raw, products: [] };
  }
}

module.exports = { getAdvisorResponse };
