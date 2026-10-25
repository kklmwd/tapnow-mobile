// Playtomic: the same public JSON endpoints the playtomic.com web app reads
// (no login). Court availability per club, plus open matches looking for
// players.
import { PLAYTOMIC, DAYS_AHEAD } from '../config.mjs';
import { matchArea } from './areas.mjs';
import { get, nextDays, toDate, sgIso } from './util.mjs';

const qs = (o) => new URLSearchParams(o).toString();

export function tenantVenue(t) {
  const a = t.address ?? {};
  const address = [a.street, a.postal_code, a.city].filter(Boolean).join(', ');
  const lat = Number(a.coordinate?.lat);
  const lng = Number(a.coordinate?.lon ?? a.coordinate?.lng);
  return {
    id: t.tenant_id,
    name: t.tenant_name ?? t.name ?? 'Unknown club',
    address,
    lat: Number.isFinite(lat) ? lat : undefined,
    lng: Number.isFinite(lng) ? lng : undefined,
    url: `https://playtomic.com/clubs/${t.slug ?? t.tenant_uid ?? t.tenant_id}`,
  };
}

function offersPickleball(t, sportId) {
  const resources = t.resources;
  if (!Array.isArray(resources) || resources.length === 0) return true; // can't tell; keep
  return resources.some((r) => String(r.sport_id).toUpperCase() === sportId);
}

export async function fetchTenants(log) {
  const { base, sportId, coordinate, radiusMeters } = PLAYTOMIC;
  const size = 100;
  const all = [];
  for (let page = 0; page < 10; page++) {
    const url = `${base}/tenants?${qs({
      sport_id: sportId,
      coordinate: `${coordinate.lat},${coordinate.lng}`,
      radius: radiusMeters,
      size,
      page,
    })}`;
    const batch = await get(url);
    if (!Array.isArray(batch)) throw new Error(`tenants: expected an array, got ${typeof batch}`);
    all.push(...batch);
    if (batch.length < size) break;
  }
  log(`playtomic: ${all.length} clubs near Singapore`);
  return all.filter((t) => offersPickleball(t, sportId));
}

// Turns one availability response into one row per club/day/start time,
// counting how many courts are free then.
export function courtRows(venue, area, availability, sportId = PLAYTOMIC.sportId) {
  const byStart = new Map();
  for (const res of availability ?? []) {
    for (const slot of res.slots ?? []) {
      const start = toDate(`${res.start_date}T${slot.start_time}`);
      if (!start) continue;
      const key = start.toISOString();
      const row = byStart.get(key) ?? {
        source: 'playtomic', kind: 'court', area, venue: venue.name, address: venue.address,
        url: venue.url, start: sgIso(start), courts: new Set(), durations: new Set(), prices: new Set(),
        sport: sportId,
      };
      row.courts.add(res.resource_id);
      if (slot.duration) row.durations.add(Number(slot.duration));
      if (slot.price) row.prices.add(String(slot.price));
      byStart.set(key, row);
    }
  }
  return [...byStart.values()].map(({ courts, durations, prices, ...row }) => ({
    ...row,
    title: `${courts.size} court${courts.size === 1 ? '' : 's'} free`,
    courtsFree: courts.size,
    durations: [...durations].sort((a, b) => a - b),
    price: [...prices].sort()[0] ?? null,
    id: `playtomic:${venue.id}:${row.start}`,
  }));
}

// Open matches: a match with fewer players than places.
export function matchRows(venue, area, matches) {
  const rows = [];
  for (const m of matches ?? []) {
    const start = toDate(m.start_date);
    if (!start) continue;
    const teams = Array.isArray(m.teams) ? m.teams : [];
    const places = teams.reduce((n, t) => n + (Number(t.max_players) || 0), 0);
    const players = teams.reduce((n, t) => n + (Array.isArray(t.players) ? t.players.length : 0), 0);
    const spots = places ? places - players : null;
    if (spots !== null && spots <= 0) continue;
    const level = m.min_level != null && m.max_level != null ? ` · level ${m.min_level}–${m.max_level}` : '';
    rows.push({
      source: 'playtomic', kind: 'match', area, venue: venue.name, address: venue.address,
      url: m.match_id ? `https://app.playtomic.io/matches/${m.match_id}` : venue.url,
      start: sgIso(start), end: toDate(m.end_date) ? sgIso(toDate(m.end_date)) : null,
      title: `Open match${level}`,
      spots, capacity: places || null,
      price: m.price ?? m.price_per_player ?? null,
      id: `playtomic-match:${m.match_id ?? `${venue.id}:${start.toISOString()}`}`,
    });
  }
  return rows;
}

export async function scrapePlaytomic({ log, warn, raw }) {
  const { base, sportId } = PLAYTOMIC;
  const tenants = await fetchTenants(log);
  raw('playtomic-tenants', tenants);
  const rows = [];
  const venues = [];
  for (const t of tenants) {
    const venue = tenantVenue(t);
    const area = matchArea({ text: `${venue.name} ${venue.address}`, lat: venue.lat, lng: venue.lng });
    if (!area) continue;
    venues.push({ ...venue, area, source: 'playtomic' });
    log(`playtomic: ${venue.name} → ${area}`);
    for (const day of nextDays(DAYS_AHEAD)) {
      try {
        const availability = await get(`${base}/availability?${qs({
          sport_id: sportId, tenant_id: venue.id,
          local_start_min: `${day}T00:00:00`, local_start_max: `${day}T23:59:59`,
        })}`);
        raw(`playtomic-availability-${venue.id}-${day}`, availability);
        rows.push(...courtRows(venue, area, availability));
      } catch (e) {
        warn(`playtomic availability ${venue.name} ${day}: ${e.message}`);
      }
    }
    try {
      const days = nextDays(DAYS_AHEAD);
      const matches = await get(`${base}/matches?${qs({
        sport_id: sportId, tenant_id: venue.id, visibility: 'VISIBLE',
        from_start_date: `${days[0]}T00:00:00`, to_start_date: `${days.at(-1)}T23:59:59`,
        sort: 'start_date,ASC', size: 100,
      })}`);
      raw(`playtomic-matches-${venue.id}`, matches);
      rows.push(...matchRows(venue, area, Array.isArray(matches) ? matches : matches?.content));
    } catch (e) {
      warn(`playtomic open matches ${venue.name}: ${e.message}`);
    }
  }
  return { rows, venues };
}
