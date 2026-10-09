import { z } from 'zod';

export const DISCOVERY_PAGE_SIZE = 12;
export const DISCOVERY_FETCH_LIMIT = DISCOVERY_PAGE_SIZE + 1;
const MAX_PAGE = Math.floor(2_147_483_647 / DISCOVERY_PAGE_SIZE) + 1;
const MAX_QUERY_LENGTH = 120;

export type DiscoveryFilterInput = URLSearchParams | Record<string, string | string[] | undefined>;
export type DiscoveryFilters = {
  subjectId: string | null;
  nodeId: string | null;
  teacherId: string | null;
  weekday: number | null;
  hasSeats: boolean;
  query: string;
  page: number;
};

function firstValue(input: DiscoveryFilterInput, key: string): string {
  if (input instanceof URLSearchParams) return input.get(key) ?? '';
  const value = input[key];
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

function optionalUuid(input: DiscoveryFilterInput, key: string): string | null {
  const value = firstValue(input, key).trim();
  return z.string().uuid().safeParse(value).success ? value.toLowerCase() : null;
}

function optionalWeekday(input: DiscoveryFilterInput): number | null {
  const value = firstValue(input, 'weekday');
  return /^[0-6]$/.test(value) ? Number(value) : null;
}

function pageNumber(input: DiscoveryFilterInput): number {
  const value = firstValue(input, 'page');
  if (!/^[1-9]\d*$/.test(value)) return 1;
  const page = Number(value);
  return Number.isSafeInteger(page) && page <= MAX_PAGE ? page : 1;
}

export function normalizeDiscoveryFilters(input: DiscoveryFilterInput): DiscoveryFilters {
  const rawQuery = firstValue(input, 'query').trim();
  const seatsValue = firstValue(input, 'has_seats').toLowerCase();
  return {
    subjectId: optionalUuid(input, 'subject_id'),
    nodeId: optionalUuid(input, 'node_id'),
    teacherId: optionalUuid(input, 'teacher_id'),
    weekday: optionalWeekday(input),
    hasSeats: seatsValue === 'true' || seatsValue === '1' || seatsValue === 'on',
    query: rawQuery.slice(0, MAX_QUERY_LENGTH),
    page: pageNumber(input),
  };
}

export function discoverySearchParams(filters: DiscoveryFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.subjectId) params.set('subject_id', filters.subjectId);
  if (filters.nodeId) params.set('node_id', filters.nodeId);
  if (filters.teacherId) params.set('teacher_id', filters.teacherId);
  if (filters.weekday !== null) params.set('weekday', String(filters.weekday));
  if (filters.hasSeats) params.set('has_seats', 'true');
  if (filters.query) params.set('query', filters.query);
  if (filters.page > 1) params.set('page', String(filters.page));
  return params;
}

export function discoveryRpcArgs(filters: DiscoveryFilters) {
  return {
    p_subject_id: filters.subjectId,
    p_node_id: filters.nodeId,
    p_teacher_id: filters.teacherId,
    p_weekday: filters.weekday,
    p_has_seats: filters.hasSeats,
    p_query: filters.query,
    p_offset: (filters.page - 1) * DISCOVERY_PAGE_SIZE,
    p_limit: DISCOVERY_FETCH_LIMIT,
  };
}
