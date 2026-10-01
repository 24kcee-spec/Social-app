# social-platform (placeholder name)

Monorepo for the Social Connection Platform. See docs/product-definition.md and docs/decisions.md.

## Commands
- `pnpm install` - install everything
- `pnpm verify` - typecheck + all tests (run before every commit)
- `pnpm --filter @sp/api dev` - run the API on http://localhost:4000 (GET /health, GET /ready)
- `pnpm --filter @sp/api migrate` - apply SQL migrations (needs DATABASE_URL)

Secrets live in `.env` (git-ignored). Copy `.env.example` to start.
