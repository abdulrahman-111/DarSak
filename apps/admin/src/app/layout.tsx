import type { Metadata } from 'next';
import { fontVariables } from './fonts';

export const metadata: Metadata = {
  title: 'DarSak Admin',
  description: 'DarSak administrator portal',
  icons: { icon: '/brand/darsak/favicon.svg' },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html>
      <body className={fontVariables}>{children}</body>
    </html>
  );
}
