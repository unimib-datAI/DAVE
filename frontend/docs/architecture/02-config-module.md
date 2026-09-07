# 02 — Config module

_Status: done (2026-09-04, first module landed)._

## What changed

Every non-test `process.env.*` read in `server/`, `lib/`, and `pages/api/` (≈55
distinct variables, ~90 call sites) now goes through one of two files:

- [`lib/config/server.ts`](../../lib/config/server.ts) — `serverConfig`, grouped
  by domain (`app`, `mongo`, `elastic`, `llm`, `embeddings`, `anonymization`,
  `keycloak`, `nextAuth`, `localAuth`, `adminSeed`, `externalBackend`,
  `annotationPipeline`, `sourceRetrievers`). Server-only — never import from
  browser code. Also re-exports `publicConfig` so server files need one import.
  Ships `assertServerConfig()` for a future explicit startup check (not wired
  in yet — see below).
- [`lib/config/public.ts`](../../lib/config/public.ts) — `publicConfig`, the
  `NEXT_PUBLIC_*` vars + `NODE_ENV`. Safe to import anywhere (browser,
  `middleware.ts`, server). Every field stays a **literal**
  `process.env.NEXT_PUBLIC_FOO` reference so Next's build-time inlining still
  works.
- [`lib/config/index.ts`](../../lib/config/index.ts) — barrel that only
  re-exports `publicConfig`, so a stray `@/lib/config` import from a component
  can't accidentally pull in empty server config.

This was a **behavior-preserving mechanical migration**: every default value
was carried over as-is, verified by diffing `tsc --noEmit` error counts
before/after (258 → 258, zero new errors) on every touched file. Scope was
deliberately `server/`, `lib/`, `pages/api/` only — see "Left for later" below.

## Two intentional exceptions (documented, not silent)

- **Keycloak defaults unified.** `KEYCLOAK_ISSUER`/`KEYCLOAK_ID` previously had
  three different inline defaults across `[...nextauth].ts` (`''`),
  `keycloakAuth.ts` (`.../realms/dave`, `dave-client`), and `keycloakService.ts`
  (`.../realms/dave`, `dave_client`). All three now read
  `serverConfig.keycloak.issuer` / `.clientId`, defaulting to the
  `.env.sample` values (`.../realms/DAVE`, `dave_client`). In every real
  deployment these env vars are set, so the default was already dead code —
  but flagging it here in case a dev environment was relying on it. The
  underlying `DAVE` vs `dave` realm-case inconsistency (doc 01 §8 item 6) is
  **not** fixed by this — that needs an actual decision, not just
  centralization.
- **`NEXT_PUBLIC_BASE_PATH` in `pages/api/auth/[...nextauth].ts`.** The old
  code built `pages.signIn` as `` `${process.env.NEXT_PUBLIC_BASE_PATH}/sign-in` ``
  — if the var was unset this produced the literal string
  `"undefined/sign-in"`. Now uses `publicConfig.basePath`, which normalizes an
  unset/`/`-valued basePath to `''`, producing `/sign-in`. A genuine (small)
  bug fix that fell out of centralizing the value.

Everything else is a 1:1 substitution.

## Left for later (tracked, not done)

- **`pages/*.tsx` `getServerSideProps`** — ~15 call sites read `LOCALE` and
  `USE_AUTH` directly (with an existing `'eng'` vs `'ita'` default split — see
  `serverConfig.app.locale`'s doc comment). These belong to the UI module
  (doc 04), not the server module, so left untouched here.
- **Client components** — `NEXT_PUBLIC_USE_AUTH`, `NEXT_PUBLIC_SYSTEM_PROMPT`,
  `NEXT_PUBLIC_QUESTIONS`, etc. in `components/`, `modules/`, `hooks/`,
  `utils/auth.ts`, `pages/_app.tsx`. `publicConfig` already covers all of
  these — migrating the call sites is mechanical and is a good first task for
  whoever picks up doc 04 (UI module).
- **`utils/trpc.ts`'s `getJWTHeader`** reads `USE_AUTH` (not
  `NEXT_PUBLIC_USE_AUTH`) but is imported by client code, where that var is
  always `undefined`. Left as-is — this is a pre-existing latent bug, not
  something to paper over silently inside the config module; it should be
  fixed explicitly when doc 03 (state management) touches the tRPC client
  setup.
- **`assertServerConfig()` is not called anywhere yet.** Wire it into a
  startup path (e.g. the top of `pages/api/trpc/[trpc].ts`, or a custom
  server entry) once we're ready to fail fast on missing `MONGO`/
  `ELASTIC_INDEX` instead of failing lazily deep in a resolver.
- **`.env.sample` was not touched.** It's stale relative to the full var list
  in `serverConfig`/`publicConfig` (e.g. missing `LLM_KEY`, `LLM_NAME`,
  `DEFAULT_MODEL`, `ADMIN_EMAIL`/`ADMIN_PASSWORD`, `JWT_SECRET`,
  `BCRYPT_SALT_ROUNDS`, `NEXT_PUBLIC_QUESTIONS`, `NEXT_PUBLIC_SYSTEM_PROMPT`,
  `NEXT_PUBLIC_DOCS_BASE_URL`, `NEXT_PUBLIC_LLM_NAME`, per-source retriever
  addresses). Worth a pass once the client-side vars are migrated too, so it
  can be regenerated from the two config files rather than hand-audited again.

## How to extend this

Adding a new env var: add it to the right group in `serverConfig` (or to
`publicConfig` if it's `NEXT_PUBLIC_*`), with a one-line doc comment saying
what it's for and what the default means. Never read `process.env.*` directly
outside `lib/config/*` again — that's now the invariant this module exists to
enforce; a future lint rule (`no-restricted-syntax` on `process.env` outside
`lib/config/`) would make it mechanical to keep true.
