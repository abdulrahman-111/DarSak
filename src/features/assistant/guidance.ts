import type { AssistantAccess, AssistantLocale } from './domain';

export type GuidanceLink = { label: string; href: string };
export type GuidanceTopic = {
  id: string;
  title: string;
  answer: string;
  links: GuidanceLink[];
};

type TopicDefinition = {
  id: string;
  title: { en: string; ar: string };
  answer: { en: string; ar: string };
  path: string;
  label: { en: string; ar: string };
  terms: string[];
};

const common: TopicDefinition[] = [
  {
    id: 'account',
    title: { en: 'Account settings', ar: 'إعدادات الحساب' },
    answer: {
      en: 'Review your account settings and keep your sign-in details current.',
      ar: 'راجع إعدادات حسابك وحافظ على تحديث بيانات تسجيل الدخول.',
    },
    path: '/account',
    label: { en: 'Account', ar: 'الحساب' },
    terms: ['account', 'settings', 'حساب', 'الحساب', 'إعدادات'],
  },
  {
    id: 'security',
    title: { en: 'Password and security', ar: 'كلمة المرور والأمان' },
    answer: {
      en: 'You can update your password in account security settings. Never share your password or verification codes with anyone.',
      ar: 'يمكنك تحديث كلمة المرور من إعدادات أمان الحساب. لا تشارك كلمة مرورك أو رموز التحقق مع أي شخص.',
    },
    path: '/account/security',
    label: { en: 'Security settings', ar: 'إعدادات الأمان' },
    terms: [
      'password',
      'passcode',
      'sign in',
      'login',
      'security',
      'reset',
      'forgot',
      'كلمة المرور',
      'كلمة السر',
      'مرور',
      'الأمان',
      'امن',
      'نسيت',
      'تغيير',
    ],
  },
  {
    id: 'reports',
    title: { en: 'Reports', ar: 'البلاغات' },
    answer: {
      en: 'Use reports to review or submit a platform problem.',
      ar: 'استخدم صفحة البلاغات لمراجعة مشكلة في المنصة أو الإبلاغ عنها.',
    },
    path: '/reports',
    label: { en: 'Reports', ar: 'البلاغات' },
    terms: ['report', 'problem', 'issue', 'بلاغ', 'البلاغات', 'مشكلة'],
  },
  {
    id: 'notifications',
    title: { en: 'Notifications', ar: 'الإشعارات' },
    answer: {
      en: 'Open notifications to review updates about activity on the platform.',
      ar: 'افتح الإشعارات لمراجعة التحديثات المتعلقة بنشاطك على المنصة.',
    },
    path: '/notifications',
    label: { en: 'Notifications', ar: 'الإشعارات' },
    terms: ['notification', 'notifications', 'alert', 'إشعار', 'الإشعارات', 'تنبيه'],
  },
  {
    id: 'help',
    title: { en: 'Help centre', ar: 'مركز المساعدة' },
    answer: {
      en: 'The help centre has more information about using DarSak.',
      ar: 'يحتوي مركز المساعدة على معلومات إضافية حول استخدام دارسك.',
    },
    path: '/help',
    label: { en: 'Help centre', ar: 'مركز المساعدة' },
    terms: ['help', 'support', 'مساعدة', 'الدعم'],
  },
];

