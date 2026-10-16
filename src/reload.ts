import type { NodeData } from './types';

export const INTERRUPTED =
  'Interrupted: the page reloaded before fal confirmed the job (phones close background tabs). Tap Run again.';

/** What a node looks like after a reload: a queued fal job stays running so it can resume. */
export function afterReload(d: NodeData): NodeData {
  if (d.status !== 'running') return { ...d, log: undefined };
  if (d.pending) return { ...d, log: 'Reconnecting to fal' };
  return { ...d, status: 'error', error: INTERRUPTED, log: undefined };
}
