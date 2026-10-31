import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/supabase/config';

const privatePaths = [
  '/*/student',
  '/ar/teacher$',
  '/ar/teacher/',
  '/en/teacher$',
  '/en/teacher/',
  '/*/account',
  '/*/notifications',
  '/*/reports',
  '/*/dashboard',
  '/api/',
];

export default function robots(): MetadataRoute.Robots {
  const origin = siteUrl();
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/ar/account/setup$', '/en/account/setup$'],
        disallow: privatePaths,
      },
    ],
    sitemap: `${origin}/sitemap.xml`,
    host: origin,
  };
}
