'use client';

import { useActionState } from 'react';
import Image from 'next/image';
import type { Locale } from '@/features/student/domain';
import type { TeacherProfileActionState } from './profile-actions';
import { removeTeacherCover, uploadTeacherCover } from './profile-cover-actions';

export function TeacherCoverEditor({ locale, coverUrl, hasCover }: { locale: Locale; coverUrl: string | null; hasCover: boolean }) {
  const ar = locale === 'ar';
  const [uploadState, uploadAction, uploadPending] = useActionState<TeacherProfileActionState, FormData>(uploadTeacherCover.bind(null, locale), null);
  const [removeState, removeAction, removePending] = useActionState<TeacherProfileActionState, FormData>(removeTeacherCover.bind(null, locale), null);
  return <section aria-labelledby="teacher-cover-heading" className="mb-6 border-b border-line pb-6">
    <h2 id="teacher-cover-heading" className="text-lg font-black text-teal">{ar ? 'صورة الغلاف' : 'Cover image'}</h2>
    <p className="mt-1 text-sm text-muted">{ar ? 'JPG أو PNG أو WebP، بحد أقصى ٢ ميجابايت.' : 'JPG, PNG, or WebP, up to 2 MB.'}</p>
    {coverUrl && <Image src={coverUrl} alt={ar ? 'صورة غلاف ملفك الشخصي' : 'Your profile cover image'} width={1200} height={400} unoptimized className="mt-4 aspect-[3/1] w-full rounded-2xl object-cover"/>}
    <form action={uploadAction} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
      <label className="min-w-0 flex-1 text-sm font-bold">
        <span className="sr-only">{ar ? 'اختر صورة الغلاف' : 'Choose a cover image'}</span>
        <input name="cover" type="file" accept="image/jpeg,image/png,image/webp" required aria-label={ar ? 'اختر صورة الغلاف' : 'Choose a cover image'} className="block w-full min-w-0 text-sm file:me-3 file:rounded-lg file:border-0 file:bg-cream file:px-3 file:py-2 file:font-bold file:text-teal"/>
      </label>
      <button type="submit" disabled={uploadPending || removePending} className="shrink-0 rounded-xl bg-teal px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{uploadPending ? (ar ? 'جارٍ الرفع…' : 'Uploading…') : (ar ? 'رفع صورة الغلاف' : 'Upload cover')}</button>
    </form>
    {uploadState?.error && <p role="alert" className="mt-3 text-sm text-red-700">{uploadState.error}</p>}
    {uploadState?.success && <p role="status" className="mt-3 text-sm font-bold text-teal">{uploadState.success}</p>}
    {hasCover && <form action={removeAction} className="mt-3">
      <button type="submit" disabled={removePending || uploadPending} className="rounded-lg border border-line px-3 py-2 text-sm font-bold text-muted disabled:opacity-50">{removePending ? (ar ? 'جارٍ الحذف…' : 'Removing…') : (ar ? 'إزالة صورة الغلاف' : 'Remove cover')}</button>
    </form>}
    {removeState?.error && <p role="alert" className="mt-2 text-sm text-red-700">{removeState.error}</p>}
    {removeState?.success && <p role="status" className="mt-2 text-sm font-bold text-teal">{removeState.success}</p>}
  </section>;
}
