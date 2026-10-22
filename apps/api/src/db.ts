import pg from "pg";

/** Builds pg pool config. Remote databases use TLS with certificate validation; local databases do not. sslmode is stripped so it cannot override our TLS policy. */
export function poolConfig(databaseUrl: string): pg.PoolConfig {
  const url = new URL(databaseUrl);
  const local = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname);
  url.searchParams.delete("sslmode");
  return {
    connectionString: url.toString(),
    ssl: local ? undefined : { rejectUnauthorized: true },
    max: 5,
    connectionTimeoutMillis: 5000,
  };
}

export function makePool(databaseUrl: string): pg.Pool {
  return new pg.Pool(poolConfig(databaseUrl));
}
