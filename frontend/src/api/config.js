// In production (Vercel), set VITE_API_URL to your Render backend URL.
// In dev, leave it unset — the Vite dev server proxy handles /api/* → localhost:8000.
export const API_BASE_URL = import.meta.env.VITE_API_URL || ''
