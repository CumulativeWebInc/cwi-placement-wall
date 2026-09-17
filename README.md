# Catalog Placement Wall

Scan-verified playlist placements for the That Boy Hi Hat catalog — live at
https://cumulativewebinc.github.io/cwi-placement-wall/

Every card on the wall is a dated scan snapshot: playlist, curator, track,
position, playlist size, `verified_at`, and a **proof link** that opens the
live playlist so anyone can check the claim themselves. No invented data —
claims not confirmed by a full scan (e.g. DJ 6Rings' "It's Goin", WATCH THA
GAP VOL.5's "Ultimate") are deliberately excluded.

## Data truth: LIVE
Positions are snapshots at `verified_at`; curators can edit playlists at any
time. See `docs/placements.json` → `honest_limits`.

## Machine-readable
- `docs/placements.json` — the wall's data (schema `cwi.placement-record/1.0`)
- `docs/placements.schema.json` — JSON Schema
- `docs/wall.js` — zero-dependency UMD engine (validation, summary, rendering,
  `?playlist=` deep links). Served byte-identical.
- `docs/.well-known/agent-card.json` — agent discovery
- `docs/llms.txt` — model-readable summary

Deep links: `?playlist=<spotify_playlist_id>` filters to one playlist.

## Kill rule
If no fresh Spotify scan verifies the data within 30 days, every card flips
to STALE. If scans stop entirely, the wall is retired — a wall of stale
placements is a vanity metric dressed as truth.

## Tests
`node --test tests/wall.test.mjs` — 14/14 green (engine contract, data
integrity, XSS escaping, STALE kill rule, schema conformance).

## Deploy
`python3 deploy.py ["commit message"]` — Git Data API, commits on top of HEAD,
idempotent Pages enable. Repo: CumulativeWebInc/cwi-placement-wall.
