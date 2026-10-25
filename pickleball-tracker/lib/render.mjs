import { TIMEZONE } from '../config.mjs';

const fmt = (iso, opts) => new Intl.DateTimeFormat('en-SG', { timeZone: TIMEZONE, ...opts }).format(new Date(iso));
const day = (iso) => fmt(iso, { weekday: 'short', day: 'numeric', month: 'short' });
const time = (iso) => fmt(iso, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');

export function renderMarkdown({ generatedAt, sessions, sources, warnings }) {
  const groups = sessions.filter((s) => s.kind !== 'court');
  const courts = sessions.filter((s) => s.kind === 'court');
  const out = [];
  out.push('# Pickleball sessions: East & Jalan Kayu', '');
  out.push(`Updated ${fmt(generatedAt, { dateStyle: 'medium', timeStyle: 'short' })} SGT. 🆕 = first seen this run.`, '');
  out.push(Object.entries(sources).map(([k, v]) => `**${k}**: ${v}`).join(' · '), '');

  out.push('## Sessions to join', '');
  if (groups.length === 0) {
    out.push('_None found in the next week._', '');
  } else {
    out.push('| When | Area | Venue | Session | Spots | Price | |', '|---|---|---|---|---|---|---|');
    for (const s of groups) {
      const when = `${day(s.start)} ${time(s.start)}${s.end ? `–${time(s.end)}` : ''}`;
      const spots = s.spots == null ? '' : `${s.spots}${s.capacity ? `/${s.capacity}` : ''}`;
      const src = s.source === 'reclub' ? 'Reclub' : 'Playtomic';
      out.push(`| ${s.isNew ? '🆕 ' : ''}${when} | ${s.area} | ${cell(s.venue)} | ${cell(s.title)} | ${spots} | ${cell(s.price)} | [${src}](${s.url}) |`);
    }
    out.push('');
  }

  out.push('## Free courts (Playtomic)', '');
  if (courts.length === 0) out.push('_No free court slots found._', '');
  const byVenue = Map.groupBy(courts, (s) => s.venue);
  for (const [venue, rows] of byVenue) {
    out.push(`### [${venue}](${rows[0].url}) · ${rows[0].area}`, '');
    if (rows[0].address) out.push(`${rows[0].address}`, '');
    for (const [d, slots] of Map.groupBy(rows, (s) => day(s.start))) {
      const list = slots.map((s) => `${s.isNew ? '🆕' : ''}${time(s.start)}${s.courtsFree > 1 ? ` ×${s.courtsFree}` : ''}`).join(', ');
      const price = slots.find((s) => s.price)?.price;
      out.push(`- **${d}**: ${list}${price ? ` (from ${price})` : ''}`);
    }
    out.push('');
  }

  if (warnings.length) {
    out.push('<details><summary>Warnings</summary>', '', ...warnings.map((w) => `- ${cell(w)}`), '', '</details>', '');
  }
  return out.join('\n');
}