const byRole: Record<AssistantAccess['role'], TopicDefinition[]> = {
  student: [
    {
      id: 'teachers',
      title: { en: 'Find teachers', ar: 'العثور على معلمين' },
      answer: {
        en: 'Browse teacher profiles to discover learning options.',
        ar: 'تصفح ملفات المعلمين للتعرف على خيارات التعلم.',
      },
      path: '/teachers',
      label: { en: 'Browse teachers', ar: 'تصفح المعلمين' },
      terms: ['teacher', 'tutor', 'find', 'discover', 'معلم', 'مدرس', 'العثور', 'ابحث'],
    },
    {
      id: 'learning-profile',
      title: { en: 'Learning profile', ar: 'ملف التعلم' },
      answer: {
        en: 'Review your learning profile and preferences.',
        ar: 'راجع ملف التعلم والتفضيلات الخاصة بك.',
      },
      path: '/account/learning-profile',
      label: { en: 'Learning profile', ar: 'ملف التعلم' },
      terms: ['learning profile', 'preferences', 'profile', 'تعلم', 'التفضيلات', 'ملف التعلم'],
    },
    {
      id: 'classes',
      title: { en: 'Requests and classes', ar: 'الطلبات والحصص' },
      answer: {
        en: 'Check your class requests and accepted classes. A pending request is not an accepted enrollment; teacher contact is unlocked only after acceptance.',
        ar: 'تابع طلبات الحصص والحصص المقبولة. الطلب قيد الانتظار لا يعني قبول التسجيل؛ ولا يتاح التواصل مع المعلم إلا بعد القبول.',
      },
      path: '/student/classes',
      label: { en: 'Classes', ar: 'الحصص' },
      terms: [
        'class',
        'classes',
        'request',
        'enroll',
        'enrollment',
        'pending',
        'accepted',
        'حصة',
        'حصص',
        'طلب',
        'طلبات',
        'تسجيل',
        'انتظار',
        'قبول',
      ],
    },
    {
      id: 'timetable',
      title: { en: 'Timetable', ar: 'الجدول' },
      answer: {
        en: 'Open your timetable to review your scheduled learning sessions.',
        ar: 'افتح الجدول لمراجعة جلسات التعلم المسجلة.',
      },
      path: '/timetable',
      label: { en: 'Timetable', ar: 'الجدول' },
      terms: ['timetable', 'calendar', 'schedule', 'جدول', 'الجدول', 'مواعيد'],
    },
    {
      id: 'materials',
      title: { en: 'Class materials', ar: 'مواد الحصص' },
      answer: {
        en: 'Your class materials are available in the materials area for your enrolled classes.',
        ar: 'تتوفر مواد الحصص في قسم المواد للحصص التي سجلت فيها.',
      },
      path: '/student/materials',
      label: { en: 'Materials', ar: 'المواد' },
      terms: ['material', 'materials', 'resource', 'resources', 'ملف', 'مواد', 'المواد', 'مصادر'],
    },
    {
      id: 'saved',
      title: { en: 'Saved groups', ar: 'المجموعات المحفوظة' },
      answer: {
        en: 'Review the groups you saved for later.',
        ar: 'راجع المجموعات التي حفظتها للعودة إليها.',
      },
      path: '/student/saved',
      label: { en: 'Saved groups', ar: 'المجموعات المحفوظة' },
      terms: ['saved', 'save', 'bookmark', 'محفوظ', 'حفظ', 'المحفوظات'],
    },
  ],
  teacher: [],
  admin: [
    {
      id: 'admin-teachers',
      title: { en: 'Teacher review', ar: 'مراجعة المعلمين' },
      answer: {
        en: 'Review teacher records and applications in the teacher administration area.',
        ar: 'راجع سجلات المعلمين وطلباتهم في قسم إدارة المعلمين.',
      },
      path: '/admin/teachers',
      label: { en: 'Teachers', ar: 'المعلمون' },
      terms: ['teacher', 'application', 'review', 'معلم', 'طلب', 'مراجعة'],
    },
    {
      id: 'admin-users',
      title: { en: 'User administration', ar: 'إدارة المستخدمين' },
      answer: {
        en: 'Review user records in the user administration area.',
        ar: 'راجع سجلات المستخدمين في قسم إدارة المستخدمين.',
      },
      path: '/admin/users',
      label: { en: 'Users', ar: 'المستخدمون' },
      terms: ['user', 'users', 'account', 'مستخدم', 'المستخدمين', 'حساب'],
    },
    {
      id: 'admin-groups',
      title: { en: 'Group administration', ar: 'إدارة المجموعات' },
      answer: {
        en: 'Review group records in the group administration area.',
        ar: 'راجع سجلات المجموعات في قسم إدارة المجموعات.',
      },
      path: '/admin/groups',
      label: { en: 'Groups', ar: 'المجموعات' },
      terms: ['group', 'groups', 'مجموعة', 'مجموعات'],
    },
    {
      id: 'admin-reports',
      title: { en: 'Platform reports', ar: 'بلاغات المنصة' },
      answer: {
        en: 'Review submitted platform reports in the reports administration area.',
        ar: 'راجع البلاغات المرسلة عن المنصة في قسم إدارة البلاغات.',
      },
      path: '/admin/reports',
      label: { en: 'Reports', ar: 'البلاغات' },
      terms: ['report', 'reports', 'بلاغ', 'بلاغات'],
    },
  ],
};

