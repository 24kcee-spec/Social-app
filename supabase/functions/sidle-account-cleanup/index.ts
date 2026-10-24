import { createCleanupHandler } from './core.ts';

// Supabase provides its server key; the worker credential is separately provisioned.
// Gateway JWT checks are off only because this function enforces its own bearer token.
Deno.serve(createCleanupHandler({
  projectUrl: Deno.env.get('SUPABASE_URL') ?? '',
  serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  workerToken: Deno.env.get('SIDLE_CLEANUP_TOKEN') ?? '',
}));
