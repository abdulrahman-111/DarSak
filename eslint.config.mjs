import nextVitals from 'eslint-config-next/core-web-vitals';
import security from 'eslint-plugin-security';

const config = [
  { ignores: ['**/.next/**'] },
  ...nextVitals,
  {
    files: ['src/**/*.{js,jsx,ts,tsx}', 'apps/admin/src/**/*.{js,jsx,ts,tsx}'],
    plugins: { security },
    // Focus on executable-code and unsafe API checks. Heuristics such as generic
    // object-injection warnings flag ordinary typed dictionary lookups throughout
    // this bilingual app and are covered more usefully by CodeQL's dataflow checks.
    rules: {
      'security/detect-eval-with-expression': 'error',
      'security/detect-new-buffer': 'error',
      'security/detect-buffer-noassert': 'error',
      'security/detect-child-process': 'error',
      'security/detect-disable-mustache-escape': 'error',
      'security/detect-pseudoRandomBytes': 'error',
      'security/detect-unsafe-regex': 'error',
    },
  },
];

export default config;
