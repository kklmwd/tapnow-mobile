// Reclub: no public API. reclub.co is a Nuxt site, so each club page ships its
// data as a Nuxt payload (/_payload.json, or a __NUXT_DATA__ script in the
// HTML). We revive that payload and pick out anything shaped like a meet.
// The field names below are guesses that cover the usual spellings; the raw
// payloads are saved on every run so they can be tightened later.
import { RECLUB, DAYS_AHEAD } from '../config.mjs';
import { matchArea } from './areas.mjs';
import { get, toDate, sgIso } from './util.mjs';

// Nuxt 3 payloads use devalue's flat format: an array where object values
// are indexes into the same array.
export function unflatten(flat) {
  if (!Array.isArray(flat)) return flat;
  const SPECIAL = { '-1': undefined, '-2': undefined, '-3': NaN, '-4': Infinity, '-5': -Infinity, '-6': -0 };
  const seen = new Map();
  const hydrate = (i) => {
    if (typeof i !== 'number') return i;
    if (i < 0) return SPECIAL[i];
    if (seen.has(i)) return seen.get(i);
    const v = flat[i];
    if (v === null || typeof v !== 'object') {
      seen.set(i, v);
      return v;
    }
    if (Array.isArray(v)) {
      if (typeof v[0] === 'string') {
        const [type, ...args] = v;
        switch (type) {
          case 'Date': { const d = new Date(args[0]); seen.set(i, d); return d; }
          case 'Set': { const s = new Set(); seen.set(i, s); args.forEach((a) => s.add(hydrate(a))); return s; }
          case 'Map': {
            const m = new Map(); seen.set(i, m);
            for (let k = 0; k < args.length; k += 2) m.set(hydrate(args[k]), hydrate(args[k + 1]));
            return m;
          }
          case 'null': { const o = Object.create(null); seen.set(i, o); for (let k = 0; k < args.length; k += 2) o[args[k]] = hydrate(args[k + 1]); return o; }
          case 'BigInt': return BigInt(args[0]);
          case 'RegExp': return new RegExp(args[0], args[1]);
          case 'EmptyRef': case 'EmptyShallowRef': return undefined;
          default: {
            // Nuxt wrappers: Reactive, ShallowReactive, Ref, ShallowRef, NuxtError, Island...
            const inner = hydrate(args[0]);
            seen.set(i, inner);
            return inner;
          }
        }
      }
      const arr = [];
      seen.set(i, arr);
      v.forEach((x) => arr.push(hydrate(x)));
      return arr;
    }
    const obj = {};
    seen.set(i, obj);
    for (const [k, x] of Object.entries(v)) obj[k] = hydrate(x);
    return obj;
  };
  return hydrate(0);
}

