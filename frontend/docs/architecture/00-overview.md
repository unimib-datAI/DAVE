# 00 — Overview & Layering

_Status: draft (2026-09-04). Owner: refactor effort._

## What this app is

DAVE's `frontend/` is a **Next.js 16 (pages router) application** that is also,
increasingly, the **backend** for the DAVE product. Historically the UI was a
thin client over a set of Python microservices (`backend/documents`,
`backend/qavectorizer`, the annotation pipeline). Over the last few iterations
large parts of those services have been **ported into this package** as Node
code under `lib/`, so today the process is a hybrid:

- a React SPA (Emotion + antd v5 + HeroUI, Jotai for state)
- a tRPC **v9** API layer (`server/routers/*`) served from one Next API route
- a pile of Next API routes (`pages/api/*`) for auth, streaming, and
  URL-compatible service shims
- a Node "backend" in `lib/` — Mongoose data layer, Elasticsearch access,
  RAG/search, a multi-agent pipeline, auth, and controllers ported 1:1 from the
  old Express `backend/documents` service

## Process / deployment model

Single `next start` process (see [`Dockerfile`](../../Dockerfile)). It holds:

- an in-process Mongoose connection pool (cached on `global`, see
  [`lib/db/connection.ts`](../../lib/db/connection.ts))
- an in-process Elasticsearch client singleton
  ([`lib/elasticClient.ts`](../../lib/elasticClient.ts))
- **in-memory mutable state** that assumes a single instance:
  `cancelledUploadJobIds` set and the permissions cache in
  [`lib/documentsBackend/permission.ts`](../../lib/documentsBackend/permission.ts),
  plus fire-and-forget upload loops started inside tRPC resolvers. Horizontal
  scaling is not currently safe.

## Layer map

```
┌─────────────────────────────────────────────────────────────────────┐
│ Browser (SPA)                                                        │
│   pages/  ·  modules/  ·  components/         ← UI            (doc 03)│
│   atoms/  ·  */*Provider  ·  hooks/  ·  utils/trpc  ← state   (doc 02)│
└───────────────┬─────────────────────────────────────────────────────┘
                │  HTTP
┌───────────────▼─────────────────────────────────────────────────────┐
│ Next.js server (Node)                                        (doc 01)│
│                                                                     │
│  pages/api/trpc/[trpc].ts ──► server/routers/_app.ts                 │
│      document · collection · search · user · permission ·            │
│      annotation · infer · taxonomy · review · wikipedia · elastic    │
│                                                                     │
│  pages/api/auth/*        NextAuth (Keycloak) + ported local JWT auth │
│  pages/api/elastic/*     URL-compat shims  ─┐                        │
│  pages/api/chroma/*      URL-compat shims  ─┤                        │
│  pages/api/generate.ts   LLM streaming proxy│                        │
│  pages/api/upload-jobs/* SSE progress bridge│                        │
│                                             ▼                        │
│  lib/                                                                │
│   ├─ db/            Mongoose models + connection                     │
│   ├─ documentsBackend/  controllers ported from backend/documents    │
│   ├─ elasticClient / elasticAdmin / facetedSearch / vectorSearch     │
│   ├─ multiAgent / documentIndexer / documentRetrievers / embedClient │
│   └─ ner/           shared NER offset + markdown logic (also client) │
└───────┬───────────────────────────────┬────────────────┬────────────┘
        │                               │                │
   ┌────▼─────┐                  ┌───────▼──────┐   ┌─────▼────────────┐
   │ MongoDB  │                  │Elasticsearch │   │ External Python  │
   │          │                  │              │   │ services:        │
   └──────────┘                  └──────────────┘   │  - qavectorizer  │
                                                    │    /embed only   │
   ┌───────────────┐   ┌──────────────────────┐     │  - API_BASE_URI  │
   │ Keycloak      │   │ OpenAI-compat LLM     │     │    (pipeline,    │
   │               │   │ (API_LLM)             │     │    infer, tax,   │
   └───────────────┘   └──────────────────────┘     │    review, wiki) │
                                                    │  - annotation    │
   ┌────────────────────────┐                       │    pipeline      │
   │ Anonymization vault    │                       │    (spacyner,    │
   │ (ANONYMIZATION_ENDPOINT)│                      │    blink, …)     │
   └────────────────────────┘                       │  - per-source    │
                                                    │    retrievers    │
                                                    └──────────────────┘
```

## Tech-stack debt worth naming up front

| Thing | Current | Problem |
|-------|---------|---------|
| tRPC | v9.22 (`createReactQueryHooks`, `router().merge()`, `withTRPC`) | v9 is years-EOL; pairing it with Next 16 / React 19 is unsupported territory. Every router uses the string-key builder API. |
| Auth | NextAuth v4 + Keycloak OAuth, **plus** a ported local email/JWT path, **plus** direct-Keycloak password grant routes | Three code paths, only one used by the UI. `verifyKeycloakToken` hardcodes realm `DAVE`, `getRequestUser` default realm is `dave`. |
| Type safety | `next.config.js` sets `typescript.ignoreBuildErrors` and `eslint.ignoreDuringBuilds` | The build does not type-check. `lib/documentsBackend/*` is `any`-heavy (ported JS). |
| Multi-instance | in-memory job-cancel set, permissions cache, fire-and-forget resolver loops | Can't scale out; a redeploy drops in-flight upload jobs' cancel signals. |
| `document.ts` router | 1847 lines, mixes 30 procedures + pipeline orchestration + helpers | Needs to split into transport / service / pipeline. |
| Env sprawl | ~45 `process.env.*` reads across `server/` + `lib/` + `pages/api/`, no central config | No validation, defaults scattered (some point at unroutable IPs). |

## Cross-cutting concerns

- **Auth token flow**: browser gets a Keycloak access token via NextAuth
  session; the tRPC client passes it as a `token` field **in each procedure's
  input** (there is no tRPC context/middleware — `server/context.ts` is empty).
  Resolvers call `getRequestUser(token)` then `requirePermission(user, section,
  action)`.
- **`USE_AUTH=false` mode**: bypasses Keycloak verification, permission checks,
  and outbound Basic auth; identifies the user by an `X-Browser-ID`. Threaded
  through `getRequestUser`, `requirePermission`, `getAuthHeader`, `middleware.ts`.
- **Anonymization**: optional. When `ANONYMIZATION_ENDPOINT` is unset the code
  degrades to pass-through (documented in
  [`lib/documentsBackend/anonymization.ts`](../../lib/documentsBackend/anonymization.ts)).
- **`X-Collection-Id`**: [`lib/fetchJson.ts`](../../lib/fetchJson.ts) auto-injects
  the active collection id from `localStorage` on document/save calls.
- **NER offset logic** in [`lib/ner/`](../../lib/ner/) is imported by **both**
  server (indexer) and client (rendering) — it is the one genuinely shared
  module.

See [doc 01](./01-server-side.md) for the server detail.
