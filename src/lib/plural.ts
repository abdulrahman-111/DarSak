/**
 * Picks the grammatically correct phrase for a count.
 *
 * Arabic has six plural categories (zero, one, two, few, many, other), so a
 * single "N items" string reads wrongly for 1, 2 and 11+. `{n}` is replaced by
 * the count; categories that are not supplied fall back to `other`.
 */
export type PluralForms = Partial<Record<Intl.LDMLPluralRule, string>> & { other: string };

export function pluralize(locale: string, count: number, forms: PluralForms): string {
  const language = locale === 'ar' ? 'ar' : 'en';
  const category = new Intl.PluralRules(language).select(count);
  const template = forms[category] ?? forms.other;
  return template.replace('{n}', String(count));
}
