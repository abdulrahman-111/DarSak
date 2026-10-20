import { ensureLocale } from '@/i18n/config';
import { requireViewer } from '@/components/platform/access';
import { Metric, ScreenTitle, UnavailableMetric } from '@/components/platform/ui';

export default async function AdminOverview({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params,
    locale = ensureLocale(raw),
    ar = locale === 'ar',
    me = await requireViewer(locale, 'admin');
  const [students, teachers, reviews, groups, reports, enrollments] = await Promise.all([
    me.db.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'student'),
    me.db.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'teacher'),
    me.db.rpc('admin_teacher_reviews', {
      p_status: 'pending',
      p_query: '',
      p_offset: 0,
      p_limit: 1,
    }),
    me.db.from('groups').select('id', { count: 'exact', head: true }),
    me.db.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'open'),
    me.db.from('enrollments').select('id', { count: 'exact', head: true }).eq('status', 'accepted'),
  ]);
  const response = reviews.data as { total?: unknown } | null,
    pendingTotal = typeof response?.total === 'number' ? response.total : null,
    reviewsFailed = !!reviews.error || pendingTotal === null;
  const t = ar
    ? {
        eyebrow: 'إدارة المنصة',
        title: 'نظرة عامة',
        description:
          'ابدأ بمراجعة طلبات المعلمين والبلاغات المفتوحة، ثم انتقل إلى بقية أقسام الإدارة.',
        students: 'الطلاب',
        teachers: 'المعلمون',
        pending: 'طلبات معلمين بانتظار المراجعة',
        groups: 'المجموعات',
        enrollments: 'طلبات التحاق مقبولة',
        reports: 'بلاغات مفتوحة',
        queue: 'مراجعة طلبات المعلمين',
        error: 'تعذر تحميل هذا العدد. حدّث الصفحة وحاول مرة أخرى.',
        intro: 'راجع طلبات المعلمين والبلاغات المفتوحة.',
        users: 'المستخدمون',
        groupsLink: 'المجموعات',
        catalogue: 'الدليل التعليمي',
        reportsLink: 'مراجعة البلاغات المفتوحة',
        settings: 'الإعدادات',
        retry: 'إعادة المحاولة',
      }
    : {
        eyebrow: 'Platform administration',
        title: 'Overview',
        description:
          'Start by reviewing teacher applications and open reports, then use the other administration areas as needed.',
        students: 'Students',
        teachers: 'Teachers',
        pending: 'Teacher applications awaiting review',
        groups: 'Groups',
        enrollments: 'Accepted enrollments',
        reports: 'Open reports',
        queue: 'Review teacher applications',
        error: 'Could not load this count. Refresh and try again.',
        intro: 'Review teacher applications and open reports.',
        users: 'People',
        groupsLink: 'Groups',
        catalogue: 'Education catalogue',
        reportsLink: 'Review open reports',
        settings: 'Settings',
        retry: 'Try again',
      };
  const stats = [
    {
      label: t.pending,
      result: reviewsFailed ? { error: true, count: null } : { error: null, count: pendingTotal },
      href: `/${locale}/admin/teachers`,
    },
    { label: t.reports, result: reports, href: `/${locale}/admin/reports` },
    { label: t.students, result: students, href: `/${locale}/admin/users` },
    { label: t.teachers, result: teachers, href: `/${locale}/admin/users?role=teacher` },
    { label: t.groups, result: groups, href: `/${locale}/admin/groups` },
    { label: t.enrollments, result: enrollments, href: `/${locale}/admin/groups` },
  ];
  const attention = stats.slice(0, 2),
    platform = stats.slice(2);
  const render = (item: (typeof stats)[number], tone: 'default' | 'attention') =>
    item.result.error || item.result.count === null ? (
      <UnavailableMetric
        key={item.label}
        label={item.label}
        message={t.error}
        href={`/${locale}/admin?retry=1`}
        retry={t.retry}
      />
    ) : (
      <Metric
        key={item.label}
        href={item.href}
        label={item.label}
        value={item.result.count}
        tone={tone}
      />
    );
  // Work queues first (highlighted when non-empty), then platform totals. The sidebar already covers the other admin areas.
  return (
    <>
      <ScreenTitle eyebrow={t.eyebrow} title={t.title} description={t.description} />
      <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-muted">
        {ar ? 'بانتظارك' : 'Needs your attention'}
      </h2>
      <div className="grid gap-4 sm:grid-cols-2">
        {attention.map(item => render(item, 'attention'))}
      </div>
      <h2 className="mb-3 mt-8 text-sm font-bold uppercase tracking-wider text-muted">
        {ar ? 'المنصة' : 'Platform'}
      </h2>
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {platform.map(item => render(item, 'default'))}
      </div>
    </>
  );
}
