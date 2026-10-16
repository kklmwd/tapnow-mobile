const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function dims(input: Record<string, unknown>): [number, number] {
  const a = String(input.aspect_ratio ?? '');
  const m = a.match(/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/);
  if (m) {
    const w = Number(m[1]);
    const h = Number(m[2]);
    return w >= h ? [768, Math.round((768 * h) / w)] : [Math.round((768 * w) / h), 768];
  }
  const s = String(input.image_size ?? '');
  if (s.startsWith('landscape')) return [768, 512];
  if (s.startsWith('portrait')) return [512, 768];
  return [640, 640];
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function svgImage(prompt: string, label: string, seed: number, input: Record<string, unknown>) {
  const [w, h] = dims(input);
  const hue = seed % 360;
  const words = (prompt || 'empty prompt').split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const word of words) {
    if ((cur + ' ' + word).trim().length > 26) {
      lines.push(cur.trim());
      cur = word;
    } else cur = `${cur} ${word}`;
  }
  if (cur.trim()) lines.push(cur.trim());
  const text = lines
    .slice(0, 5)
    .map((l, i) => `<text x="${w / 2}" y="${h / 2 + (i - 1) * 34}" text-anchor="middle" font-size="26" fill="#fff" font-family="sans-serif">${esc(l)}</text>`)
    .join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue},70%,45%)"/><stop offset="1" stop-color="hsl(${(hue + 70) % 360},75%,30%)"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#g)"/>${text}<text x="16" y="${h - 16}" font-size="18" fill="#ffffffb0" font-family="sans-serif">MOCK · ${esc(label)}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export async function runMock(
  kind: 'image' | 'video',
  label: string,
  input: Record<string, unknown>,
  onLog: (msg: string) => void,
): Promise<string[]> {
  onLog('Mock: queued');
  await sleep(250);
  if (typeof input.prompt !== 'string' || !input.prompt.trim()) throw new Error('Mock: prompt is empty');
  onLog('Mock: generating');
  if (kind === 'video') {
    await sleep(900);
    return [`${import.meta.env.BASE_URL}mock.mp4`];
  }
  await sleep(500);
  const n = Math.max(1, Math.min(4, Number(input.num_images ?? 1)));
  const base = hash(input.prompt + label);
  return Array.from({ length: n }, (_, i) => svgImage(input.prompt as string, label, base + i * 97, input));
}
