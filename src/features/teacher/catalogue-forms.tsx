'use client';

import { useActionState, useEffect, useState } from 'react';
import type { Locale } from '@/features/student/domain';
import {
  saveTeacherCatalogueCategory,
  saveTeacherCatalogueSubject,
  setTeacherCatalogueArchived,
  type TeacherCatalogueActionState,
} from './catalogue-actions';
import type { TeacherCatalogueCategory, TeacherCatalogueSubject } from './catalogue-data';
import type { TeacherCategoryKind } from './catalogue-domain';

const copy = (locale: Locale) =>
  locale === 'ar'
    ? {
        nameAr: 'الاسم بالعربية',
        nameEn: 'الاسم بالإنجليزية',
        type: 'نوع الفئة',
        year: 'سنة دراسية مخصصة',
        student: 'فئة طلاب',
        create: 'إضافة',
        save: 'حفظ التغييرات',
        saving: 'جارٍ الحفظ…',
        subject: 'المادة',
        category: 'الفئة',
        archive: 'أرشفة',
        restore: 'استعادة',
        working: 'جارٍ التحديث…',
        archived: 'مؤرشفة',
        active: 'نشطة',
      }
    : {
        nameAr: 'Arabic name',
        nameEn: 'English name',
        type: 'Category type',
        year: 'Custom year',
        student: 'Student category',
        create: 'Add',
        save: 'Save changes',
        saving: 'Saving…',
        subject: 'Subject',
        category: 'Category',
        archive: 'Archive',
        restore: 'Restore',
        working: 'Updating…',
        archived: 'Archived',
        active: 'Active',
      };

export function CatalogueLabelEditor({
  locale,
  kind,
  row,
  onSaved,
}: {
  locale: Locale;
  kind: 'subject' | 'category';
  row?: TeacherCatalogueSubject | TeacherCatalogueCategory;
  onSaved?: (row: TeacherCatalogueSubject | TeacherCatalogueCategory) => void;
}) {
  const t = copy(locale);
  const categoryRow =
    kind === 'category' ? (row as TeacherCatalogueCategory | undefined) : undefined;
  const [values, setValues] = useState({
    name_ar: row?.name_ar ?? '',
    name_en: row?.name_en ?? '',
    categoryKind: categoryRow?.kind ?? 'custom_year',
  });
  const actionFn = kind === 'subject' ? saveTeacherCatalogueSubject : saveTeacherCatalogueCategory;
  const [state, action, pending] = useActionState<TeacherCatalogueActionState, FormData>(
    actionFn.bind(null, locale),
    null,
  );

  useEffect(() => {
    if (state?.row) onSaved?.(state.row);
  }, [onSaved, state?.row]);

  const fieldError = (name: string) => state?.fieldErrors?.[name];
  const labelField = (name: 'name_ar' | 'name_en', label: string) => (
    <div>
      <label
        htmlFor={`catalogue-${row?.id ?? 'new'}-${kind}-${name}`}
        className="block text-sm font-bold"
      >
        {label}
      </label>
      <input
        id={`catalogue-${row?.id ?? 'new'}-${kind}-${name}`}
        name={name}
        value={values[name]}
        onChange={event => setValues(current => ({ ...current, [name]: event.target.value }))}
        maxLength={120}
        dir="auto"
        aria-invalid={!!fieldError(name)}
        aria-describedby={
          fieldError(name) ? `catalogue-${row?.id ?? 'new'}-${kind}-${name}-error` : undefined
        }
        className="mt-2 block w-full rounded-xl border border-line bg-cream p-3"
      />
      {fieldError(name) && (
        <p
          id={`catalogue-${row?.id ?? 'new'}-${kind}-${name}-error`}
          className="mt-1 text-sm text-danger"
        >
          {locale === 'ar'
            ? 'أدخل اسماً لا يتجاوز ١٢٠ حرفاً في لغة واحدة على الأقل.'
            : 'Enter a name up to 120 characters in at least one language.'}
        </p>
      )}
    </div>
  );

  return (
    <form action={action} onReset={event => event.preventDefault()} className="grid gap-4">
      {row && <input type="hidden" name="id" value={row.id} />}
      {kind === 'category' && (
        <>
          {categoryRow ? (
            <p className="rounded-xl bg-cream p-3 text-sm">
              <span className="font-bold">{t.type}: </span>
              {categoryRow.kind === 'custom_year' ? t.year : t.student}
            </p>
          ) : (
            <div>
              <label htmlFor="catalogue-new-category-kind" className="block text-sm font-bold">
                {t.type}
              </label>
              <select
                id="catalogue-new-category-kind"
                name="kind"
                value={values.categoryKind}
                onChange={event =>
                  setValues(current => ({
                    ...current,
                    categoryKind: event.target.value as TeacherCategoryKind,
                  }))
                }
                className="mt-2 block w-full rounded-xl border border-line bg-cream p-3"
              >
                <option value="custom_year">{t.year}</option>
                <option value="student_category">{t.student}</option>
              </select>
            </div>
          )}
          {categoryRow && <input type="hidden" name="kind" value={categoryRow.kind} />}
        </>
      )}
      {labelField('name_ar', t.nameAr)}
      {labelField('name_en', t.nameEn)}
      {state?.error && (
        <p role="alert" className="rounded-xl bg-danger-soft p-3 text-sm text-danger">
          {state.error}
        </p>
      )}
      {state?.success && (
        <p role="status" className="rounded-xl bg-teal/10 p-3 text-sm text-teal">
          {state.success}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-teal px-4 py-3 font-bold text-white disabled:cursor-wait disabled:opacity-50 sm:w-auto sm:justify-self-start"
      >
        {pending ? t.saving : row ? t.save : t.create}
      </button>
    </form>
  );
}

export function CatalogueArchiveButton({
  locale,
  kind,
  id,
  archived,
}: {
  locale: Locale;
  kind: 'subject' | 'category';
  id: string;
  archived: boolean;
}) {
  const t = copy(locale);
  const [state, action, pending] = useActionState<TeacherCatalogueActionState, FormData>(
    setTeacherCatalogueArchived.bind(null, locale),
    null,
  );
  return (
    <form action={action} className="mt-3 flex flex-wrap items-center gap-3">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="archived" value={String(!archived)} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-xl border border-line px-4 py-2 text-sm font-bold text-teal disabled:opacity-50"
      >
        {pending ? t.working : archived ? t.restore : t.archive}
      </button>
      {state?.error && (
        <span role="alert" className="text-sm text-danger">
          {state.error}
        </span>
      )}
      {state?.success && (
        <span role="status" className="text-sm text-teal">
          {state.success}
        </span>
      )}
    </form>
  );
}
