---
name: fix-parsers
description: Fit the Playtomic/Reclub parsers to real API responses, when a run shows warnings, 0 results, wrong fields, or after first setup.
---

# Fix the parsers against real responses

The parsers were written without live responses, so expect field names to need adjusting.

1. **Get real responses** (any one):
   - `npm run scrape` writes them to `out/raw/` (needs network access to `api.playtomic.io` and `reclub.co`).
   - Or the user downloads the `raw-responses` artifact from the latest **Pickleball tracker** Actions run and puts it in `out/raw/`.
   - Read the warnings in `out/sessions.json` (or the run summary) first. They name which call failed.
2. **Playtomic** (`lib/playtomic.mjs`):
   - `playtomic-tenants.json` is empty or 400: check the `sport_id` value (Playtomic lists sports at `/v2/configuration`) and the `coordinate`/`radius` params.
   - `/v1/matches` errors: the matches query params are the least certain part. Fix them, or drop open matches if there's no working public endpoint (say so).
   - Check `tenantVenue()`, `courtRows()` and `matchRows()` against the real field names.
3. **Reclub** (`lib/reclub.mjs`):
   - Revive a raw club payload with `unflatten()` and find the real meet objects (look for the meet's start time and its short code, e.g. `7SK3WZ`).
   - Put the real key names first in the `*_KEYS` lists (`START_KEYS`, `CODE_KEYS`, `PLACE_KEYS`, ...). Tighten `findMeets()` if it catches non-meet objects. Check the meet URL format (`/m/<code>`).
   - Confirm the sport filter keeps pickleball and drops other sports.
4. **Lock it in**: add a trimmed real sample (a few objects, personal names/phone numbers removed) under `test/fixtures/` and a test that parses it. Run `npm test`.
5. Rerun `npm run scrape` if you can, and report what changed and how many sessions each source now finds. Remove the matching caveat in CLAUDE.md's "Status of the parsers" once a source is verified.
