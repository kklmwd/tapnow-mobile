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
npm test          # unit tests (Node 22, no npm packages to install)
npm run scrape    # live run into out/, with raw API responses in out/raw/
```

In Actions, the raw responses are uploaded as the `raw-responses` artifact.

## With Claude Code

Open this folder in Claude Code. `CLAUDE.md` explains the code, and these slash commands are included:

- `/sessions <question>`: e.g. `/sessions saturday evening tampines` or `/sessions open spots tonight`. Answers from the latest results.
- `/add-club <reclub link or slug>`: tracks another Reclub group.
- `/fix-parsers`: fits the Playtomic/Reclub parsers to real responses (run it after the first real run).

## Change what it tracks

All settings are in `config.mjs`: areas (keywords, postal sectors, map box/circle), days ahead,
the Playtomic sport id, and the Reclub clubs.
