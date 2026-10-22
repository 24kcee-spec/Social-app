import pg from "pg";

/**
 * Builds pg pool config. Local databases do not use TLS. Remote databases use TLS,
 * but certificate-chain verification remains temporarily disabled until the deployed
 * Supabase pooler CA configuration is verified. Do not ship this to a broader public
 * launch without configuring and testing a trusted CA.
 */
export function poolConfig(databaseUrl: string): pg.PoolConfig {
  const url = new URL(databaseUrl);
  const local = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname);
  url.searchParams.delete("sslmode");
  return {
    connectionString: url.toString(),
    ssl: local ? undefined : { rejectUnauthorized: false },
    max: 5,
    connectionTimeoutMillis: 5000,
  };
}

export function makePool(databaseUrl: string): pg.Pool {
  return new pg.Pool(poolConfig(databaseUrl));
}
