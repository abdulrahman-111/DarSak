export const SUPABASE_PAGE_SIZE = 1000;

type Page<T> = { data: T[] | null; error: unknown };
type RangeQuery<T> = (from: number, to: number) => PromiseLike<Page<T>>;

/** Read every row from an ordered PostgREST query without relying on the API row cap. */
export async function readAllPages<T>(query: RangeQuery<T>, pageSize = SUPABASE_PAGE_SIZE): Promise<{ data: T[]; error: unknown | null }> {
  if (!Number.isSafeInteger(pageSize) || pageSize <= 0) {
    return { data: [], error: new RangeError('Page size must be a positive safe integer.') };
  }
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await query(from, from + pageSize - 1);
    if (error) return { data: [], error };
    if (!Array.isArray(data)) return { data: [], error: new Error('Paged query returned no row array.') };
    const page = data;
    rows.push(...page);
    if (page.length < pageSize) return { data: rows, error: null };
  }
}
