# 03 — Shared types

_Status: done (2026-09-07)._

## The problem

`server/routers/*.ts` exported two unrelated kinds of thing:

1. **The tRPC contract** — `AppRouter` (`typeof appRouter`) in `_app.ts`. This is
   how the client gets end-to-end type inference; it belongs in the server.
2. **Plain data-shape types** — `type Document = {...}`, `EntityAnnotation`,
   `Cluster`, `FacetedQueryOutput`, … Hand-written descriptions of API payloads.
   No reason to live in a router file.

**~66 client files** imported category 2 straight out of `@/server/routers/*`.
That coupled every NER component, provider, and page to server route modules —
so a client build pulled the router files (and transitively Mongoose, the
controllers, `@elastic/elasticsearch`, …) into its module graph. It also made
`server/get-auth-header.ts → utils/shared.ts → server/routers/document.ts` a
genuine **circular import between server modules**.

## What changed

New folder [`lib/types/`](../../lib/types/), one file per domain, mirroring the
router split:

| File | Types |
|------|-------|
| [`document.ts`](../../lib/types/document.ts) | `Document`, `Cluster`, `AnnotationSet`, `LinkingCandidate`, `AdditionalAnnotationProps`, `EntityAnnotation`, `SectionAnnotation`, `GetDocumentsDoc`, `GetPaginatedDocuments` |
| [`search.ts`](../../lib/types/search.ts) | `FacetedQueryHit`, `HitMetadata`, `HitAnnotation`, `Facet`, `FacetedQueryOutput`, `DocumentChunk`, `DocumentWithChunk` |
| [`taxonomy.ts`](../../lib/types/taxonomy.ts) | `SpecializationCandidate` |
| [`review.ts`](../../lib/types/review.ts) | `GetDocumentProps`, `SourceDoc`, `GetSourceProps`, `Source` |
| [`permission.ts`](../../lib/types/permission.ts) | `DAVEPermissions` |
| [`collection.ts`](../../lib/types/collection.ts) | `Collection`, `CollectionUser`, `collectionDocInfo` |
| [`user.ts`](../../lib/types/user.ts) | `KeycloakUser` |
| [`index.ts`](../../lib/types/index.ts) | barrel (`export *` from all of the above) |

- **`EntityAnnotation` / `SectionAnnotation` / `AdditionalAnnotationProps`** went
  into `lib/types/document.ts`, which imports the generic `Annotation<T>` from
  [`lib/ner/core/types.ts`](../../lib/ner/core/types.ts). One-directional:
  `lib/ner/core` stays generic rendering primitives, `lib/types/document` is the
  DAVE domain model on top.
- Routers now **import their payload types back** from `lib/types/*` (`import
  type { Document } from '@/lib/types/document'`) instead of defining them.
- All ~66 client import sites were repointed `@/server/routers/x` →
  `@/lib/types/x`. `@/server/routers/_app` (the `AppRouter` contract) is
  unchanged.

### Name collisions resolved

Two pairs of same-named, unrelated types existed. Renamed so the barrel
(`export *`) is unambiguous and greps are clean:

| Was | Now | Why |
|-----|-----|-----|
| `Candidate` (document.ts) — entity-linking / BLINK output | `LinkingCandidate` | 19 sites |
| `Candidate` (taxonomy.ts) — taxonomy specialization output | `SpecializationCandidate` | 3 sites |
| `User` (collection.ts) — Mongo `{userId,email,name}` | `CollectionUser` | 1 site (`collection.ts` internal) |
| `User` (user.ts) — Keycloak `{id,email,roles,…}` | `KeycloakUser` | 1 site (`pages/admin`) |

## Scope decisions (what did NOT move)

Per the agreed "move only shared types + their transitive deps" rule, these
stayed in their router file because nothing outside that one router imports
them: `MostSimilarDocument`, `GetSimilarDocument(Response)`,
`AddAnnotationsResponse` (search.ts); `GetSourcesProps`, `PostSaveDocumentProps`
(review.ts); `GetAnnotationDetails` (annotation.ts); `GetDataProps`
(wikipedia.ts). `document.ts`'s `GetDocumentsDoc` moved (it's a dep of
`GetPaginatedDocuments`) but the router itself no longer references it directly.

`Collection` + `CollectionUser` moved even though only `collectionDocInfo` is
imported externally — they're canonical domain entities and the collision-rename
decision named `CollectionUser` explicitly.

## Verification

- `tsc --noEmit` error count: **258 → 254** (4 pre-existing errors *fixed* as a
  side effect of the `Candidate` disambiguation; zero new errors; no error
  references `lib/types/`).
- `eslint` clean on all touched files; `prettier --check` clean on `lib/types/*`.
- Behavior-preserving: types moved verbatim (except the two renames). No
  resolver logic touched.

## Follow-ups this unblocks

- **tRPC v11 upgrade** (next module) — the router files are now much thinner and
  no longer the source of truth for client-facing types, so the v9→v11 builder
  migration touches less.
- **Domain-model doc (06)** — `lib/types/` is the skeleton. Deepening it means
  documenting invariants (e.g. `Document.id` is a non-unique content hash) and
  reconciling the hand-written shapes against what resolvers actually return
  (the build still doesn't type-check that).
- A lint rule (`no-restricted-imports` on `@/server/routers/*` except `_app`)
  would keep client code from drifting back.
