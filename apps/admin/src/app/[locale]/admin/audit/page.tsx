import Link from 'next/link';
import { ensureLocale } from '@/i18n/config';
import { requireAdminActor } from '@admin/lib/access';
import { Panel, ScreenTitle } from '@/components/platform/ui';
import { fieldClass, primaryButtonClass, secondaryButtonClass } from '@admin/components/ui';
import {
  auditActions,
  auditTargetTypes,
  isUtcTimestamp,
  parseAuditPage,
  validateAuditFilters,
  utcDateStart,
  utcDateExclusiveEnd,
  type AuditFilters,
} from '@admin/features/audit/domain';

type Query = Record<string, string | string[] | undefined>;

export default async function AuditPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Query>;
}) {
  const [{ locale: raw }, query] = await Promise.all([params, searchParams]);
  const locale = ensureLocale(raw),
    ar = locale === 'ar';
  const actor = await requireAdminActor(locale);
  const filters: AuditFilters = {
    actorId: typeof query.actor_id === 'string' ? query.actor_id : '',
    targetType: typeof query.target_type === 'string' ? query.target_type : '',
    targetId: typeof query.target_id === 'string' ? query.target_id : '',
    action: typeof query.action === 'string' ? query.action : '',
    from: typeof query.from === 'string' ? query.from : '',
    to: typeof query.to === 'string' ? query.to : '',
  };
  const filterNames = ['actor_id', 'target_type', 'target_id', 'action', 'from', 'to'];
  const duplicateFilter = filterNames.some(name => Array.isArray(query[name]));
  const validation = duplicateFilter ? 'duplicate' : validateAuditFilters(filters);
  const hasCursorAt = query.before_at !== undefined;
  const hasCursorId = query.before_id !== undefined;
  const cursorId = typeof query.before_id === 'string' ? query.before_id : '';
  const cursorValid =
    hasCursorAt === hasCursorId &&
    (!hasCursorAt ||
      (typeof query.before_at === 'string' &&
        isUtcTimestamp(query.before_at) &&
        /^\d{1,19}$/.test(cursorId) &&
        BigInt(cursorId) > BigInt(0) &&
        BigInt(cursorId) <= BigInt('9223372036854775807')));
  const snapshotValid =
    query.snapshot_at === undefined ||
    (typeof query.snapshot_at === 'string' && isUtcTimestamp(query.snapshot_at));
  let page = null;
  if (!validation && cursorValid && snapshotValid) {
    const result = await actor.db.rpc('admin_audit_page', {
      p_actor_id: filters.actorId || null,
      p_target_type: filters.targetType || null,
      p_target_id: filters.targetId || null,
      p_action: filters.action || null,
      p_from: filters.from ? utcDateStart(filters.from) : null,
      p_to: filters.to ? utcDateExclusiveEnd(filters.to) : null,
      p_before_at: hasCursorAt ? query.before_at : null,
      p_before_id: hasCursorAt ? cursorId : null,
      p_snapshot_at: typeof query.snapshot_at === 'string' ? query.snapshot_at : null,
      p_limit: 50,
    });
    page = result.error ? null : parseAuditPage(result.data);
  }
  const copy = ar
    ? {
        title: 'سجل التدقيق',
        description:
          'سجل إداري للتغييرات. يعرض السجلات حتى وقت القطع المحدد؛ قد تظهر عمليات متأخرة في صفحات لاحقة.',
        filters: 'تصفية السجل',
        actorFilter: 'معرّف المسؤول',
        targetType: 'نوع الهدف',
        targetId: 'معرّف الهدف',
        action: 'الإجراء',
        from: 'من تاريخ UTC (شامل)',
        to: 'قبل تاريخ UTC (غير شامل)',
        apply: 'تطبيق',
        export: 'تصدير CSV',
        invalid:
          'تحقق من المرشحات: استخدم معرّفات UUID وتواريخ UTC صحيحة، واجعل تاريخ البداية قبل تاريخ النهاية.',
        cursorInvalid: 'مؤشر الصفحة غير صالح. ابدأ من الصفحة الأولى.',
        error: 'تعذر تحميل سجل التدقيق. حدّث الصفحة وحاول مرة أخرى.',
        empty: 'لا توجد سجلات تطابق المرشحات.',
        records: 'السجلات حتى',
        total: 'المطابق',
        capped: 'العدد معروض بحد أقصى ٥٠٬٠٠٠',
        first: 'الصفحة الأولى',
        next: 'التالي',
        at: 'الوقت (UTC)',
        actor: 'الفاعل',
        system: 'النظام',
        metadata: 'بيانات وصفية',
      }
    : {
        title: 'Audit log',
        description:
          'An administrator change ledger. Records are shown up to the stated cutoff; later commits may appear on subsequent pages.',
        filters: 'Filter the ledger',
        actorFilter: 'Administrator UUID',
        targetType: 'Target type',
        targetId: 'Target UUID',
        action: 'Action',
        from: 'From UTC date (inclusive)',
        to: 'Before UTC date (exclusive)',
        apply: 'Apply filters',
        export: 'Export CSV',
        invalid:
          'Check the filters: use valid UUIDs and real UTC dates, with the start date before the exclusive end date.',
        cursorInvalid: 'The page cursor is invalid. Start at the first page.',
        error: 'Could not load the audit log. Refresh and try again.',
        empty: 'No records match these filters.',
        records: 'Records up to',
        total: 'Matching records',
        capped: 'Count capped at 50,000',
        first: 'First page',
        next: 'Next',
        at: 'Time (UTC)',
        actor: 'Actor',
        system: 'System',
        metadata: 'Metadata',
      };
  const queryString = new URLSearchParams(
    Object.entries(filters).map(([key, value]) => [
      (
        {
          actorId: 'actor_id',
          targetType: 'target_type',
          targetId: 'target_id',
          action: 'action',
          from: 'from',
          to: 'to',
        } as Record<string, string>
      )[key],
      value,
    ]),
  );
  return (
    <>
      <ScreenTitle
        eyebrow={ar ? 'إدارة المنصة' : 'Platform administration'}
        title={copy.title}
        description={copy.description}
        action={
          <a className={secondaryButtonClass} href={`/${locale}/admin/audit/export?${queryString}`}>
            {copy.export}
          </a>
        }
      />
      <Panel className="mb-5">
        <h2 className="font-bold text-teal">{copy.filters}</h2>
        <form method="get" className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="grid gap-1 text-sm font-semibold">
            {copy.actorFilter}
            <input
              className={fieldClass}
              name="actor_id"
              type="text"
              defaultValue={filters.actorId}
              maxLength={36}
            />
          </label>
          <label className="grid gap-1 text-sm font-semibold">
            {copy.targetType}
            <select className={fieldClass} name="target_type" defaultValue={filters.targetType}>
              <option value="">{ar ? 'الكل' : 'All'}</option>
              {auditTargetTypes.map(value => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-semibold">
            {copy.targetId}
            <input
              className={fieldClass}
              name="target_id"
              type="text"
              defaultValue={filters.targetId}
              maxLength={36}
            />
          </label>
          <label className="grid gap-1 text-sm font-semibold">
            {copy.action}
            <select className={fieldClass} name="action" defaultValue={filters.action}>
              <option value="">{ar ? 'الكل' : 'All'}</option>
              {auditActions.map(value => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-semibold">
            {copy.from}
            <input className={fieldClass} name="from" type="date" defaultValue={filters.from} />
          </label>
          <label className="grid gap-1 text-sm font-semibold">
            {copy.to}
            <input className={fieldClass} name="to" type="date" defaultValue={filters.to} />
          </label>
          <div className="sm:col-span-2 lg:col-span-3">
            <button className={primaryButtonClass}>{copy.apply}</button>
          </div>
        </form>
      </Panel>
      {validation || !cursorValid || !snapshotValid ? (
        <Panel>
          <p role="alert" className="text-danger">
            {validation ? copy.invalid : !cursorValid ? copy.cursorInvalid : copy.invalid}
          </p>
        </Panel>
      ) : !page ? (
        <Panel>
          <p role="alert" className="text-danger">
            {copy.error}
          </p>
        </Panel>
      ) : (
        <>
          <p className="mb-3 text-sm text-muted">
            {copy.records} <time dateTime={page.snapshot_at}>{page.snapshot_at}</time> ·{' '}
            {copy.total}: {page.total.toLocaleString(ar ? 'ar' : 'en')}
            {page.total_capped ? ` · ${copy.capped}` : ''}
          </p>
          {page.rows.length ? (
            <div className="overflow-x-auto rounded-2xl border border-line bg-white">
              <table className="w-full min-w-[900px] border-collapse text-start text-sm">
                <thead>
                  <tr className="border-b border-line bg-cream">
                    {[
                      copy.at,
                      copy.actor,
                      copy.action,
                      copy.targetType,
                      copy.targetId,
                      copy.metadata,
                    ].map(x => (
                      <th key={x} className="p-3 text-start">
                        {x}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {page.rows.map(row => (
                    <tr key={row.id} className="border-b border-line last:border-0">
                      <td className="whitespace-nowrap p-3" dir="ltr">
                        {row.at}
                      </td>
                      <td className="p-3">
                        <span className="block break-all font-mono text-xs" dir="ltr">
                          {row.actor_id ?? copy.system}
                        </span>
                        <span className="mt-1 block text-muted">{row.actor_role}</span>
                      </td>
                      <td className="p-3 font-semibold">{row.action}</td>
                      <td className="p-3">{row.target_type}</td>
                      <td className="p-3 font-mono text-xs" dir="ltr">
                        {row.target_id ?? '—'}
                      </td>
                      <td className="max-w-sm whitespace-pre-wrap break-all p-3 font-mono text-xs">
                        {JSON.stringify(row.metadata)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Panel>
              <p>{copy.empty}</p>
            </Panel>
          )}
          <nav
            aria-label={ar ? 'صفحات السجل' : 'Audit pages'}
            className="mt-5 flex flex-wrap gap-3"
          >
            <Link className={secondaryButtonClass} href={`/${locale}/admin/audit?${queryString}`}>
              {copy.first}
            </Link>
            {page.next_cursor && (
              <Link
                className={secondaryButtonClass}
                href={`/${locale}/admin/audit?${new URLSearchParams([...queryString.entries(), ['before_at', page.next_cursor.at], ['before_id', String(page.next_cursor.id)], ['snapshot_at', page.snapshot_at]])}`}
              >
                {copy.next}
              </Link>
            )}
          </nav>
        </>
      )}
    </>
  );
}
