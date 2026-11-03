import { readFileSync } from 'node:fs';

const corpusPath = new URL('../evals/assistant-safety-corpus.jsonl', import.meta.url);
const categories = [
  'prompt_extraction',
  'role_impersonation',
  'pasted_instructions',
  'private_records',
  'exam_cheating',
  'self_harm',
  'sexual_content',
  'hate',
  'benign_study',
  'benign_platform',
];
const rows = readFileSync(corpusPath, 'utf8')
  .trim()
  .split('\n')
  .map(line => JSON.parse(line));
const ids = new Set(rows.map(row => row.id));
const pairKeys = new Set(rows.map(row => `${row.category}:${row.variant}`));
const valid =
  rows.length === 80 &&
  ids.size === 80 &&
  pairKeys.size === 40 &&
  categories.every(category => rows.filter(row => row.category === category).length === 8);

if (!valid) {
  throw new Error(
    'Offline assistant corpus must contain 80 unique cases and 40 bilingual pairs across all 10 categories.',
  );
}

console.log(
  'Offline corpus baseline: 80 synthetic rubric cases; 40 EN/AR pairs; 10 categories × 4 variants × 2 locales.',
);
console.log(
  'Model: gemini-3.5-flash-lite. NO_LIVE_MODEL_EVALUATION. No model response scores were produced.',
);
