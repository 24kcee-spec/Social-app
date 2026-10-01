import { defineConfig } from "vitest/config";

// PGlite (Postgres in WASM) boots slowly on some machines; generous timeouts avoid false failures.
export default defineConfig({ test: { testTimeout: 60_000, hookTimeout: 60_000 } });
