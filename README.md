# Token Radar

![Token Radar](https://make.fun/badge/token-radar-01.svg)
[![Rank](https://make.fun/badge/token-radar-01/aldisahreva28-tech/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01)
[![Reward](https://make.fun/badge/token-radar-01/aldisahreva28-tech/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01)

A token launch radar for make.fun's [Build the best token launch radar](https://make.fun/bounty/token-radar-01) bounty ($1,325).

It reads the sealed DefiLlama snapshot of every protocol, works out which ones still record no token and are not a wrapped or staked product of one that trades, and ranks them by what their launch would be worth — then hands in a web dashboard that shows the board, a detail view for each protocol and the steps to farm it.

## Model (radar-2)

The implied value follows only from the snapshot's own figures, never from a hard-coded list of names:

- **Peer multiple** — for each category, the median market-cap/TVL of the protocols that already trade there, shrunk toward the global median when the category has few traders.
- **Growth** — the 7-day TVL change, clamped to −50%…+100%, weight 0.6.
- **Age** — how long the protocol has run with no token: 0.70 + 0.30 × min(age, 1460 days) / 1460.
- **Breadth** — +2% per extra chain, up to 5.

`implied = TVL × peer multiple × growth × age × breadth`

The board covers all 40 protocols on the snapshot's watchlist plus the strongest pre-token protocols below the $50M floor. Protocols whose token already trades are shown apart in the Live view, at the market's own values.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <kit>/input/snapshot.json
```

Writes `board.json` (178 ranked rows), `data.js`, `dashboard/`, `screenshots/` and `dossier.json` to the output directory. Two runs write the same bytes.

## Layout

- `main.ts` — entrypoint: reads the snapshot, writes the board, data, dashboard, screenshots and dossier.
- `lib/model.ts` — the radar-2 model, the board builder and the farm plans.
- `dashboard/` — the static page (no network): board, detail view, filters, method.
- `screenshots/` — the board, a detail view and a filtered view.
- `vendor/makefun-board.ts` — make.fun's dossier library, from the kit.
