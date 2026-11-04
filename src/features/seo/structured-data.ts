import { localePath, type SeoLocale } from './metadata';
import { siteUrl } from '@/lib/supabase/config';
import type { GroupSeo, TeacherSeo } from './public-entity-data';

export function teacherJsonLd(locale: SeoLocale, teacher: TeacherSeo) {
  const url = `${siteUrl()}${localePath(locale, `/teachers/${teacher.id}`)}`;
  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: teacher.name,
    ...(teacher.headline ? { jobTitle: teacher.headline } : {}),
    ...(teacher.subjects.length ? { knowsAbout: teacher.subjects } : {}),
    url,
    mainEntityOfPage: url,
  };
}

export function groupJsonLd(locale: SeoLocale, group: GroupSeo) {
  const url = `${siteUrl()}${localePath(locale, `/groups/${group.id}`)}`;
  return {
    '@context': 'https://schema.org',
    '@type': 'Course',
    name: group.name,
    ...(group.description ? { description: group.description } : {}),
    about: { '@type': 'Thing', name: group.subject },
    url,
    provider: {
      '@type': 'Person',
      name: group.teacher.name,
      url: `${siteUrl()}${localePath(locale, `/teachers/${group.teacher.id}`)}`,
    },
  };
}

/** Safe for a JSON-LD script text node, including script-breaking and JS separators. */
export function safeJsonLd(value: unknown) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}
