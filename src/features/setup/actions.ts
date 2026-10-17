'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { Locale } from '@/i18n/config';
import { parseSetupCompletion, parseSetupDraft, type SetupDraft } from './domain';
import { safeSetupReturnPath } from './destination';

export type SetupActionState = { error?: 'invalid'|'save'|'conflict'|'upload'|'complete'; draft?: SetupDraft; pendingCvPath?: string; field?: string } | null;

async function activeIdentity(locale: Locale) {
  const db = await createClient();
  const { data: { user }, error } = await db.auth.getUser();
  if (error || !user) return null;
  const profile = await db.from('profiles').select('role,status').eq('id', user.id).maybeSingle();
  if (profile.error || profile.data?.status !== 'active' || !['teacher','student'].includes(profile.data.role)) return null;
  return { db, id: user.id, role: profile.data.role as 'teacher'|'student' };
}

function parsePayload(form: FormData): Record<string, unknown> | null {
  const raw = form.get('payload');
  if (typeof raw !== 'string' || raw.length > 100_000) return null;
  try { const parsed = JSON.parse(raw); return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null; } catch { return null; }
}

export async function saveSetupStage(locale: Locale, _state: SetupActionState, form: FormData): Promise<SetupActionState> {
  const me = await activeIdentity(locale);
  const payload = parsePayload(form);
  const stage = Number(form.get('stage'));
  const expected = Number(form.get('version'));
  const intent = String(form.get('intent') ?? 'next');
  const returnTo = safeSetupReturnPath(locale, me?.role ?? 'student', form.get('return_to')) ?? `/${locale}/${me?.role ?? 'student'}`;
  if (!me || !payload || !Number.isInteger(stage) || !Number.isSafeInteger(expected) || expected < 0 || !['next','back','exit'].includes(intent)) return { error: 'invalid' };
  const result = await me.db.rpc('save_account_setup_stage', {
    p_stage: stage, p_payload: payload, p_expected_version: expected, p_locale: locale, p_return_to: returnTo,
  });
  const draft = result.error ? null : parseSetupDraft(result.data);
  if (!draft) return { error: result.error?.code === 'PT409' ? 'conflict' : 'save' };
  if (intent === 'exit') redirect(`/${locale}/account`);
  const lastStage = draft.role === 'teacher' ? 4 : 2;
  const nextStage = intent === 'back' ? Math.max(1, stage - 1) : Math.min(lastStage, stage + 1);
  if (nextStage === stage) return { draft };
  const moved = await me.db.rpc('save_account_setup_stage', {
    p_stage: nextStage, p_payload: {}, p_expected_version: draft.version, p_locale: locale, p_return_to: returnTo,
  });
  const movedDraft = moved.error ? null : parseSetupDraft(moved.data);
  return movedDraft ? { draft: movedDraft } : { error: moved.error?.code === 'PT409' ? 'conflict' : 'save', draft };
}

export async function completeSetup(locale: Locale, version: number, returnTo: string): Promise<{ error?: string; destination?: string }> {
  const me = await activeIdentity(locale);
  if (!me) return { error: 'complete' };
  const safeReturn = safeSetupReturnPath(locale, me.role, returnTo) ?? `/${locale}/${me.role}`;
  const result = await me.db.rpc(me.role === 'teacher' ? 'complete_teacher_account_setup' : 'complete_student_account_setup', {
    p_expected_version: version, p_locale: locale, p_return_to: safeReturn,
  });
  const completed = result.error ? null : parseSetupCompletion(result.data);
  if (!completed) return { error: result.error?.code === 'PT409' ? 'conflict' : 'complete' };
  for (const lang of ['en','ar'] as const) {
    revalidatePath(`/${lang}/account/setup`);
    revalidatePath(`/${lang}/account/application`);
    revalidatePath(`/${lang}/account/profile`);
    revalidatePath(`/${lang}/${me.role}`);
  }
  return { destination: completed.destination };
}

export async function restartSetup(locale: Locale, version: number, returnTo: string): Promise<{ error?: string; draft?: SetupDraft }> {
  const me = await activeIdentity(locale);
  if (!me || !Number.isSafeInteger(version) || version < 0) return { error: 'complete' };
  const safeReturn = safeSetupReturnPath(locale, me.role, returnTo) ?? `/${locale}/${me.role}`;
  const result = await me.db.rpc('restart_account_setup_draft', {
    p_expected_version: version, p_locale: locale, p_return_to: safeReturn,
  });
  const draft = result.error ? null : parseSetupDraft(result.data);
  return draft ? { draft } : { error: result.error?.code === 'PT409' ? 'conflict' : 'complete' };
}
