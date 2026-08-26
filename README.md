# ATLAS Terminal

ATLAS Terminal is a private, keyboard-first financial research workstation. The repository now contains the integrated research workflows delivered across Phases 1–8: the terminal shell, live or deterministic market data, stocks and charts, news, corporate events, financials, options research, scanners, advanced analytics, and PostgreSQL-backed personal research records.

It is research software. It does not place trades, route orders, guarantee outcomes, or turn correlations into recommendations. Mock data is always labeled, and live modules retain provider freshness and quality metadata.

## Production handoff status

| Area | Delivered behavior | Current boundary |
| --- | --- | --- |
| Terminal shell | Three workspaces, nested horizontal/vertical panels, resize, close, maximize, active-panel routing, ticker synchronization, command palette, activity log, and keyboard shortcuts. | Workspace state is session-local unless saved through the personal API. |
| Stocks and charts | Ticker search, quote/security overview, movers, candlestick/line/area charts, volume, ranges from `1D` through `MAX`, and explicit intervals from `1m` through `1W`. | Intraday access and freshness follow the active Massive entitlement. |
| Indicators | SMA, EMA, cumulative VWAP, RSI, MACD, Bollinger Bands, ATR, and relative volume computed from normalized bars. | Calculations are research aids and depend on the returned history window. |
| Watchlist | Sort, keyboard navigation, drag reorder, remove, and live snapshot refresh for the default `CORE` list. | The visible watchlist is session-local today. Durable watchlist CRUD exists at `/api/personal` but is not yet connected to this panel. |
| News | Benzinga headline feed, ticker/all-market/watchlist scope, article selection, sector, category, date and keyword filtering, and ticker navigation. | Availability and latency depend on the Benzinga entitlement; the UI polls rather than streams. Sector is a disclosed local classification derived from Massive SIC metadata. |
| Events and earnings | TMX corporate-event and earnings views with watchlist, ticker, horizon, event type, market-cap, sector and date filters, plus countdown and event detail. | TMX supplies a date, not a structured event time. Earnings estimates/timing are not invented when absent. |
| Financials | Income statement, balance sheet, cash flow, ratios, and locally calculated growth views with annual, quarterly, and supported TTM periods. | Statements and ratios require the relevant entitlement. Missing fields and incomparable periods remain unavailable. |
| Options | Expiration/strike/volume/open-interest filters, call/put chain, contract detail and price history, Greeks, put/call ratios, current-chain activity ranking, and a research strategy builder with payoff, break-even, max gain/loss, and combined Greeks. | No trade execution. Historical IV rank/percentile and historical activity baselines are not currently populated. |
| Scanner | Built-in research presets, configurable conditions, sorting, news/event enrichment, and explicit missing-field handling. | Scans run over a curated U.S. research universe, not every listed security. Custom presets in the current panel are session-local; scanner persistence exists at `/api/personal`. |
| Advanced analytics | Heatmap, current breadth, heuristic chart patterns, news-versus-price views, catalyst timeline, and normalized comparison for up to four securities. | Heatmap/breadth are curated-universe snapshots. News/event proximity is association only, never claimed causation. |
| Personal research | PostgreSQL-backed notes, alert definitions, and settings UI; API support for watchlists, saved workspaces, and scanners. A single bounded monitor evaluates structured NEWS and EVENT alerts every 60 seconds while ATLAS is open. | Notes/alerts/settings require PostgreSQL. Browser-closed/background evaluation and non-NEWS/EVENT alert types still require a separately deployed scheduler/worker. |

## Architecture and trust boundaries

```text
React terminal shell
  ├─ production Sign in with ChatGPT owner gate
  ├─ workspace tree, commands, keyboard and panel state
  ├─ GET /api/research ── normalized read-only research facade
  │    ├─ deterministic mock research service
  │    └─ Massive research services
  │         ├─ stocks, aggregates, snapshots, options and financials
  │         ├─ Benzinga news
  │         └─ TMX corporate events
  │              └─ server-only Massive client
  │                   ├─ timeout + bounded retries + Retry-After
  │                   ├─ in-flight request coalescing
  │                   ├─ bounded cache + stale fallback
  │                   └─ Zod validation + provider adapters
  └─ /api/personal ── state-changing personal-data boundary
       └─ Prisma ── PostgreSQL
```

