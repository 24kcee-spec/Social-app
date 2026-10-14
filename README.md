# Social-app 🚀

> Better than Instagram and TikTok.

A social platform monorepo built with TypeScript, Next.js, Expo, and Fastify.

<p align="center">
  <img src="https://img.shields.io/github/repo-size/24kcee-spec/Social-app" alt="Repo size" />
  <img src="https://img.shields.io/github/languages/top/24kcee-spec/Social-app" alt="Top language" />
  <img src="https://img.shields.io/github/license/24kcee-spec/Social-app" alt="License" />
</p>

Social-app is a full-stack social product in one monorepo. It includes:

- Web app: Next.js frontend
- Mobile app: Expo + React Native
- API: Fastify backend
- Shared packages: config, types, validation, auth, profile tooling
- Docs and migration assets for product, delivery, and DB work

---

## Why this project exists

The goal is to create a modern, social-first platform with a clean product experience across web and mobile while keeping the codebase maintainable through a monorepo structure.

It is organized so that:

- the API owns the backend logic
- the web and mobile apps share common domain contracts
- shared validation and types reduce drift across products
- docs are close to the codebase for easier onboarding and delivery

---

## Tech stack

### Frontend
- Next.js
- React
- TypeScript

### Mobile
- Expo
- React Native
- TypeScript

### Backend
- Fastify
- TypeScript
- PostgreSQL / Supabase-style architecture

### Shared tooling
- pnpm workspaces
- TypeScript workspace config
- Vitest for tests

---

## Quick start

### 1) Clone the repository

```bash
git clone https://github.com/24kcee-spec/Social-app.git
cd Social-app
```

### 2) Install dependencies

```bash
npm install -g pnpm
pnpm install
```

### 3) Set up environment variables

```bash
cp .env.example .env
```

Then update `.env` with the required values such as database and provider settings.

### 4) Run the API

```bash
pnpm --filter @sp/api dev
```

### 5) Run the web app

```bash
pnpm --filter @sp/web dev
```

### 6) Run the mobile app

```bash
pnpm --filter @sp/mobile start
```

---

## Project structure

```text
Social-app/
├── apps/
│   ├── api/             # Backend server
│   ├── web/             # Next.js frontend
│   └── mobile/          # Expo / React Native app
├── packages/
│   ├── auth-client/     # Auth client utilities
│   ├── profile-client/  # Profile-related helpers
│   ├── config/          # Shared config helpers
│   ├── types/           # Shared TypeScript types
│   └── validation/      # Shared validation logic
├── docs/                # Handover, decisions, SQL, product docs
├── scripts/             # Smoke & automation scripts
├── .github/             # GitHub workflows
├── .env.example
├── .editorconfig
├── .gitignore
├── .nvmrc
├── .prettierrc
├── package.json
├── pnpm-lock.yaml
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── README.md
├── smoke-next-phase.ps1
└── ...
```

---

## Monorepo breakdown

### apps/api
Responsible for backend services, migrations, and API endpoints.

Key commands:

```bash
pnpm --filter @sp/api dev
pnpm --filter @sp/api migrate
pnpm --filter @sp/api test
pnpm --filter @sp/api typecheck
pnpm --filter @sp/api setup-check
```

Important files:

- `apps/api/src/server.ts`
- `apps/api/src/app.ts`
- `apps/api/src/migrate-cli.ts`
- `apps/api/src/doctor.ts`
- `apps/api/migrations/`

### apps/web
Responsible for the website UI and product pages.

Key commands:

```bash
pnpm --filter @sp/web dev
pnpm --filter @sp/web build
pnpm --filter @sp/web start
pnpm --filter @sp/web typecheck
```

Important files:

- `apps/web/app/page.tsx`
- `apps/web/app/layout.tsx`
- `apps/web/app/community.tsx`
- `apps/web/app/messages.tsx`
- `apps/web/app/discover.tsx`

### apps/mobile
Responsible for the mobile app experience across devices.

Key commands:

```bash
pnpm --filter @sp/mobile start
pnpm --filter @sp/mobile android
pnpm --filter @sp/mobile ios
pnpm --filter @sp/mobile typecheck
```

Important files:

- `apps/mobile/App.tsx`
- `apps/mobile/src/Community.tsx`
- `apps/mobile/src/Discover.tsx`
- `apps/mobile/src/Messages.tsx`
- `apps/mobile/src/auth.ts`

### packages/*
These are shared workspace packages used by apps.

- `@sp/auth-client` — auth helpers and Supabase integration
- `@sp/profile-client` — profile related logic
- `@sp/config` — config/env helpers
- `@sp/types` — shared domain types
- `@sp/validation` — shared validation logic

---

## Developer workflow

### Run everything together

```bash
pnpm install
pnpm verify
```

`pnpm verify` runs project-wide typecheck and tests.

### Typical local flow

```bash
cp .env.example .env
pnpm install
pnpm --filter @sp/api migrate
pnpm --filter @sp/api dev
pnpm --filter @sp/web dev
pnpm --filter @sp/mobile start
```

---

## Environment variables

Copy the example file:

```bash
cp .env.example .env
```

Then set the required values for your local environment. These typically include:

- database connection details
- Supabase credentials
- platform/service secrets
- any app-specific runtime settings

Do not commit `.env` files.

---

## Testing and quality checks

At the repo root:

```bash
pnpm verify
```

This is the main verification command used by the monorepo.

Package-level checks:

```bash
pnpm --filter @sp/api test
pnpm --filter @sp/auth-client test
pnpm --filter @sp/profile-client test
```

---

## Documentation

This repo includes a full documentation set for contributors and maintainers:

- `docs/REPO_MAP.md` — repository map
- `docs/ARCHITECTURE.md` — architecture overview
- `docs/BUILD-HANDOVER.md` — build and handover notes
- `docs/decisions.md` — engineering decisions
- `docs/handover.md` — project handoff docs
- `docs/incident-playbook.md` — incident flow
- `docs/product-definition.md` — product context

---

## Features in this repo

The app structure suggests product domains such as:

- profile
- authentication
- messaging
- connections
- community/social feed
- discovery
- safety / moderation
- sharing/reporting

---

## Useful commands

```bash
# install everything
pnpm install

# verify project-wide
pnpm verify

# run API
pnpm --filter @sp/api dev

# run web app
pnpm --filter @sp/web dev

# run mobile app
pnpm --filter @sp/mobile start

# build web
pnpm --filter @sp/web build

# apply migrations
pnpm --filter @sp/api migrate
```

---

## Notes

- Node version is defined in `.nvmrc` and package engine settings.
- The monorepo uses pnpm workspaces for package linking.
- PowerShell smoke scripts are present in `scripts/` for validation flows.
- The repo is still in active product-build mode, so docs are intentionally detailed to support onboarding and delivery.

---

## Contributing

We welcome contributions. Before opening a PR:

- run `pnpm verify`
- keep changes scoped and clear
- add migration files when the schema changes
- update docs when architecture or workflow changes

---

## License

This project is open for development and contribution under the repository default license.

---

## Final note

This project is designed to be a full-stack social platform with a clean separation of responsibilities across web, mobile, API, and shared packages.

If you want, I can also turn this into a more premium GitHub landing page version with:

- a hero banner
- a feature grid
- a better “why use this” section
- a stronger product branding tone
- a shorter, more polished developer-focused version
