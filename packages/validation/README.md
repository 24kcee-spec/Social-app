# Validation

Shared validation package for the monorepo.

## Purpose
This package provides validation utilities and schemas for request data and shared app models.

## Typical responsibilities
- request schema validation
- data normalization
- input safety checks
- shared validation logic across web, mobile, and API

## Files
```text
packages/validation/
├── src/
├── package.json
├── tsconfig.json
└── README.md
```

## Why it matters
The repo uses the same validation package in API, auth-client, and profile-client, which keeps validation behavior consistent across the stack.
