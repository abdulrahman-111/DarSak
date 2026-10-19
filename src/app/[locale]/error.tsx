'use client';

import { RouteError } from '@/components/route-feedback';

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteError area="page" retry={reset} />;
}
