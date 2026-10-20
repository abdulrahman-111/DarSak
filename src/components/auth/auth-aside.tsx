import Image from 'next/image';
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
      <Image src="/brand/darsak/favicon.svg" alt="" aria-hidden="true" width={48} height={48} className="size-12 rounded-2xl ring-1 ring-cream/20" />
      <h2 className="display mt-6 text-2xl font-bold leading-tight text-cream">{copy.asideTitle}</h2>
      <div className="mt-8 space-y-6">
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
