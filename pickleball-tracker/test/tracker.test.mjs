// npm test
// Fixtures follow the expected response shapes; they are not captured from
// the live sites.
import test from 'node:test';
import assert from 'node:assert/strict';
import { matchArea } from '../lib/areas.mjs';
import { toDate, sgIso } from '../lib/util.mjs';
import { courtRows, matchRows, tenantVenue } from '../lib/playtomic.mjs';
import { unflatten, findMeets, meetRow, payloadFromHtml } from '../lib/reclub.mjs';
import { renderMarkdown } from '../lib/render.mjs';

test('areas: names, postal sectors and coordinates', () => {
  assert.equal(matchArea({ text: 'The Sports Arina @ Jalan Kayu' }), 'Jalan Kayu');
  assert.equal(matchArea({ text: 'Bedok North Ave 1' }), 'East');
  assert.equal(matchArea({ text: '1 Somewhere Rd, Singapore 529510' }), 'East'); // Tampines sector 52
  assert.equal(matchArea({ text: 'Club X', lat: 1.3521, lng: 103.9447 }), 'East'); // Tampines
  assert.equal(matchArea({ text: 'Club Y', lat: 1.4, lng: 103.871 }), 'Jalan Kayu');
  assert.equal(matchArea({ text: 'Advantage Pickleball, Dunearn Road 299000' }), null);
  assert.equal(matchArea({ text: 'Club Z', lat: 1.4043, lng: 103.9020 }), null); // Punggol
  assert.equal(matchArea({ text: 'Rubik club' }), null); // 'ubi' is whole-word only
});

test('dates: naive strings are Singapore time', () => {
  assert.equal(sgIso(toDate('2026-10-26T19:00:00')), '2026-10-26T19:00:00+08:00');
  assert.equal(sgIso(toDate('2026-10-26T11:00:00Z')), '2026-10-26T19:00:00+08:00');
  assert.equal(sgIso(toDate(1793012400)), sgIso(new Date(1793012400000)));
  assert.equal(toDate('nope'), null);
});

const tenant = {
  tenant_id: 't1', tenant_name: 'TSA Jalan Kayu', slug: 'tsa-jalan-kayu',
  address: { street: '2 Jalan Kayu', postal_code: '799000', city: 'Singapore', coordinate: { lat: 1.4, lon: 103.87 } },
};

test('playtomic: free courts grouped by start time', () => {
  const venue = tenantVenue(tenant);
  assert.equal(venue.url, 'https://playtomic.com/clubs/tsa-jalan-kayu');
  const rows = courtRows(venue, 'Jalan Kayu', [
    { resource_id: 'c1', start_date: '2026-10-26', slots: [{ start_time: '19:00:00', duration: 60, price: '35 SGD' }, { start_time: '20:00:00', duration: 60, price: '35 SGD' }] },
    { resource_id: 'c2', start_date: '2026-10-26', slots: [{ start_time: '19:00:00', duration: 90, price: '30 SGD' }] },
  ]);
  assert.equal(rows.length, 2);
  const seven = rows.find((r) => r.start === '2026-10-26T19:00:00+08:00');
  assert.equal(seven.courtsFree, 2);
  assert.deepEqual(seven.durations, [60, 90]);
  assert.equal(seven.price, '30 SGD');
});

test('playtomic: only matches with open spots', () => {
  const venue = tenantVenue(tenant);
  const rows = matchRows(venue, 'Jalan Kayu', [
    { match_id: 'm1', start_date: '2026-10-26T19:00:00', teams: [{ max_players: 2, players: [{}] }, { max_players: 2, players: [] }], min_level: 2, max_level: 3.5 },
    { match_id: 'm2', start_date: '2026-10-26T20:00:00', teams: [{ max_players: 2, players: [{}, {}] }, { max_players: 2, players: [{}, {}] }] },
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].spots, 3);
  assert.match(rows[0].title, /level 2–3.5/);
});

// A devalue-flattened payload, as Nuxt writes it.
const flat = [
  { data: 1 },
  ['ShallowReactive', 2],
  { club: 3 },
  { name: 4, meets: 5 },
  'East Coast Plan',
  [6, 12, 17],
  { referenceCode: 7, name: 8, startDatetime: 9, location: 10, maxParticipants: 13, participants: 14, price: 16 },
  'ABC123',
  'Tuesday social',
  '2026-10-27T19:00:00+08:00',
  { name: 11 },
  'Bedok Sports Hall',
  { referenceCode: 'ZZZ999', name: 'Far away', startDatetime: '2026-10-27T19:00:00+08:00', location: 'Jurong West' },
  8,
  [15, 15, 15],
  { name: 'p' },
  15,
  { referenceCode: 'OLD111', name: 'Past', startDatetime: '2026-10-01T19:00:00+08:00', location: 'Tampines Hub' },
];

test('reclub: revives a Nuxt payload and keeps upcoming meets in area', () => {
  const data = unflatten(flat);
  assert.equal(data.data.club.name, 'East Coast Plan');
  const meets = findMeets(data);
  assert.equal(meets.length, 3);
  const now = new Date('2026-10-25T12:00:00+08:00');
  const rows = meets.map((m) => meetRow(m, 'east-coast-plan', now)).filter(Boolean);
  assert.equal(rows.length, 1);
  assert.deepEqual(
    { url: rows[0].url, area: rows[0].area, spots: rows[0].spots, venue: rows[0].venue, price: rows[0].price },
    { url: 'https://reclub.co/m/ABC123', area: 'East', spots: 5, venue: 'Bedok Sports Hall', price: '15' },
  );
});

test('reclub: reads __NUXT_DATA__ from HTML', () => {
  const html = `<html><script type="application/json" data-nuxt-data="nuxt-app" id="__NUXT_DATA__">${JSON.stringify(flat)}</script></html>`;
  assert.deepEqual(payloadFromHtml(html), flat);
});

test('render: markdown has both sections', () => {
  const md = renderMarkdown({
    generatedAt: '2026-10-25T04:00:00Z', sources: { Playtomic: '1 found', Reclub: 'failed' }, warnings: ['x'],
    sessions: [
      { kind: 'court', source: 'playtomic', venue: 'TSA', area: 'Jalan Kayu', url: 'u', start: '2026-10-26T19:00:00+08:00', courtsFree: 2, price: '35 SGD', isNew: true },
      { kind: 'meet', source: 'reclub', venue: 'Bedok | Hall', area: 'East', url: 'v', start: '2026-10-27T19:00:00+08:00', title: 'Social', spots: 5, capacity: 8 },
    ],
  });
  assert.match(md, /Mon, 26 Oct.*: 🆕19:00 ×2 \(from 35 SGD\)/);
  assert.match(md, /Bedok \\\| Hall \| Social \| 5\/8/);
});
