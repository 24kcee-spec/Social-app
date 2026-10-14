# Web

This package is the Next.js frontend for the social platform.

## Purpose
- App Router frontend (`app/` directory)
- Product UI pages for social interactions such as:
  - community
  - connections
  - discover
  - messages
  - say hi
  - report/share modals
- Shared access to auth, profile, types, and validation packages

## Key scripts
```bash
pnpm --filter @sp/web dev
pnpm --filter @sp/web build
pnpm --filter @sp/web start
pnpm --filter @sp/web typecheck
```

## Main structure
```text
apps/web/
├── app/
│   ├── community.tsx
│   ├── connections.tsx
│   ├── discover.tsx
│   ├── globals.css
│   ├── layout.tsx
│   ├── messages.tsx
│   ├── page.tsx
│   ├── report-modal.tsx
│   ├── reset/
│   ├── say-hi.tsx
│   ├── share-modal.tsx
│   └── ...
├── lib/
├── next.config.mjs
├── package.json
├── tsconfig.json
└── README.md
```

## Dependencies
This app uses the workspace packages:
- `@sp/auth-client`
- `@sp/profile-client`
- `@sp/types`
- `@sp/validation`

It also depends on:
- `next`
- `react`
- `react-dom`

## Local run
```bash
pnpm install
pnpm --filter @sp/web dev
```

The app runs on port `3000` via the script in `package.json`.

## Overview of the UI
The page files suggest a social product with core flows like:
- home feed / landing page
- community discovery
- messaging and notifications
- connections/following
- sharing/reporting interactions
