export const TEACHER_PLANS = {
  standard: {
    planCode: 'standard',
    monthlyEgp: 100,
    activeGroups: 5,
    storedFiles: 100,
    storageBytes: 250 * 1024 * 1024,
    maxFileBytes: 10 * 1024 * 1024,
  },
  pro: {
    planCode: 'pro',
    monthlyEgp: 200,
    activeGroups: 20,
    storedFiles: 500,
    storageBytes: 1024 * 1024 * 1024,
    maxFileBytes: 10 * 1024 * 1024,
  },
} as const;

export const PLAN_ENFORCEMENT_DEFAULT_ENABLED = false;
