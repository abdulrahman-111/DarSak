const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function first(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : value;
}

export function normalizeRosterFilters(query: unknown, groupId: unknown) {
  const rawQuery = first(query);
  const rawGroupId = first(groupId);
  return {
    query: typeof rawQuery === 'string' ? rawQuery.trim().slice(0, 120) : '',
    groupId: typeof rawGroupId === 'string' && UUID.test(rawGroupId) ? rawGroupId : null,
  };
}
