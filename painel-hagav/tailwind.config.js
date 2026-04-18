/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // HAGAV Branding
        hagav: {
          black:   '#0A0A0A',
          dark:    '#111111',
          surface: '#161616',
          card:    '#1C1C1C',
          border:  '#2A2A2A',
          muted:   '#3A3A3A',
          gray:    '#888888',
          light:   '#CCCCCC',
          white:   '#F5F5F5',
          gold:    '#C9A84C',
          'gold-light': '#DFC06A',
          'gold-dark':  '#A8872E',
        },
        // Status badges
        status: {
          novo:       '#3B82F6',
          chamado:    '#8B5CF6',
          proposta:   '#EAB308',
          negociacao: '#F97316',
          fechado:    '#22C55E',
          perdido:    '#EF4444',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      boxShadow: {
        'card':   '0 1px 3px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.6)',
        'gold':   '0 0 20px rgba(201,168,76,0.15)',
        'modal':  '0 25px 60px rgba(0,0,0,0.8)',
        'panel':  '0 4px 24px rgba(0,0,0,0.5)',
      },
      backgroundImage: {
        'gold-gradient': 'linear-gradient(135deg, #C9A84C 0%, #DFC06A 50%, #A8872E 100%)',
        'dark-gradient': 'linear-gradient(180deg, #161616 0%, #111111 100%)',
      },
      animation: {
        'fade-in':    'fadeIn 0.2s ease-out',
        'slide-in':   'slideIn 0.25s ease-out',
        'slide-up':   'slideUp 0.25s ease-out',
      },
      keyframes: {
        fadeIn:  { from: { opacity: 0 }, to: { opacity: 1 } },
        slideIn: { from: { transform: 'translateX(20px)', opacity: 0 }, to: { transform: 'translateX(0)', opacity: 1 } },
        slideUp: { from: { transform: 'translateY(10px)', opacity: 0 }, to: { transform: 'translateY(0)', opacity: 1 } },
      },
    },
  },
  plugins: [],
};
