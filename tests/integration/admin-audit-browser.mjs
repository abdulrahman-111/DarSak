import { createHmac } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { createServerClient } from '@supabase/ssr';

const origin = process.env.ADMIN_E2E_BASE_URL ?? 'http://127.0.0.1:3082';
const email = 'seed-admin+en-desktop@e2e.invalid';
const studentEmail = 'student+en-desktop@e2e.invalid';
const password = 'E2E-local-only-2026!';
const supabaseUrl = process.env.ADMIN_E2E_SUPABASE_URL;
const anonKey = process.env.ADMIN_E2E_ANON_KEY;
const output = process.env.ADMIN_E2E_ARTIFACT_DIR ?? '.admin-e2e-artifacts';
const ensure = (ok, message) => {
  if (!ok) throw new Error(message);
};

function decodeBase32(secret) {
  let bits = '';
  for (const c of secret.toUpperCase().replace(/=+$/, '')) {
    const n = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(c);
    ensure(n >= 0, 'MFA enrollment returned an invalid secret');
    bits += n.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}
function totp(secret) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const digest = createHmac('sha1', decodeBase32(secret)).update(counter).digest();
  const offset = digest[digest.length - 1] & 15;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, '0');
}
async function enterCode(page, secret) {
  const remaining = 30000 - (Date.now() % 30000);
  if (remaining < 5000) await page.waitForTimeout(remaining + 250);
  await page.getByLabel(/verification code|رمز التحقق/).fill(totp(secret));
}
async function uiLogin(page, account) {
  await page.goto(`${origin}/en/login`);
  await page.getByLabel('Email').fill(account);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}
