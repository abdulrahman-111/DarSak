import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { mapDiscoverGroup } from '@/features/platform/data';
import { catalogueDisplayName } from '@/features/teacher/catalogue-domain';
import {
  matchingReasonLabel,
  normalizeRecommendationsPage,
  parseMatchingPreferences,
  parsePreferredWeekdayInput,
  parseRecommendationsPage,
  recommendationPageCount,
} from '@/features/student-matching/domain';

const groupId = 'd7e2dce8-e028-4e4d-90b4-2ced3327ee6d';
const groupRow = {
  id: groupId,
  teacher_id: '85aed6b2-c557-44c4-8d11-8e2878da6603',
  offering_id: '12738d72-5a1a-4eb7-8903-9f33dd92ae2f',
  name: 'Physics foundations',
  description: '',
  capacity: 12,
  status: 'published',
  location: '',
  created_at: '2026-10-18T09:00:00Z',
  teacher_name: 'Noor Teacher',
  subject_name_ar: 'الفيزياء',
  subject_name_en: '',
  node_name_ar: 'المرحلة الثانوية',
  node_name_en: 'Secondary school',
  accepted_count: 2,
  available_seats: 10,
  weekdays: [1, 3],
  next_lesson_at: null,
  reason_codes: ['interest_subject_text', 'preferred_weekday'],
};

describe('student matching domain', () => {
  it('parses a database-shaped page with nullable profile and next-lesson fields', () => {
    const envelope = {
      rows: [groupRow],
      total: 1,
      has_profile_signals: true,
      preferred_weekdays: [1, 3],
      profile_updated_at: null,
    };
    const page = parseRecommendationsPage(envelope);
    expect(page?.rows[0]).toMatchObject({
      group: { next_lesson_at: null, subject_name_en: '', subject_name_ar: 'الفيزياء' },
      reasonCodes: ['interest_subject_text', 'preferred_weekday'],
    });
    const mapped = mapDiscoverGroup(page!.rows[0].group);
    expect(catalogueDisplayName(mapped.offering!.subject!, 'en')).toBe('الفيزياء');
    expect(mapped.next_lesson_at).toBeNull();
    expect(parseRecommendationsPage({ ...envelope, rows: Array(13).fill(groupRow) })).toBeNull();
  });

  it('bounds paging, validates optional weekday values, and labels reasons literally', () => {
    expect(normalizeRecommendationsPage('2')).toBe(2);
    expect(normalizeRecommendationsPage(['3', '4'])).toBe(3);
    expect(normalizeRecommendationsPage('999999999')).toBe(1);
    expect(recommendationPageCount(25)).toBe(3);
    expect(parsePreferredWeekdayInput(['1', '5'])).toEqual([1, 5]);
    expect(parsePreferredWeekdayInput(['1', '1'])).toBeNull();
    expect(parsePreferredWeekdayInput(['7'])).toBeNull();
    expect(
      parseMatchingPreferences({ preferred_weekdays: null, updated_at: '2026-10-20T10:00:00Z' }),
    ).toMatchObject({ preferredWeekdays: [] });
    expect(matchingReasonLabel('preferred_weekday', 'en')).toBe(
      'Includes one of your preferred days',
    );
    expect(matchingReasonLabel('interest_subject_text', 'en')).toBe(
      'Shares a topic with your interests',
    );
    expect(matchingReasonLabel('preferred_weekday', 'ar')).toContain('أيامك المفضلة');
  });
});
