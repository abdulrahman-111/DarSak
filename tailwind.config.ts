import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        cream: '#f6f0e4',
        surface: '#fffdf8',
        teal: '#0e4a4b',
        orange: '#c4561a',
        ink: '#23211e',
        muted: '#6b6358',
        line: '#e3d9c8',
      },
      boxShadow: {
        card: '0 16px 45px rgba(14, 74, 75, 0.08)',
      },
      fontFamily: {
        sans: ['"Instrument Sans"', '"IBM Plex Sans Arabic"', 'Arial', 'sans-serif'],
        display: ['"Bricolage Grotesque"', '"IBM Plex Sans Arabic"', 'Arial', 'sans-serif'],
      },
    },
  },
  plugins: [],
} satisfies Config;
