'use server';

import { redirect } from 'next/navigation';
import { getAdminAccess } from '@admin/lib/access';
import { isLocale } from '@admin/lib/i18n';

const CODE = /^\d{6}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function read(formData: FormData) {
  const value = String(formData.get('locale') ?? '');
  return {
    locale: isLocale(value) ? value : ('ar' as const),
    code: String(formData.get('code') ?? '')
      .replace(/\s+/g, '')
      .trim(),
    factorId: String(formData.get('factorId') ?? ''),
  };
}

/** Confirms the first TOTP code of a freshly enrolled factor, which upgrades the session to aal2. */
export async function enrollMfaAction(formData: FormData) {
  const { locale, code, factorId } = read(formData);
  const access = await getAdminAccess();
  if (access.status === 'ok') redirect(`/${locale}/admin`);
  if (access.status === 'mfa-verify') redirect(`/${locale}/mfa/verify`);
  if (access.status !== 'mfa-enroll') redirect(`/${locale}/login`);
  if (!UUID.test(factorId) || !CODE.test(code)) redirect(`/${locale}/mfa/enroll?error=code`);
  const { error } = await access.actor.db.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) redirect(`/${locale}/mfa/enroll?error=code`);
  redirect(`/${locale}/admin`);
}

/** Verifies a TOTP code for an administrator who already has a verified factor. */
export async function verifyMfaAction(formData: FormData) {
  const { locale, code } = read(formData);
  const access = await getAdminAccess();
  if (access.status === 'ok') redirect(`/${locale}/admin`);
  if (access.status === 'mfa-enroll') redirect(`/${locale}/mfa/enroll`);
  if (access.status !== 'mfa-verify') redirect(`/${locale}/login`);
  if (!CODE.test(code)) redirect(`/${locale}/mfa/verify?error=code`);
  const { db } = access.actor;
  const { data: factors, error: listError } = await db.auth.mfa.listFactors();
  const factor = factors?.totp.find(item => item.status === 'verified');
  if (listError || !factor) redirect(`/${locale}/mfa/verify?error=unavailable`);
  const { error } = await db.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
  if (error) redirect(`/${locale}/mfa/verify?error=code`);
  redirect(`/${locale}/admin`);
}
