import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const apiTarget =
    mode !== 'development' && process.env.VITE_API_URL
      ? process.env.VITE_API_URL
      : 'http://localhost:8000'

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
          proxyTimeout: 60000,
          timeout: 60000,
        },
      },
    },
  }
})
