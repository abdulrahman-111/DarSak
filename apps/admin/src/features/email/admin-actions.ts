'use server';

import { redirect } from 'next/navigation';
import { getAdminActor } from '@admin/lib/access';

export async function retryEmailJob(locale: string, form: FormData): Promise<void> {
  const actor = await getAdminActor();
  const id = String(form.get('id') ?? '');
  if (
    !actor ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
  )
    redirect(`/${locale}/admin/email?result=unavailable`);
  const { error } = await actor.db.rpc('retry_email_job', { p_id: id });
  if (error) redirect(`/${locale}/admin/email?result=unavailable`);
  redirect(`/${locale}/admin/email?result=retried`);
}
