# Sidle

Current implementation, validation and remaining release work: [release handover](Documents/PLATFORM_RELEASE_HANDOVER.md), [status](docs/status.md) and [NUST hosting](ops/nust/README.md).

> People. Moments. Possibilities.

Sidle is the codebase for a social connection product spanning web, mobile, and API layers. The current focus is on the core social experience: profiles, community, discover, connections, messaging, and safer sharing/reporting flows, with a shared design system and domain contracts across apps.

## What this repo includes

- Web app: Next.js + React for the product experience
- Mobile app: Expo + React Native for Android/iOS coverage
- API: Fastify backend with health/readiness checks and migration tooling
- Shared packages: auth, profile helpers, validation, shared types, and design tokens
- Monorepo tooling: pnpm workspaces and TypeScript project config

---

## Current architecture

```text
Social-app/
├── apps/
│   ├── api/            # Fastify backend and server logic
│   ├── mobile/         # Expo React Native app
│   └── web/            # Next.js frontend
├── packages/
│   ├── auth-client/    # Auth utilities
│   ├── config/         # Shared config helpers
│   ├── design-tokens/  # Design tokens and design-system primitives
│   ├── profile-client/  # Profile-related helpers
│   ├── types/          # Shared domain types
│   └── validation/     # Shared validation logic
├── docs/               # Project docs and delivery notes
├── DESIGN.md           # Current design system and UI rules
├── .env.example
├── .gitignore
├── .nvmrc
├── .prettierrc
├── package.json
├── pnpm-lock.yaml
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── README.md
└── scripts/
```

---

## Tech stack

### Web
- Next.js
- React
- TypeScript

### Mobile
- Expo
- React Native
- TypeScript

### API
- Fastify
- PostgreSQL-ready architecture
- JWT/JWE support via `jose`
- `pg` client for database access

### Shared tooling
- pnpm workspaces
- TypeScript
- Vitest for tests
- `@sp/design-tokens` for consistent UI primitives

---

## Quick start

### 1) Clone the repo

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

Then update `.env` with the values required by the API and app configuration.

### 4) Run the backend

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

## Common commands

```bash
# install dependencies
pnpm install

# typecheck all workspaces
pnpm typecheck

# run tests across the monorepo
pnpm test

# verify the repo
pnpm verify

# run the API
pnpm --filter @sp/api dev

# run the web app
pnpm --filter @sp/web dev

# run the mobile app
pnpm --filter @sp/mobile start
```

---

## Product focus right now

This repo is not just a generic starter app. The current implementation is centered around social product flows, including:

- profiles and identity
- connections and follow logic
- community and discovery experiences
- messaging and conversations
- sharing/reporting actions
- moderation and safety-oriented UX
- consistent cross-platform design system

The design direction is documented in `DESIGN.md`, which defines the actual implementation rules and token system used in the app.

---

## Project structure keys

- `apps/web/` — Next.js frontend and product UI
- `apps/mobile/` — Expo mobile app
- `apps/api/` — Fastify backend, DB access, health checks, migrations
- `packages/design-tokens/` — design system tokens
- `packages/types/` — shared domain models and DTOs
- `packages/validation/` — common validation rules
- `packages/auth-client/` — auth integration helpers
- `packages/profile-client/` — profile functions and client logic
- `docs/` — repository and delivery notes

---

## Notes

- The monorepo uses `pnpm` workspaces.
- Node version is set in `.nvmrc`.
- The app is actively being built and refined around core social product flows.
- The repo contains implementation-focused docs and design guidance rather than a placeholder marketing README.

---

## Contributing

When making changes, keep the work aligned with the current social product goals and shared contracts across the monorepo.

Recommended checks before submitting work:

```bash
pnpm verify
```
