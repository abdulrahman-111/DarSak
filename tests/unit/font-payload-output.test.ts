import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const script = path.resolve('scripts/measure-font-payload.mjs');
const temporaryDirectories: string[] = [];

function makeTemporaryDirectory() {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'font-payload-test-'));
  temporaryDirectories.push(directory);
  return directory;
}

function runWithOutput(output: string) {
  return spawnSync(
    process.execPath,
    [script, '--base-url', 'http://127.0.0.1:3000', '--output', output],
    { encoding: 'utf8' },
  );
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe('font measurement output directory', () => {
  it('fails before browser launch when the requested directory already exists', () => {
    const parent = makeTemporaryDirectory();
    const output = path.join(parent, 'existing');
    mkdirSync(output);
    const victim = path.join(output, 'measurements.json');
    writeFileSync(victim, 'keep this file');

    const result = runWithOutput(output);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('EEXIST');
    expect(readFileSync(victim, 'utf8')).toBe('keep this file');
  });

  it('fails before browser launch when the requested directory is a symlink', () => {
    const parent = makeTemporaryDirectory();
    const target = path.join(parent, 'target');
    const output = path.join(parent, 'output-link');
    mkdirSync(target);
    const victim = path.join(target, 'measurements.json');
    writeFileSync(victim, 'keep this file');
    symlinkSync(target, output, 'dir');

    const result = runWithOutput(output);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('EEXIST');
    expect(readFileSync(victim, 'utf8')).toBe('keep this file');
  });

  it('creates a fresh private output directory before browser launch', () => {
    const parent = makeTemporaryDirectory();
    const output = path.join(parent, 'new-output');

    const result = spawnSync(
      process.execPath,
      [
        script,
        '--base-url',
        'http://127.0.0.1:3000',
        '--output',
        output,
        '--browser',
        '/missing/chromium',
      ],
      { encoding: 'utf8' },
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).not.toContain('EEXIST');
    expect(statSync(output).mode & 0o777).toBe(0o700);
  });

  it('creates a private temporary directory by default', () => {
    const parent = makeTemporaryDirectory();
    const result = spawnSync(
      process.execPath,
      [script, '--base-url', 'http://127.0.0.1:3000', '--browser', '/missing/chromium'],
      { encoding: 'utf8', env: { ...process.env, TMPDIR: parent } },
    );
    const outputDirectories = readdirSync(parent).filter(name =>
      name.startsWith('darsak-font-measure-'),
    );
    const [output] = outputDirectories.map(name => path.join(parent, name));

    expect(result.status).not.toBe(0);
    expect(outputDirectories).toHaveLength(1);
    expect(output).toBeDefined();
    expect(statSync(output).mode & 0o777).toBe(0o700);
  });

  it('rejects a bare --output option', () => {
    const result = spawnSync(
      process.execPath,
      [script, '--base-url', 'http://127.0.0.1:3000', '--output'],
      { encoding: 'utf8' },
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('--output must be a non-empty path');
  });
});
