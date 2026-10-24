/** Only Supabase's current server-side user record is proof of email ownership.
 * JWT user_metadata and form fields are user-editable and must never supply this proof.
 */
export class EmailProofUnavailable extends Error {}

export function createEmailProofReader(options: {
  supabaseUrl: string;
  publishableKey?: string;
  fetchImpl?: typeof fetch;
}) {
  return async (token: string, userId: string): Promise<string | null> => {
    if (!options.publishableKey) throw new EmailProofUnavailable();
    try {
      const response = await (options.fetchImpl ?? fetch)(`${options.supabaseUrl.replace(/\/+$/, "")}/auth/v1/user`, {
        headers: { apikey: options.publishableKey, authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10_000),
      });
      if (response.status === 401 || response.status === 403) return null;
      if (!response.ok) throw new EmailProofUnavailable();
      const user = await response.json() as { id?: string; email?: string; email_confirmed_at?: string };
      if (user.id !== userId || !user.email_confirmed_at || !Number.isFinite(Date.parse(user.email_confirmed_at))) return null;
      return typeof user.email === "string" ? user.email.trim().toLowerCase() : null;
    } catch {
      throw new EmailProofUnavailable();
    }
  };
}
