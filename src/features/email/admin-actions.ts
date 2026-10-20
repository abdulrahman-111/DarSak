'use server';

import { after } from 'next/server';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { flushEmailOutbox } from './worker';

async function activeAdmin(locale: string) {
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return null;
  const { data: profile } = await db
    .from('profiles')
    .select('role,status')
    .eq('id', user.id)
    .maybeSingle();
  return profile?.role === 'admin' && profile.status === 'active' ? db : null;
}

export async function retryEmailJob(locale: string, form: FormData): Promise<void> {
  const db = await activeAdmin(locale);
  const id = String(form.get('id') ?? '');
  if (!db || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))
    redirect(`/${locale}/admin/email?result=unavailable`);
  const { error } = await db.rpc('retry_email_job', { p_id: id });
  if (error) redirect(`/${locale}/admin/email?result=unavailable`);
  after(async () => {
    try {
      await flushEmailOutbox(1);
    } catch {
      /* The daily recovery run handles queued jobs. */
    }
  });
  redirect(`/${locale}/admin/email?result=retried`);
}

export async function flushEmailJobs(locale: string): Promise<void> {
  if (!(await activeAdmin(locale))) redirect(`/${locale}/admin/email?result=unavailable`);
  const result = await flushEmailOutbox(5);
  const query = new URLSearchParams({
    result: result.state,
    claimed: String(result.claimed),
    sent: String(result.sent),
    retried: String(result.retried),
    failed: String(result.failed),
    skipped: String(result.skipped),
    unsettled: String(result.unsettled),
  });
  redirect(`/${locale}/admin/email?${query.toString()}`);
}
