/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        deep: {
          bg:       '#09090b',
          surface:  '#111113',
          elevated: '#18181b',
        },
        border: {
          subtle: 'rgba(255,255,255,0.06)',
          hover:  'rgba(255,255,255,0.1)',
        },
        ink: {
          primary:   '#e4e4e7',
          secondary: '#a1a1aa',
          muted:     '#71717a',
          faint:     '#52525b',
        },
        accent: {
          DEFAULT: '#6366f1',
          hover:   '#818cf8',
          muted:   'rgba(99,102,241,0.15)',
        },
        success: '#22c55e',
        danger:  '#ef4444',
        warning: '#f59e0b',
      },
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'system-ui', 'sans-serif'],
        mono: ['IBM Plex Mono', 'monospace'],
      },
    },
  },
  plugins: [],
}
