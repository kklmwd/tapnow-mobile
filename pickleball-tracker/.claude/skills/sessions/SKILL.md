---
name: sessions
description: Answer questions about upcoming pickleball sessions in East Singapore / Jalan Kayu (e.g. "/sessions saturday evening tampines", "any open spots tonight?", "free courts at TSA tomorrow"). Reads the tracker's latest results.
---

# Find pickleball sessions

1. Get the latest results:
   - Published: `git fetch origin pickleball-data && git show origin/pickleball-data:sessions.json`
   - If the user asks for live/fresh data, or the published file is missing or older than 6 hours (`generatedAt`), run `npm run scrape` and read `out/sessions.json` instead. If the network blocks it, say so and use the published copy.
2. Filter `sessions` to what the user asked (args: `$ARGUMENTS`):
   - Day/time words are Singapore time. "Tonight" means today 17:00 or later, "morning" means before 12:00, "evening" means 17:00 or later.
   - Area: `area` is `East` or `Jalan Kayu`. For a neighbourhood (e.g. Tampines), match `venue`/`address`.
   - `kind`: `meet` (Reclub) and `match` (Playtomic open match) are sessions to join; `court` is a free court to book.
3. Answer briefly, soonest first: day + time, venue, what it is, spots left / courts free, price, link. Group free courts per venue and day as a list of times. Mark items with `isNew: true` as new.
4. If `sources` shows a source `failed`, or `warnings` is non-empty, mention it in one line so the user knows results may be incomplete.

Never invent sessions. If nothing matches, say so and give the nearest alternatives in time or area.
