export type ActorName =
  | 'teacher'
  | 'student'
  | 'outsider'
  | 'passwordStudent'
  | 'notificationStudent'
  | 'liveNotificationStudent'
  | 'accessTeacher'
  | 'ratingsTeacher'
  | 'ratingsStudent'
  | 'meetingTeacher'
  | 'meetingStudent'
  | 'viewerStudent';

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
  'liveNotificationStudent',
  'accessTeacher',
  'ratingsTeacher',
  'ratingsStudent',
  'meetingTeacher',
  'meetingStudent',
  'viewerStudent',
];
const actorIndexes: Record<ActorName, number> = {
  teacher: 1,
  student: 2,
  outsider: 3,
  passwordStudent: 4,
  notificationStudent: 5,
  liveNotificationStudent: 7,
  accessTeacher: 8,
  ratingsTeacher: 9,
  ratingsStudent: 10,
  meetingTeacher: 11,
  meetingStudent: 12,
  viewerStudent: 13,
};
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
    actorNames.map(name => [
      name,
      {
        id: uuid(0, projectIndex, actorIndexes[name]),
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
      liveNotificationStudentId: actors.liveNotificationStudent.id,
      accessTeacherId: actors.accessTeacher.id,
      seedAdminId: uuid(0, projectIndex, 6),
      groupId: uuid(1, projectIndex),
      accessTeacherGroupId: uuid(1, projectIndex, 8),
      ratingsGroupId: `00000148-0000-4000-8000-${projectIndex.toString().padStart(4, '0')}00000001`,
      meetingTeacherId: actors.meetingTeacher.id,
      meetingStudentId: actors.meetingStudent.id,
      meetingGroupId: `00000145-0000-4000-8000-${projectIndex.toString().padStart(4, '0')}00000001`,
      meetingLessonId: `00000145-0000-4000-8000-${projectIndex.toString().padStart(4, '0')}00000002`,
      futureLessonId: uuid(2, projectIndex, 1),
      endedLessonId: uuid(2, projectIndex, 2),
      accessTeacherLessonId: uuid(2, projectIndex, 8),
      ratingsFirstLessonId: uuid(6, projectIndex, 1),
      ratingsSecondLessonId: uuid(6, projectIndex, 2),
      ratingsBaselineFeedbackIds: [20, 21, 22].map(index => uuid(5, projectIndex, index)),
      assignmentId: uuid(3, projectIndex),
      notificationId: uuid(4, projectIndex),
      feedbackId: uuid(5, projectIndex),
    },
  };
}

export const E2E_PROJECT_NAMES = Object.keys(projectIndexes);
