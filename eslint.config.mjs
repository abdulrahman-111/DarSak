import nextVitals from 'eslint-config-next/core-web-vitals';
const config = [
  { ignores: ['*.dc.html', 'dars-core.js', 'support.js'] },
  ...nextVitals,
];

export default config;