### Stage 1 shared-data assessment

This increment deliberately strengthens the shared foundation beneath the existing terminal surfaces; it does not start a broad rewrite of later feature stages.

| Assessment | Result |
| --- | --- |
| Existing and reusable | The terminal shell, authenticated API boundaries, normalized provider adapters, deterministic mock provider, bounded async cache, PostgreSQL/Prisma layer, and current research panels remain the base. |
| Missing before this increment | Provider-neutral service contracts, one operational freshness model, intraday/options cache policies, shared news/event deduplication, one alert cooldown gate, scanner-run/read-news/cache persistence records, and same-owner default-reference validation. |
| Compatibility choice | Existing `Notes`, `UserSettings`, and generic typed `Alert` records are extended instead of destructively renamed into several nearly identical tables. Existing JSON scanner definitions remain while relational conditions and run history are added. |
| Deliberately deferred | A distributed cache, an always-on alert scheduler/notification worker, streaming news distribution, and an edge-compatible hosted PostgreSQL path remain production infrastructure work. The in-browser monitor is explicitly active-terminal-only and is not an off-browser scheduler. |

The resulting service structure is:

```text
lib/services/      provider-neutral capability contracts
lib/massive/       server-only provider clients, schemas, adapters, implementations
lib/mock/          matching deterministic implementations and normalized fixtures
lib/cache/         async cache contract, bounded memory adapter, domain TTL policy
lib/freshness/     provider-independent freshness state and labels
lib/research/      news/event deduplication and shared research models
lib/alerts/        common duplicate/cooldown gate and deterministic active-terminal matching
prisma/            tenant-scoped persistence models and additive migrations
```

Important boundaries:

- Provider and database credentials remain server-only. Never expose them through `NEXT_PUBLIC_`, `VITE_`, client bundles, URLs, diagnostics, or committed files.
- `/api/research` is a read-only, provider-neutral facade. The browser does not call Massive directly.
- `/api/personal` is the only application boundary for personal state. Notes are not sent to Massive, Benzinga, TMX, or browser-only storage.
- Provider responses are validated and adapted before UI code receives them. API responses use `Cache-Control: private, no-store`.
- Mock mode is explicit. Live mode with no provider key fails configuration rather than silently substituting synthetic prices.
- Production pages and APIs require the authenticated Sites user header before provider or database work. The private deployment remains the outer access-control boundary.
- Personal records are scoped to a non-reversible identifier derived from the signed-in email. Local development uses the `primary` fixture profile.
- Keep the deployed application behind private hosting access controls. Server-only secrets protect credentials, but they are not a substitute for deployment authentication and authorization.

## Requirements

- Node.js 22.13 or newer
- pnpm 11 or newer
- One Massive API key for live data
- PostgreSQL 15+ only when durable personal research is required

The same Massive API key is used for every entitled Massive, Benzinga, and TMX dataset. Separate product-specific keys are not required; additional plan entitlements may still be required.

## Install and run

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

Open the URL printed by the development server. The checked-in example selects deterministic mock mode, so the first run does not consume live provider calls.

### Mock mode

```dotenv
USE_MOCK_DATA=true
```

Mock mode uses deterministic fixtures behind the same normalized interfaces as live mode. Response metadata reports `mode: "mock"` and indicative quality.

### Live mode

Set these values only in `.env.local` or the deployment's secret manager:

```dotenv
USE_MOCK_DATA=false
MASSIVE_API_KEY=<server-only-secret>
MASSIVE_API_BASE_URL=https://api.massive.com
```

Do not commit a real key. If a credential is ever copied into source control, logs, or another unintended location, revoke and rotate it before deployment.

### Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `USE_MOCK_DATA` | Yes | `true` selects deterministic fixtures; `false` selects Massive. |
| `MASSIVE_API_KEY` | Live mode | The single server-only Massive credential. |
| `MASSIVE_API_BASE_URL` | No | Provider origin; defaults to `https://api.massive.com`. |
| `MASSIVE_REQUEST_TIMEOUT_MS` | No | Per-attempt provider timeout. |
| `MASSIVE_MAX_RETRIES` | No | Bounded retry count. |
| `MASSIVE_RETRY_BASE_DELAY_MS` | No | Base exponential-backoff delay. |
| `MEMORY_CACHE_MAX_ENTRIES` | No | Process-local cache bound. |
| `CACHE_TTL_QUOTE_MS` | No | Very short quote/snapshot cache window. |
| `CACHE_TTL_INTRADAY_MS` | No | Short minute/hour aggregate cache window. |
| `CACHE_TTL_OPTIONS_MS` | No | Option-snapshot cache window aligned to returned timing metadata. |
| `CACHE_TTL_NEWS_MS`, `CACHE_TTL_EVENTS_MS` | No | News and corporate-event cache windows. |
| `CACHE_TTL_REFERENCE_MS`, `CACHE_TTL_FINANCIALS_MS`, `CACHE_TTL_HISTORICAL_MS` | No | Longer-lived reference, statement, and completed-history windows. |
| `CACHE_STALE_IF_ERROR_MS` | No | Bounded fallback window only where stale data can be labeled safely. |
| `DATABASE_URL` | Personal data | Server-side PostgreSQL connection string for `/api/personal`. |

The current cache implementation is bounded process memory. Its asynchronous interface can be replaced with a distributed cache without changing research consumers.

## Research API

`GET /api/research` is the browser's read-only market-research boundary. It validates tickers and ranges, chooses mock or live services server-side, and returns a common envelope:

```json
{
  "ok": true,
  "data": {},
  "meta": {
    "mode": "live",
    "source": "massive",
    "quality": "delayed",
    "asOf": "provider timestamp",
    "freshness": {
      "status": "delayed",
      "delayMinutes": 15,
      "lastUpdatedAt": "provider timestamp",
      "source": "massive",
      "marketSession": "regular"
    }
  }
}
```

Errors are sanitized and include a request ID. The route accepts at most 100 requested symbols, and comparison output is capped at four securities.

| `kind` | Main inputs | Result |
| --- | --- | --- |
| `dashboard` | none | ETF proxy snapshots, movers, Benzinga headlines, and upcoming TMX events. |
| `search` | `q` | Ticker search results. |
| `security`, `chart` | `ticker`, `range`, `interval` | Quote, company details, and adjusted aggregate bars. |
| `movers` | none | Gainers/losers bundle. |
| `watchlist` | `symbols` | Snapshot bundle for a caller-supplied or default symbol list. |
| `classifications` | `symbols` | Bounded Massive reference metadata with local SIC-to-sector classification for filters. |
| `market`, `heatmap`, `breadth`, `scanner` | optional `symbols` | Snapshots for the curated research universe. |
| `news` | `ticker`, `all`, `after`, `category`, `q` | Benzinga news bundle, with a labeled Massive Stocks news fallback if Benzinga is unavailable. |
| `events`, `earnings` | `ticker`, `all`, `from`, `to`, `type` | TMX event bundle; earnings fixes the event type. |
| `options` | `ticker`, `expiration` | Normalized option chain and freshness metadata. |
| `option-chart` | `contract`, `range`, `interval` | Validated option-contract aggregate bars. |
| `financials` | `ticker` | Statements, ratios, and entitlement-aware availability. |
| `compare` | `symbols`, `range`, `interval` | Quotes, history, company detail, and ratios for up to four tickers. |
| `timeline` | `ticker` | Benzinga news, TMX events, and daily price moves of at least 4%. |

Examples:

```text
/api/research?kind=security&ticker=NVDA&range=1Y
/api/research?kind=news&ticker=AMD
/api/research?kind=compare&symbols=NVDA,AMD,AVGO
```

The chart route supports ranges `1D`, `5D`, `1M`, `3M`, `6M`, `YTD`, `1Y`, `3Y`, `5Y`, and `MAX`, with a strict range/interval matrix from `1m` through `1W`. Incompatible combinations such as `MAX` with minute bars are rejected, and each upstream history request is capped at 5,000 bars.

## Personal-data API

`/api/personal` owns private, state-changing data. All operations use the `resource` query parameter and the normalized `{ ok, data }` or `{ ok: false, error }` envelope.

