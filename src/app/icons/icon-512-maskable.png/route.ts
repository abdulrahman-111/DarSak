import { renderPwaIcon } from '@/features/pwa/icon';

export const runtime = 'nodejs';
export const dynamic = 'force-static';

export function GET() {
  return renderPwaIcon(512, true);
}
