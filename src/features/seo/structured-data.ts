import { localePath, type SeoLocale } from './metadata';
import { siteUrl } from '@/lib/supabase/config';
import type { GroupSeo, TeacherSeo } from './public-entity-data';

export function teacherJsonLd(
  locale: SeoLocale,
  teacher: TeacherSeo,
  service?: { subject: string; description: string; average: number; count: number },
) {
  const url = `${siteUrl()}${localePath(locale, `/teachers/${teacher.id}`)}`;
  const personId = `${url}#teacher`;
  const person = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    '@id': personId,
    name: teacher.name,
    ...(teacher.headline ? { jobTitle: teacher.headline } : {}),
    ...(teacher.subjects.length ? { knowsAbout: teacher.subjects } : {}),
    url,
    mainEntityOfPage: url,
  };
  if (
    !service ||
    !service.subject.trim() ||
    !service.description.trim() ||
    !Number.isFinite(service.average) ||
    service.average < 1 ||
    service.average > 5 ||
    !Number.isSafeInteger(service.count) ||
    service.count < 3
  )
    return person;
  const displayedAverage = Number(service.average.toFixed(1));
  return {
    '@context': 'https://schema.org',
    '@graph': [
      person,
      {
        '@type': 'Service',
        '@id': `${url}#teaching-service`,
        name: locale === 'ar' ? `التعلّم مع ${teacher.name}` : `Teaching with ${teacher.name}`,
        description: `${service.subject.trim()}: ${service.description.trim()}`,
        serviceType: service.subject.trim(),
        provider: { '@id': personId },
        aggregateRating: {
          '@type': 'AggregateRating',
          ratingValue: displayedAverage,
          reviewCount: service.count,
          bestRating: 5,
          worstRating: 1,
        },
      },
    ],
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

const brandName: Record<SeoLocale, string> = { ar: 'درسك', en: 'DarSak' };

export function organizationJsonLd(locale: SeoLocale) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${siteUrl()}/#organization`,
    name: brandName[locale],
    url: siteUrl(),
    logo: `${siteUrl()}/brand/darsak/english-header-lockup.svg`,
  };
}

export function websiteJsonLd(locale: SeoLocale) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${siteUrl()}${localePath(locale)}/#website`,
    name: brandName[locale],
    url: `${siteUrl()}${localePath(locale)}`,
    inLanguage: locale,
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
