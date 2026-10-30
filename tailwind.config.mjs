const config = {
  theme: {
    extend: {
      colors: {
        cream: '#f6f0e4',
        surface: '#fffdf8',
        teal: '#0e4a4b',
        // #c4561a failed WCAG AA (3.94:1 on cream); this shade passes on cream and with white text.
        orange: '#b04c16',
        'orange-deep': '#8f3d11',
        ink: '#23211e',
        'ink-soft': '#4d473f',
        muted: '#6b6358',
        line: '#e3d9c8',
        'line-strong': '#d8ccb8',
        mint: '#d5ebe6',
        success: { DEFAULT: '#2c5620', soft: '#dfedd5' },
        danger: { DEFAULT: '#9b2c1f', soft: '#f6e1dc' },
      },
      boxShadow: {
        card: '0 16px 45px rgba(14, 74, 75, 0.08)',
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
};

export default config;
