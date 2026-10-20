'use client';

import Image from 'next/image';
import type { Locale } from '@/features/student/domain';

export function TeacherCoverEditor({
  locale,
  coverUrl,
  hasCover,
}: {
  locale: Locale;
  coverUrl: string | null;
  hasCover: boolean;
}) {
  const ar = locale === 'ar';
  return (
    <section aria-labelledby="teacher-cover-heading" className="mb-6 border-b border-line pb-6">
      <h2 id="teacher-cover-heading" className="text-lg font-black text-teal">
        {ar ? 'صورة الغلاف' : 'Cover image'}
      </h2>
      <p className="mt-1 text-sm text-muted">
        {ar ? 'رفع صور الغلاف غير متاح حالياً.' : 'Cover uploads are unavailable at launch.'}
      </p>
      {coverUrl && (
        <Image
          src={coverUrl}
          alt={ar ? 'صورة غلاف ملفك الشخصي' : 'Your profile cover image'}
          width={1200}
          height={400}
          unoptimized
          className="mt-4 aspect-[3/1] w-full rounded-2xl object-cover"
        />
      )}
      {hasCover && (
        <p className="mt-2 text-sm text-muted">
          {ar ? 'تُعرض صورة الغلاف المحفوظة.' : 'Your saved cover remains visible.'}
        </p>
      )}
    </section>
  );
}
