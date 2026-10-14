# Types

Shared TypeScript types for the monorepo.

## Purpose
This package defines common domain models and interfaces used across apps and shared packages.

## Typical responsibilities
- user types
- auth/session types
- profile models
- request/response DTO contracts
- shared app domain contracts

## Files
```text
packages/types/
├── src/
├── package.json
├── tsconfig.json
└── README.md
```

## Why it matters
Using a shared types package avoids drift between the web app, mobile app, and API, so the contract between client and server stays consistent.
