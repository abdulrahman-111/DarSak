import { ensureLocale } from '@/i18n/config';
import { EmptyState, Panel, ScreenTitle } from '@/components/platform/ui';
import { catalogueDisplayName } from '@/features/teacher/catalogue-domain';
import { CatalogueArchiveButton, CatalogueLabelEditor } from '@/features/teacher/catalogue-forms';
import { teacherCatalogue } from '@/features/teacher/catalogue-data';
import { requireViewer } from '@/components/platform/access';

export default async function TeacherCataloguePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  const locale = ensureLocale(raw);
  const ar = locale === 'ar';
  await requireViewer(locale, 'teacher');
  const data = await teacherCatalogue(locale);
  const copy = ar
    ? {
        eyebrow: 'مساحة المعلم',
        title: 'المواد والفئات',
        description: 'أنشئ أسماء المواد والسنوات أو فئات الطلاب التي تحتاجها لمجموعاتك.',
        subjects: 'المواد',
        categories: 'السنوات / فئات الطلاب',
        createSubject: 'إضافة مادة',
        createCategory: 'إضافة سنة أو فئة',
        emptySubjects: 'لم تضف مواد بعد.',
        emptyCategories: 'لم تضف سنوات أو فئات طلاب بعد.',
        load: 'تعذر تحميل الدليل التعليمي. حدّث الصفحة وحاول مرة أخرى.',
        active: 'نشطة',
        archived: 'مؤرشفة',
        help: 'تغيير الاسم ينعكس في كل مكان يستخدمه. الأرشفة تخفي العنصر من الخيارات الجديدة وتحتفظ بالمجموعات والسجل الحاليين.',
      }
    : {
        eyebrow: 'Teacher workspace',
        title: 'Subjects & categories',
        description:
          'Create the subject names and years or student categories you need for your groups.',
        subjects: 'Subjects',
        categories: 'Years / student categories',
        createSubject: 'Add a subject',
        createCategory: 'Add a year or category',
        emptySubjects: 'You have not added any subjects yet.',
        emptyCategories: 'You have not added any years or student categories yet.',
        load: 'Could not load your catalogue. Refresh and try again.',
        active: 'Active',
        archived: 'Archived',
        help: 'Renaming changes the label wherever it is used. Archiving hides it from new choices while keeping existing groups and history.',
      };
  const categories = [...data.categories].sort((a, b) =>
    catalogueDisplayName(a, locale).localeCompare(
      catalogueDisplayName(b, locale),
      ar ? 'ar' : 'en',
    ),
  );
  const subjects = [...data.subjects].sort((a, b) =>
    catalogueDisplayName(a, locale).localeCompare(
      catalogueDisplayName(b, locale),
      ar ? 'ar' : 'en',
    ),
  );

  return (
    <>
      <ScreenTitle eyebrow={copy.eyebrow} title={copy.title} description={copy.description} />
      {data.error ? (
        <Panel>
          <p role="alert" className="text-sm text-red-800">
            {copy.load}
          </p>
        </Panel>
      ) : (
        <div className="grid gap-6">
          <Panel>
            <h2 className="mb-2 text-xl font-black text-teal">
              {copy.subjects} <span className="text-base text-muted">({subjects.length})</span>
            </h2>
            <p className="mb-5 text-sm text-muted">{copy.help}</p>
            <div className="grid gap-5 lg:grid-cols-[minmax(260px,360px)_1fr]">
              <div className="rounded-2xl bg-cream p-4">
                <h3 className="mb-4 font-bold text-teal">{copy.createSubject}</h3>
                <CatalogueLabelEditor locale={locale} kind="subject" />
              </div>
              <div className="grid content-start gap-3">
                {subjects.length ? (
                  subjects.map(subject => (
                    <article key={subject.id} className="rounded-2xl border border-line p-4">
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <h3 className="font-bold text-teal">
                          {catalogueDisplayName(subject, locale)}
                        </h3>
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-bold ${subject.archived_at ? 'bg-orange/10 text-orange' : 'bg-green-100 text-green-800'}`}
                        >
                          {subject.archived_at ? copy.archived : copy.active}
                        </span>
                      </div>
                      <CatalogueLabelEditor locale={locale} kind="subject" row={subject} />
                      <CatalogueArchiveButton
                        locale={locale}
                        kind="subject"
                        id={subject.id}
                        archived={!!subject.archived_at}
                      />
                    </article>
                  ))
                ) : (
                  <EmptyState>{copy.emptySubjects}</EmptyState>
                )}
              </div>
            </div>
          </Panel>
          <Panel>
            <h2 className="mb-2 text-xl font-black text-teal">
              {copy.categories} <span className="text-base text-muted">({categories.length})</span>
            </h2>
            <p className="mb-5 text-sm text-muted">{copy.help}</p>
            <div className="grid gap-5 lg:grid-cols-[minmax(260px,360px)_1fr]">
              <div className="rounded-2xl bg-cream p-4">
                <h3 className="mb-4 font-bold text-teal">{copy.createCategory}</h3>
                <CatalogueLabelEditor locale={locale} kind="category" />
              </div>
              <div className="grid content-start gap-3">
                {categories.length ? (
                  categories.map(category => (
                    <article key={category.id} className="rounded-2xl border border-line p-4">
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <h3 className="font-bold text-teal">
                          {catalogueDisplayName(category, locale)}
                        </h3>
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-bold ${category.archived_at ? 'bg-orange/10 text-orange' : 'bg-green-100 text-green-800'}`}
                        >
                          {category.archived_at ? copy.archived : copy.active}
                        </span>
                      </div>
                      <CatalogueLabelEditor locale={locale} kind="category" row={category} />
                      <CatalogueArchiveButton
                        locale={locale}
                        kind="category"
                        id={category.id}
                        archived={!!category.archived_at}
                      />
                    </article>
                  ))
                ) : (
                  <EmptyState>{copy.emptyCategories}</EmptyState>
                )}
              </div>
            </div>
          </Panel>
        </div>
      )}
    </>
  );
}
