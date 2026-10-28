#!/usr/bin/env node
/**
 * Operator-only: promote an existing registered account. Never import into the app.
 *
 * MFA: the admin portal requires a TOTP second factor (Supabase MFA, aal2).
 * After promotion, the new administrator signs in at the portal and is sent to
 * /{locale}/mfa/enroll to scan a QR code and confirm a 6-digit code. Do this
 * straight away: until a factor is verified, anyone with the password could enrol.
 * Recovery for a lost device: remove the user's factor in the Supabase dashboard
 * (Authentication > Users > the user > remove MFA factor); the next sign-in shows
 * enrolment again. See apps/admin/README.md.
 */
const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const id = process.argv[2];
if (
  !url ||
  !key ||
  !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id || '')
) {
  console.error(
    'Usage: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/bootstrap-admin.mjs <registered-user-uuid>',
  );
  process.exit(1);
}
const response = await fetch(`${url}/rest/v1/profiles?id=eq.${id}`, {
  method: 'PATCH',
  headers: {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  },
  body: JSON.stringify({ role: 'admin', status: 'active' }),
});
if (!response.ok) {
  console.error(
    `Admin promotion failed (${response.status}). Check the target project and operator credentials.`,
  );
  process.exit(1);
}
const rows = await response.json();
if (rows.length !== 1 || rows[0].role !== 'admin') {
  console.error('No matching profile was promoted. Register the account first.');
  process.exit(1);
}
console.log(
  'Administrator profile verified. Sign in to the admin portal and complete TOTP enrolment at /<locale>/mfa/enroll straight away.',
);
