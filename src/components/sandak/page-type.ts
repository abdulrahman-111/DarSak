import type { AssistantPageType } from '@/features/assistant/domain';

/** Reduces a pathname to a coarse, non-identifying page category. */
export function pageTypeFor(pathname: string | null): AssistantPageType {
  const parts = (pathname ?? '').split('/').filter(Boolean).slice(1);
  const [first, second] = parts;
  if (!first) return 'home';
  if (first === 'student') return 'student_workspace';
  if (first === 'teacher') return 'teacher_workspace';
  if (first === 'teachers') return 'teacher_profile';
  if (first === 'groups' || first === 'classes') return 'group';
  if (first === 'help') return 'help';
  if (first === 'account') return 'account';
  if (first === 'discover' || (first === 'student' && second === 'discover')) return 'discover';
  return 'other';
}
