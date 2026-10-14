# Profile Client

Shared profile client for the monorepo.

## Purpose
This package contains reusable logic for profile-related data access and updates used across the app ecosystem.

## Package metadata
```json
{
  "name": "@sp/profile-client",
  "dependencies": {
    "@sp/types": "workspace:*",
    "@sp/validation": "workspace:*"
  }
}
```

## Typical responsibilities
- profile fetch/update helpers
- user profile data transformation
- profile validation integration
- client-side access for both mobile and web apps

## Files
```text
packages/profile-client/
├── src/
├── package.json
├── tsconfig.json
└── README.md
```

## Scripts
```bash
pnpm --filter @sp/profile-client typecheck
pnpm --filter @sp/profile-client test
```
