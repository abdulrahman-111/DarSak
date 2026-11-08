import { Panel } from '@/components/platform/ui';

export default function AuditLoading() {
  return (
    <div aria-label="Loading audit log" className="grid gap-4" role="status">
      <div className="h-24 animate-pulse rounded-2xl bg-line/50" />
      <Panel>
        <div className="h-6 w-48 animate-pulse rounded bg-line/50" />
        <div className="mt-4 h-48 animate-pulse rounded bg-line/50" />
      </Panel>
    </div>
  );
}
