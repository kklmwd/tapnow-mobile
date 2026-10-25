---
name: add-club
description: Add a Reclub club (or several) to the tracker, e.g. "/add-club https://reclub.co/clubs/@pickleball-bedok-south".
---

# Add a Reclub club

1. From `$ARGUMENTS`, get each slug: the part after `reclub.co/clubs/@` (strip trailing `/`, query strings, and a leading `@`). Accept bare slugs too.
2. Add each slug to `RECLUB.clubs` in `config.mjs`, keeping the list free of duplicates. Don't reorder existing entries.
3. If the network allows, check the club page: run `node -e` with `get()` from `lib/util.mjs` on `https://reclub.co/clubs/@<slug>/_payload.json` and confirm it returns JSON. Report the slug as unverified if it can't be reached; don't remove it.
4. Run `npm test`.
5. Commit with a message like `Track Reclub club @<slug>` and push if the user asked for it.

New clubs show up on the next workflow run. Results are still filtered to the areas in `AREAS`, so a club whose meets are all elsewhere adds nothing.
