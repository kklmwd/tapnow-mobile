# Pickleball tracker (East + Jalan Kayu)

Scrapes **Playtomic** and **Reclub** every 3 hours for pickleball in East Singapore
(Bedok, Tampines, Pasir Ris, Changi, Simei, East Coast, Marine Parade, Katong, Paya Lebar, ...)
and **Jalan Kayu / Seletar**, for the next 7 days.

- **Playtomic**: every pickleball club in Singapore is listed, and the ones in those areas are kept.
  For each club it lists free court slots (how many courts are free at each start time) and open matches that have spots left.
- **Reclub**: Reclub has no public search, so the tracker reads the meets on the club pages listed in
  `config.mjs` (`RECLUB.clubs`) and keeps the upcoming ones whose venue is in the areas.
  To track more groups, add a club's slug, the part after `reclub.co/clubs/@`.

## Where to see results

The **Pickleball tracker** workflow commits `SESSIONS.md` and `sessions.json` to the `pickleball-data`
branch. Open `SESSIONS.md` on that branch on GitHub (it renders on a phone too). 🆕 marks anything that
first appeared on the latest run. Each run's page under Actions also shows the same table.

## Run it

```
node pickleball-tracker/scrape.mjs --out out --raw   # Node 22, no npm packages
node --test pickleball-tracker/test.mjs
```

`--raw` saves every API response under `out/raw/`. In Actions these are uploaded as the `raw-responses` artifact.

## Change what it tracks

All settings are in `config.mjs`: areas (keywords, postal sectors, map box/circle), days ahead,
the Playtomic sport id, and the Reclub clubs.
