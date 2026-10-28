import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'DarSak',
    short_name: 'DarSak',
    start_url: '/ar',
    display: 'standalone',
    background_color: '#f6f0e4',
    theme_color: '#0e4a4b',
    icons: [
      { src: '/brand/darsak/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
    ],
  };
}