byRole.teacher = [
  {
    id: 'teacher-access',
    title: { en: 'Teaching access', ar: 'صلاحية التدريس' },
    answer: {
      en: 'Review your application and teaching access status. Teaching tools become available when teaching access is granted.',
      ar: 'راجع طلبك وحالة صلاحية التدريس. تتاح أدوات التدريس بعد منح الصلاحية.',
    },
    path: '/account/application',
    label: { en: 'Application', ar: 'الطلب' },
    terms: [
      'teaching access',
      'application',
      'approval',
      'status',
      'صلاحية',
      'التدريس',
      'طلب',
      'موافقة',
      'الحالة',
    ],
  },
  {
    id: 'teacher-access-status',
    title: { en: 'Teaching access status', ar: 'حالة صلاحية التدريس' },
    answer: {
      en: 'Review the current status of your teaching access.',
      ar: 'راجع الحالة الحالية لصلاحية التدريس.',
    },
    path: '/account/teaching-access',
    label: { en: 'Teaching access', ar: 'صلاحية التدريس' },
    terms: ['teaching access', 'status', 'صلاحية', 'التدريس', 'الحالة'],
  },
  {
    id: 'teacher-profile',
    title: { en: 'Teacher profile', ar: 'ملف المعلم' },
    answer: {
      en: 'Review your teacher profile information.',
      ar: 'راجع معلومات ملف المعلم الخاص بك.',
    },
    path: '/account/profile',
    label: { en: 'Profile', ar: 'الملف' },
    terms: ['profile', 'teacher profile', 'ملف', 'المعلم'],
  },
  {
    id: 'teacher-groups',
    title: { en: 'Create and manage groups', ar: 'إنشاء المجموعات وإدارتها' },
    answer: {
      en: 'To create a group, enter its details, set its schedule, review it, then publish. A local template preview does not create a group.',
      ar: 'لإنشاء مجموعة، أدخل تفاصيلها وحدد جدولها ثم راجعها وانشرها. معاينة القالب المحلية لا تنشئ مجموعة.',
    },
    path: '/teacher/groups/new',
    label: { en: 'Create a group', ar: 'إنشاء مجموعة' },
    terms: [
      'group',
      'groups',
      'create',
      'manage',
      'publish',
      'مجموعة',
      'مجموعات',
      'إنشاء',
      'ادارة',
      'إدارة',
      'نشر',
    ],
  },
  {
    id: 'teacher-manage-groups',
    title: { en: 'Manage groups', ar: 'إدارة المجموعات' },
    answer: {
      en: 'Open your groups to review and manage group details.',
      ar: 'افتح مجموعاتك لمراجعة تفاصيل المجموعة وإدارتها.',
    },
    path: '/teacher/groups',
    label: { en: 'My groups', ar: 'مجموعاتي' },
    terms: ['manage groups', 'my groups', 'مجموعاتي', 'إدارة المجموعات'],
  },
  {
    id: 'teacher-requests',
    title: { en: 'Student requests', ar: 'طلبات الطلاب' },
    answer: {
      en: 'Review requests to join your groups in the requests area.',
      ar: 'راجع طلبات الانضمام إلى مجموعاتك في قسم الطلبات.',
    },
    path: '/teacher/requests',
    label: { en: 'Requests', ar: 'الطلبات' },
    terms: ['request', 'requests', 'student', 'join', 'طلب', 'طلبات', 'طالب', 'انضمام'],
  },
  {
    id: 'teacher-lessons',
    title: { en: 'Lessons', ar: 'الدروس' },
    answer: { en: 'Review your lessons in the lessons area.', ar: 'راجع دروسك في قسم الدروس.' },
    path: '/teacher/lessons',
    label: { en: 'Lessons', ar: 'الدروس' },
    terms: ['lesson', 'lessons', 'class', 'درس', 'دروس', 'حصة'],
  },
  {
    id: 'teacher-students',
    title: { en: 'Students', ar: 'الطلاب' },
    answer: {
      en: 'Review your enrolled students in the students area.',
      ar: 'راجع الطلاب المسجلين لديك في قسم الطلاب.',
    },
    path: '/teacher/students',
    label: { en: 'Students', ar: 'الطلاب' },
    terms: ['student', 'students', 'roster', 'طالب', 'طلاب', 'الطلاب'],
  },
];

