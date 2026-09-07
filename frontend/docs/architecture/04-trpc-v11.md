# 04 — tRPC v9 → v11 migration

_Status: **DONE** (2026-09-07). Landed on branch `refactor/trpc-v11` in 5
commits. Briefing + spike notes kept below for context._

---

## Outcome

| | |
|---|---|
| **Commits** | `chore(next16)` config fixes → `build(trpc)` deps → `refactor(trpc) plumbing` → `refactor(trpc) routers` → `refactor(trpc) client` |
| **Deps** | `@trpc/{server,client,next,react-query}@11.18`, `@tanstack/react-query@5.102`, `typescript@5.7.3`; dropped `@trpc/react` + `react-query@3` |
| **`tsc`** | 254 → **245** errors (zero new; 9 pre-existing fixed as a side effect). Still `ignoreBuildErrors` per decision. |
| **`next build`** | passes (Turbopack, Next 16). |
| **Runtime** | not verified here — no backend/live app in this environment; user runs the real app. |

### What changed

- **`server/trpc.ts`** (new): `initTRPC.context<Context>().create()` →
  `router`, `publicProcedure`, `authedProcedure` (rejects a null `ctx.user`).
- **`server/context.ts`**: `createContext` resolves the caller **once** from
  the `Authorization: Bearer` / `x-browser-id` headers. The v9 pattern of
  `token: z.string().optional()` in every input + `getRequestUser(input.token)`
  by hand is **gone** — every input schema lost its `token` field.
- **`server/routers/*`** (10 routers, ~61 procedures): rewritten to the
  builder API. `_app.ts` now nests properly (`router({ document, taxonomy,
  … })`), which also fixed the old missing-dot bug on the taxonomy merge.
  Permission checks (`requirePermission(ctx.user, …)`) stay explicit in the
  resolvers.
- **`utils/trpc.ts`**: `createReactQueryHooks` → `createTRPCNext`. The access
  token rides an `Authorization` header sourced from a module-level holder
  (`setAuthToken`) kept fresh by `AuthWatcher` in `_app.tsx`.
- **`_app.tsx`**: `withTRPC(...)` → `trpc.withTRPC(MyApp)`; link/url/fetch
  config moved into `utils/trpc.ts`.
- **~33 client files**: `useQuery(['x.y', input], opts)` →
  `trpc.x.y.useQuery(input, opts)`; `useContext()` → `trpc.useUtils()`;
  `.invalidateQueries(['x.y'])` → `.x.y.invalidate()`.
- **react-query v3 → v5**: mutation `isLoading` → `isPending`; `cacheTime` →
  `gcTime`; `keepPreviousData: true` → `placeholderData: keepPreviousData`;
  `useInfiniteQuery` gained `initialCursor`; the handful of `useQuery`
  `onSuccess`/`onError` callbacks moved to `useEffect` (per decision).
