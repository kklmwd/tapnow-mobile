import { fal } from '@fal-ai/client';

const TIMEOUT_MS = 10 * 60 * 1000;

/** Run an endpoint through fal's queue and wait for the result. */
export async function runFal(
  endpoint: string,
  input: Record<string, unknown>,
  key: string,
  onLog: (msg: string) => void,
  onEnqueue?: (requestId: string) => void,
): Promise<unknown> {
  if (!key) throw new Error('Add your fal.ai key in Settings first.');
  fal.config({ credentials: key });
  onLog('Sending to fal');
  const run = fal.subscribe(endpoint, {
    input,
    logs: true,
    onEnqueue: (requestId) => {
      onLog('Queued at fal');
      onEnqueue?.(requestId);
    },
    onQueueUpdate: queueLogger(onLog),
  });
  return withTimeout(run.then((r) => r.data));
}

/**
 * Pick up a job that was queued before the page reloaded (phones often discard
 * background tabs) and wait for its result.
 */
export async function resumeFal(
  endpoint: string,
  requestId: string,
  key: string,
  onLog: (msg: string) => void,
): Promise<unknown> {
  if (!key) throw new Error('Add your fal.ai key in Settings first.');
  fal.config({ credentials: key });
  onLog('Resuming fal job');
  const run = fal.queue
    .subscribeToStatus(endpoint, { requestId, logs: true, onQueueUpdate: queueLogger(onLog) })
    .then(() => fal.queue.result(endpoint, { requestId }))
    .then((r) => r.data);
  return withTimeout(run);
}

function queueLogger(onLog: (msg: string) => void) {
  return (u: { status: string; queue_position?: number; logs?: { message: string }[] }) => {
    if (u.status === 'IN_QUEUE') onLog(`Queued${u.queue_position != null ? ` (#${u.queue_position})` : ''}`);
    else if (u.status === 'IN_PROGRESS') {
      const last = u.logs?.at(-1)?.message;
      onLog(last ? last.slice(0, 80) : 'Generating');
    }
  };
}

async function withTimeout<T>(run: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('Timed out after 10 minutes waiting for fal.')), TIMEOUT_MS);
  });
  try {
    return await Promise.race([run, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** Upload a data/blob URL to fal storage and return a public URL. */
export async function uploadToFal(url: string, key: string): Promise<string> {
  if (!key) throw new Error('Add your fal.ai key in Settings first.');
  fal.config({ credentials: key });
  const blob = await (await fetch(url)).blob();
  return fal.storage.upload(blob);
}

/**
 * Turn any thrown value into readable text. fal's errors keep the real reason in
 * `status` and `body.detail`, and `message` is often empty, so read all three.
 */
export function errorMessage(e: unknown): string {
  const err = (e ?? {}) as { message?: unknown; status?: unknown; body?: unknown; name?: unknown };
  const parts: string[] = [];
  if (typeof err.status === 'number') parts.push(`HTTP ${err.status}`);
  const body = err.body as { detail?: unknown; message?: unknown } | string | undefined;
  const detail = typeof body === 'string' ? body : (body?.detail ?? body?.message);
  if (typeof detail === 'string' && detail) parts.push(detail);
  else if (Array.isArray(detail)) {
    parts.push(
      detail
        .map((d) => (d && typeof d === 'object' && 'msg' in d ? String((d as { msg: unknown }).msg) : JSON.stringify(d)))
        .join('; '),
    );
  }
  if (typeof err.message === 'string' && err.message && !parts.some((p) => p.includes(err.message as string))) {
    parts.push(err.message);
  }
  if (parts.length === 0) {
    const name = typeof err.name === 'string' && err.name ? err.name : 'Error';
    return `${name}: fal returned no details. Check the key, your fal balance, and the endpoint name in Settings.`;
  }
  return parts.join(' - ').slice(0, 400);
}
