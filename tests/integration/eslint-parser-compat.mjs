import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const parser = require('@typescript-eslint/parser');
const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), 'darsak-eslint-parser-'));
const allowedPatterns = ['allowed.js', '*.ts'];

async function createFixture(name, contents) {
  const filePath = path.join(fixtureRoot, name);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, contents);
  return filePath;
}

function parse(filePath, projectService) {
  const isJavaScript = filePath.endsWith('.js') || filePath.endsWith('.jsx');
  const source = isJavaScript ? 'const value = 1;' : 'const value: number = 1;';
  return parser.parseForESLint(source, {
    filePath,
    sourceType: 'module',
    tsconfigRootDir: fixtureRoot,
    projectService,
  });
}

try {
  await createFixture(
    'tsconfig.json',
    JSON.stringify({
      compilerOptions: { strict: true },
      files: ['configured.ts'],
    }),
  );

  const defaultProject = { allowDefaultProject: allowedPatterns };
  for (const [name, contents] of [
    ['allowed.js', 'const value = 1;'],
    ['allowed.ts', 'const value: number = 1;'],
    ['.hidden.ts', 'const value: number = 1;'],
  ]) {
    const filePath = await createFixture(name, contents);
    parser.clearCaches();
    assert.doesNotThrow(
      () => parse(filePath, defaultProject),
      `${name} should use the default project`,
    );
  }

  const rejectedPath = await createFixture('rejected.jsx', 'const value = 1;');
  parser.clearCaches();
  assert.throws(
    () => parse(rejectedPath, defaultProject),
    /was not found by the project service|allowDefaultProject/i,
    'a nonmatching file should be rejected by project service',
  );

  const configuredPath = await createFixture('configured.ts', 'const value: number = 1;');
  parser.clearCaches();
  assert.throws(
    () => parse(configuredPath, { allowDefaultProject: ['configured.ts'] }),
    /allowDefaultProject/i,
    'a configured-project file must not also match allowDefaultProject',
  );

  const firstLimitedPath = await createFixture('max-one.ts', 'const value: number = 1;');
  const secondLimitedPath = await createFixture('max-two.ts', 'const value: number = 2;');
  const limitedProject = {
    allowDefaultProject: ['max-one.ts', 'max-two.ts'],
    maximumDefaultProjectFileMatchCount_THIS_WILL_SLOW_DOWN_LINTING: 1,
  };
  parser.clearCaches();
  assert.doesNotThrow(() => parse(firstLimitedPath, limitedProject));
  assert.throws(
    () => parse(secondLimitedPath, limitedProject),
    /maximumDefaultProjectFileMatchCount|allowDefaultProject/i,
    'the configured default-project file limit should be enforced',
  );

  console.log('ESLint parser project-service compatibility checks passed.');
} finally {
  parser.clearCaches();
  await rm(fixtureRoot, { recursive: true, force: true });
}
