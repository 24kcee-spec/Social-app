# Mobile

This package is the Expo React Native client for the app.

## Purpose
- Cross-platform mobile app experience
- Connects to the same shared packages as the web frontend
- Includes image upload / picker capabilities and local storage support

## Key scripts
```bash
pnpm --filter @sp/mobile start
pnpm --filter @sp/mobile android
pnpm --filter @sp/mobile ios
pnpm --filter @sp/mobile typecheck
```

## Main structure
```text
apps/mobile/
├── src/
│   ├── components/
│   ├── theme/
│   ├── App.tsx
│   ├── Community.tsx
│   ├── Connections.tsx
│   ├── Discover.tsx
│   ├── Messages.tsx
│   ├── SayHi.tsx
│   ├── auth.ts
│   ├── communityClient.ts
│   ├── connectionClient.ts
│   ├── discovery.ts
│   ├── messagingClient.ts
│   ├── profile.ts
│   └── ...
├── App.tsx
├── app.config.js
├── index.ts
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

It also includes Expo and React Native packages for mobile behavior, image handling, and async storage.

## Local run
```bash
pnpm install
pnpm --filter @sp/mobile start
```

## Notes
The structure mirrors the web app’s social flows:
- community
- discover
- messages
- profile and connections
- say-hi interactions
