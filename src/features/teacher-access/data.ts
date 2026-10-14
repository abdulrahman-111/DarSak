import 'server-only';
import { cache } from 'react';
import type { createClient } from '@/lib/supabase/server';
import { parseTeacherAccessStatus, type TeacherAccessStatus } from './domain';
export type AccessRead = { status: TeacherAccessStatus|null; error: boolean };
export async function getTeacherAccessStatus(db: Awaited<ReturnType<typeof createClient>>): Promise<AccessRead> {
  const result=await db.rpc('teacher_access_status');
  const status=result.error?null:parseTeacherAccessStatus(result.data);
  return {status,error:!!result.error||!status};
}
export const readTeacherAccessStatus = cache(getTeacherAccessStatus);
