# Config

Shared configuration helpers for the monorepo.

## Purpose
This package centralizes configuration logic so the app and packages can read consistent environment variables and runtime settings.

## Package metadata
```json
{
  "name": "@sp/config",
  "dependencies": {
    "@sp/types": "workspace:*"
  }
}
```

## Typical responsibilities
- reading `.env` values
- validating runtime settings
- shared config defaults for API and clients
- keeping environment-based settings in one place

## Files
```text
packages/config/
├── src/
├── package.json
├── tsconfig.json
└── README.md
```

## Usage
This package is consumed by the API and other workspace packages where environment configuration needs to be consistent.
