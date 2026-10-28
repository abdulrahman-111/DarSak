'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import type { Locale } from '@/features/student/domain';
import { summarizeSchedule } from '@/features/groups/schedule-summary';
import {
  deleteScheduleSlot,
  saveScheduleSlot,
  type ScheduleSlotActionState,
} from './setup-actions';
import { scheduleCopy, SlotFields, weekdayLabels } from './setup-forms';

export type GroupScheduleRow = {
  id: string;
  weekday: number;
  start_time: string;
  end_time: string;
  /** Preformatted next generated lesson in Cairo time, or null when none is scheduled. */
  next: string | null;
};

const tableCopy = (locale: Locale) =>
  locale === 'ar'
    ? {
        day: 'اليوم',
        time: 'الوقت',
        next: 'الحصة التالية',
        actions: 'إجراءات',
        edit: 'تعديل',
        cancel: 'إلغاء',
        addTime: 'إضافة موعد',
        none: 'لا توجد حصة قادمة',
        newTitle: 'موعد أسبوعي جديد',
        editing: 'تعديل موعد',
        summary: 'ملخص الجدول',
        saved: 'تم حفظ الجدول.',
        editOne: 'عدّل موعداً واحداً في كل مرة.',
      }
    : {
        day: 'Day',
        time: 'Time',
        next: 'Next lesson',
        actions: 'Actions',
        edit: 'Edit',
        cancel: 'Cancel',
        addTime: 'Add time',
        none: 'No upcoming lesson',
        newTitle: 'New weekly time',
        editing: 'Editing time',
        summary: 'Schedule summary',
        saved: 'Schedule saved.',
        editOne: 'Edit one time at a time.',
      };

const btn =
  'inline-flex min-h-11 items-center justify-center rounded-xl px-4 py-2 text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange disabled:cursor-wait disabled:opacity-50';

function PendingButton({
  idle,
  busy,
  className,
}: {
  idle: string;
  busy: string;
  className: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-disabled={pending} className={className}>
      {pending ? busy : idle}
    </button>
  );
}

