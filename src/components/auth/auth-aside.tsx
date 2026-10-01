import { CalendarDays, Clock3, ShieldCheck } from 'lucide-react';
import { authCopy, type AuthLocale } from './copy';

export function AuthAside({ locale }: { locale: AuthLocale }) {
  const copy = authCopy[locale];
  const benefits = [
    [CalendarDays, copy.benefitOne],
    [ShieldCheck, copy.benefitTwo],
    [Clock3, copy.benefitThree],
  ] as const;

  return (
    <aside className="rounded-[1.4rem] bg-teal p-7 text-cream md:p-9">
      <div className="grid size-12 place-items-center rounded-2xl bg-cream text-2xl font-black text-teal">{locale === 'ar' ? 'د' : 'D'}</div>
      <div className="mt-10 space-y-6">
        {benefits.map(([Icon, text]) => (
          <div key={text} className="flex gap-3 border-t border-[#3d6f6f] pt-5">
            <Icon className="mt-0.5 flex-none text-[#8fd1b5]" size={20}/>
            <p className="leading-6 text-[#d8e9e5]">{text}</p>
          </div>
        ))}
      </div>
    </aside>
  );
}
