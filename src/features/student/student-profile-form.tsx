'use client';

import { useActionState, useState } from 'react';
import { saveStudentLearningProfile } from './student-profile-actions';

type Values = { full_name: string; age_range: string; education_year: string; interests_text: string; learning_goal: string; school_name: string };
const control = 'mt-2 min-h-12 w-full rounded-xl border border-line-strong bg-white px-4 py-3 text-ink outline-none focus:border-teal focus:ring-2 focus:ring-teal/15';

export function StudentProfileForm({ locale, initial, updatedAt }: { locale: 'en' | 'ar'; initial: Values; updatedAt: string }) {
  const ar = locale === 'ar';
  const [state, action, pending] = useActionState(saveStudentLearningProfile.bind(null, locale), null);
  const [values, setValues] = useState(initial);
  const update = (key: keyof Values) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const value = event.currentTarget.value;
    setValues(current => ({ ...current, [key]: value }));
  };
  const errors = state?.fieldErrors ?? {};
  const labels = ar ? {
    name: 'الاسم الكامل', age: 'الفئة العمرية', ageHint: 'خاصة بك وبالمسؤولين المخولين، ولا تظهر في ملفك العام أو للمعلمين.', year: 'الصف أو السنة الدراسية', yearHint: 'اكتب صفك أو سنتك الجامعية، أو اختر متعلم مستقل.', interests: 'المواضيع التي تهمك', interestsHint: 'أدخل من ١ إلى ١٠ اهتمامات، وافصل بينها بفاصلة عربية أو إنجليزية أو بسطر جديد.', goal: 'ما الذي تريد تعلمه؟', goalHint: 'اكتب من ١٠ إلى ١٠٠٠ حرف. تبقى هذه المعلومة خاصة بك وبالمسؤولين المخولين.', school: 'اسم المدرسة أو الجامعة (اختياري)', schoolHint: 'تبقى هذه المعلومة خاصة بك وبالمسؤولين المخولين، ولا تظهر للمعلمين.', save: 'حفظ الملف ومتابعة التعلم', saving: 'جارٍ الحفظ…', formError: 'تعذر حفظ الملف. راجع الحقول وحدودها وحاول مرة أخرى.', ageOptions: ['اختر الفئة العمرية', 'أقل من ١٣ سنة', '١٣–١٥ سنة', '١٦–١٧ سنة', '١٨–٢٤ سنة', '٢٥ سنة فأكثر'], years: ['الصف السابع', 'الصف الثامن', 'الصف التاسع', 'الصف العاشر', 'الصف الحادي عشر', 'الصف الثاني عشر', 'متعلم مستقل'], required: 'تحقق من قيمة الحقل وحدوده.'
  } : {
    name: 'Full name', age: 'Age range', ageHint: 'Private to you and authorized administrators. It never appears on your public profile or to teachers.', year: 'School or university year', yearHint: 'Enter your year or choose Independent learner.', interests: 'Topics you are interested in', interestsHint: 'Enter 1 to 10 interests, separated by an English comma, Arabic comma, or new line.', goal: 'What would you like to learn?', goalHint: 'Write 10 to 1,000 characters. Private to you and authorized administrators; teachers cannot see it.', school: 'School or university name (optional)', schoolHint: 'Private to you and authorized administrators; never shown to teachers.', save: 'Save profile and continue', saving: 'Saving…', formError: 'We could not save your profile. Check the fields and their limits, then try again.', ageOptions: ['Choose an age range', 'Under 13', '13–15', '16–17', '18–24', '25 or older'], years: ['Year 7', 'Year 8', 'Year 9', 'Year 10', 'Year 11', 'Year 12', 'Independent learner'], required: 'Check the required value and this field’s limits.'
  };
  const fieldError = (field: string) => errors[field] ? <span className="mt-1 block text-sm font-normal text-red-700">{labels.required}</span> : null;
  return <form action={action} className="grid gap-5" aria-describedby={state?.error ? 'student-profile-error' : undefined}>
    <input type="hidden" name="expected_updated_at" value={updatedAt}/>
    {state?.error && <p id="student-profile-error" role="alert" className="rounded-xl bg-[#f3e1db] p-3 text-sm text-[#6e2414]">{state.error || labels.formError}</p>}
    <label className="block text-sm font-bold text-ink">{labels.name}
      <input className={control} name="full_name" autoComplete="name" required minLength={2} maxLength={100} value={values.full_name} onChange={update('full_name')} aria-invalid={!!errors.full_name}/>{fieldError('full_name')}
    </label>
    <label className="block text-sm font-bold text-ink">{labels.age}
      <select className={control} name="age_range" required value={values.age_range} onChange={update('age_range')} aria-invalid={!!errors.age_range}>
        <option value="">{labels.ageOptions[0]}</option>
        {(['under_13', '13_15', '16_17', '18_24', '25_plus'] as const).map((value, index) => <option key={value} value={value}>{labels.ageOptions[index + 1]}</option>)}
      </select>{fieldError('age_range')}<span className="mt-1 block text-xs font-normal text-muted">{labels.ageHint}</span>
    </label>
    <label className="block text-sm font-bold text-ink">{labels.year}
      <input className={control} name="education_year" list="student-education-years" required minLength={1} maxLength={100} value={values.education_year} onChange={update('education_year')} aria-invalid={!!errors.education_year}/>
      <datalist id="student-education-years">{labels.years.map(year => <option key={year} value={year}/>)}</datalist>{fieldError('education_year')}<span className="mt-1 block text-xs font-normal text-muted">{labels.yearHint}</span>
    </label>
    <label className="block text-sm font-bold text-ink">{labels.interests}
      <textarea className={control} name="interests" rows={3} required maxLength={1000} value={values.interests_text} onChange={update('interests_text')} aria-invalid={!!errors.interests}/>{fieldError('interests')}<span className="mt-1 block text-xs font-normal text-muted">{labels.interestsHint}</span>
    </label>
    <label className="block text-sm font-bold text-ink">{labels.goal}
      <textarea className={control} name="learning_goal" rows={4} required minLength={10} maxLength={1000} value={values.learning_goal} onChange={update('learning_goal')} aria-invalid={!!errors.learning_goal}/>{fieldError('learning_goal')}<span className="mt-1 block text-xs font-normal text-muted">{labels.goalHint}</span>
    </label>
    <label className="block text-sm font-bold text-ink">{labels.school}
      <input className={control} name="school_name" maxLength={160} value={values.school_name} onChange={update('school_name')} aria-invalid={!!errors.school_name}/>{fieldError('school_name')}<span className="mt-1 block text-xs font-normal text-muted">{labels.schoolHint}</span>
    </label>
    <button disabled={pending} type="submit" className="min-h-12 rounded-xl bg-orange px-5 py-3 font-bold text-white transition hover:bg-orange-deep disabled:cursor-wait disabled:opacity-60">{pending ? labels.saving : labels.save}</button>
  </form>;
}
