import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function loopbackHost(hostname) {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (host === 'localhost' || host === '::1') return true;
  const octets = host.split('.').map(Number);
  return (
    octets.length === 4 &&
    octets[0] === 127 &&
    octets.every(n => Number.isInteger(n) && n >= 0 && n <= 255)
  );
}

function assertLoopbackUrl(value, label, protocols) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} is not a valid URL.`);
  }
  if (!protocols.includes(url.protocol)) throw new Error(`${label} has an unexpected protocol.`);
  if (!loopbackHost(url.hostname))
    throw new Error(`Refusing non-loopback ${label} host: ${url.hostname}`);
  return url.toString().replace(/\/$/, '');
}

const supabaseWorkdir = resolve(process.env.E2E_SUPABASE_WORKDIR ?? process.cwd());
const portValue = process.env.E2E_PORT ?? '3000';
if (!/^\d+$/.test(portValue) || Number(portValue) < 1 || Number(portValue) > 65535) {
  throw new Error('E2E_PORT must be an integer from 1 to 65535.');
}
const baseURL = assertLoopbackUrl(
  process.env.E2E_BASE_URL ?? `http://127.0.0.1:${portValue}`,
  'E2E_BASE_URL',
  ['http:', 'https:'],
);

const status = spawnSync('supabase', ['status', '--output', 'json'], {
  cwd: supabaseWorkdir,
  encoding: 'utf8',
  env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: '1', SUPABASE_USE_SLIM_IMAGES: '1' },
});
if (status.error) throw status.error;
if (status.status !== 0) {
  process.stderr.write(status.stderr ?? '');
  throw new Error(
    `supabase status failed in ${supabaseWorkdir}. Start an isolated local stack first.`,
  );
}

let details;
try {
  details = JSON.parse(status.stdout);
} catch {
  throw new Error('Could not parse `supabase status --output json`; upgrade to CLI 2.120.0.');
}
const apiURL = assertLoopbackUrl(
  details.API_URL ?? details.SUPABASE_URL,
  'local Supabase API URL',
  ['http:', 'https:'],
);
const databaseURL = assertLoopbackUrl(
  details.DB_URL ?? details.DATABASE_URL,
  'local Supabase database URL',
  ['postgres:', 'postgresql:'],
);
const anonKey = details.ANON_KEY ?? details.PUBLISHABLE_KEY;
if (typeof anonKey !== 'string' || !anonKey)
  throw new Error('Supabase status did not provide a local anon or publishable key.');

const childEnv = {
  ...process.env,
  E2E_DATABASE_URL: databaseURL,
  E2E_BASE_URL: baseURL,
  E2E_PORT: String(portValue),
  NEXT_PUBLIC_SUPABASE_URL: apiURL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: anonKey,
  NEXT_PUBLIC_SITE_URL: baseURL,
  NEXT_PUBLIC_AUTH_GOOGLE_ENABLED: 'false',
  AUTH_RECOVERY_SECRET: randomBytes(32).toString('hex'),
  NEXT_TELEMETRY_DISABLED: '1',
};

run('node', ['tests/e2e/support/seed.mjs'], { env: childEnv });
run('npm', ['run', 'build'], { env: childEnv });
run('npx', ['playwright', 'test', '--config=playwright.config.ts'], { env: childEnv });
