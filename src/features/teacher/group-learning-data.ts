import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { GroupLearningDetails } from './group-learning-domain';
export async function groupLearningDetails(db: SupabaseClient, id: string) {
  const r = await db
    .from('group_learning_details')
    .select(
      'group_id,outcomes,prerequisites,delivery_mode,fee_egp,fee_basis,fee_includes,updated_at',
    )
    .eq('group_id', id)
    .maybeSingle();
  return { data: r.data as GroupLearningDetails | null, error: !!r.error };
}
