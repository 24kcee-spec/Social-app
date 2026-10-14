# Repository Map — Social-app (Detailed)

A clear, easy-to-follow map of the repository to help new contributors and maintainers find code, docs, and run the project.

## What this repo is (short)
A TypeScript monorepo for a social platform (web, mobile, and API) with shared packages and docs for build/handover and security/DB migrations.

## Quick start (short path to run locally)
1. Clone the repo:
   - git clone https://github.com/24kcee-spec/Social-app.git
2. Install dependencies:
   - pnpm install
3. Copy environment file and add secrets:
   - cp .env.example .env
   - Fill in DATABASE_URL and other secrets in `.env`.
4. Run the API (dev):
   - pnpm --filter @sp/api dev
5. Verify (typecheck + tests):
   - pnpm verify

See `README.md` for more commands.

## Top-level structure (annotated)

```text
Social-app/
├── .github/                 # GitHub workflows and automation
├── apps/                    # Application projects (api, web, mobile)
│   ├── api/                 # Backend API (server, migrations)
│   ├── web/                 # Web frontend (likely Next.js or similar)
│   └── mobile/              # Mobile client (React Native/Expo or similar)
├── packages/                # Shared packages (clients, types, validation)
│   ├── auth-client/         # Auth helper client used by apps
│   ├── profile-client/      # Profile-related client utilities
│   ├── config/              # Centralized configuration utilities
│   ├── types/               # Shared TypeScript types and interfaces
│   └── validation/          # Validation schemas & helpers (zod/joi/Yup)
├── docs/                    # Documentation, handover notes, SQL migrations
├── scripts/                 # Helper scripts (smoke tests, automation)
├── .editorconfig
├── .env.example
├── .gitattributes
├── .gitignore
├── .nvmrc
├── .prettierrc
├── README.md
├── package.json
├── pnpm-lock.yaml
├── pnpm-workspace.yaml
├── smoke-next-phase.ps1     # top-level PowerShell automation script
├── tsconfig.base.json
└── ...
```

### How the pieces fit together
- apps/api is the runtime server providing HTTP endpoints and migrations; it depends on shared types and clients in packages/*.
- apps/web and apps/mobile are consumers of the API; they import shared types and clients to keep behaviour consistent.
- packages/* contain reusable code (auth, configuration, types, validation). These are versioned inside the workspace and published or referenced locally via pnpm workspace.
- docs/ contains handover notes, product definition, incident playbook, and SQL migration/security scripts for Supabase.

## Files and directories (detailed)

Top-level files
- README.md — Setup and high-level commands. (Contains the `pnpm` commands and reference to docs.)
- package.json — Root workspace configuration and scripts. Use `pnpm` workspace filters to run package-specific commands.
- pnpm-workspace.yaml — Lists workspace packages or globs used by pnpm.
- pnpm-lock.yaml — Lockfile for dependencies.
- tsconfig.base.json — Base TypeScript settings extended by packages/apps.
- .env.example — Sample environment variables. Copy to `.env` and fill secrets.
- smoke-next-phase.ps1 — PowerShell script used for smoke testing across phases.

apps/
- apps/api/
  - Contains the API server. Commands referenced in README: `pnpm --filter @sp/api dev` and `pnpm --filter @sp/api migrate`.
  - Look for: package.json, src/ (server entry), migration scripts (migrations/ or prisma/supabase SQL), and health/readiness endpoints (GET /health, GET /ready).
- apps/web/
  - Web frontend. Look for a framework-specific structure (next.config.js, pages/ or app/ for Next.js).
- apps/mobile/
  - Mobile client. Look for expo/React Native config or Android/iOS folders.

packages/
- packages/auth-client/ — Utilities for authentication flows shared by web/mobile.
- packages/profile-client/ — Utilities around profile data fetching/updates.
- packages/config/ — Centralized configuration helpers. Read this for common env var names and defaults.
- packages/types/ — Shared TypeScript types and interfaces used across apps.
- packages/validation/ — Validation schemas used by API and clients (keeps validation consistent).

scripts/
- smoke-auth.ps1 — PowerShell script exercising auth flows.
- smoke-phase10-share.ps1 — Phase-specific smoke script for sharing features.
- smoke-phase12-mobile.ps1 — Phase-specific smoke script for mobile.
- (Top-level smoke-next-phase.ps1 also available.)

docs/ (selected files)
- BUILD-HANDOVER.md — Detailed build and handover instructions (useful for new maintainers).
- decisions.md — Architectural decisions, tradeoffs, and rationale.
- handover.md — Handover notes and responsibilities.
- incident-playbook.md — Steps to follow during incidents.
- product-definition.md — Product goals and feature definition.
- supabase-phase*.sql — SQL scripts for Supabase security/migrations across phases.
- REPO_MAP.md — This file (updated). Use it as the single source of truth for repo layout.

.github/
- workflows/ — CI workflows. Check these for test, build, and release automation.

## Environment & secrets (what to set)
- Copy `.env.example` to `.env`.
- Common env vars you should find in `.env.example`: DATABASE_URL (required for migrations), Supabase keys, external API keys, and any local-only flags used in dev.
- Never commit `.env` — it's git-ignored. Use a secret manager for CI (GitHub Actions secrets).

## Common commands (extracted from repo)
- Install: pnpm install
- Run all checks: pnpm verify
- Run API locally: pnpm --filter @sp/api dev
- Apply DB migrations: pnpm --filter @sp/api migrate
- Run workspace script for a package (example): pnpm --filter @sp/web dev

## Recommended next improvements (low-friction)
1. Add a CONTRIBUTING.md in docs/ with a checklist for running the app, PR conventions, and how to add a new package or app.
2. Add a short architecture diagram (SVG/PNG) in docs/ and reference it from README.
3. Create README.md files inside apps/api, apps/web, apps/mobile, and each package with package-specific dev commands and entrypoints.
4. Add badges to README for build status, coverage, and workspace integrity.

## Where I looked (evidence)
- README.md
- docs/* (BUILD-HANDOVER.md, decisions.md, handover.md, incident-playbook.md, product-definition.md, supabase SQL files)
- packages/* (auth-client, config, profile-client, types, validation) — directories present in repository
- apps/* (api, web, mobile) — directories present in repository
- scripts/* (smoke-*.ps1) — automation scripts found
- .github/workflows/ — CI workflows directory present

---

If you'd like, I can now:
- Add individual README.md files inside each apps/* and packages/* with run instructions and important file pointers (I can draft them and add as PR or direct commit).
- Generate a simple ASCII diagram or Mermaid diagram and include it in docs/ARCHITECTURE.md.


Generated and updated: docs/REPO_MAP.md
