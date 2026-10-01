import pg from "pg";

/** Builds pg pool config. Remote databases (Supabase) use TLS; local ones do not. sslmode is stripped so our ssl option is the single source of truth. */
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
