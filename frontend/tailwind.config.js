/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        base: '#0a0a0f',
        surface: '#111118',
        'surface-2': '#17171f',
        border: '#1e1e2e',
      },
    },
  },
  plugins: [],
}
