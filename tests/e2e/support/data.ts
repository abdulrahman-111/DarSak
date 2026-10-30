export type ActorName =
  'teacher' | 'student' | 'outsider' | 'passwordStudent' | 'notificationStudent';

const projectIndexes: Record<string, number> = {
  'en-desktop': 1,
  'ar-desktop': 2,
  'en-mobile': 3,
  'ar-mobile': 4,
};

const actorNames: ActorName[] = [
  'teacher',
  'student',
  'outsider',
  'passwordStudent',
  'notificationStudent',
];
const password = 'E2E-local-only-2026!';

function uuid(kind: number, projectIndex: number, actorIndex = 0): string {
  return `e2e${kind.toString().padStart(5, '0')}-0000-4000-8000-${projectIndex
    .toString()
    .padStart(4, '0')}${actorIndex.toString().padStart(8, '0')}`;
}

export function fixtureData(projectName: string) {
  const projectIndex = projectIndexes[projectName];
  if (!projectIndex) throw new Error(`Unknown E2E project: ${projectName}`);

  const actors = Object.fromEntries(
    actorNames.map((name, index) => [
      name,
      {
        id: uuid(0, projectIndex, index + 1),
        email: `${name.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}+${projectName}@e2e.invalid`,
        password,
      },
    ]),
  ) as Record<ActorName, { id: string; email: string; password: string }>;

  return {
    projectName,
    actors,
    credentials: actors,
    ids: {
      teacherId: actors.teacher.id,
      studentId: actors.student.id,
      outsiderId: actors.outsider.id,
      passwordStudentId: actors.passwordStudent.id,
      notificationStudentId: actors.notificationStudent.id,
      groupId: uuid(1, projectIndex),
      futureLessonId: uuid(2, projectIndex, 1),
      endedLessonId: uuid(2, projectIndex, 2),
      assignmentId: uuid(3, projectIndex),
      notificationId: uuid(4, projectIndex),
    },
  };
}

export const E2E_PROJECT_NAMES = Object.keys(projectIndexes);