export function payloadFromHtml(html) {
  const m = html.match(/<script[^>]*id="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  return m ? JSON.parse(m[1]) : null;
}

const pick = (o, keys) => {
  for (const k of keys) if (o[k] != null && o[k] !== '') return o[k];
  return undefined;
};
const START_KEYS = ['startDatetime', 'start_datetime', 'startDateTime', 'startAt', 'start_at', 'startsAt', 'startTime', 'start_time', 'startDate', 'start_date', 'start', 'datetime', 'dateTime'];
const END_KEYS = ['endDatetime', 'end_datetime', 'endDateTime', 'endAt', 'end_at', 'endsAt', 'endTime', 'end_time', 'endDate', 'end_date', 'end'];
const CODE_KEYS = ['referenceCode', 'reference_code', 'shortCode', 'short_code', 'meetCode', 'code', 'slug'];
const TITLE_KEYS = ['name', 'title'];
const PLACE_KEYS = ['location', 'venue', 'place', 'court', 'facility', 'address'];
const CAP_KEYS = ['maxParticipants', 'max_participants', 'maxPlayers', 'max_players', 'capacity', 'participantLimit', 'limit', 'slots'];
const JOINED_KEYS = ['participantCount', 'participantsCount', 'participants_count', 'confirmedCount', 'confirmed_count', 'joinedCount', 'attendeeCount', 'goingCount'];
const PRICE_KEYS = ['price', 'fee', 'cost', 'priceAmount', 'price_amount', 'amount'];

function placeOf(o) {
  const p = pick(o, PLACE_KEYS);
  if (typeof p === 'string') return { name: p, address: '' };
  if (p && typeof p === 'object') {
    const name = pick(p, ['name', 'title', 'displayName', 'label']) ?? '';
    const address = pick(p, ['formattedAddress', 'formatted_address', 'address', 'fullAddress', 'street', 'description']) ?? '';
    const lat = Number(pick(p, ['lat', 'latitude']) ?? p.coordinates?.lat ?? p.geo?.lat);
    const lng = Number(pick(p, ['lng', 'lon', 'longitude']) ?? p.coordinates?.lng ?? p.geo?.lng);
    return {
      name: String(name), address: typeof address === 'string' ? address : '',
      lat: Number.isFinite(lat) ? lat : undefined, lng: Number.isFinite(lng) ? lng : undefined,
    };
  }
  return null;
}

function countOf(v) {
  if (Array.isArray(v)) return v.length;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function priceOf(o) {
  const p = pick(o, PRICE_KEYS);
  if (p == null) return null;
  if (typeof p === 'object') {
    const amt = pick(p, ['amount', 'value', 'price']);
    const cur = pick(p, ['currency', 'currencyCode']) ?? '';
    return amt == null ? null : `${amt} ${cur}`.trim();
  }
  const cur = pick(o, ['currency', 'currencyCode']);
  return cur ? `${p} ${cur}` : String(p);
}

// Walks a revived payload and returns every object that looks like a meet:
// it has a parseable start time and a title or short code.
export function findMeets(root) {
  const out = [];
  const visited = new Set();
  const walk = (node, depth) => {
    if (!node || typeof node !== 'object' || visited.has(node) || depth > 40) return;
    visited.add(node);
    if (Array.isArray(node)) {
      node.forEach((n) => walk(n, depth + 1));
      return;
    }
    if (node instanceof Map || node instanceof Set) {
      [...node.values()].forEach((n) => walk(n, depth + 1));
      return;
    }
    const start = toDate(pick(node, START_KEYS));
    const title = pick(node, TITLE_KEYS);
    const code = pick(node, CODE_KEYS);
    if (start && (typeof title === 'string' || typeof code === 'string')) {
      out.push(node);
    }
    Object.values(node).forEach((n) => walk(n, depth + 1));
  };
  walk(root, 0);
  return out;
}

export function meetRow(m, club, now = new Date()) {
  const start = toDate(pick(m, START_KEYS));
  if (!start) return null;
  const until = now.getTime() + DAYS_AHEAD * 86400000;
  if (start.getTime() < now.getTime() - 3600000 || start.getTime() > until) return null;
  const place = placeOf(m) ?? { name: '', address: '' };
  const title = String(pick(m, TITLE_KEYS) ?? 'Reclub meet');
  const area = matchArea({ text: `${place.name} ${place.address} ${title}`, lat: place.lat, lng: place.lng });
  if (!area) return null;
  const sport = String(pick(m, ['sport', 'sportName', 'sport_name', 'activity']) ?? '');
  if (sport && !/pickle/i.test(typeof m.sport === 'object' ? JSON.stringify(m.sport) : sport)) return null;
  const code = pick(m, CODE_KEYS);
  const capacity = countOf(pick(m, CAP_KEYS));
  const joined = countOf(pick(m, JOINED_KEYS) ?? m.participants ?? m.attendees);
  const end = toDate(pick(m, END_KEYS));
  return {
    source: 'reclub', kind: 'meet', area,
    venue: place.name || club, address: place.address,
    title, club,
    url: typeof code === 'string' && /^[A-Z0-9]{4,10}$/.test(code)
      ? `${RECLUB.base}/m/${code}`
      : `${RECLUB.base}/clubs/@${club}`,
    start: sgIso(start), end: end ? sgIso(end) : null,
    capacity, spots: capacity != null && joined != null ? Math.max(0, capacity - joined) : null,
    price: priceOf(m),
    id: `reclub:${code ?? `${club}:${start.toISOString()}:${title}`}`,
  };
}

async function clubPayload(slug, warn) {
  const page = `${RECLUB.base}/clubs/@${slug}`;
  try {
    return await get(`${page}/_payload.json`);
  } catch (e) {
    warn(`reclub ${slug}: _payload.json failed (${e.message}); trying the HTML page`);
  }
  const flat = payloadFromHtml(await get(page, { json: false }));
  if (!flat) throw new Error('no __NUXT_DATA__ in page');
  return flat;
}

export async function scrapeReclub({ log, warn, raw }) {
  const rows = [];
  let failed = 0;
  for (const club of RECLUB.clubs) {
    try {
      // Save the flat payload: the revived one can contain cycles.
      const flat = await clubPayload(club, warn);
      raw(`reclub-${club}`, flat);
      const meets = findMeets(unflatten(flat));
      const kept = meets.map((m) => meetRow(m, club)).filter(Boolean);
      log(`reclub: @${club} → ${meets.length} meet-like objects, ${kept.length} upcoming in area`);
      rows.push(...kept);
    } catch (e) {
      warn(`reclub @${club}: ${e.message}`);
      failed++;
    }
  }
  if (failed && failed === RECLUB.clubs.length) throw new Error('every club page failed');
  return { rows };
}
