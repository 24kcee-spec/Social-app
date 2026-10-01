import { fileURLToPath } from "node:url";

/** Loads <repo>/.env into process.env (existing variables win). Missing file is fine. */
export function loadDotEnv(): void {
  try {
    process.loadEnvFile(fileURLToPath(new URL("../../../.env", import.meta.url)));
  } catch (err) {
    if ((err as { code?: string }).code !== "ENOENT") throw err;
  }
}
