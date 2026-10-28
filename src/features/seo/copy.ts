import type { SeoLocale } from './metadata';

/** Titles are shown as "<title> · DarSak"; the landing page uses the brand and tagline instead. */
export const seoCopy: Record<
  SeoLocale,
  Record<'home' | 'teachers' | 'login' | 'register', { title: string; description: string }>
> = {
  en: {
    home: {
      title: 'Find the right teacher. Learn with purpose.',
      description:
        'Browse teachers and small groups, request a seat and keep your weekly timetable in one place.',
    },
    teachers: {
      title: 'Find a teacher',
      description:
        'Search approved teachers and open groups by subject, level and weekday, then request a seat.',
    },
    login: {
      title: 'Sign in',
      description:
        'Sign in to follow your join requests, upcoming lessons and materials in one place.',
    },
    register: {
      title: 'Create an account',
      description:
        'Join DarSak as a student to find a group, or as a teacher to organize your classes.',
    },
  },
  ar: {
    home: {
      title: 'اعثر على المعلم المناسب وتعلّم لهدفك',
      description:
        'تصفّح المعلمين والمجموعات الصغيرة، واطلب مقعدًا، وتابع جدولك الأسبوعي في مكان واحد.',
    },
    teachers: {
      title: 'ابحث عن معلم',
      description:
        'ابحث عن معلمين معتمدين ومجموعات مفتوحة حسب المادة والمستوى واليوم، ثم اطلب مقعدًا.',
    },
    login: {
      title: 'تسجيل الدخول',
      description: 'سجّل الدخول لمتابعة طلبات الانضمام والحصص القادمة والمواد في مكان واحد.',
    },
    register: {
      title: 'إنشاء حساب',
      description: 'انضم إلى درسك كطالب للعثور على مجموعة، أو كمعلم لتنظيم حصصك.',
    },
  },
};
