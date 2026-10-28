import type { ChangeEvent } from 'react';
import type { GroupLearningDetails } from './group-learning-domain';

export function GroupLearningFields({
  locale,
  details,
  errors = {},
  values,
  onValueChange,
}: {
  locale: string;
  details: GroupLearningDetails | null;
  errors?: Record<string, string>;
  values?: Pick<GroupLearningDetails, 'outcomes' | 'prerequisites'>;
  onValueChange?: (field: 'outcomes' | 'prerequisites', value: string) => void;
}) {
  const ar = locale === 'ar';
  const fields = [
    {
      name: 'outcomes',
      label: ar ? 'ما الذي سيتعلمه الطلاب؟' : 'What will students learn?',
      max: 2000,
      example: ar
        ? 'مثال: بناء برامج بسيطة وفهم الدوال وحل المشكلات.'
        : 'Example: Build simple programs, understand functions, and solve problems.',
    },
    {
      name: 'prerequisites',
      label: ar ? 'ما المعرفة المطلوبة للانضمام؟' : 'What should students know before joining?',
      max: 1500,
      example: ar
        ? 'مثال: لا يلزم خبرة سابقة، أو أساسيات البرمجة.'
        : 'Example: No prior experience, or basic programming knowledge.',
    },
    {
      name: 'fee_includes',
      label: ar ? 'ما الذي تتضمنه المجموعة؟' : 'What is included?',
      max: 1000,
      example: ar
        ? 'مثال: الحصص، أوراق تدريب ومراجعة الحلول.'
        : 'Example: Lessons, practice sheets, and feedback on exercises.',
    },
  ] as const;
  const modes = ar
    ? ['غير محددة', 'عن بُعد', 'حضوري', 'حضوري وعن بُعد']
    : ['Not specified', 'Online', 'In person', 'Hybrid'];
  const feeUnits = ar
    ? ['لكل حصة', 'شهريًا', 'لكل فصل دراسي', 'لكل دورة']
    : ['Per lesson', 'Per month', 'Per semester', 'Per course'];
  const errorCopy: Record<string, string> = ar
    ? {
        outcomes: 'اكتب ما سيتعلمه الطلاب في حدود 2000 حرف.',
        prerequisites: 'اكتب المتطلبات في حدود 1500 حرف.',
        delivery_mode: 'اختر طريقة تعلم صالحة أو اتركها دون تحديد.',
        fee_egp: 'أدخل رسوماً بين 0 و100000 جنيه مصري، وبحد أقصى منزلتين عشريتين.',
        fee_basis: 'أدخل وحدة الرسوم عند تحديد الرسوم، أو امسح قيمة الرسوم.',
        fee_includes: 'اكتب ما تتضمنه المجموعة في حدود 1000 حرف.',
      }
    : {
        outcomes: 'Describe what students will learn in 2,000 characters or fewer.',
        prerequisites: 'Describe prerequisites in 1,500 characters or fewer.',
        delivery_mode: 'Choose a valid learning format or leave it blank.',
        fee_egp: 'Enter a fee from EGP 0 to EGP 100,000, with up to two decimal places.',
        fee_basis: 'Choose a fee unit when you enter a fee, or clear the fee amount.',
        fee_includes: 'Describe what is included in 1,000 characters or fewer.',
      };
  const errorFor = (name: string) =>
    errors[name]
      ? (errorCopy[name] ??
        (ar ? 'راجع هذه القيمة وحاول مرة أخرى.' : 'Review this value and try again.'))
      : undefined;
  const invalid = (name: string) => ({
    'aria-invalid': !!errors[name],
    'aria-describedby': errors[name] ? `learning-${name}-error` : undefined,
  });
  return (
    <section className="grid gap-5" aria-labelledby="group-learning-heading">
      <div>
        <h2 id="group-learning-heading" className="text-xl font-black text-teal">
          {ar ? 'تفاصيل التعلم (اختيارية)' : 'Learning details (optional)'}
        </h2>
        <p className="mt-1 text-sm leading-6 text-muted">
          {ar
            ? 'ساعد الطلاب على فهم ما سيتعلمونه وما يحتاجون إليه قبل الانضمام.'
            : 'Help students understand what they will learn and what they need before joining.'}
        </p>
      </div>
      {fields.slice(0, 2).map(f => (
        <label key={f.name} className="grid gap-2 text-sm font-bold">
          {f.label}{' '}
          <span className="font-normal text-muted">
            {ar
              ? `اختياري • حتى ${f.max} حرف`
              : `Optional • up to ${f.max.toLocaleString()} characters`}
          </span>
          <textarea
            id={`learning-${f.name}`}
            name={f.name}
            {...(values && onValueChange && (f.name === 'outcomes' || f.name === 'prerequisites')
              ? {
                  value: values[f.name],
                  onChange: (event: ChangeEvent<HTMLTextAreaElement>) =>
                    onValueChange(f.name, event.target.value),
                }
              : { defaultValue: details?.[f.name] ?? '' })}
            rows={3}
            maxLength={f.max}
            dir="auto"
            placeholder={f.example}
            {...invalid(f.name)}
            className="w-full rounded-xl border border-line bg-cream p-3"
          />
          {errorFor(f.name) && (
            <span id={`learning-${f.name}-error`} className="font-normal text-danger">
              {errorFor(f.name)}
            </span>
          )}
        </label>
      ))}
      <section
        className="grid gap-4 border-t border-line pt-5"
        aria-labelledby="learning-format-heading"
      >
        <div>
          <h3 id="learning-format-heading" className="text-lg font-black text-teal">
            {ar ? 'طريقة التعلم والرسوم' : 'Format and fees'}
          </h3>
          <p className="mt-1 text-sm text-muted">
            {ar
              ? 'أدخل الرسوم اختيارياً. عند إدخال مبلغ، اختر وحدته أيضاً.'
              : 'Fees are optional. If you enter an amount, choose its unit too.'}
          </p>
        </div>
        <div>
          <label htmlFor="learning-delivery_mode" className="grid gap-2 text-sm font-bold">
            {ar ? 'طريقة التعلم' : 'Learning format'}{' '}
            <span className="font-normal text-muted">{ar ? 'اختياري' : 'Optional'}</span>
          </label>
          <select
            id="learning-delivery_mode"
            name="delivery_mode"
            defaultValue={details?.delivery_mode ?? ''}
            {...invalid('delivery_mode')}
            className="mt-2 min-h-11 w-full rounded-xl border border-line bg-cream p-3"
          >
            <option value="">{modes[0]}</option>
            <option value="online">{modes[1]}</option>
            <option value="in_person">{modes[2]}</option>
            <option value="hybrid">{modes[3]}</option>
          </select>
          {errorFor('delivery_mode') && (
            <p id="learning-delivery_mode-error" className="mt-1 text-sm text-danger">
              {errorFor('delivery_mode')}
            </p>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="learning-fee_egp" className="grid gap-2 text-sm font-bold">
              {ar ? 'رسوم المجموعة بالجنيه المصري' : 'Group fee in EGP'}{' '}
              <span className="font-normal text-muted">
                {ar ? 'اختياري • من 0 إلى 100000 جنيه' : 'Optional • EGP 0 to EGP 100,000'}
              </span>
            </label>
            <input
              id="learning-fee_egp"
              type="number"
              name="fee_egp"
              min="0"
              max="100000"
              step="0.01"
              defaultValue={details?.fee_egp ?? ''}
              {...invalid('fee_egp')}
              className="mt-2 min-h-11 w-full rounded-xl border border-line bg-cream p-3"
            />
            {errorFor('fee_egp') && (
              <p id="learning-fee_egp-error" className="mt-1 text-sm text-danger">
                {errorFor('fee_egp')}
              </p>
            )}
          </div>
          <div>
            <label htmlFor="learning-fee_basis" className="grid gap-2 text-sm font-bold">
              {ar ? 'وحدة الرسوم' : 'Fee unit'}{' '}
              <span className="font-normal text-muted">
                {ar ? 'مطلوبة عند إدخال الرسوم' : 'Required when you enter a fee'}
              </span>
            </label>
            <select
              id="learning-fee_basis"
              name="fee_basis"
              defaultValue={details?.fee_basis ?? ''}
              {...invalid('fee_basis')}
              className="mt-2 min-h-11 w-full rounded-xl border border-line bg-cream p-3"
            >
              <option value="">{modes[0]}</option>
              {(['lesson', 'month', 'semester', 'course'] as const).map((x, i) => (
                <option key={x} value={x}>
                  {feeUnits[i]}
                </option>
              ))}
            </select>
            {errorFor('fee_basis') && (
              <p id="learning-fee_basis-error" className="mt-1 text-sm text-danger">
                {errorFor('fee_basis')}
              </p>
            )}
          </div>
        </div>
      </section>
      <label className="grid gap-2 text-sm font-bold">
        {fields[2].label}{' '}
        <span className="font-normal text-muted">
          {ar ? 'اختياري • حتى 1,000 حرف' : 'Optional • up to 1,000 characters'}
        </span>
        <textarea
          id="learning-fee_includes"
          name="fee_includes"
          defaultValue={details?.fee_includes ?? ''}
          rows={2}
          maxLength={1000}
          placeholder={fields[2].example}
          {...invalid('fee_includes')}
          className="w-full rounded-xl border border-line bg-cream p-3"
        />
        {errorFor('fee_includes') && (
          <span id="learning-fee_includes-error" className="font-normal text-danger">
            {errorFor('fee_includes')}
          </span>
        )}
      </label>
    </section>
  );
}