async function uiLogout(page) {
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.waitForURL(/\/en\/login/);
}
async function requireDeniedAal1() {
  ensure(supabaseUrl && anonKey, 'Local Supabase browser credentials are missing');
  const signIn = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anonKey, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  ensure(signIn.ok, 'Could not create the real AAL1 admin session');
  const session = await signIn.json();
  ensure(session.user?.id && session.access_token, 'AAL1 sign-in returned no session');
  const rpc = await fetch(`${supabaseUrl}/rest/v1/rpc/admin_analytics_summary`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${session.access_token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ p_days: 7 }),
  });
  ensure([401, 403].includes(rpc.status), 'AAL1 admin unexpectedly accessed analytics');
}
async function assertProtectedRedirects(page, label) {
  for (const route of ['audit', 'analytics']) {
    await page.goto(`${origin}/en/admin/${route}`);
    await page.waitForURL(/\/en\/login/);
    ensure(page.url().includes('/en/login'), `${label} could access ${route}`);
  }
  const csv = await page.request.get(`${origin}/en/admin/audit/export?action=report_resolved`);
  const contentType = csv.headers()['content-type'] ?? '';
  const body = await csv.text();
  ensure(
    !/text\/csv/i.test(contentType) &&
      !body.includes('id,at,actor_id,actor_role,action,target_type,target_id') &&
      !body.includes('report_resolved'),
    `${label} received protected audit CSV content`,
  );
}
async function createStudentSsrSession() {
  ensure(supabaseUrl && anonKey, 'Local Supabase browser credentials are missing');
  const cookieJar = new Map();
  const client = createServerClient(supabaseUrl, anonKey, {
    cookieOptions: {
      name: 'darsak-admin-local-auth',
      path: '/',
      sameSite: 'lax',
      secure: false,
    },
    cookies: {
      getAll: () => [...cookieJar].map(([name, value]) => ({ name, value })),
      setAll: values => values.forEach(({ name, value }) => cookieJar.set(name, value)),
    },
  });
  const { data, error } = await client.auth.signInWithPassword({ email: studentEmail, password });
  ensure(!error && data.user?.id && data.session?.access_token, 'Student Auth sign-in failed');
  const verified = await client.auth.getUser();
  ensure(
    verified.data.user?.id === data.user.id && verified.data.user.email === studentEmail,
    'Student session identity did not verify',
  );
  const profile = await client
    .from('profiles')
    .select('role,status')
    .eq('id', data.user.id)
    .single();
  ensure(
    profile.data?.role === 'student' && profile.data.status === 'active',
    'Student fixture has the wrong role or status',
  );
  const cookies = [...cookieJar].map(([name, value]) => ({
    name,
    value,
    url: origin,
    sameSite: 'Lax',
    secure: false,
  }));
  ensure(
    cookies.some(cookie => cookie.name.startsWith('darsak-admin-local-auth')),
    'SSR Auth did not create the admin session cookie',
  );
  return { client, userId: data.user.id, token: data.session.access_token, cookies };
}
async function assertStudentRpcDenied(token) {
  for (const [rpc, body] of [
    ['admin_analytics_summary', { p_days: 7 }],
    ['admin_audit_page', { p_limit: 50 }],
  ]) {
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${rpc}`, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    ensure([401, 403].includes(response.status), `Student unexpectedly accessed ${rpc}`);
  }
}
function digits(value) {
  return value.replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[^0-9]/g, '');
}

const samples = [];
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
    : {}),
});
try {
  await mkdir(output, { recursive: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  // Verify anonymous UI and CSV boundaries for both protected screens.
  await assertProtectedRedirects(page, 'Anonymous visitor');
  await page.screenshot({ path: `${output}/admin-unauthorized.png`, fullPage: true });

  await uiLogin(page, email);
  await page.waitForURL(/\/en\/mfa\/enroll/);
  const secret = (await page.locator('code[dir="ltr"]').innerText()).trim();
  ensure(secret.length >= 16, 'MFA enrollment did not expose the real TOTP setup secret');
  await enterCode(page, secret);
  await page.getByRole('button', { name: 'Turn on and continue' }).click();
  await page.waitForURL(/\/en\/admin/);
  await uiLogout(page);
  await uiLogin(page, email);
  await page.waitForURL(/\/en\/mfa\/verify/);
  await requireDeniedAal1();
  await enterCode(page, secret);
  await page.getByRole('button', { name: 'Verify' }).click();
  await page.waitForURL(/\/en\/admin/);

  const analyticsReadiness = async () => {
    await page.goto(`${origin}/en/admin/analytics?days=30`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'Analytics' }).waitFor({ state: 'visible' });
    const period = page.getByRole('link', { name: 'Last 30 days', exact: true });
    await period.waitFor({ state: 'visible' });
    ensure(
      (await period.getAttribute('aria-current')) === 'page',
      '30-day analytics window was not active',
    );
    const row = page.getByRole('row').filter({ hasText: 'Student registrations' });
    await row.waitFor({ state: 'visible' });
    const registrations = Number(digits(await row.locator('td').first().innerText()));
    ensure(registrations >= 4500, '30-day student registration count missed the synthetic cohort');
  };
  const analytics = [];
  await page.setViewportSize({ width: 1440, height: 1000 });
  for (let i = 0; i < 4; i++) {
    const started = performance.now();
    await analyticsReadiness();
    analytics.push(Math.round(performance.now() - started));
  }
  samples.push(
    ...analytics.map((milliseconds, index) => ({
      environment: index === 0 ? 'en-desktop-cold' : `en-desktop-warm-${index}`,
      route: 'analytics-30-day',
      milliseconds,
    })),
  );

  const combinations = [
    { locale: 'en', name: 'en-desktop', width: 1440, height: 1000 },
    { locale: 'ar', name: 'ar-desktop', width: 1440, height: 1000 },
    { locale: 'en', name: 'en-mobile', width: 390, height: 844 },
    { locale: 'ar', name: 'ar-mobile', width: 390, height: 844 },
  ];
  for (const item of combinations) {
    await page.setViewportSize({ width: item.width, height: item.height });
    for (const route of ['audit', 'analytics']) {
      const url = `${origin}/${item.locale}/admin/${route}${route === 'analytics' ? '?days=30' : ''}`;
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.getByRole('heading', { level: 1 }).waitFor({ state: 'visible' });
      if (route === 'audit') {
        const label = item.locale === 'ar' ? 'سجل التدقيق' : 'Audit log';
        await page.getByRole('heading', { name: label }).waitFor();
        await page
          .getByLabel(item.locale === 'ar' ? 'الإجراء' : 'Action')
          .selectOption('report_resolved');
        await page
          .getByRole('button', { name: item.locale === 'ar' ? 'تطبيق' : 'Apply filters' })
          .click();
        await page.waitForURL(/action=report_resolved/);
        const countLabel = page
          .locator('p')
          .filter({ hasText: item.locale === 'ar' ? 'المطابق' : 'Matching records' });
        const auditCountText = await countLabel.innerText();
        const countMarker = item.locale === 'ar' ? 'المطابق:' : 'Matching records:';
        const countSegment = auditCountText.split(countMarker)[1]?.split('·')[0] ?? '';
        const auditCount = Number(digits(countSegment));
        ensure(
          auditCount >= 20000,
          'Filtered audit ledger did not include all synthetic volume rows',
        );
        const csv = await page.request.get(
          `${origin}/${item.locale}/admin/audit/export?action=report_resolved`,
        );
        ensure(
          csv.ok() && /text\/csv/i.test(csv.headers()['content-type'] ?? ''),
          'Filtered audit CSV export failed',
        );
        const csvText = await csv.text();
        const csvLines = csvText.trim().split(/\r?\n/);
        ensure(
          csvLines[0] ===
            'id,at,actor_id,actor_role,action,target_type,target_id,request_id,metadata',
          'Audit CSV header is invalid',
        );
        ensure(
          csvLines.length > 1 && csvLines.length <= 50001,
          'Audit CSV row count was empty or exceeded its bound',
        );
        ensure(
          csvLines.slice(1).every(line => line.includes('report_resolved')),
          'Audit CSV ignored the selected action filter',
        );
      } else {
        const label = item.locale === 'ar' ? 'التحليلات' : 'Analytics';
        await page.getByRole('heading', { name: label }).waitFor();
        const period = page.getByRole('link', {
          name: item.locale === 'ar' ? 'آخر ٣٠ يومًا' : 'Last 30 days',
          exact: true,
        });
        await period.waitFor({ state: 'visible' });
        ensure(
          (await period.getAttribute('aria-current')) === 'page',
          'Analytics did not render the selected 30-day window',
        );
        const studentRow = page
          .getByRole('row')
          .filter({ hasText: item.locale === 'ar' ? 'تسجيلات الطلاب' : 'Student registrations' });
        await studentRow.waitFor();
        const registrationText = await studentRow.locator('td').first().innerText();
        const registered = Number(digits(registrationText));
        ensure(
          registered >= 4500,
          'Last 30 days student registration table did not include the synthetic volume cohort',
        );
      }
      await page.screenshot({ path: `${output}/${item.name}-${route}.png`, fullPage: true });
    }
  }
  const student = await createStudentSsrSession();
  await assertStudentRpcDenied(student.token);
  const studentContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await studentContext.addCookies(student.cookies);
  const studentPage = await studentContext.newPage();
  await assertProtectedRedirects(studentPage, 'Authenticated non-admin student');
  await student.client.auth.signOut();
  await studentContext.close();
  const warm = analytics.slice(1).sort((a, b) => a - b);
  const median =
    warm.length % 2
      ? warm[(warm.length - 1) / 2]
      : (warm[warm.length / 2 - 1] + warm[warm.length / 2]) / 2;
  const report = {
    environment: 'GitHub Actions local Supabase + production admin build',
    coldMilliseconds: analytics[0],
    warmMilliseconds: analytics.slice(1),
    warmMedianMilliseconds: median,
    minimumAuditRows: 20000,
    samples,
    measuredAt: new Date().toISOString(),
  };
  await mkdir(output, { recursive: true });
  await writeFile(`${output}/admin-latency.json`, JSON.stringify(report, null, 2) + '\n');
  ensure(median < 1000, `Warm meaningful analytics page median was ${median}ms (limit 1000ms)`);
} catch (error) {
  await mkdir(output, { recursive: true }).catch(() => {});
  await writeFile(
    `${output}/admin-latency.json`,
    JSON.stringify(
      {
        environment: 'GitHub Actions local Supabase + production admin build',
        samples,
        error: 'Admin browser audit failed',
        measuredAt: new Date().toISOString(),
      },
      null,
      2,
    ) + '\n',
  ).catch(() => {});
  throw error;
} finally {
  await browser.close();
}
