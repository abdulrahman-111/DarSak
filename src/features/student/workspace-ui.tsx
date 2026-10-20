import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';
export function StudentHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <header className="mb-6 flex min-w-0 flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && (
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">{eyebrow}</p>
        )}
        <h1 className="break-words text-2xl font-bold tracking-tight text-teal sm:text-3xl">
          {title}
        </h1>
        {description && (
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">{description}</p>
        )}
      </div>
      {action}
    </header>
  );
}
export function ClassMark({ name, size = 44 }: { name: string; size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0 items-center justify-center rounded-2xl border border-teal/10 bg-teal/5 font-bold text-teal"
      style={{ width: size, height: size }}
    >
      {name.trim().slice(0, 2).toLocaleUpperCase()}
    </span>
  );
}
export function StudentEmpty({
  title,
  description,
  href,
  label,
  icon = 'prepare-for-class',
}: {
  title: string;
  description: string;
  href?: string;
  label?: string;
  icon?: string;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-line bg-white p-7 text-center">
      <Image
        src={`/brand/darsak/${icon}.svg`}
        width={44}
        height={44}
        alt=""
        className="mx-auto mb-4 size-11"
      />
      <h2 className="font-bold text-teal">{title}</h2>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted">{description}</p>
      {href && label && (
        <Link
          href={href}
          className="mt-4 inline-flex min-h-11 items-center justify-center rounded-xl bg-teal px-4 text-sm font-bold text-white"
        >
          {label}
        </Link>
      )}
    </div>
  );
}
export const studentCard = 'min-w-0 rounded-2xl border border-line bg-white p-5 shadow-sm';