const ROLE_TOPICS: Record<AssistantAccess['role'], TopicDefinition[]> = {
  student: [...common, ...byRole.student],
  teacher: [...common, ...byRole.teacher],
  admin: [...common, ...byRole.admin],
};

const SEARCH_LIMIT = 180;
const RESULT_LIMIT = 5;
const UNAVAILABLE_TO_UNAPPROVED_TEACHERS = new Set([
  'teacher-groups',
  'teacher-manage-groups',
  'teacher-requests',
  'teacher-lessons',
  'teacher-students',
]);

function normalize(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '')
    .replace(/ـ/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function toTopic(definition: TopicDefinition, locale: AssistantLocale): GuidanceTopic {
  return {
    id: definition.id,
    title: definition.title[locale],
    answer: definition.answer[locale],
    links: [{ label: definition.label[locale], href: `/${locale}${definition.path}` }],
  };
}

export function getGuidanceTopics(
  locale: AssistantLocale,
  access: AssistantAccess,
): GuidanceTopic[] {
  if ((locale !== 'en' && locale !== 'ar') || !access || !ROLE_TOPICS[access.role]) return [];
  const role = access.role;
  return ROLE_TOPICS[role]
    .filter(
      topic =>
        !(
          role === 'teacher' &&
          !access.canTeach &&
          UNAVAILABLE_TO_UNAPPROVED_TEACHERS.has(topic.id)
        ),
    )
    .map(topic => toTopic(topic, locale));
}

export function findGuidanceTopics(
  query: string,
  locale: AssistantLocale,
  access: AssistantAccess,
): GuidanceTopic[] {
  if (typeof query !== 'string' || query.length > SEARCH_LIMIT || !query.trim()) return [];
  const normalizedQuery = normalize(query);
  const queryTokens = normalizedQuery.split(' ').filter(token => token.length > 1);
  if (!queryTokens.length) return [];

  const ranked = ROLE_TOPICS[access.role]
    .filter(
      topic =>
        !(
          access.role === 'teacher' &&
          !access.canTeach &&
          UNAVAILABLE_TO_UNAPPROVED_TEACHERS.has(topic.id)
        ),
    )
    .map(topic => {
      const searchable = [
        topic.id,
        topic.title.en,
        topic.title.ar,
        topic.answer.en,
        topic.answer.ar,
        ...topic.terms,
      ]
        .map(normalize)
        .filter(Boolean);
      const score = queryTokens.reduce((total, token) => {
        if (searchable.some(item => item === token)) return total + 3;
        if (searchable.some(item => item.includes(token) || token.includes(item))) return total + 1;
        return total;
      }, 0);
      return { topic, score };
    })
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || left.topic.id.localeCompare(right.topic.id))
    .slice(0, RESULT_LIMIT);

  return ranked.map(({ topic }) => toTopic(topic, locale));
}
