import { fal } from '@fal-ai/client';

/** Run an endpoint through fal's queue and wait for the result. */
export async function runFal(
  endpoint: string,
  input: Record<string, unknown>,
  key: string,
  onLog: (msg: string) => void,
): Promise<unknown> {
  if (!key) throw new Error('Add your fal.ai key in Settings first.');
  fal.config({ credentials: key });
  const res = await fal.subscribe(endpoint, {
    input,
    logs: true,
    onQueueUpdate: (u) => {
      if (u.status === 'IN_QUEUE') onLog(`Queued${u.queue_position != null ? ` (#${u.queue_position})` : ''}`);
      else if (u.status === 'IN_PROGRESS') {
        const last = u.logs?.at(-1)?.message;
        onLog(last ? last.slice(0, 80) : 'Generating');
      }
    },
  });
  return res.data;
}

/** Upload a data/blob URL to fal storage and return a public URL. */
export async function uploadToFal(url: string, key: string): Promise<string> {
  if (!key) throw new Error('Add your fal.ai key in Settings first.');
  fal.config({ credentials: key });
  const blob = await (await fetch(url)).blob();
  return fal.storage.upload(blob);
}

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  try {
    return JSON.stringify(e).slice(0, 300);
  } catch {
    return 'Unknown error';
  }
}
