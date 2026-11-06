/** Verify the local demo administrator's real Auth MFA boundary end to end. */
import { createHmac } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const adminId = 'de000000-0000-4000-8000-000000000003';
const adminEmail = 'admin@demo.invalid';
const adminPassword = 'DarSak-local-demo-2026!';
class SafeFailure extends Error {}

const safeMessage = message => {
  throw new SafeFailure(message);
};
const ensure = (condition, message) => {
  if (!condition) safeMessage(message);
};

let status;
try {
  status = JSON.parse(
    execFileSync('supabase', ['status', '--output', 'json'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      env: {
        ...process.env,
        DO_NOT_TRACK: '1',
        SUPABASE_TELEMETRY_DISABLED: '1',
      },
    }),
  );
} catch {
  safeMessage('Could not read local Supabase status');
}

const apiOrigin = new URL(status.API_URL);
ensure(
  ['127.0.0.1', 'localhost', '[::1]'].includes(apiOrigin.hostname) &&
    apiOrigin.protocol === 'http:' &&
    !apiOrigin.username &&
    !apiOrigin.password,
  'Admin MFA integration test requires a loopback-only HTTP API_URL',
);
const anonKey = status.ANON_KEY;
ensure(typeof anonKey === 'string' && anonKey.length > 0, 'Local anonymous key is missing');

let accessToken;
let factorId;
let totpSecret;

function ensureNoSecrets(raw) {
  for (const secret of [adminPassword, accessToken, totpSecret]) {
    if (secret) ensure(!raw.includes(secret), 'API error response contained sensitive test data');
  }
}

async function request(path, { token = anonKey, method = 'GET', body } = {}) {
  const response = await fetch(new URL(path, apiOrigin), {
    method,
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const raw = await response.text();
  if (!response.ok) ensureNoSecrets(raw);
  let data = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    // Successful no-content Auth endpoints legitimately return an empty body.
  }
  return { response, raw, data };
}

async function requireSuccess(path, options) {
  const result = await request(path, options);
  ensure(result.response.ok, `Local Auth/API request failed (${result.response.status})`);
  return result.data;
}

function jwtAssurance(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    return payload.aal;
  } catch {
    safeMessage('Auth returned an invalid access token');
  }
}

function decodeBase32(secret) {
  let bits = '';
  for (const character of secret.toUpperCase().replace(/=+$/, '')) {
    const value = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(character);
    ensure(value >= 0, 'Auth returned an invalid TOTP secret');
    bits += value.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let offset = 0; offset + 8 <= bits.length; offset += 8) {
    bytes.push(Number.parseInt(bits.slice(offset, offset + 8), 2));
  }
  ensure(bytes.length > 0, 'Auth returned an invalid TOTP secret');
  return Buffer.from(bytes);
}

function totp(secret, timestamp = Date.now()) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(timestamp / 30000)));
  const digest = createHmac('sha1', decodeBase32(secret)).update(counter).digest();
  const offset = digest[digest.length - 1] & 15;
  const value = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(value).padStart(6, '0');
}

