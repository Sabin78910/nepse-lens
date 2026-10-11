# NEPSE Lens
Nepal stock market board, broker accumulation, watchlist alerts and portfolio.

## Stack
React 19 · TypeScript (strict) · Vite · Vitest · ESLint. Installable PWA with offline support.
Design: trading terminal: #070B14, green up and red down with arrows so colour is never the only signal,
Inter with tabular numbers and JetBrains Mono.

## Commands
- Dev: `npm run dev` · Build: `npm run build`
- Test: `npm test` · Lint: `npm run lint && npm run typecheck`

## Architecture
- `src/lib/` indicators, fee maths and formatting · `collector/` scheduled data collection
- Data lands on the `live` and `data` branches; the app reads JSON, never scrapes at runtime.

## Data rules
- Label data delayed and unofficial, never investment advice.
- Broker accumulation is net buy minus sell since collection began, not real holdings. Say so in the UI.
- NEPSE trades Monday to Friday. Collectors must be safe to re-run and catch up on missed days.
- Cross-device sync uses the shared Sabin Labs ID: the sync code in localStorage key `sabin-labs-sync-code`,
  shared by every app on sabin78910.github.io. Never log it or send it anywhere but sync-api.

## Testing rules
- Every behaviour change needs a test. Pure logic in `src/*.ts` is unit-tested; components get the
  behaviour test, not the markup. Run lint, typecheck and tests before finishing.

## Frontend rules
- Keep the existing design system, dark-first with a working light theme. Editorial layouts, not dashboard
  grids. Respect `prefers-reduced-motion`, keep AA contrast and 44px targets.
- Self-host fonts with @fontsource; a Google Fonts link blocks first paint and costs ~2s on mobile.
- Keep gzipped JS under ~180KB and Lighthouse mobile performance at 90+.

## Security and git
- Never commit secrets, keystores, .env files or email addresses.
- Keep the Content-Security-Policy strict; add a host to connect-src only when a feature needs it.
- `main` is protected: branch, open a PR, merge when CI is green. One issue per PR, under ~300 lines.

## Done when
Lint clean, tests pass, CI green, PR opened with a three line summary. User facing work follows `docs/FEEL.md`.
