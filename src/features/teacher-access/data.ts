import 'server-only';
import { cache } from 'react';
import type { createClient } from '@/lib/supabase/server';
import { parseTeacherAccessStatus, type TeacherAccessStatus } from './domain';
export type AccessRead = { status: TeacherAccessStatus|null; error: boolean; feesEffective: boolean };
export async function getTeacherAccessStatus(db: Awaited<ReturnType<typeof createClient>>): Promise<AccessRead> {
  const result=await db.rpc('teacher_access_status');
  const status=result.error?null:parseTeacherAccessStatus(result.data);
  const feesEffective=!!status?.fees_enabled&&(status.fee_effective_at===null||Date.parse(status.fee_effective_at)<=Date.now());
  return {status,error:!!result.error||!status,feesEffective};
}
export const readTeacherAccessStatus = cache(getTeacherAccessStatus);
