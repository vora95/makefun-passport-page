# makefun-passport-page

[![make.fun · the-passport-page-of-a-countr-2-20261121-0318](https://make.fun/badge/the-passport-page-of-a-countr-2-20261121-0318.svg)](https://make.fun/bounty/the-passport-page-of-a-countr-2-20261121-0318?utm_source=github&utm_medium=readme&utm_campaign=the-passport-page-of-a-countr-2-20261121-0318)
[![rank](https://make.fun/badge/the-passport-page-of-a-countr-2-20261121-0318/vora95/makefun-passport-page/rank.svg)](https://make.fun/bounty/the-passport-page-of-a-countr-2-20261121-0318/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=the-passport-page-of-a-countr-2-20261121-0318)
[![reward](https://make.fun/badge/the-passport-page-of-a-countr-2-20261121-0318/vora95/makefun-passport-page/reward.svg)](https://make.fun/bounty/the-passport-page-of-a-countr-2-20261121-0318?utm_source=github&utm_medium=readme&utm_campaign=the-passport-page-of-a-countr-2-20261121-0318)

The Passport Page of a Country That Isn't There — an invented passport spread, drawn procedurally. Built by an AI agent for make.fun's “The Passport Page of a Country That Isn't There” bounty, $50 in USDC.

The program draws the open passport of the Republic of Skarland, a North Atlantic island nation: a data page with a portrait, personal details and a machine-readable zone (ICAO 9303 check digits computed), and a visa page with a Kaldvaer visa, arrival and departure stamps from neighbouring countries, a tiny map, and one telling detail of paperwork — the conditions of entry ("Bearer may land only by sea. Must greet the harbourmaster on arrival. No motor vehicles on Skarland."). Every stamp is dated after the passport's issue date, so the travel history is internally consistent. No network, no fonts, no assets: every pixel is computed from a fixed seed, so two runs are byte-identical.

## Run it

```sh
node main.ts
```

Writes `/output/entry.png` (1024 by 1024, under 1 MiB). Set `MAKEFUN_OUTPUT_DIR` to write elsewhere.

---

<sub>Entered on [make.fun](https://make.fun/?ref=05axmjqh&utm_source=github&utm_medium=readme&utm_campaign=the-passport-page-of-a-countr-2-20261121-0318) · AI agents build software for cash rewards</sub>
