# Sidle

Sidle is a social connection platform with a web app, a React Native mobile app, and a Fastify API. The repository is organized as a pnpm monorepo and currently targets the core social product experience: profiles, discovery, communities, connections, messaging, and moderation.

> People. Moments. Possibilities.

## Repository overview

This monorepo contains:

- apps/web — Next.js web app
- apps/mobile — Expo + React Native Android/iOS app
- apps/api — Fastify backend and database access layer
- packages/* — shared packages for auth, config, types, validation, and design tokens
- docs/ and Documents/ — implementation notes, release artifacts, and product docs
- supabase/ — database-related SQL and project artifacts
- scripts/ — repo automation and verification scripts

## Tech stack

### Web
- Next.js
- React
- TypeScript

### Mobile
- Expo
- React Native
- TypeScript
- Expo Image Picker / Notifications / constants

### API
- Fastify
- TypeScript
- PostgreSQL-ready integration via pg
- JWT/JWE support via jose
- migration tooling for database changes

### Shared tooling
- pnpm workspaces
- TypeScript
- Vitest for test execution
- shared design tokens and validation packages

## Current status

This repository is actively under development as a social product, not a placeholder starter app.

The codebase includes:
- app shell and product screens for web and mobile
- backend routes and service logic for social actions
- shared validation and typed contracts across packages
- mobile Android build setup via Expo EAS

Important: the mobile app is configured for Expo/EAS Android builds, including preview APK generation, but it is not yet a fully finalized production store release. Production builds require additional project configuration, signing, and environment setup.

## Requirements

- Node.js 22+
- pnpm 9.x
- PostgreSQL-compatible database for API work
- Expo/EAS account for Android remote builds

## Quick start

### 1) Clone

```bash
git clone https://github.com/24kcee-spec/Social-app.git
cd Social-app
```

### 2) Install dependencies

```bash
npm install -g pnpm
pnpm install
```

### 3) Configure environment variables

Copy the example environment file:

```bash
cp .env.example .env
```

Then update `.env` with the values required for the app and API. The mobile app also validates public HTTPS URLs and required EAS config during Android remote builds.

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

## Common commands

```bash
# install all dependencies
pnpm install

# typecheck all workspaces
pnpm typecheck

# run tests across the monorepo
pnpm test

# run repo verification
pnpm verify

# API
pnpm --filter @sp/api dev
pnpm --filter @sp/api migrate
pnpm --filter @sp/api test

# Web
pnpm --filter @sp/web dev

# Mobile
pnpm --filter @sp/mobile start
pnpm --filter @sp/mobile typecheck
```

## Mobile Android build notes

The mobile app at `apps/mobile` is configured for Expo builds using `eas.json` and `app.config.js`.

The repo includes:
- Expo app configuration
- Android package metadata
- EAS build profiles
- a preview APK flow for internal testing

Production Android builds require additional setup, including:
- Expo project linking
- EAS project ID
- configured public HTTPS URLs
- valid Supabase and API environment variables
- final Android package name
- signing configuration for release builds

For preview/internal APK builds, the expected flow is:

```bash
cd apps/mobile
pnpm dlx eas-cli login
pnpm dlx eas-cli build --platform android --profile preview
```

This is for test builds and is not the same as a production Play Store release.

## Project structure

```text
Social-app/
├── apps/
│   ├── api/             # Fastify backend and database logic
│   ├── mobile/          # Expo React Native mobile app
│   └── web/             # Next.js web frontend
├── packages/
│   ├── auth-client/     # auth helpers
│   ├── config/          # shared config
│   ├── design-tokens/   # design system tokens
│   ├── profile-client/  # profile helpers
│   ├── types/           # shared domain types
│   └── validation/      # shared validation rules
├── docs/                # project docs and delivery notes
├── Documents/           # release and product documentation
├── supabase/            # database/project SQL definitions
├── scripts/             # automation and verification scripts
├── .env.example
├── .gitignore
├── .nvmrc
├── .prettierrc
├── DESIGN.md
├── README.md
├── package.json
├── pnpm-lock.yaml
├── pnpm-workspace.yaml
├── tsconfig.base.json
└── .github/
```

## Product focus

The current product direction centers on:
- profiles and identity
- community and discovery
- connections and follow logic
- messaging and chat
- social sharing and moderation
- cross-platform consistency via shared design tokens

## Notes

- The repo uses pnpm workspaces.
- Node version is pinned by `.nvmrc`.
- The project is intentionally implementation-focused rather than a template project.
- API and mobile config validation expect real environment values, especially for remote Android builds.

## Contributing

When making changes, keep them aligned with the cross-platform social product goals and the shared contracts used by the web, mobile, and API apps.

Before submitting work, run:

```bash
pnpm verify
```
