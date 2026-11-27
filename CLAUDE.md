# DAVE

## Documentation rule

Every project must keep documentation of all its code, using **FumaDocs** (https://fumadocs.dev).

- The docs site lives in `docs/` (Next.js + fumadocs-mdx); pages are `docs/content/docs/*.mdx`, ordered in `docs/content/docs/meta.json`.
- Whenever code is added, changed or removed, update the matching docs page in the same session.
- Run it with `cd docs && pnpm dev`.

## Layout notes

- The app is the Next.js project in `frontend/` (pages router, tRPC v9, Mongo via mongoose). Backend logic that used to live in `backend/documents` and most of `backend/qavectorizer` now lives in `frontend/lib` and `frontend/server/routers`; qavectorizer only serves embeddings/reranking.
- `frontend/pages/collections/[id].tsx` is a stale duplicate of `frontend/pages/collections/[id]/index.tsx`; edit the latter.
