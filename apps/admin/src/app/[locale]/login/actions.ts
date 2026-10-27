'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@admin/lib/supabase/server';
import { activeAdmin } from '@admin/lib/access';
import { isLocale } from '@admin/lib/i18n';

export async function loginAction(formData: FormData) {
  const localeValue = String(formData.get('locale') ?? '');
  const locale = isLocale(localeValue) ? localeValue : 'ar';
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  if (!email || !password) redirect(`/${locale}/login?error=credentials`);

  let db;
  try {
    db = await createClient();
  } catch {
    redirect(`/${locale}/login?error=unavailable`);
  }

  const { error } = await db.auth.signInWithPassword({ email, password });
  if (error) redirect(`/${locale}/login?error=credentials`);
  const { data, error: userError } = await db.auth.getUser();
  const actor = !userError && data.user ? await activeAdmin(db, data.user) : null;
  if (!actor) {
    await db.auth.signOut({ scope: 'local' });
    redirect(`/${locale}/login?error=admin-only`);
  }
  redirect(`/${locale}/admin`);
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
