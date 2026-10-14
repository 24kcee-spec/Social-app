# Auth Client

Shared auth client for the monorepo.

## Purpose
This package exposes authentication-related client logic used by the web and mobile apps.

## Package metadata
```json
{
  "name": "@sp/auth-client",
  "dependencies": {
    "@sp/validation": "workspace:*",
    "@supabase/supabase-js": "^2.45.0"
  }
}
```

## Typical responsibilities
- sign in / sign up flows
- session handling
- auth state helpers
- integration with Supabase JS client

## Files
```text
packages/auth-client/
├── src/
├── package.json
├── tsconfig.json
└── README.md
```

## Usage
```ts
import { someAuthHelper } from '@sp/auth-client';
```

## Scripts
```bash
pnpm --filter @sp/auth-client typecheck
pnpm --filter @sp/auth-client test
```
