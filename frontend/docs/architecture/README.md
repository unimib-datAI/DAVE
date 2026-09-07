# DAVE Frontend — Architecture Docs

This folder is the living architecture reference for the `frontend/` package. It
is built up **incrementally** as we refactor the app module by module. Each
document describes one slice of the system: what it does today, what talks to
what, where the seams are, and what the target shape is.

## How to read this

Start with the layer maps, then drill into a module doc when you touch it.

| # | Document | Status | Covers |
|---|----------|--------|--------|
| 00 | [Overview & layering](./00-overview.md) | draft | The whole picture: process model, layers, tech stack, cross-cutting concerns |
| 01 | [Server side](./01-server-side.md) | draft | Everything that runs in Node: tRPC routers, API routes, `lib/`, data layer, auth, RAG/search, external services |
| 02 | [Config module](./02-config-module.md) | done | `lib/config/` — the env-var refactor, what moved where, what's still pending |
| 03 | [Shared types](./03-shared-types.md) | done | `lib/types/` — types pulled out of `server/routers/*` so the client stops importing from server route modules |
| 04 | [tRPC v9 → v11](./04-trpc-v11.md) | briefing | What the upgrade actually involves here + the decisions to make before starting |
| 05 | Frontend — state management | _todo_ | Jotai atoms, the `*Provider` reducer pattern, tRPC client cache, URL/query state |
| 06 | Frontend — UI | _todo_ | `pages/`, `modules/`, `components/`, layout/skeleton system, design-system usage |
| 07 | Domain model | _todo_ | Deepen `lib/types/` into a documented domain model: Document / AnnotationSet / Annotation / Collection / FacetEntry / Configuration / Permission — shapes and invariants |

## Refactoring tracker

The goal: **clean separation of logical modules** — server vs client, and within
the client, state vs UI. We move one module at a time, documenting it here as we
go so the docs stay current with the code.

### Legend
`⬜ not started` · `🟨 in progress` · `✅ done`

### Server-side modules

| Module | State | Notes |
|--------|-------|-------|
| Central config (`lib/config/`) | ✅ | Landed 2026-09-04. See [02-config-module.md](./02-config-module.md) |
| Shared types (`lib/types/`) | ✅ | Landed 2026-09-07. Types out of `server/routers/*`; ~66 client import sites repointed; `Candidate`/`User` name collisions resolved. See [03-shared-types.md](./03-shared-types.md) |
| tRPC infra (v9 → v11) | 🟨 | Spike done ([04-trpc-v11.md §0](./04-trpc-v11.md)): stack installs clean on Next 16, TS bump is free, v11 patterns proven. Turbopack forces one-shot big-bang. Ready to execute on user's go. |
| `server/routers/*` boundary cleanup | ⬜ | Routers mix transport concerns, business logic, and external-service orchestration. `document.ts` is 1.8k lines |
| `lib/documentsBackend/*` (ported Express service) | ⬜ | Controllers ported from `backend/documents`. Naming + error handling inconsistent with rest of app |
| Data layer (`lib/db`) | ⬜ | Mongoose models + connection. Mostly clean; needs typed DTOs and to stop leaking `any` |
| Auth (NextAuth + Keycloak + local JWT) | ⬜ | Three overlapping auth paths; local JWT path has no UI caller |
| Search / RAG (`lib/vectorSearch`, `facetedSearch`, `multiAgent`) | ⬜ | Ported from `qavectorizer` Python. `multiAgent.ts` is 1.2k lines |
| External pipeline orchestration (annotation pipeline, infer, taxonomy, review, wikipedia) | ⬜ | Still proxied to the Python `API_BASE_URI` backend via `fetchJson` + Basic auth |
| Elastic/Chroma compat API routes | ⬜ | `pages/api/elastic/*`, `pages/api/chroma/*` — URL-compatible shims for external callers |
| Upload job pipeline | ⬜ | `createUploadJob` runs a fire-and-forget async loop inside a tRPC resolver |

### Frontend state modules

| Module | State | Notes |
|--------|-------|-------|
| _pending doc 05_ | ⬜ | Also finishes the config migration: client `NEXT_PUBLIC_*` call sites → `publicConfig` |

### Frontend UI modules

| Module | State | Notes |
|--------|-------|-------|
| _pending doc 06_ | ⬜ | |

## Conventions for these docs

- Describe **what is**, then **what should be** — keep them visually separate.
- Link code with repo-relative paths so they stay clickable.
- When a refactor lands, update the relevant doc **in the same PR** and flip the
  tracker row.
