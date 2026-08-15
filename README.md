# ATLAS Terminal

ATLAS Terminal is a private, keyboard-first financial research workstation. This repository currently implements **Phase 1 — Foundation** from the product brief: the terminal shell, command language, multi-panel workspace, server-only Massive client, normalized market-data contracts, cache and error layers, deterministic mock mode, and a PostgreSQL/Prisma schema.

It is research software. It does not place trades, make guaranteed recommendations, or present mock data as live market data.

## Phase 1 status

Implemented:

- Dense dark terminal shell with a collapsible navigation rail and market strip.
- Three default workspace layouts: Research, Monitor, and Focus.
- Nested horizontal/vertical panel splits, drag or keyboard resizing, close, maximize, panel view selection, per-panel ticker entry, and synchronized ticker mode.
- `/` and `Cmd/Ctrl + K` command entry, fuzzy suggestions, keyboard navigation, and a deterministic parser.
- Commands for ticker overview, chart, news, options, financials, events, market, movers, scanner, watchlist, earnings, and comparisons.
- Explicit future-phase results: a recognized command never pretends an unbuilt module exists.
- Provider-neutral types for quotes, securities, news, events, options, financials, bars, trades, and snapshots.
- Server-only Massive transport with bounded retries, timeouts, `Retry-After` support, request coalescing, cache fallback, Zod validation, and sanitized diagnostics.
- Deterministic mock provider using the same contracts as the real provider.
- Bounded in-memory cache behind an asynchronous `CacheStore` interface. TTLs are configurable and a distributed Redis implementation can replace it without changing service consumers.
- PostgreSQL Prisma schema and initial SQL migration for settings, watchlists, scanners, alerts, workspaces, cached security metadata, and private notes.
- Unit coverage for the command grammar and workspace-tree invariants, plus a production-render smoke test.

Not implemented yet: live stock screens, charts, watchlist persistence UI, Benzinga news screens, TMX event screens, options, scanners, heatmaps, alerts, portfolio tools, or trading. The navigation and parser reserve these workflows for later phases without fabricating functionality.

## Architecture

```text
Terminal UI / React client components
  ├─ serializable workspace tree + reducer
  └─ command palette → pure command parser

Server-only service boundary
  └─ MarketDataService
      ├─ MockMarketDataService
      └─ MassiveMarketDataService
          └─ MassiveClient
              ├─ bounded retries + timeout
              ├─ in-flight request deduplication
              ├─ CacheStore
              └─ Zod response adapters

Provider-neutral domain types
  └─ Quote, TickerDetails, NewsArticle, CorporateEvent,
     OptionContract, FinancialStatement, AggregateBar, Trade, Snapshot

Persistence foundation
  └─ Prisma → PostgreSQL
```

Important boundaries:

- Modules that can access credentials import `server-only`.
- The browser never receives `MASSIVE_API_KEY` or a PostgreSQL connection string.
- The Massive client only accepts root-relative, typed endpoint paths and rejects credential query parameters. It is not an arbitrary URL proxy.
- Raw provider responses are validated and adapted before they can reach UI code.
- Mock mode is explicit. Real mode with a missing key fails as a configuration error; it does not silently substitute synthetic prices.
- Personal notes are represented only in the local PostgreSQL schema and are never sent to data providers.

Brand strings are centralized in `lib/brand.ts`. The social preview image in `public/og.png` must be regenerated when the brand changes.

## Requirements

- Node.js 22.13 or newer
- pnpm 11 or newer
- PostgreSQL 15+ for persistence work
- A Massive API key only when using real provider mode

## Install and run locally

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

Open the local URL printed by the development server. The checked-in environment example starts in deterministic mock mode and does not consume Massive API calls.

### Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `USE_MOCK_DATA` | Yes | `true` selects deterministic local fixtures; `false` selects Massive. |
| `MASSIVE_API_KEY` | Real mode | Private provider credential; server-only. |
| `MASSIVE_API_BASE_URL` | No | Central provider base URL, default `https://api.massive.com`. |
| `DATABASE_URL` | Database work | PostgreSQL connection string used only when Prisma is invoked. |
| `MASSIVE_REQUEST_TIMEOUT_MS` | No | Per-attempt provider timeout. |
| `MASSIVE_MAX_RETRIES` | No | Bounded retry count, capped during validation. |
| `MASSIVE_RETRY_BASE_DELAY_MS` | No | Base exponential-backoff delay. |
| `MEMORY_CACHE_MAX_ENTRIES` | No | Process-local cache bound. |
| `CACHE_TTL_*_MS` | No | Data-class-specific freshness and stale-fallback windows. |