| Resource | GET | POST | PATCH | DELETE |
| --- | --- | --- | --- | --- |
| `status` | Verifies whether PostgreSQL is configured and reachable from the runtime. | — | — | — |
| `settings` | Reads the primary profile. | Upserts settings. | — | — |
| `notes` | Lists notes, optionally by `symbol`. | Creates a note. | Updates by `id`. | Deletes by `id`. |
| `alerts` | Lists alert definitions; `monitor=active-terminal` returns a bounded enabled NEWS/EVENT set. | Creates a definition. | Updates by `id`; narrow `active-terminal-evaluate` and `active-terminal-delivery` actions persist monitor state. | Deletes by `id`. |
| `watchlists` | Lists ordered lists/tickers. | Creates a list. | — | Deletes by `id`. |
| `workspaces` | Lists saved layouts. | Upserts by name. | — | Deletes by `id`. |
| `scanners` | Lists saved definitions. | Creates a definition. | — | Deletes by `id`. |

`GET /api/personal?resource=status` works without a database. Every other operation returns `503 DATABASE_UNCONFIGURED` until a server-side `DATABASE_URL` is available. In production, all personal operations first require the authenticated owner and scope rows to that owner's derived identifier.

Current UI behavior is deliberately narrower than the API:

- Notes support create, edit, delete, ticker filtering, and Markdown text stored privately in PostgreSQL.
- Structured NEWS and EVENT definitions are evaluated by one centralized polling loop every 60 seconds while the terminal page remains open and PostgreSQL is configured. Each cycle is capped at 100 enabled definitions, 500 normalized source observations, eight new notifications, and a 20-second request window; the terminal status bar discloses when the definition cap is reached. The authenticated API applies the shared cooldown/dedup gate before the client emits an in-terminal toast and any configured browser/sound channels. Event status-transition rules establish and persist a prior-status baseline before they can match. Legacy free-form NEWS/EVENT definitions fail closed. This is not an off-browser scheduler, and no alert executes a trade.
- Price, percent-change, relative-volume, technical, options, browser-closed, and continuous/background alert evaluation still require a separately deployed scheduler/worker.
- Settings persist market timezone, default chart range, and refresh preference. The editor saves these values; not every already-mounted research module consumes them globally yet.
- Workspace layouts can be saved and restored from the toolbar when PostgreSQL is configured.
- Watchlist interactions and scanner custom presets remain session-local in the current panels. Durable watchlist/scanner APIs and schema are ready for later UI wiring.

## PostgreSQL and Prisma

Research routes work without a database. To enable durable personal data:

1. Provision PostgreSQL and set a server-side, preferably pooled, `DATABASE_URL`.
2. Generate the Prisma client and apply the committed migration.
3. Redeploy and confirm `/api/personal?resource=status` reports `configured: true`.

```bash
pnpm prisma:generate
pnpm prisma:migrate
```

Prisma is loaded lazily, and the application never runs migrations at startup. The schema includes settings, ordered watchlists, notes, generic market/news/event/options alerts, saved scanners with relational conditions and run history, read-news state, saved workspaces, and deduplicated security/event/news cache metadata. Tenant-owned rows require an explicit authenticated owner ID; production writes cannot fall through to the local `primary` fixture owner.

### Current Sites/Prisma runtime caveat

The Sites/Vinext deployment targets a Cloudflare Worker-compatible runtime. The default Prisma PostgreSQL client uses a TCP-oriented Node runtime and must not be assumed to work there. For production persistence, either:

- run `/api/personal` in a standard Next.js Node runtime, or
- configure and verify an edge-compatible Prisma PostgreSQL adapter/proxy with a pooled connection URL.

The current Sites project does not provision D1, and D1/Drizzle is not silently substituted for the PostgreSQL/Prisma design. Until one of the supported PostgreSQL runtime paths is deployed, the hosted research UI can operate but personal modules will correctly report persistence as unconfigured.

## Entitlements, timing, and analytical limits