- **Latent type bugs fixed** (surfaced by v11's real inference):
  `FacetedQueryHit.id: Number` → `number`; `.lean()` resolver results cast to
  `any` where the client relied on shapes Mongoose doesn't type.

### Follow-ups (not blocking)

- `elastic.ts` router migrated but still not mounted in `_app.ts` (unchanged
  from before — `search.addAnnotations` covers it).
- `middleware.ts` → `proxy.ts` rename still pending (Next 16 deprecation
  warning; deferred as its own change — see doc 04's config commit note).
- `permissionInterceptor.ts` was left as-is; its `window.fetch` patch reads
  the tRPC error envelope, which `httpLink` (still non-batched) keeps
  compatible — **verify one real 403 in the running app**.
- Re-enabling `ignoreBuildErrors` for `server/**` is now much more feasible
  (the server tree is clean); still off per the standing decision.

---

## 0. Spike results (2026-09-07)

Half-day spike on the dirty tree (reverted afterward): installed the full v11
stack, migrated the `wikipedia` router (1 procedure) + `createContext` + handler
+ `createTRPCNext` client + its one call site (`LInkPopover.tsx`), ran `tsc` and
`next build`.

**What we learned:**

| # | Finding | Consequence |
|---|---------|-------------|
| 1 | `@trpc/{server,client,next,react-query}@11.18` + `@tanstack/react-query@5.102` + `typescript@5.7.3` **install clean** on Next 16.1.6 / React 19.2 / pnpm 8. Only pre-existing peer noise (`react-beautiful-dnd`). | The Next-16 go/no-go risk is **cleared**. |
| 2 | **TypeScript 5.5.4 → 5.7.3: exactly zero new errors** (254 → 254, identical breakdown). | The forced TS bump is free. Not a risk. |
| 3 | The migrated `wikipedia` path (`server/trpc.ts`, `context.ts`, `_app.ts`, handler, `utils/trpc.ts`, `LInkPopover.tsx`) — **0 tsc errors, 0 Turbopack errors**. | The v11 patterns work here. `initTRPC.context<Context>()` + `publicProcedure`/`authedProcedure` + `createTRPCNext` + `httpLink` with a `headers()` reading a module-level token holder — all fine. |
| 4 | **Next 16 builds with Turbopack, which hard-fails on `Module not found` / missing exports.** `typescript.ignoreBuildErrors` only skips `tsc` — it does **not** make Turbopack tolerate a missing `useQuery` export. The spike build died with "79 errors", every one an un-migrated call site. | **Big-bang is structurally forced, not a preference.** The moment `utils/trpc.ts` drops the v9 hook exports, `next build` is red until *all* ~31 client files are converted. No incremental landing is possible. |
| 5 | Confirmed scope: **10 v9 routers** (incl. `elastic.ts`, forgotten in the first count) + `_app.ts` + `context.ts` + handler + `utils/trpc.ts` + `_app.tsx` (AuthWatcher wiring `setAuthToken`) + **~31 client files** + **2** direct `react-query` imports (`pages/annotation-configuration.tsx`, `modules/documents/DocumentsList.tsx`) → `@tanstack/react-query`. | — |
| 6 | The 254 baseline `tsc` errors are ~all HeroUI `Button`/`Text`/`Chip` prop mismatches + i18n translation-key strictness + Playwright `JSX` namespace. **None are tRPC-related.** | The migration's acceptance test is "254 → 254 (minus any it happens to fix), zero new", same as the last two passes. |
| 7 | Pre-existing **Next-16 config debt** surfaces on every build (not ours, but noise): `next.config.js` needs `experimental.emotion`→`compiler.emotion`, `images.domains`→`images.remotePatterns`, and drops unrecognised `serverActions`/`eslint` keys; `middleware.ts`→`proxy.ts` is deprecated; the **duplicate lockfile** (`DAVE/pnpm-lock.yaml` + `DAVE/frontend/pnpm-lock.yaml`) makes Turbopack pick the wrong workspace root. | Decide whether to fix these in the same branch (they're small) or separately. |

**Bottom line:** the upgrade is viable and the end-state patterns are proven. The
only real change from the briefing is that finding #4 removes options B/C/D — it
has to be one branch, done in one push, though it can still be **committed** in
stages (deps → plumbing → routers → client) for review sanity even if it can't
be *landed* in stages.

---

_Original briefing follows._

## TL;DR

This is not "bump a version". tRPC v9 → v11 is **four coupled rewrites**:

1. every router (`server/routers/*.ts`) — new builder API
2. the server handler — gains a real `createContext`
3. the client wiring (`_app.tsx` + `utils/trpc.ts`) — `withTRPC` → `createTRPCNext`, string-key hooks → proxy hooks
4. **react-query v3 → v5** — forced, because `@trpc/react@9` hard-pins `react-query@3` and `@trpc/react-query@11` requires `@tanstack/react-query@5`

Roughly **61 procedures across 11 routers**, **~31 client files / ~120 hook call
sites**, **111 `isLoading` references**, **33 `onSuccess/onError/onSettled`
callbacks**. All in a repo whose build doesn't type-check and which has no
running backend to test against here.

The good news: **no subscriptions** (`useSubscription` is exported but never
called), **no SSR/SSG tRPC** (`ssr: false`, no `createCaller`/ssg helpers), and
the shared-types extraction (doc 03) already made the routers thinner.

---

## 1. What v9 looks like in this repo

### Server — the string-key builder

```ts
// server/routers/_app.ts
export const appRouter = createRouter()
  .merge('document.', documents)
  .merge('taxonomy', taxonomy)   // ← note: no trailing dot, a pre-existing bug
  .merge('search.', search)
  // …8 more

// server/routers/search.ts
export const search = createRouter()
  .mutation('mostSimilarDocuments', {
    input: z.object({ query: z.string(), /* … */ token: z.string().optional() }),
    resolve: async ({ input }) => { /* … */ },
  })
```

- `server/context.ts` is `trpc.router()` — **no context type, no middleware.**
- Auth is smuggled: every protected procedure declares `token: z.string().optional()`
  in its own zod input and calls `getRequestUser(input.token)` by hand.
- Handler: `pages/api/trpc/[trpc].ts` = `createNextApiHandler({ router: appRouter })`,
  no `createContext`.

### Client — string tuple keys

```ts
// utils/trpc.ts
export const { useQuery, useMutation, useInfiniteQuery, useSubscription, useContext }
  = createReactQueryHooks<AppRouter>();

// call sites
useQuery(['collection.getAll', { token }], { enabled, retry: false });
useMutation(['document.save']);
useMutation(['infer.getResults'], { ssr: false });
const utils = useContext();                 // trpc context
utils.invalidateQueries(['document.getServices']);
```

- `_app.tsx`: `withTRPC<AppRouter>({ config, ssr: false })(MyApp)` with a single
  `httpLink` (deliberately **not** `httpBatchLink` — avoids 431s from big JWTs,
  and keeps the error envelope non-batched for `permissionInterceptor`).
- react-query **v3.39** (`react-query`, not `@tanstack/react-query`). Two files
  import it directly: `pages/annotation-configuration.tsx` (`useQueryClient`),
  `modules/documents/DocumentsList.tsx` (`InfiniteData` type).

### The bespoke pieces that touch the wire format

- **`lib/permissionInterceptor.ts`** — patches `window.fetch`, reads
  `body.error.message` / `body.error.data.httpStatus` out of the tRPC JSON
  envelope to raise antd notifications on 401/403. Transport-level, so it
  survives the client-API rewrite, but the envelope shape must be re-verified.
- **`utils/trpc.ts` `getJWTHeader`** — unused-ish helper, reads `USE_AUTH`.
- **`_app.tsx` `getTRPCHeaders`** — sends `X-Browser-ID` when auth is off.

---

## 2. What v11 requires

### 2a. Routers → the procedure builder

```ts
// server/trpc.ts  (new)
import { initTRPC, TRPCError } from '@trpc/server';
const t = initTRPC.context<Context>().create();
export const router = t.router;
export const publicProcedure = t.procedure;
export const authedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED' });
  return next({ ctx: { ...ctx, user: ctx.user } });
});

// server/routers/search.ts
export const searchRouter = router({
  mostSimilarDocuments: publicProcedure
    .input(z.object({ query: z.string(), /* … no more token */ }))
    .mutation(async ({ input, ctx }) => { /* ctx.user available */ }),
});

// server/routers/_app.ts
export const appRouter = router({
  document: documentRouter,
  taxonomy: taxonomyRouter,   // consistent nesting, fixes the missing-dot bug
  search: searchRouter,
  // …
});
```

Every `.query('name', { input, resolve })` becomes
`name: procedure.input(...).query(({ input, ctx }) => ...)`. ~61 of these.

### 2b. Real `createContext` + auth middleware

```ts
// server/context.ts
export async function createContext({ req }: CreateNextContextOptions) {
  const token = req.headers.authorization?.replace('Bearer ', '')
    ?? (req.headers['x-browser-id'] as string | undefined);
  const user = await getRequestUser(token).catch(() => null);
  return { user, token };
}
```

Then `token: z.string().optional()` is **deleted from every input schema**, and
resolvers read `ctx.user` / call `ctx.requirePermission(...)`. This is the
actual point of the migration — but it means every call site that currently
passes `{ token }` in the input must stop, and the client must send the token as
a **header** instead (`_app.tsx` link `headers()` reads the NextAuth session).

> ⚠️ Client components currently get the token from `useSession()` and pass it
> per-call. Moving it to a link header means the link needs access to the
> session — either via `getSession()` inside an async `headers()` fn, or a
> module-level holder updated by `AuthWatcher`. Design decision (see §5).

### 2c. Client wiring

```ts
// utils/trpc.ts
export const trpc = createTRPCNext<AppRouter>({
  config() {
    return {
      links: [httpLink({ url, headers: async () => ({ Authorization: `Bearer ${await getToken()}` }) })],
    };
  },
  ssr: false,
});

// call sites
trpc.collection.getAll.useQuery(undefined, { enabled, retry: false });
trpc.document.save.useMutation();
const utils = trpc.useUtils();
utils.document.getServices.invalidate();
```

`_app.tsx`: `export default trpc.withTRPC(MyApp)` (createTRPCNext still gives you
a `withTRPC`).

### 2d. react-query v3 → v5 (the sleeper cost)

`@tanstack/react-query@5` breaking changes that hit this code:

| v3 | v5 | Where it bites |
|----|----|----------------|
| `useQuery`'s `onSuccess`/`onError`/`onSettled` | **removed** | some of the 33 callback usages are on queries — must move to `useEffect` or a global `QueryCache` handler |
| `useMutation` `isLoading` | `isPending` | ~45 mutations, subset of 111 `isLoading` |
| `useQuery` `isLoading` | still exists but semantics shift (`isPending` is the "no data yet") | audit the 111 |
| `keepPreviousData: true` | `placeholderData: keepPreviousData` | check infinite-query pages |
| `cacheTime` | `gcTime` | grep |
| `useInfiniteQuery` | now requires `initialPageParam` + `getNextPageParam` signature change | 4 sites (`pages/search`, `pages/documents`, `DocumentsList`) |
| `react-query` package | `@tanstack/react-query` | 2 direct import sites + peer of everything |

### 2e. Next.js 16 peer-dep check

`@trpc/next@11` officially targets Next 13–15. Next **16.1.6** here is newer than
tRPC's test matrix. Expect to either get lucky or need a
`pnpm.overrides`/`peerDependencyRules` entry. Must be validated early — this is a
go/no-go for the whole plan.

---

## 3. Risk assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| No backend to test against here | High | Migrate + `tsc` + `next build` locally; you run the real app |
| Build doesn't type-check (`ignoreBuildErrors`) | High | This migration is the moment to flip it on for `server/` + `utils/trpc.ts` at least |
| react-query v5 behavioural changes (refetch, suspense, callbacks) | Medium | Audit the 33 callbacks + 111 `isLoading` explicitly, file-by-file |
| `permissionInterceptor` envelope drift | Low | httpLink (non-batch) envelope barely changed; re-verify one 403 by hand |
| Next 16 peer deps | Medium | Spike first (½ day): install, `next build`, minimal round-trip |
| Big-bang PR too large to review | Medium | Stage it — see §4 |

---

## 4. Migration path options

### Option A — Big-bang v11

One branch: all routers + context + client + react-query, land together.
- ➕ One coherent end state, no interop cruft, shortest calendar time if it goes well.
- ➖ Enormous un-reviewable diff; if the Next-16 peer issue is fatal you find out late; no partial value if we stop halfway.

### Option B — `interop()` staged (tRPC's official v9→v10 path, then v10→v11)

tRPC v10 shipped `appRouter.interop()` — v9 routers run **unchanged** under a v10
server while you convert them one at a time. v10 client proxy hooks and v9
string-key hooks can coexist during the transition. Then v10 → v11 is a small
hop (mostly react-query 4→5).
- ➕ Ship in small reviewable PRs; each router verifiable independently; value banked incrementally; Next-16 risk surfaced on PR 1.
- ➖ Two upgrades not one; interop layer is temporary code; react-query gets upgraded twice (3→4, then 4→5); more total hours.

### Option C — Add `createContext` to **v9 first**, defer v11

v9 *does* support context (`trpc.router<Context>()` + `createContext` on the
handler). We could kill the token-smuggling — the actual pain — now, under v9,
and do the full v11 jump later as its own project.
- ➕ 80% of the benefit for ~20% of the work; unblocks the `document.ts` split immediately; no react-query upheaval.
- ➖ Still on an EOL library; doesn't fix the Next-16-on-v9 fragility; "later" tends to become "never".

### Option D — Spike then decide

½–1 day: new branch, install `@trpc/*@11` + `@tanstack/react-query@5`, migrate
**one** small router (`wikipedia` or `infer`, 1 procedure) end-to-end incl.
client, run `next build` + one manual request. Then pick A/B/C with real
information about the Next-16 friction and the per-router cost.

---

## 5. Decisions needed

1. **Path**: A (big-bang), B (interop staged), C (context-on-v9 now, v11 later),
   or D (spike first)?
2. **`createContext` token source on the client**: async `getSession()` inside
   the link's `headers()`, vs a module-level token holder kept fresh by
   `AuthWatcher`? (Affects how invasive the client change is.)
3. **`USE_AUTH=false` / `X-Browser-ID`**: keep sending it as a header and have
   `createContext` synthesise the anon user from it (current behaviour), or
   simplify now that context is centralised?
4. **Type-checking**: flip `ignoreBuildErrors` off for `server/**` +
   `utils/trpc.ts` as part of this (recommended — it's the safety net), or keep
   it off and rely on manual `tsc`?
5. **react-query query-level callbacks**: where a `useQuery` uses
   `onSuccess/onError`, move to `useEffect` per-site, or install one global
   `QueryCache({ onError })` for the error-notification cases?
6. **Scope of the first PR** (if B or D): which router goes first?
