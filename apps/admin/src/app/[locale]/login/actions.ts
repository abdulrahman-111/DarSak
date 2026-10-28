'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@admin/lib/supabase/server';
import { adminProfile, assuranceState } from '@admin/lib/access';
import { isLocale } from '@admin/lib/i18n';
import { clientIp, loginAllowed, recordLoginFailure } from '@admin/lib/login-throttle';

export async function loginAction(formData: FormData) {
  const localeValue = String(formData.get('locale') ?? '');
  const locale = isLocale(localeValue) ? localeValue : 'ar';
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  if (!email || !password || email.length > 254) redirect(`/${locale}/login?error=credentials`);

  let db;
  try {
    db = await createClient();
  } catch {
    redirect(`/${locale}/login?error=unavailable`);
  }

  // Blocked and wrong-password attempts show the same message, so the response
  // does not reveal whether the account exists or has been throttled.
  const ip = await clientIp();
  if (!(await loginAllowed(db, email, ip))) redirect(`/${locale}/login?error=credentials`);

  const { error } = await db.auth.signInWithPassword({ email, password });
  if (error) {
    await recordLoginFailure(db, email, ip);
    redirect(`/${locale}/login?error=credentials`);
  }
  const { data, error: userError } = await db.auth.getUser();
  const actor = !userError && data.user ? await adminProfile(db, data.user) : null;
  if (!actor) {
    await db.auth.signOut({ scope: 'local' });
    redirect(`/${locale}/login?error=admin-only`);
  }
  // Only a session that has completed TOTP (aal2) continues to the portal.
  const state = await assuranceState(db);
  if (state === 'aal2') redirect(`/${locale}/admin`);
  if (state === 'verify') redirect(`/${locale}/mfa/verify`);
  if (state === 'enroll') redirect(`/${locale}/mfa/enroll`);
  await db.auth.signOut({ scope: 'local' });
  redirect(`/${locale}/login?error=unavailable`);
}

export async function logoutAction(formData: FormData) {
  const value = String(formData.get('locale') ?? 'ar');
  const locale = isLocale(value) ? value : 'ar';
  try {
    const db = await createClient();
    await db.auth.signOut({ scope: 'local' });
  } catch {
    // Redirect to sign-in even when the staging backend is unavailable.
  }
  redirect(`/${locale}/login`);
}
