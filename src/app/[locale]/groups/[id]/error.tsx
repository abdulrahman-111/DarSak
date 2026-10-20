'use client';

import { RouteError } from '@/components/route-feedback';

export default function Error({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return <RouteError area="group" retry={retry} />;
}
