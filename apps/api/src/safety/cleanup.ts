import type { SqlRunner } from "../migrate";

/** Idempotent external erasure. Only durable jobs created by account removal are processed. */
export function createAccountCleanupWorker(db: SqlRunner, options: {
  supabaseUrl: string; secretKey: string; fetchImpl?: typeof fetch;
}) {
  const base = new URL(options.supabaseUrl);
  if (base.protocol !== "https:") throw new Error("Account cleanup requires HTTPS");
  const request = async (path: string, method: string, body?: unknown) => {
    const response = await (options.fetchImpl ?? fetch)(`${base.origin}${path}`, {
      method,
      headers: { apikey: options.secretKey, authorization: `Bearer ${options.secretKey}`, "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(15_000),
      redirect: "error",
    });
    if (!response.ok && !(method === "DELETE" && response.status === 404)) throw new Error("External cleanup failed");
    return response;
  };

  return async () => {
    const jobs = await db.query<{ user_id: string }>(`select j.user_id::text from account_cleanup_jobs j join users u on u.id = j.user_id where u.status = 'deleted' and j.completed_at is null and j.next_attempt_at <= now() order by j.created_at limit 5`);
    for (const job of jobs.rows) {
      if (!/^[0-9a-f-]{36}$/i.test(job.user_id)) throw new Error("Invalid cleanup job");
      try {
        // Current profile uploads are flat under <user UUID>/. Re-list at offset zero
        // after each successful batch, so deleting files cannot skip later pages.
        for (let batch = 0; ; batch++) {
          if (batch >= 100) throw new Error("Cleanup batch limit reached");
          const result = await request("/storage/v1/object/list/profile-media", "POST", { prefix: `${job.user_id}/`, limit: 100, offset: 0, sortBy: { column: "name", order: "asc" } });
          const objects = await result.json() as { name: string; id: string | null }[];
          if (!Array.isArray(objects)) throw new Error("Invalid storage response");
          if (!objects.length) break;
          if (objects.some((o) => !o.id || typeof o.name !== "string" || !o.name || /[/\\]/.test(o.name) || o.name === "." || o.name === "..")) throw new Error("Unexpected storage path; manual cleanup required");
          await request("/storage/v1/object/profile-media", "DELETE", { prefixes: objects.map((o) => `${job.user_id}/${o.name}`) });
        }
        // Storage must be cleared before deleting the Auth owner record.
        await request(`/auth/v1/admin/users/${job.user_id}`, "DELETE");
        await db.query("update account_cleanup_jobs set completed_at = now(), attempts = attempts + 1 where user_id = $1", [job.user_id]);
      } catch {
        // Do not retain provider bodies/errors: they can include personal data.
        await db.query("update account_cleanup_jobs set attempts = attempts + 1, next_attempt_at = now() + interval '5 minutes' where user_id = $1", [job.user_id]);
      }
    }
  };
}
