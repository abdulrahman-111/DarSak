import { Panel } from '@/components/platform/ui';

export default function AnalyticsLoading() {
  return (
    <div aria-label="Loading analytics" className="grid gap-4 sm:grid-cols-2" role="status">
      {Array.from({ length: 6 }, (_, index) => (
        <Panel key={index}>
          <div className="h-6 w-40 animate-pulse rounded bg-line/50" />
          <div className="mt-4 h-36 animate-pulse rounded bg-line/50" />
        </Panel>
      ))}
    </div>
  );
}
