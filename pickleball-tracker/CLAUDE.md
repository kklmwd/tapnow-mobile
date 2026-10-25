# Pickleball tracker

Scrapes Playtomic and Reclub for pickleball sessions in East Singapore and
Jalan Kayu over the next 7 days. Plain Node 22 ESM, no npm dependencies. Keep
it that way: use built-in `fetch`, `node:test` and `Intl`.

## Layout

- `config.mjs`: everything a user would change (areas, days ahead, Playtomic sport id, Reclub club slugs).
- `scrape.mjs`: entry point. Runs each source, dedupes by `id`, marks `isNew` against the previous `sessions.json`, writes `sessions.json` + `SESSIONS.md` (+ `raw/` with `--raw`).
- `lib/areas.mjs`: `matchArea()`, which checks keywords (whole word), then the 6-digit postal sector, then lat/lng (box or circle). The first area in `AREAS` that matches wins.
- `lib/playtomic.mjs`: `/v1/tenants` → keep clubs in the areas → `/v1/availability` per day (free courts grouped by start time) and `/v1/matches` (open matches with spots).
- `lib/reclub.mjs`: no public API. Fetches `reclub.co/clubs/@<slug>/_payload.json` (falls back to the `__NUXT_DATA__` script in the page HTML), revives the devalue-flattened Nuxt payload with `unflatten()`, then `findMeets()` walks it for objects with a start time and a title/code. `meetRow()` maps them using the `*_KEYS` lists of possible field names.
- `lib/render.mjs`: `SESSIONS.md`.
- `lib/util.mjs`: rate-limited `get()`, Singapore-time helpers. All times are `Asia/Singapore` (UTC+8, no DST); naive timestamps are treated as SGT.
- `.github/workflows/tracker.yml`: runs every 3 h and commits results to the orphan `pickleball-data` branch. Raw responses are uploaded as the `raw-responses` artifact (7 days).

## Status of the parsers

The endpoints and field names were written without access to live responses.
Playtomic's endpoints are unofficial (the ones its web app uses), and the
`/v1/matches` parameters and the `PICKLEBALL` sport id are unconfirmed. Reclub's meet field
names are guesses. When real responses are available (`npm run scrape` with
network, or the `raw-responses` artifact), fit the parsers to them and add a
trimmed real sample as a test fixture. See `/fix-parsers`.

## Commands

- `npm test`: unit tests (`test/*.test.mjs`, node:test).
- `npm run scrape`: live run into `out/` with raw responses saved.
- Latest published results: `git fetch origin pickleball-data && git show origin/pickleball-data:sessions.json`.

## Conventions

- Scraping is polite: one request at a time, at least 400 ms apart, an identifying User-Agent, one retry on 429/5xx. Don't parallelise requests.
- A failing source or club becomes a warning, never a crash. Exit non-zero only when every source failed, so partial results still publish.
- Session ids must stay stable between runs (the 🆕 marker depends on them).