Never use `NEXT_PUBLIC_` or `VITE_` prefixes for secrets. `.env*` files are ignored; `.env.example` is the only committed environment file.

## PostgreSQL and Prisma

1. Start PostgreSQL and create a local database.
2. Set `DATABASE_URL` in `.env.local`.
3. Generate the client and apply the migration:

```bash
pnpm prisma:generate
pnpm prisma:migrate
```

The initial migration is committed under `prisma/migrations`. Prisma is initialized lazily by `lib/prisma.ts`; importing the application does not connect to a database, and the application never runs migrations at startup.

The current Sites/Vinext preview runs in a Cloudflare Worker-compatible runtime. Phase 1 does not access PostgreSQL from that Worker. Before persistence routes are enabled, deploy those routes in a standard Next.js Node runtime or configure a verified edge-compatible Prisma PostgreSQL adapter/proxy and pooled database URL. D1/Drizzle is intentionally not substituted for the requested PostgreSQL/Prisma stack.

## Command language

| Input | Parsed intent | Availability |
| --- | --- | --- |
| `NVDA` | Security overview | Phase 2 |
| `TSLA CHART` | Chart | Phase 2 |
| `NVDA NEWS` | Ticker news | Phase 3 |
| `AMD OPT` | Options terminal | Phase 5 |
| `META FIN` | Financials | Phase 2 |
| `PLTR EVENTS` | Corporate events | Phase 4 |
| `MARKET` | Market monitor | Phase 1 mock fixture |
| `MOVERS` | Market movers | Phase 2 |
| `SCAN` | Scanner | Phase 6 |
| `WATCH` | Watchlists | Phase 2 |
| `EARNINGS` | Earnings center | Phase 4 |
| `COMPARE NVDA AMD AVGO` | Company comparison | Phase 7 |

Parser inputs are case-insensitive, whitespace-normalized, bounded in length, and fully validated. Extend the declarative registry in `lib/commands/parser.ts`; UI routing remains separate.

Keyboard shortcuts:

- `/` or `Cmd/Ctrl + K`: open the command bar
- `Esc`: close the active command overlay
- `M`: open the Phase 1 market fixture in the active panel
- `N`, `S`, `W`, `E`, `O`: recognize future news, scanner, watchlist, events, and options modules
- `?`: open the shortcut reference

Shortcuts do not fire while typing in inputs, selects, textareas, or editable content.

## Checks

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:render
pnpm prisma:validate
```

The production build and render test do not require an API key, live database, or network call.

## Project map

```text
app/                         Next.js routes, metadata, and global styles
components/terminal/         Shell, command palette, navigation, panels
lib/commands/                Parser and fuzzy ranking
lib/workspace/               Serializable layout tree and reducer
lib/massive/                 Server-only request client, schemas, adapters
lib/mock/                    Deterministic provider implementation
lib/cache/                   Cache contract, TTL policy, memory adapter
lib/errors/                  Typed and sanitized application errors
lib/env.ts                   Server environment validation
lib/market-data.ts           Mock/live provider selection
lib/prisma.ts                Lazy PostgreSQL client
types/                       Provider-neutral domain contracts
prisma/                      Schema and initial migration
tests/                       Parser, workspace, and render checks
```

## Roadmap

- Phase 2: stock search, overview, quote header, charting, watchlists, movers
- Phase 3: Benzinga news terminal and ticker news
- Phase 4: TMX events, catalysts, and earnings center
- Phase 5: options chain, contracts, Greeks, and research strategy builder
- Phase 6: scanner engine, RVOL, catalysts, and saved presets
- Phase 7: breadth, heatmap, patterns, timelines, and comparisons
- Phase 8: persistence UI, saved workspaces, settings, performance, and polish

Each phase should keep the provider boundary, explicit freshness labels, research-safety language, and no-trade-execution constraint established here.
