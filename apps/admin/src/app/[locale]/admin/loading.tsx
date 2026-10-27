import { Panel } from '@/components/platform/ui';

export default function AdminLoading() {
  return (
    <Panel>
      <p role="status" className="text-sm text-muted">
        Loading administrator workspace…
      </p>
    </Panel>
  );
}
