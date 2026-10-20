import { describe, expect, it } from 'vitest';
import { groupLearningDetailsSchema, feeLabel } from '@/features/teacher/group-learning-domain';

const valid = {
  outcomes: 'Understand fractions',
  prerequisites: 'Basic arithmetic',
  delivery_mode: 'online',
  fee_egp: '450',
  fee_basis: 'month',
  fee_includes: 'Practice sheets',
};

describe('group learning details', () => {
  it('normalizes optional fields while preserving an explicit fee and billing basis', () => {
    expect(groupLearningDetailsSchema.parse(valid)).toEqual({
      outcomes: 'Understand fractions',
      prerequisites: 'Basic arithmetic',
      delivery_mode: 'online',
      fee_egp: 450,
      fee_basis: 'month',
      fee_includes: 'Practice sheets',
    });
    expect(
      groupLearningDetailsSchema.parse({
        outcomes: '',
        prerequisites: '',
        delivery_mode: '',
        fee_egp: '',
        fee_basis: '',
        fee_includes: '',
      }),
    ).toEqual({
      outcomes: '',
      prerequisites: '',
      delivery_mode: null,
      fee_egp: null,
      fee_basis: null,
      fee_includes: '',
    });
  });

  it('bounds text and rejects invalid fees, modes, and fee units', () => {
    expect(
      groupLearningDetailsSchema.safeParse({ ...valid, outcomes: 'x'.repeat(2001) }).success,
    ).toBe(false);
    expect(
      groupLearningDetailsSchema.safeParse({ ...valid, prerequisites: 'x'.repeat(1501) }).success,
    ).toBe(false);
    expect(groupLearningDetailsSchema.safeParse({ ...valid, fee_egp: '100001' }).success).toBe(
      false,
    );
    expect(groupLearningDetailsSchema.safeParse({ ...valid, delivery_mode: 'both' }).success).toBe(
      false,
    );
    expect(groupLearningDetailsSchema.safeParse({ ...valid, fee_basis: 'week' }).success).toBe(
      false,
    );
  });

  it('never labels a missing fee as free', () => {
    expect(feeLabel('en', { fee_egp: null, fee_basis: null })).toContain('Ask the teacher');
    expect(feeLabel('ar', { fee_egp: null, fee_basis: null })).toContain('اسأل');
    expect(feeLabel('en', { fee_egp: 450, fee_basis: 'month' })).toBe('EGP 450 / month');
  });
});
