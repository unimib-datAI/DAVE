# 01 — Server Side

_Status: draft (2026-09-04). Covers everything that executes in Node._

Reading order: [transport](#1-transport-layer) → [API surface](#2-api-surface-trpc-routers)
→ [service layer `lib/`](#3-service-layer-lib) → [data layer](#4-data-layer-libdb)
→ [auth](#5-auth) → [search--rag](#6-search--rag) → [external services](#7-external-services)
→ [known problems](#8-known-problems--refactor-targets).

---

## 1. Transport layer

There are **two** server entry styles:

### 1a. tRPC (the main API)

- One Next API route hosts the whole router:
  [`pages/api/trpc/[trpc].ts`](../../pages/api/trpc/%5Btrpc%5D.ts) →
  `trpcNext.createNextApiHandler({ router: appRouter })`. Body limit bumped to
  `900mb` (large document uploads go through here as base64 in JSON).
- Router assembly: [`server/routers/_app.ts`](../../server/routers/_app.ts)
  merges 11 sub-routers with the **tRPC v9 string-key builder**
  (`createRouter().merge('document.', documents)…`).
- [`server/context.ts`](../../server/context.ts) is **empty** —
  `trpc.router()` with no context. There is **no auth middleware**. Consequence:
  every procedure that needs identity declares `token: z.string().optional()` in
  its own input schema and calls `getRequestUser(token)` by hand.
- Client hooks: [`utils/trpc.ts`](../../utils/trpc.ts) =
  `createReactQueryHooks<AppRouter>()`. Client transport wired in
  [`pages/_app.tsx`](../../pages/_app.tsx) via `withTRPC` + `httpLink` (note:
  **not** `httpBatchLink` — no request batching) pointing at
  `${NEXT_PUBLIC_BASE_PATH}/api/trpc`.
- Permission errors: because `fetchJson` runs server-side, its 401/403 handler
  can't reach the browser. [`lib/permissionInterceptor.ts`](../../lib/permissionInterceptor.ts)
  monkey-patches `window.fetch` to read the tRPC v9 error envelope and pop an
  antd message.

### 1b. Plain Next API routes (`pages/api/`)

| Route | Purpose | Backed by |
|-------|---------|-----------|
| `auth/[...nextauth].ts` | NextAuth Keycloak OAuth (code flow), token refresh, logout | `next-auth` v4 |
| `auth/login.ts`, `auth/refresh.ts`, `auth/logout.ts`, `auth/me.ts` | Ported local email/JWT auth — **no UI caller**, parity for external consumers | `lib/documentsBackend/localAuth.ts` |
| `auth/keycloak-login.ts`, `keycloak-refresh.ts`, `keycloak-logout.ts` | Direct Keycloak password grant — **no UI caller**, not live-tested | `lib/documentsBackend/keycloakService.ts` |
| `generate.ts` | Streaming LLM proxy (OpenAI-compat). Standard or multi-agent path. | `openai` sdk + `lib/multiAgent.ts` |
| `find-matching-chunks.ts` | Sentence→chunk similarity for citation highlighting | `utils/stringUtilities.ts` |
| `upload-jobs/[jobId]/stream.ts` | SSE bridge: polls the Mongo job record every 1s, forwards diffs | `lib/documentsBackend/uploadJobController.ts` |
| `collection/[id]/download.ts` | Streams a `.zip` of a collection's documents via `archiver` | `CollectionController.streamAllDocuments` |
| `elastic/index/**` | **URL-compatible shims** for `qavectorizer`'s old ES routes so external callers (`backend/documents`) can retarget here | `lib/elasticAdmin.ts`, `lib/facetedSearch.ts` |
| `chroma/collection/[collectionName]/query.ts` | URL-compatible shim for `qavectorizer`'s old RAG route | `lib/vectorSearch.ts` |

---

## 2. API surface (tRPC routers)

`server/routers/` — 11 routers. Split by **how they get their data**:

### Native (own Mongo / ES / logic, via `lib/`)

| Router | LOC | Procedures | Talks to |
|--------|-----|-----------|----------|
| [`document.ts`](../../server/routers/document.ts) | **1847** | `getDocument`, `inifniteDocuments` _(sic)_, service CRUD (`getServices`/`createService`/…), configuration CRUD + `activateConfiguration`, `moveEntitiesToCluster`, `deleteDocument`, `deleteAnnotationSet`, `save`, `createDocument`, `deanonymizeKey(s)`, `getDocumentsByIds`, `fetchFacetDocuments`, `annotateAndUpload`, `createUploadJob`, `getUploadJob`, `getRecentUploadJobs`, `dismissUploadJob`, `cancelUploadJob` | Mongo (`DocumentController`, `Service`, `Configuration`), ES (`elasticAdmin`, `documentIndexer`), anonymization vault, **annotation pipeline** (spacyner/blink/indexer/nilpredictor/clustering/consolidation), `UploadJobController` |
| [`collection.ts`](../../server/routers/collection.ts) | 570 | `getAll`, `getById`, `getCollectionInfo`, `facetsCache`, `facetsCachePaginated`, `facetsCacheSearch`, `create`, `update`, `delete`, `getAllUsers`, `download` | Mongo (`CollectionController`, `FacetEntryModel`) |
| [`search.ts`](../../server/routers/search.ts) | 266 | `mostSimilarDocuments`, `facetedSearch`, `rateTheConversation`, `addAnnotations` | `lib/vectorSearch`, `lib/facetedSearch`, `lib/elasticAdmin`, `ChatController` (Mongo) |
| [`user.ts`](../../server/routers/user.ts) | 156 | `getAllUsers`, `createUser`, `updateUser`, `deleteUser` | Keycloak admin client (`keycloakService`) + Mongo `UserModel` |
| [`permission.ts`](../../server/routers/permission.ts) | 132 | `getCurrent`, `update` | Mongo `PermissionModel` (+ cache invalidation) |
| [`elastic.ts`](../../server/routers/elastic.ts) | 54 | `addAnnotations` | `lib/elasticAdmin` |

### Proxy (forward to the Python `API_BASE_URI` backend)

All use `fetchJson` + `getAuthHeader()` (HTTP Basic, `API_USERNAME`/`API_PASSWORD`).

| Router | Procedures | Upstream |
|--------|-----------|----------|
| [`annotation.ts`](../../server/routers/annotation.ts) | `getAnnotationDetails` | `POST {API_BASE_URI}/indexer/info` |
| [`infer.ts`](../../server/routers/infer.ts) | `getResults` | `POST {API_BASE_URI}/pipeline` |
| [`taxonomy.ts`](../../server/routers/taxonomy.ts) | `getZeroShotCandidates`, `getFewShotCandidates` | `{API_BASE_URI}/…` |
| [`review.ts`](../../server/routers/review.ts) | `getAllSources`, `getSource`, `getDocument`, `saveDocument` | `{API_BASE_URI}/…` |
| [`wikipedia.ts`](../../server/routers/wikipedia.ts) | `getData` | Wikipedia API |

> The proxy routers also re-export the shared `Document` / `Candidate` TS types
> that half the codebase imports from `server/routers/document.ts` — a circular
> smell (types live in a router file).

### Error handling convention

Resolvers `try/catch`, map `PermissionDeniedError → TRPCError({code:'FORBIDDEN'})`
and everything else → `INTERNAL_SERVER_ERROR` with the raw message. Consistent-ish
in native routers, absent in proxy routers.

---

## 3. Service layer (`lib/`)

### `lib/documentsBackend/` — the ported Express service

1:1 port of `backend/documents/src` (each file's header says which `.js` it came
from). This is where the "frontend is a mess" feeling concentrates: JS idioms,
`any` params, `console.log` tracing, `throw new Error(string)`.

| File | LOC | Role |
|------|-----|------|
| `documentController.ts` | 501 | Document + AnnotationSet + Annotation persistence; `getFullDocById` (giant projection whitelist, inline "WORKAROUND" blocks for anonymized previews / CF regex / section dedup) |
| `collectionController.ts` | 388 | Collection CRUD, per-facet cache (`FacetEntry`) bulk upserts, streaming document generators for export |
| `anonymization.ts` | 586 | Vault encrypt/decrypt of annotation mentions; pass-through when unconfigured |
| `keycloakService.ts` | 354 | Keycloak **admin** client — create/update/delete realm users, role assignment (not live-tested) |
| `localAuth.ts` | 173 | Local email/password → JWT + refresh token (no UI caller) |
| `keycloakAuth.ts` | 126 | `verifyKeycloakToken` (JWKS, RS256), `getRequestUser`, `getUserRoles` |
| `uploadJobController.ts` | 130 | `UploadJob` Mongo CRUD + progress patches |
| `permission.ts` | 94 | `requirePermission` / `requireRole` / `requireAdmin` + 60s in-memory cache |
| `httpError.ts` | 54 | `HTTPError` + `sendHTTPErrorResponse` for the plain API routes |
| `annotationController.ts`, `annotationSetController.ts`, `chatController.ts` | tiny | thin Mongo wrappers |

### `lib/` — search / indexing / RAG (ported from `qavectorizer` Python)

| File | LOC | Role |
|------|-----|------|
| `multiAgent.ts` | **1255** | 9-stage multi-agent RAG (query analyze → rewrite → orchestrate → retrieve → RRF fusion → coverage check → compress → answer → evaluate), streamed |
| `vectorSearch.ts` | 524 | Hybrid dense + full-text ES search with RRF; token-budget trimming; attaches `text_emb` per chunk |
| `facetedSearch.ts` | 264 | Builds the ES bool query for metadata/annotation facet filtering |
| `elasticAdmin.ts` | 222 | ES index + doc CRUD (create/get/delete index, mapping, index doc raw / from-mongo, delete doc, add annotations) |
| `documentIndexer.ts` | 144 | Full indexing pipeline: annotations → chunk (`RecursiveCharacterTextSplitter`) → embed → ES write |
| `documentRetrievers.ts` | 53 | Per-source fallback doc fetch — hardcoded map of `10.0.0.108:300x` pipeline addresses |
| `embedClient.ts` | 40 | The **only** remaining call into `qavectorizer`: `POST {API_INDEXER}/embed` |
| `tokenCounter.ts` | 23 | Lazy `@xenova/transformers` Phi-3.5 tokenizer for RAG budget checks |
| `elasticClient.ts` | 15 | `@elastic/elasticsearch` client singleton |
| `elasticIndexSettings.ts` | 57 | ES index mapping/settings definition |

### `lib/` — misc

| File | Role |
|------|------|
| `fetchJson.ts` | Fetch wrapper: JSON body handling, timeout via `AbortController`, 401/403 hook, auto `X-Collection-Id` injection from `localStorage` |
| `permissionInterceptor.ts` | Browser `window.fetch` patch for tRPC permission errors (see §1a) |
| `upload/` | `UploadJob` shared types + `isTerminalStatus` helper |
| `ner/core/` | Offset-model NER logic — **shared with the client** |
| `ner/markdown/` | Remark plugin + block splitter for rendering annotations over markdown |
| `db/` | see §4 |

---

## 4. Data layer (`lib/db`)

- [`connection.ts`](../../lib/db/connection.ts): `dbConnect()` — promise cached
  on `global.__mongooseCache` (Next hot-reload safe). Every controller method
  starts with `await dbConnect()`.
- Mongoose **6.3.2** (old), plus `mongoose-paginate-v2` and `mongoose-sequence`.
- Models ([`db/models/`](../../lib/db/models/)), barrel-exported from `index.ts`:

| Model | Notes |
|-------|-------|
| `Document` | `id` is a **SHA-256 content hash, not unique** — same file in two collections = two rows sharing `id`, disambiguated by `collectionId`. Text/annotation split across `AnnotationSet` + `Annotation`. |
| `AnnotationSet` / `Annotation` | keyed by `docId` / `annotationSetId`; some DTO helpers (`annotationSetDTO`, `annotationDTO`) |
| `Collection` | `id` = `crypto.randomUUID()`; `ownerId` + `allowedUserIds`; `config` blob |
| `FacetEntry` | per-(collection, facetType, displayNameLower) doc with `doc_ids[]` + `ids_ER[]`; replaces an older single-doc `FacetsCache` |
| `FacetsCache` | legacy, still deleted on collection delete |
| `Configuration` | user's annotation-pipeline config: new `steps[]` format or legacy `services` Map; `isActive` flag |
| `Service` | registered pipeline service endpoints + `serviceDTO` |
| `UploadJob` | durable upload progress: `files[]`, `status`, `statistics` |
| `User` | local users (email + hashed password + `role`); also mirrors Keycloak users |
| `Permission` | single doc, `[section][action] → allowedRoles[]`; `ensureDefaultPermissions()` seeds it |
| `RefreshToken` | for the local JWT auth path |
| `ChatRating` | RAG conversation feedback |

**Invariant to preserve in any refactor:** `Document` lookups must pass
`collectionId` whenever the caller knows it, or duplicates resolve arbitrarily.

---

## 5. Auth

Three overlapping mechanisms:

1. **NextAuth + Keycloak OAuth** (`auth/[...nextauth].ts`) — the only path the
   UI uses. JWT session strategy, manual refresh against Keycloak's token
   endpoint, `session.accessToken` exposed to the client. All cookies forced
   `secure: false`.
2. **Resolver-side verification** (`keycloakAuth.ts`) — `verifyKeycloakToken`
   checks RS256 against Keycloak JWKS, then **manually** asserts the issuer ends
   with `/realms/DAVE` (hardcoded, case-mismatched vs the `dave` default
   elsewhere). Maps claims → `RequestUser { sub, roles, client_roles, userId }`.
3. **Ported local JWT + direct-Keycloak-password routes** — `localAuth.ts` /
   `keycloakService.ts` behind `pages/api/auth/{login,refresh,me,keycloak-*}`.
   No UI caller; kept for external API consumers.

**Authorization**: `requirePermission(user, section, action)` in `permission.ts`
— `USE_AUTH=false` bypass → `admin` role bypass → else user roles must
intersect `Permission[section][action]`. 60s in-memory cache, invalidated by
`permission.update`.

---

## 6. Search & RAG

Two independent search stacks, both now in-process:

- **Faceted / keyword search** — `search.facetedSearch` / `pages/api/elastic/…/query`
  → `lib/facetedSearch.ts` builds an ES `bool` query (metadata facets,
  annotation facets, collection scoping, anonymized vs `text_deanonymized`
  field) → `elasticClient`.
- **RAG retrieval** — `search.mostSimilarDocuments` / `pages/api/chroma/…/query`
  → `lib/vectorSearch.ts`: embed query (`embedClient` → qavectorizer), hybrid
  dense (kNN over `chunks.vectors`) + BM25, RRF fusion, token-budget trim,
  fallback to `documentRetrievers` when a doc isn't in ES.
- **Generation** — `pages/api/generate.ts` streams from an OpenAI-compatible
  endpoint (`API_LLM`). `useMultiAgent:true` routes through
  `lib/multiAgent.ts`'s 9-stage pipeline instead; both stream plain text chunks
  back to the browser.
- **Indexing** — `lib/documentIndexer.ts` is called from `document` router on
  create/save: flattens annotation sets, chunks text, embeds, writes the ES doc
  with per-chunk vectors.

---

## 7. External services

| Service | Env var(s) | Still used for | Notes |
|---------|-----------|----------------|-------|
| `qavectorizer` (Python) | `API_INDEXER` | **embeddings only** (`/embed`) | search/indexing/RAG logic already ported out |
| `API_BASE_URI` backend (Python) | `API_BASE_URI`, `API_USERNAME`, `API_PASSWORD` | `infer`, `annotation`, `taxonomy`, `review` routers | HTTP Basic auth via `getAuthHeader()` |
| Annotation pipeline | `ANNOTATION_SPACYNER_URL`, `ANNOTATION_BLINK_URL`, `ANNOTATION_INDEXER_URL`, `ANNOTATION_NILPREDICTION_URL`, `ANNOTATION_NILCLUSTER_URL`, `ANNOTATION_CONSOLIDATION_URL` | `runAnnotateAndUpload` in `document.ts` | Ordered step list resolved from user `Configuration`; legacy slot-map fallback with hardcoded `http://spacyner:80/…` defaults |
| Per-source retrievers | `PIPELINE_ADDRESS`, `DEMO_PIPELINE_ADDRESS`, … (10+) | `documentRetrievers.ts` fallback | Hardcoded `10.0.0.108:300x` defaults |
| Keycloak | `KEYCLOAK_ISSUER`, `KEYCLOAK_ID`, `KEYCLOAK_SECRET`, `KEYCLOAK_ADMIN*` | auth + user admin | realm name inconsistency (`DAVE` vs `dave`) |
| LLM | `API_LLM`, `LLM_KEY`, `LLM_NAME` / `DEFAULT_MODEL` | generation | per-request `customSettings` override allowed |
| Anonymization vault | `ANONYMIZATION_ENDPOINT` | encrypt/decrypt mentions | optional; pass-through when unset |
| MongoDB | `MONGO` | everything | |
| Elasticsearch | `ELASTIC_HOST`, `ELASTIC_PORT`, `ELASTIC_INDEX` | search/indexing | |

---

## 8. Known problems & refactor targets

Ordered roughly by leverage.

1. **`document.ts` (1847 lines)** — split into: (a) thin tRPC procedures, (b) a
   `DocumentService` in `lib/`, (c) `AnnotationPipelineRunner` for
   `runAnnotateAndUpload` / `runCreateDocument` / `runSave`, (d) upload-job
   orchestration extracted from the resolver (currently a fire-and-forget async
   IIFE — move to a proper worker/queue abstraction so multi-instance is safe).
2. ✅ **tRPC context/middleware** — done with #3. `createContext` resolves the
   caller from headers; `token` is gone from every input schema;
   `authedProcedure` gates the routes that need a user.
3. ✅ **tRPC v9 → v11** — done, see [04-trpc-v11.md](./04-trpc-v11.md).
4. **`lib/documentsBackend/*` port cleanup** — give it real types (drop `any`),
   swap `throw new Error(string)` for typed errors, replace `console.*` with a
   logger, and align naming with `lib/` (`XxxController` object literals vs the
   rest of `lib/`'s function modules).
5. ✅ **Central config module** — done, see [02-config-module.md](./02-config-module.md).
   `lib/config/{server,public}.ts` replace every scattered `process.env` read
   in `server/`, `lib/`, `pages/api/`. Client-side call sites (`pages/*.tsx`,
   `components/`, `modules/`) are tracked there as follow-up, not done yet.
6. **Auth consolidation** — pick one story. If external consumers still need
   local JWT, move it behind an explicit `/api/external/*` namespace and document
   it; otherwise delete `localAuth.ts` + those routes. Fix the realm-name
   inconsistency.
7. **Proxy routers** — `infer` / `annotation` / `taxonomy` / `review` are the
   last things calling `API_BASE_URI`. Either port them (like `documents` and
   `qavectorizer` were) or formally declare them the stable external boundary
   and stop leaking their types into the client.
8. ✅ **Types in router files** — done, see [03-shared-types.md](./03-shared-types.md).
   Payload/domain types moved to `lib/types/`; ~66 client import sites repointed;
   `Candidate`/`User` collisions renamed. `AppRouter` stays in `_app.ts`.
9. **Multi-instance safety** — `cancelledUploadJobIds` Set + permissions cache +
   resolver-spawned loops all assume one process. Needed before any horizontal
   scaling.
10. **Build doesn't type-check** (`ignoreBuildErrors`) — a refactor target in
    itself; re-enabling it is the acceptance test for #4 and #8.

### Suggested module order for the refactor

1. ✅ Config module (#5) — landed, see [02-config-module.md](./02-config-module.md).
2. ✅ Types extraction (#8) — landed, see [03-shared-types.md](./03-shared-types.md).
3. ✅ tRPC v11 + real context (#3, #2) — landed, see [04-trpc-v11.md](./04-trpc-v11.md).
4. `document.ts` split (#1) — the biggest single win, easier now #3 is done. **Next up.**
5. `lib/documentsBackend` cleanup (#4) + re-enable type-checking (#10).
6. Auth consolidation (#6).
7. Proxy routers decision (#7).
8. Multi-instance (#9) — last, once the seams are clean.
