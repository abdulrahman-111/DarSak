import 'server-only';
import { revalidatePath } from 'next/cache';

export function revalidateStudentWorkspace() {
  for (const locale of ['en', 'ar'] as const) {
    revalidatePath(`/${locale}/student`);
    revalidatePath(`/${locale}/student/classes`);
    revalidatePath(`/${locale}/student/classes/[id]`, 'page');
    revalidatePath(`/${locale}/student/lessons/[id]`, 'page');
    revalidatePath(`/${locale}/student/materials`);
    revalidatePath(`/${locale}/timetable`);
  }
}

export function revalidateTeacherWorkspace() {
  for (const locale of ['en', 'ar'] as const) {
    revalidatePath(`/${locale}/teacher`);
    revalidatePath(`/${locale}/teacher/lessons`);
    revalidatePath(`/${locale}/teacher/lessons/[id]`, 'page');
    revalidatePath(`/${locale}/teacher/groups`);
    revalidatePath(`/${locale}/teacher/groups/[id]`, 'page');
  }
}
