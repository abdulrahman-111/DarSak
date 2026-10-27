import type { Config } from 'tailwindcss';

export default {
  content: [
    './src/**/*.{ts,tsx}',
    '../../src/components/platform/ui.tsx',
    '../../src/components/ui.tsx',
    '../../src/features/student/pagination.tsx',
  ],
  theme: {
    extend: {
      colors: {
        cream: '#f6f0e4',
        surface: '#fffdf8',
        teal: '#0e4a4b',
        orange: '#b04c16',
        ink: '#23211e',
        'ink-soft': '#4d473f',
        muted: '#6b6358',
        line: '#e3d9c8',
      },
      fontFamily: {
        sans: [
          'var(--font-instrument-sans)',
          'var(--font-ibm-plex-sans-arabic)',
          'Arial',
          'sans-serif',
        ],
        display: [
          'var(--font-bricolage-grotesque)',
          'var(--font-ibm-plex-sans-arabic)',
          'Arial',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
} satisfies Config;
