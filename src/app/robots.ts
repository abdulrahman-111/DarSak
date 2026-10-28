import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/supabase/config';

const privatePaths = [
  '/*/student',
  '/*/teacher',
  '/*/account',
  '/*/notifications',
  '/*/reports',
  '/*/dashboard',
  '/api/',
];

export default function robots(): MetadataRoute.Robots {
  const origin = siteUrl();
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: privatePaths }],
    sitemap: `${origin}/sitemap.xml`,
    host: origin,
  };
}