async function run() {
  const signedIn = await requireSuccess('/auth/v1/token?grant_type=password', {
    method: 'POST',
    body: { email: adminEmail, password: adminPassword },
  });
  ensure(
    signedIn.user?.id === adminId && signedIn.user?.email === adminEmail,
    'Password sign-in did not return the expected synthetic demo identity',
  );
  accessToken = signedIn.access_token;
  ensure(
    typeof accessToken === 'string' && jwtAssurance(accessToken) === 'aal1',
    'Expected an Auth-issued AAL1 session',
  );

  const profile = await requireSuccess(`/rest/v1/profiles?id=eq.${adminId}&select=id,role,status`, {
    token: accessToken,
  });
  ensure(
    Array.isArray(profile) &&
      profile.length === 1 &&
      profile[0].id === adminId &&
      profile[0].role === 'admin' &&
      profile[0].status === 'active',
    'AAL1 own-profile lookup failed',
  );

  const role = await requireSuccess('/rest/v1/rpc/current_role', {
    method: 'POST',
    token: accessToken,
    body: {},
  });
  ensure(role === null, 'AAL1 admin unexpectedly has database admin authority');
  const blockedHealth = await request('/rest/v1/rpc/admin_launch_health', {
    method: 'POST',
    token: accessToken,
    body: {},
  });
  ensure(
    blockedHealth.response.status === 403 && blockedHealth.data?.code === '42501',
    'AAL1 admin launch health call was not denied with 42501',
  );

  const authUser = await requireSuccess('/auth/v1/user', { token: accessToken });
  ensure(
    authUser.id === adminId && authUser.email === adminEmail,
    'Local Auth identity changed before MFA enrollment',
  );
  ensure(
    Array.isArray(authUser.factors ?? []) && (authUser.factors ?? []).length === 0,
    'Refusing to modify a demo admin with an existing MFA factor',
  );

  const enrollment = await requireSuccess('/auth/v1/factors', {
    method: 'POST',
    token: accessToken,
    body: { factor_type: 'totp', friendly_name: 'local-admin-mfa-regression' },
  });
  factorId = enrollment.id;
  totpSecret = enrollment.totp?.secret;
  ensure(
    typeof factorId === 'string' && typeof totpSecret === 'string',
    'Local Auth TOTP enrollment failed',
  );

  const challenge = await requireSuccess(
    `/auth/v1/factors/${encodeURIComponent(factorId)}/challenge`,
    {
      method: 'POST',
      token: accessToken,
      body: {},
    },
  );
  ensure(typeof challenge.id === 'string', 'Local Auth TOTP challenge failed');

  const remainingMs = 30000 - (Date.now() % 30000);
  if (remainingMs < 5000) await new Promise(resolve => setTimeout(resolve, remainingMs + 250));
  const verification = await requireSuccess(
    `/auth/v1/factors/${encodeURIComponent(factorId)}/verify`,
    {
      method: 'POST',
      token: accessToken,
      body: { challenge_id: challenge.id, code: totp(totpSecret) },
    },
  );
  accessToken = verification.access_token;
  ensure(
    typeof accessToken === 'string' && jwtAssurance(accessToken) === 'aal2',
    'Actual Auth TOTP verification did not yield AAL2',
  );

  const elevatedRole = await requireSuccess('/rest/v1/rpc/current_role', {
    method: 'POST',
    token: accessToken,
    body: {},
  });
  ensure(elevatedRole === 'admin', 'AAL2 admin did not receive database admin authority');
  const allowedHealth = await requireSuccess('/rest/v1/rpc/admin_launch_health', {
    method: 'POST',
    token: accessToken,
    body: {},
  });
  ensure(
    allowedHealth && typeof allowedHealth === 'object',
    'AAL2 admin launch health call failed',
  );
  console.log('PASS: local AAL1 admin is denied and actual Auth TOTP AAL2 restores admin access');
}

let testFailure;
try {
  await run();
} catch (error) {
  testFailure =
    error instanceof SafeFailure
      ? error
      : new SafeFailure('Local admin MFA integration regression failed');
} finally {
  let cleanupFailed = false;
  if (factorId && accessToken) {
    try {
      await requireSuccess(`/auth/v1/factors/${encodeURIComponent(factorId)}`, {
        method: 'DELETE',
        token: accessToken,
      });
    } catch {
      cleanupFailed = true;
    }
  }
  if (accessToken) {
    try {
      await requireSuccess('/auth/v1/logout?scope=local', {
        method: 'POST',
        token: accessToken,
        body: {},
      });
    } catch {
      cleanupFailed = true;
    }
  }
  if (testFailure) throw testFailure;
  ensure(!cleanupFailed, 'Local admin MFA integration cleanup failed');
}
