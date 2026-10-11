import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

const coverPathPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/cover\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$/;

/** Create a short-lived URL only after Storage authorizes the viewer for this cover. */
export async function readTeacherCover(db: SupabaseClient, coverPath: string | null): Promise<string | null> {
  if (!coverPath || !coverPathPattern.test(coverPath)) return null;
  const { data, error } = await db.storage.from('teacher-avatars').createSignedUrl(coverPath, 300);
  return error ? null : data.signedUrl;
}