function SlotEditor({
  locale,
  groupId,
  slot,
  closeHref,
  onSaved,
}: {
  locale: Locale;
  groupId: string;
  slot: GroupScheduleRow | null;
  closeHref: string;
  onSaved: (message: string) => void;
}) {
  const t = scheduleCopy(locale);
  const c = tableCopy(locale);
  const router = useRouter();
  const [weekday, setWeekday] = useState(slot?.weekday ?? 0);
  const [start, setStart] = useState(slot ? slot.start_time.slice(0, 5) : '18:00');
  const [end, setEnd] = useState(slot ? slot.end_time.slice(0, 5) : '19:00');
  const [state, action] = useActionState<ScheduleSlotActionState, FormData>(
    saveScheduleSlot.bind(null, locale),
    null,
  );
  const handled = useRef<unknown>(null);
  useEffect(() => {
    if (state?.success && handled.current !== state) {
      handled.current = state;
      onSaved(state.success);
      router.replace(closeHref, { scroll: false });
    }
  }, [state, onSaved, router, closeHref]);
  const prefix = slot?.id ?? 'new';
  return (
    <form
      action={action}
      onReset={event => event.preventDefault()}
      aria-labelledby={`slot-editor-${prefix}-title`}
      className="grid gap-3 rounded-2xl border border-teal/40 bg-cream p-4"
    >
      <h3 id={`slot-editor-${prefix}-title`} className="font-bold text-teal">
        {slot ? c.editing : c.newTitle}
      </h3>
      <input type="hidden" name="group_id" value={groupId} />
      {slot && <input type="hidden" name="slot_id" value={slot.id} />}
      <SlotFields
        idPrefix={prefix}
        locale={locale}
        weekday={weekday}
        start={start}
        end={end}
        onWeekday={setWeekday}
        onStart={setStart}
        onEnd={setEnd}
        invalid={state?.fieldErrors}
        autoFocus
      />
      {state?.error && (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <PendingButton idle={t.save} busy={t.saving} className={`${btn} bg-teal text-white`} />
        <Link href={closeHref} className={`${btn} border border-line bg-white text-teal`}>
          {c.cancel}
        </Link>
      </div>
    </form>
  );
}

export function GroupScheduleTable({
  locale,
  groupId,
  slots,
  editSlot,
  preserve,
  readOnly = false,
}: {
  locale: Locale;
  groupId: string;
  slots: GroupScheduleRow[];
  editSlot: string | null;
  /** Other search params (list pages) kept when opening or closing the editor. */
  preserve: Record<string, string>;
  readOnly?: boolean;
}) {
  const t = scheduleCopy(locale);
  const c = tableCopy(locale);
  const ar = locale === 'ar';
  const [notice, setNotice] = useState<{ text: string; id: number } | null>(null);
  const noticeRef = useRef<HTMLParagraphElement>(null);
  const [deleteState, deleteAction, deletePending] = useActionState<
    ScheduleSlotActionState,
    FormData
  >(deleteScheduleSlot.bind(null, locale), null);

  const hrefFor = (slotParam?: string) => {
    const params = new URLSearchParams(preserve);
    if (slotParam) params.set('editSlot', slotParam);
    const query = params.toString();
    return `/${locale}/teacher/groups/${groupId}${query ? `?${query}` : ''}#schedule`;
  };
  const closeHref = hrefFor();
  const editing = !readOnly ? editSlot : null;
  const editingNew = editing === 'new';
  const editingSlot = editing && !editingNew ? slots.find(slot => slot.id === editing) : undefined;

  useEffect(() => {
    if (notice) noticeRef.current?.focus();
  }, [notice]);

  const summary = summarizeSchedule(slots, locale);
  const day = (weekday: number) => weekdayLabels(locale)[weekday];
  const timeRange = (slot: GroupScheduleRow) => (
    <span dir="ltr" className="tabular-nums">
      {slot.start_time.slice(0, 5)} – {slot.end_time.slice(0, 5)}
    </span>
  );

  return (
    <div className="grid gap-4">
      {summary.lines.length > 0 && (
        <div aria-label={c.summary} role="group" className="rounded-xl bg-mint px-4 py-3 text-sm">
          {summary.lines.map(line => (
            <p key={line} className="font-bold text-teal">
              {line}
            </p>
          ))}
          <p className="mt-1 text-muted">{summary.countLabel}</p>
        </div>
      )}
      <p
        ref={noticeRef}
        tabIndex={-1}
        role="status"
        aria-live="polite"
        className={
          notice || deleteState?.success
            ? 'rounded-xl bg-success-soft p-3 text-sm text-teal'
            : 'sr-only'
        }
      >
        {notice?.text ?? deleteState?.success ?? ''}
      </p>
      {deleteState?.error && (
        <p role="alert" className="rounded-xl bg-danger-soft p-3 text-sm text-danger">
          {deleteState.error}
        </p>
      )}
      {slots.length ? (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-start text-sm">
            <caption className="sr-only">{`${t.title}. ${t.timezone}`}</caption>
            <thead>
              <tr className="border-b border-line text-start text-xs font-bold uppercase tracking-wide text-muted">
                <th scope="col" className="py-2 pe-3 text-start font-bold">
                  {c.day}
                </th>
                <th scope="col" className="py-2 pe-3 text-start font-bold">
                  {c.time}
                </th>
                <th scope="col" className="hidden py-2 pe-3 text-start font-bold md:table-cell">
                  {c.next}
                </th>
                {!readOnly && (
                  <th scope="col" className="py-2 text-end font-bold">
                    <span className="sr-only">{c.actions}</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {slots.map(slot =>
                editingSlot?.id === slot.id ? (
                  <tr key={slot.id} className="border-b border-line">
                    <td colSpan={readOnly ? 3 : 4} className="py-3">
                      <SlotEditor
                        locale={locale}
                        groupId={groupId}
                        slot={slot}
                        closeHref={closeHref}
                        onSaved={text => setNotice({ text, id: Date.now() })}
                      />
                    </td>
                  </tr>
                ) : (
                  <tr key={slot.id} className="border-b border-line align-middle">
                    <th scope="row" className="py-2 pe-3 text-start font-bold text-teal">
                      {day(slot.weekday)}
                      <span className="mt-0.5 block text-xs font-normal text-muted md:hidden">
                        {slot.next ?? c.none}
                      </span>
                    </th>
                    <td className="py-2 pe-3">{timeRange(slot)}</td>
                    <td className="hidden py-2 pe-3 text-muted md:table-cell">
                      {slot.next ?? c.none}
                    </td>
                    {!readOnly && (
                      <td className="py-2 text-end">
                        <div className="flex flex-wrap justify-end gap-1">
                          <Link
                            href={hrefFor(slot.id)}
                            aria-label={`${c.edit}: ${day(slot.weekday)} ${slot.start_time.slice(0, 5)}`}
                            className={`${btn} text-teal underline`}
                          >
                            {c.edit}
                          </Link>
                          <form action={deleteAction} onReset={event => event.preventDefault()}>
                            <input type="hidden" name="group_id" value={groupId} />
                            <input type="hidden" name="slot_id" value={slot.id} />
                            <RemoveButton
                              label={`${t.remove}: ${day(slot.weekday)} ${slot.start_time.slice(0, 5)}`}
                              idle={ar ? 'حذف' : 'Remove'}
                              busy={t.removing}
                              otherPending={deletePending}
                            />
                          </form>
                        </div>
                      </td>
                    )}
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="rounded-xl bg-cream p-4 text-sm text-muted">{t.empty}</p>
      )}
      {editing && !editingNew && !editingSlot && (
        <p role="alert" className="rounded-xl bg-danger-soft p-3 text-sm text-danger">
          {ar ? 'لم يعد هذا الموعد موجوداً.' : 'That time no longer exists.'}
        </p>
      )}
      {!readOnly &&
        (editingNew ? (
          <SlotEditor
            locale={locale}
            groupId={groupId}
            slot={null}
            closeHref={closeHref}
            onSaved={text => setNotice({ text, id: Date.now() })}
          />
        ) : (
          <div>
            <Link href={hrefFor('new')} className={`${btn} border border-teal text-teal`}>
              + {c.addTime}
            </Link>
            {editingSlot && <p className="mt-2 text-xs text-muted">{c.editOne}</p>}
          </div>
        ))}
    </div>
  );
}

function RemoveButton({
  label,
  idle,
  busy,
  otherPending,
}: {
  label: string;
  idle: string;
  busy: string;
  otherPending: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      aria-label={label}
      disabled={pending || otherPending}
      className={`${btn} text-danger`}
    >
      {pending ? busy : idle}
    </button>
  );
}
