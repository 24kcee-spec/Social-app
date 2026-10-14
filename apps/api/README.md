# API

This package contains the backend for the social platform.

## Purpose
- Fastify-based API server
- PostgreSQL access via `pg`
- JWT/JWE support via `jose`
- database migration tooling
- health and readiness checks for local dev and deployment

## Key scripts
```bash
pnpm --filter @sp/api dev
pnpm --filter @sp/api start
pnpm --filter @sp/api migrate
pnpm --filter @sp/api test
pnpm --filter @sp/api typecheck
pnpm --filter @sp/api setup-check
```

## Main structure
```text
apps/api/
├── migrations/          # SQL migration files
├── src/
│   ├── auth/            # auth-related routes and logic
│   ├── community/       # community/feed functionality
│   ├── connections/     # follow / connection logic
│   ├── discovery/       # discovery/search logic
│   ├── messaging/       # messaging endpoints
│   ├── profile/         # profile endpoints
│   ├── safety/          # moderation / safety logic
│   ├── share/           # share / repost logic
│   ├── app.ts           # app construction
│   ├── cors.ts          # CORS config
│   ├── db.ts            # database access layer
│   ├── doctor.ts        # health/setup diagnostics
│   ├── env.ts           # env validation
│   ├── migrate.ts       # migration helpers
│   ├── migrate-cli.ts   # CLI migration runner
│   ├── server.ts        # HTTP server entrypoint
│   └── ...
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── README.md
```

## Notes
- The root README points to `pnpm --filter @sp/api dev` as the standard way to run the API.
- `src/server.ts` is the runtime entrypoint for local development.
- `src/migrate-cli.ts` is used to apply DB migrations.
- The repo includes `docs/supabase-phase*.sql` files, which suggests the API/database integration is designed for Supabase-style PostgreSQL workflows.

## Typical local flow
```bash
cp .env.example .env
pnpm install
pnpm --filter @sp/api migrate
pnpm --filter @sp/api dev
```

Then open:
- http://localhost:4000/health
- http://localhost:4000/ready
