import type { SandakStatus } from './events';
import type { SandakMood } from './sprite';

/** Maps the real request lifecycle (plus idle/hidden sleep) to the pet's mood. */
export function deriveMood({
  status,
  doneFlash,
  sleeping,
}: {
  status: SandakStatus;
  doneFlash: boolean;
  sleeping: boolean;
}): SandakMood {
  if (doneFlash) return 'done';
  if (status === 'pending') return 'thinking';
  if (status === 'needs_input') return 'needs';
  if (status === 'error') return 'oops';
  return sleeping ? 'sleep' : 'idle';
}
