# NEPSE Lens
Purpose: Mobile-first Nepal Stock Exchange app (React, TS, Vite, Capacitor) with a Python data collector.
Data is delayed and unofficial; never fake market data. Label samples as samples.

## Commands
- Test: `npm test` and `cd collector && python -m pytest -q`
- Lint: `npm run lint && npm run typecheck`
- Build: `npm run build`

## Architecture
- src/lib/*.ts: pure logic with tests (format lakh/crore, fees, indicators, accumulation, alerts, market clock, portfolio, api)
- src/pages, src/components: UI. Hash routes: #/market, #/stock/SYM, #/watch, #/brokers[/ID], #/portfolio, #/more
- collector/nepse_lens: Python collector (NepseUnofficialApi wrapper). aggregate.py and market.py are pure and tested.
- Data: `live` branch = latest.json (force-pushed); `data` branch = history (see README "Data layout").
- public/sample: a recorded real snapshot (2026-10-09) used when live data is unavailable.
- worker/: optional Cloudflare Worker cache; deploys only with CLOUDFLARE_API_TOKEN.
- NEPSE trades Mon-Fri 11:00-15:00 NPT since April 2026 (Sun-Thu before). Holidays come from meta/holidays.json.

## Rules
- Read only the files you need; do not scan the whole repo or public/sample.
- Every behavior change needs a test. Run tests and lint before finishing.
- No new dependencies, permissions, or signing/secrets changes without asking.
- Never commit secrets, keystores, .env files, or e-mail addresses (strip them from NEPSE company data).
- Keep collector requests polite: one at a time, pauses between requests, no new high-frequency jobs.
- Keep PRs under ~300 changed lines; one issue per PR.
- Be concise: diffs plus a 3-line summary.
- If tests still fail after 3 attempts, stop and report the blocker.

## Definition of done
Lint clean, tests pass, CI green, short summary, PR opened as draft.