| Capability | Production rule |
| --- | --- |
| Market benchmarks | Dashboard benchmarks are explicitly labeled ETF proxies: `SPY`, `QQQ`, `DIA`, and `IWM`. Direct index values require a separate Indices entitlement. |
| VIX | Do not synthesize VIX from an ETF or another proxy. It remains unavailable unless the Massive Indices product is entitled. |
| Options | Read quality/freshness from each normalized response. Options Developer data is commonly delayed (typically 15 minutes); the UI must honor the response metadata rather than imply real time. |
| Financials | Statements and ratios require the relevant financial-data entitlement. Missing sections remain unavailable; forward P/E is not fabricated from unrelated fields. |
| TMX events | Source records provide dates but no structured time. The source refreshes on roughly a two-hour cadence, so the UI shows date-only timing and delayed quality. |
| Benzinga news | The current client polls about every 30 seconds. Provider entitlement and response timestamps determine actual freshness. |
| Scanner, heatmap and breadth | Results cover the configured curated universe, not full-exchange membership. Heatmap sizing currently uses reported volume, not market capitalization; breadth is a current snapshot rather than a historical breadth series. |
| Pattern detection | Patterns are heuristic observations with confidence/reasoning and invalidation levels, not deterministic predictions. |
| News-price and catalysts | Co-occurrence is labeled association only. The terminal does not attribute causation to a headline or event. |
| Options activity | Put/call ratios and unusual candidates use the current returned chain. Historical IV rank, IV percentile, and volume-versus-baseline remain unavailable without separate history. |

Unavailable fields should stay unavailable. Never replace missing entitlements, times, estimates, ratios, or history with plausible-looking values.

## Commands, panels, and keyboard

The command language is case-insensitive, whitespace-normalized, bounded, and separate from panel routing.

| Input | Result |
| --- | --- |
| `NVDA` | Security overview |
| `TSLA CHART` | Interactive chart |
| `NVDA NEWS` | Ticker news |
| `AMD OPT` | Options terminal |
| `META FIN` | Financials |
| `PLTR EVENTS` | Corporate events |
| `MARKET` | Market monitor |
| `MOVERS` | Market movers |
| `SCAN` | Scanner |
| `WATCH` | Watchlist |
| `EARNINGS` | Earnings center |
| `COMPARE NVDA AMD AVGO` | Company comparison |

Keyboard shortcuts:

- `/` or `Cmd/Ctrl + K`: open the command bar
- `Esc`: close the active command overlay
- `M`: market monitor
- `N`: news
- `S`: scanner
- `W`: watchlist
- `E`: events
- `O`: options
- `?`: shortcut reference

Single-key shortcuts pause while focus is in an input, select, textarea, or editable element. The command palette supports arrow-key selection and Enter execution.

## Verification

Run the full local handoff suite from the repository root:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:render
pnpm verify:client-bundle
pnpm prisma:validate
```

The same checks can be run in order with `pnpm verify`. The unit suite covers command parsing, workspace-tree invariants, stock calculations, SIC/market-cap classification, research adapters, technical indicators, options analytics, scanner rules, advanced analytics, cache boundaries/LRU behavior, freshness labels, news/event deduplication, deterministic active-terminal alert matching, alert cooldowns, persistence invariants, and credential boundaries. `test:render` is the production-render smoke test, and `verify:client-bundle` rejects provider credential material in client assets. Use mock mode for repeatable, network-free application verification; a live provider key and database are only needed for live entitlement checks and personal persistence integration.

## Project map

```text
app/api/research/             Read-only normalized research facade
app/api/personal/             PostgreSQL-backed personal-data API
components/terminal/          Shell, panels, commands and research modules
hooks/useResearchData.ts      Client fetch/poll/session response cache
lib/commands/                 Command parser and fuzzy ranking
lib/workspace/                Serializable layout tree and reducer
lib/massive/                  Server-only client, schemas, adapters and services
lib/services/                 Provider-neutral service capability contracts
lib/mock/                     Deterministic research provider
lib/cache/                    Cache contract, TTL policy and memory adapter
lib/freshness/                Data-age/session normalization and display labels
lib/alerts/                   Shared alert matching plus duplicate/cooldown evaluation
lib/indicators/               Technical indicator calculations
lib/options/                  Chain, activity, Greeks and strategy analytics
lib/scanner/                  Scanner definitions and evaluation
lib/analytics/                Breadth, patterns, event-study and comparison logic
lib/env.ts                    Strict server environment validation
lib/prisma.ts                 Lazy PostgreSQL client
prisma/                       Schema and committed migration
tests/                        Unit and render verification
```

Brand strings are centralized in `lib/brand.ts`. Regenerate `public/og.png` when the brand changes.
