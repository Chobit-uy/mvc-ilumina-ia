/**
 * URL del backend.
 *
 * En Lovable: agregar variable de entorno VITE_API_URL con la URL de Render.
 *   ej: https://mvc-advisor-backend.onrender.com
 *
 * En desarrollo local: el backend corre en http://localhost:3000
 */
export const API_URL =
  import.meta.env.VITE_API_URL?.replace(/\/$/, '') ||
  '/api';
