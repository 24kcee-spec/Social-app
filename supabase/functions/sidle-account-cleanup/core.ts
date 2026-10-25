interface CleanupOptions {
  projectUrl: string;
  serviceKey: string;
  workerToken: string;
  fetchImpl?: typeof fetch;
}

const json = (body: unknown, status = 200) => Response.json(body, { status });
async function sameToken(left: string, right: string): Promise<boolean> {
  const encode = new TextEncoder();
  const [a, b] = await Promise.all(
    [left, right].map(
      async (value) => new Uint8Array(await crypto.subtle.digest('SHA-256', encode.encode(value))),
    ),
  );
  let difference = 0;
  for (let i = 0; i < a!.length; i++) difference |= a![i]! ^ b![i]!;
  return difference === 0;
}

/** Server-only, bounded and idempotent. Callers never supply a target account. */
export function createCleanupHandler(options: CleanupOptions) {
  return async (request: Request): Promise<Response> => {
    if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
    if (!options.workerToken || !options.serviceKey || !options.projectUrl.startsWith('https://'))
      return json({ error: 'worker_unavailable' }, 503);
    const bearer = /^Bearer\s+(\S+)$/i.exec(request.headers.get('authorization') ?? '')?.[1] ?? '';
    if (!bearer || !(await sameToken(bearer, options.workerToken)))
      return json({ error: 'unauthorized' }, 401);

    const call = async (path: string, method = 'GET', body?: unknown) => {
      const response = await (options.fetchImpl ?? fetch)(
        options.projectUrl.replace(/\/+$/, '') + path,
        {
          method,
          headers: {
            apikey: options.serviceKey,
            authorization: `Bearer ${options.serviceKey}`,
            'content-type': 'application/json',
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
          signal: AbortSignal.timeout(15_000),
          redirect: 'error',
        },
      );
      if (!response.ok && !(method === 'DELETE' && response.status === 404))
        throw new Error('provider_request_failed');
      return response;
    };
    try {
      if(new URL(request.url).searchParams.get('dryRun')==='true'){
        const due=encodeURIComponent(new Date().toISOString());
        const response=await call(`/rest/v1/account_cleanup_jobs?select=user_id,users!inner(status)&completed_at=is.null&next_attempt_at=lte.${due}&users.status=eq.deleted&limit=5`);
        const jobs=await response.json();if(!Array.isArray(jobs))throw new Error('invalid_job_response');
        return json({dryRun:true,dueAccountJobs:jobs.length,limit:5});
      }
      await call('/rest/v1/rpc/sidle_platform_retention', 'POST', {});
      const mediaResponse = await call('/rest/v1/rpc/sidle_media_cleanup_batch', 'POST', {});
      const media = (await mediaResponse.json()) as { id: string; path: string }[];
      if (
        !Array.isArray(media) ||
        media.some((asset) => !/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.[a-z0-9]+$/i.test(asset.path))
      )
        throw new Error('invalid_media_cleanup');
      if (media.length)
        await call('/storage/v1/object/sidle-social-media', 'DELETE', {
          prefixes: media.map((asset) => asset.path),
        });
      const due = encodeURIComponent(new Date().toISOString());
      const response = await call(
        `/rest/v1/account_cleanup_jobs?select=user_id,attempts,users!inner(status)&completed_at=is.null&next_attempt_at=lte.${due}&users.status=eq.deleted&order=created_at&limit=5`,
      );
      const jobs = (await response.json()) as { user_id: string; attempts: number }[];
      if (!Array.isArray(jobs)) throw new Error('invalid_job_response');
      let completed = 0,
        failed = 0;
      for (const job of jobs) {
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(job.user_id))
          throw new Error('invalid_job');
        try {
          for (const bucket of ['profile-media', 'sidle-social-media']) {
            for (let batch = 0; ; batch++) {
              if (batch >= 10) throw new Error('batch_limit');
              const list = await call('/storage/v1/object/list/' + bucket, 'POST', {
                prefix: `${job.user_id}/`,
                limit: 100,
                offset: 0,
                sortBy: { column: 'name', order: 'asc' },
              });
              const objects = (await list.json()) as { name: string; id: string | null }[];
              if (!Array.isArray(objects)) throw new Error('invalid_storage_response');
              if (!objects.length) break;
              if (
                objects.some(
                  (object) =>
                    !object.id ||
                    typeof object.name !== 'string' ||
                    !object.name ||
                    /[/\\]/.test(object.name) ||
                    object.name === '.' ||
                    object.name === '..',
                )
              )
                throw new Error('invalid_object_path');
              await call('/storage/v1/object/' + bucket, 'DELETE', {
                prefixes: objects.map((object) => `${job.user_id}/${object.name}`),
              });
            }
          }
          await call(`/auth/v1/admin/users/${job.user_id}`, 'DELETE');
          await call(
            `/rest/v1/account_cleanup_jobs?user_id=eq.${job.user_id}&completed_at=is.null`,
            'PATCH',
            { completed_at: new Date().toISOString(), attempts: job.attempts + 1 },
          );
          completed++;
        } catch {
          await call(
            `/rest/v1/account_cleanup_jobs?user_id=eq.${job.user_id}&completed_at=is.null`,
            'PATCH',
            {
              attempts: job.attempts + 1,
              next_attempt_at: new Date(Date.now() + 300_000).toISOString(),
            },
          );
          failed++;
        }
      }
      return json({ completed, failed }, failed ? 503 : 200);
    } catch {
      return json({ error: 'cleanup_deferred' }, 503);
    }
  };
}
