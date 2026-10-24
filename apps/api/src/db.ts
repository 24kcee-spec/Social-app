import pg from "pg";
import { readFileSync } from "node:fs";

/**
 * Remote databases always verify the certificate chain and hostname. Supply the
 * provider CA through DATABASE_CA_CERT_PATH when it is not in the system trust store.
 */
export function poolConfig(databaseUrl: string, ca?: string): pg.PoolConfig {
  const url = new URL(databaseUrl);
  const local = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname);
  // pg-connection-string can override the ssl object when these URL options exist.
  for (const key of ["ssl", "sslmode", "sslrootcert", "sslcert", "sslkey", "sslpassword"]) url.searchParams.delete(key);
  return {
    connectionString: url.toString(),
    ssl: local ? undefined : { rejectUnauthorized: true, ...(ca ? { ca } : {}) },
    max: 5,
    connectionTimeoutMillis: 5000,
  };
}

export function makePool(databaseUrl: string): pg.Pool {
  const caPath = process.env.DATABASE_CA_CERT_PATH?.trim();
  const ca = caPath ? readFileSync(caPath, "utf8") : undefined;
  return new pg.Pool(poolConfig(databaseUrl, ca));
}
