/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        base: '#0a0a0f',
        surface: {
          DEFAULT: '#111118',
          2: '#17171f',
          glass: 'rgba(255,255,255,0.04)',
          dark: 'rgba(15,15,35,0.45)',
          card: 'rgba(0,0,0,0.6)',
        },
        border: '#1e1e2e',
        indigo: { 300: '#a5b4fc', 400: '#818cf8', 500: '#6366f1' },
        violet: { 600: '#8b5cf6' },
        cyan: { 300: '#7DDFEE', 400: '#56CFE1' },
        deep: { bg: '#030014', surface: '#08001a' },
        bs: { bg: '#0A1F2E', surface: '#0F3A4A', border: '#1F4A5C', accent: '#56CFE1', text: '#E8F8FB' },
      },
    },
  },
  plugins: [],
}
