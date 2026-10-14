# Social-app 🎉

> Better than instagram and tiktok

[![Repo size](https://img.shields.io/github/repo-size/24kcee-spec/Social-app)](https://github.com/24kcee-spec/Social-app)
[![Languages](https://img.shields.io/github/languages/top/24kcee-spec/Social-app)](https://github.com/24kcee-spec/Social-app)
[![License](https://img.shields.io/github/license/24kcee-spec/Social-app)](https://github.com/24kcee-spec/Social-app)

A polished, contributor-friendly monorepo for the Social Connection Platform — a TypeScript-first stack powering a web app (Next.js), mobile app (Expo/React Native) and a Fastify API. This README is designed to get a new developer from clone → running in under 5 minutes and point maintainers to the docs and key workflows.

Table of contents
- [Why this repo](#why-this-repo)
- [At a glance](#at-a-glance)
- [Quick start (5-minute setup)](#quick-start-5-minute-setup)
- [Project layout](#project-layout)
- [How it runs locally](#how-it-runs-locally)
- [Environments & secrets](#environments--secrets)
- [Testing & verification](#testing--verification)
- [CI / CD](#ci--cd)
- [Contributing & workflow](#contributing--workflow)
- [Architecture & docs](#architecture--docs)
- [Helpful commands](#helpful-commands)
- [Contact & handover](#contact--handover)

---

## Why this repo
Social-app is built as a monorepo to keep client and server contracts consistent and to accelerate cross-platform features (web + mobile). Shared packages (types, validation, auth/profile clients) enforce single sources of truth so UX and API remain synchronized.

## At a glance
- Primary language: TypeScript (≈95.9%)
- Minor languages: PowerShell (scripts), CSS
- Apps: web (Next.js), mobile (Expo/React Native), api (Fastify + Postgres)
- Shared packages: auth-client, profile-client, config, types, validation

---

## Quick start (5-minute setup)
1. Clone
```bash
git clone https://github.com/24kcee-spec/Social-app.git
cd Social-app
```
2. Install (pnpm is required)
```bash
# install pnpm if you don't have it: npm install -g pnpm
pnpm install
```
3. Copy env and add secrets
```bash
cp .env.example .env
# edit .env and set DATABASE_URL, SUPABASE_URL/KEY, or other provider keys
```
4. Run the API locally (dev)
```bash
pnpm --filter @sp/api dev
# visit http://localhost:4000/health and /ready
```
5. Run the Web app
```bash
pnpm --filter @sp/web dev
# visit http://localhost:3000
```
6. Run the Mobile app (Expo)
```bash
pnpm --filter @sp/mobile start
# then open on device or simulator via the Expo dev tools
```

Note: If you plan to run migrations first (recommended):
```bash
pnpm --filter @sp/api migrate
```

---

## Project layout (short)
```text
Social-app/
├── apps/
│   ├── api/        # Fastify API and migrations (server entry: apps/api/src/server.ts)
│   ├── web/        # Next.js frontend (app router under apps/web/app)
│   └── mobile/     # Expo React Native mobile client (entry: apps/mobile/App.tsx)
├── packages/       # Shared workspace packages
│   ├── auth-client/
│   ├── profile-client/
│   ├── config/
│   ├── types/
│   └── validation/
├── docs/           # Product docs, handover, SQL migration files
├── scripts/        # Automation / smoke scripts (PowerShell)
├── .github/        # CI/workflows
├── package.json    # workspace root scripts
└── tsconfig.base.json
```

Each app/package has its own README.md in the repo root for per-package details. See `docs/REPO_MAP.md` and `docs/ARCHITECTURE.md` for a guided tour.

---

## How it runs locally (detailed)
- API (Fastify)
  - entry: apps/api/src/server.ts
  - dev: pnpm --filter @sp/api dev (uses tsx)
  - migrations: pnpm --filter @sp/api migrate
  - health endpoints: GET /health, GET /ready

- Web (Next.js App Router)
  - entry: apps/web/app/page.tsx
  - dev: pnpm --filter @sp/web dev (runs on port 3000)

- Mobile (Expo)
  - entry: apps/mobile/App.tsx
  - dev: pnpm --filter @sp/mobile start

Shared packages are referenced via workspace:* in package.json files and are resolved by pnpm workspace.

---

## Environments & secrets
- Copy `.env.example` to `.env` and populate required keys (DATABASE_URL, SUPABASE keys, third-party API keys).
- `.env` is gitignored — never commit secrets.
- In CI (GitHub Actions) use repository secrets (Settings → Secrets) and map them to environment variables in workflows.
- packages/config centralizes env parsing — use it to learn expected variable names.

---

## Testing & verification
- Root verification script runs typecheck + tests across workspace:
```bash
pnpm verify
```
- Package-level test/type commands (examples):
```bash
pnpm --filter @sp/api test
pnpm --filter @sp/web typecheck
pnpm --filter @sp/mobile typecheck
```
- Tests use vitest in the API and packages (see package.json in each package for exact commands).

---

## CI / CD
- CI workflows live in `.github/workflows/`.
- Common CI steps to look for: install (pnpm), verify (typecheck & tests), build (web), and publish (if any).
- Keep secrets out of logs and rotate keys used in workflows when needed.

---

## Contributing & workflow
We follow a conventional branching & PR workflow. Key pointers:
- Run `pnpm verify` before opening a PR.
- Fill a short PR description: what changed, why, and any DB migration notes.
- If your change adds/changes DB schema, add migration SQL under `apps/api/migrations` and update docs if necessary.
- Update `docs/decisions.md` for major architectural changes.

Want a CONTRIBUTING.md? Run `@copilot` (I can add a polished CONTRIBUTING.md and a Day-1 checklist).

---

## Architecture & docs
- REPO_MAP: docs/REPO_MAP.md — full repo map and where to find things.
- ARCHITECTURE: docs/ARCHITECTURE.md — high-level Mermeid diagram + runtime flow.
- BUILD HANDOVER: docs/BUILD-HANDOVER.md — maintainer handover instructions.
- Product docs and security SQL are under docs/ (supabase-phase*.sql, product-definition.md, decisions.md).

---

## Helpful commands (cheat sheet)
- Install all: pnpm install
- Verify everything: pnpm verify
- API dev: pnpm --filter @sp/api dev
- API migrate: pnpm --filter @sp/api migrate
- Web dev: pnpm --filter @sp/web dev
- Mobile dev (Expo): pnpm --filter @sp/mobile start
- Run package tests: pnpm --filter <package> test

---

## Tips & gotchas
- Node version: check `.nvmrc` or package.json engines (>=22.13).
- If workspace packages don’t resolve, try `pnpm -w install` from repo root.
- PowerShell smoke scripts exist (scripts/*.ps1) and are useful for quick integration checks on Windows.
- Use `pnpm --filter <package> <script>` to run package-scoped scripts quickly.

---

## Aesthetic & meta
Thanks for visiting — this README is designed to be the single starting point for new contributors. If you prefer a shorter README or one with fewer badges, I can produce a compact variation.

Made with ❤️ by the Social-app team — Better than instagram and tiktok.
