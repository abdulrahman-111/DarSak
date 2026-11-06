'use client';

import { useEffect, useState } from 'react';

export type MeetingJoinLesson = {
  id: string;
  starts_at: string;
  ends_at: string;
  status: string;
};

export function meetingJoinState(
  lesson: Pick<MeetingJoinLesson, 'starts_at' | 'ends_at' | 'status'>,
  meetingUrl: string | null,
  now: number,
): 'hidden' | 'before' | 'open' {
  if (!meetingUrl || lesson.status !== 'scheduled') return 'hidden';
  const startsAt = new Date(lesson.starts_at).getTime();
  const endsAt = new Date(lesson.ends_at).getTime();
  if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt) || endsAt <= startsAt) return 'hidden';
  if (now >= endsAt) return 'hidden';
  return now >= startsAt - 15 * 60_000 ? 'open' : 'before';
}

export function scheduleMeetingJoinBoundary(
  lesson: Pick<MeetingJoinLesson, 'starts_at' | 'ends_at'>,
  state: 'before' | 'open' | 'hidden',
  onBoundary: () => void,
  now = Date.now(),
) {
  if (state === 'hidden') return () => {};
  const boundary =
    state === 'before'
      ? new Date(lesson.starts_at).getTime() - 15 * 60_000
      : new Date(lesson.ends_at).getTime();
  const timer = setTimeout(onBoundary, Math.max(1, Math.min(boundary - now, 2_147_000_000)));
  return () => clearTimeout(timer);
}

export function MeetingJoin({
  locale,
  lesson,
  meetingUrl,
  initialNow,
}: {
  locale: string;
  lesson: MeetingJoinLesson;
  meetingUrl: string | null;
  initialNow: number;
}) {
  const [now, setNow] = useState(() => initialNow);
  const state = meetingJoinState(lesson, meetingUrl, now);
  const startsAt = new Date(lesson.starts_at).getTime();

  useEffect(() => {
    const browserState = meetingJoinState(
      {
        starts_at: lesson.starts_at,
        ends_at: lesson.ends_at,
        status: lesson.status,
      },
      meetingUrl,
      Date.now(),
    );
    if (browserState !== state) {
      const timer = setTimeout(() => setNow(Date.now()), 0);
      return () => clearTimeout(timer);
    }
    return scheduleMeetingJoinBoundary(
      { starts_at: lesson.starts_at, ends_at: lesson.ends_at },
      state,
      () => setNow(Date.now()),
    );
  }, [lesson.ends_at, lesson.starts_at, lesson.status, meetingUrl, now, state]);

  if (state === 'hidden') return null;
  if (state === 'before') {
    const startLabel = new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG' : 'en-GB', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Africa/Cairo',
    }).format(new Date(startsAt));
    return (
      <p className="mt-3 min-w-0 wrap-break-word text-sm text-muted [overflow-wrap:anywhere]">
        {locale === 'ar'
          ? `يفتح رابط الاجتماع قبل الحصة بـ ١٥ دقيقة. البداية ${startLabel} بتوقيت القاهرة.`
          : `The meeting link opens 15 minutes before the lesson. Starts ${startLabel} Cairo time.`}
      </p>
    );
  }

  const host = new URL(meetingUrl!).hostname;
  return (
    <a
      href={meetingUrl!}
      target="_blank"
      rel="noopener noreferrer"
      dir="ltr"
      className="mt-4 inline-flex min-h-11 max-w-full min-w-0 items-center justify-center rounded-xl bg-orange px-4 py-2 text-center font-bold text-white underline decoration-white/70 underline-offset-2 hover:bg-orange-deep [overflow-wrap:anywhere]"
    >
      <span className="min-w-0 break-all">
        {locale === 'ar' ? `انضم إلى الاجتماع · ${host}` : `Join meeting · ${host}`}
      </span>
    </a>
  );
}
