import { TIMEZONE } from '../config.mjs';

const UA = 'pickleball-tracker (personal use; github.com/kklmwd/pickleball-tracker)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// GET with a polite delay between calls and one retry on 429/5xx.
let last = 0;
export async function get(url, { json = true, headers = {} } = {}) {
  for (let attempt = 0; ; attempt++) {
    const wait = last + 400 - Date.now();
    if (wait > 0) await sleep(wait);
    last = Date.now();
    const res = await fetch(url, {
      headers: { 'user-agent': UA, accept: json ? 'application/json' : 'text/html', ...headers },
      signal: AbortSignal.timeout(30000),
    });
    if ((res.status === 429 || res.status >= 500) && attempt < 1) {
      await sleep(3000);
      continue;
    }
    if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
    return json ? res.json() : res.text();
  }
}

// 'YYYY-MM-DD' for a Date, in Singapore time.
export function sgDate(date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE }).format(date);
}

// The next `n` Singapore calendar dates, starting today.
export function nextDays(n, now = new Date()) {
  return Array.from({ length: n }, (_, i) => sgDate(new Date(now.getTime() + i * 86400000)));
}

// Parses ISO strings, epoch seconds or epoch milliseconds. A string with no
// zone is taken as Singapore local time (UTC+8, no DST).
export function toDate(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'number' || /^\d{10,13}$/.test(value)) {
    const n = Number(value);
    const d = new Date(n < 1e12 ? n * 1000 : n);
    return d.getFullYear() > 2000 ? d : null;
  }
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(value)) return null;
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(value);
  const d = new Date(hasZone || value.length === 10 ? value : `${value.replace(' ', 'T')}+08:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

// '2026-10-25T19:00:00+08:00' style string in Singapore time.
export function sgIso(date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(date).map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}+08:00`;
}
