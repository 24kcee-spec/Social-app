/** Only Supabase's current server-side user record is proof of email ownership.
 * JWT user_metadata and form fields are user-editable and must never supply this proof.
 */
import { decodeJwt } from 'jose';
export class EmailProofUnavailable extends Error {}

export function createEmailProofReader(options: {
  supabaseUrl: string;
  publishableKey?: string;
  fetchImpl?: typeof fetch;
  readConfirmationBaseline: () => Promise<string>;
}) {
  return async (token: string, userId: string): Promise<string | null> => {
    if (!options.publishableKey) throw new EmailProofUnavailable();
    try {
      const response = await (options.fetchImpl ?? fetch)(
        `${options.supabaseUrl.replace(/\/+$/, '')}/auth/v1/user`,
        {
          headers: { apikey: options.publishableKey, authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(10_000),
          redirect: 'error',
        },
      );
      if (response.status === 401 || response.status === 403) return null;
      if (!response.ok) throw new EmailProofUnavailable();
      const user = (await response.json()) as {
        id?: string;
        email?: string;
        email_confirmed_at?: string;
        phone?: string | null;
      };
      if (
        user.id !== userId ||
        !user.email_confirmed_at ||
        !Number.isFinite(Date.parse(user.email_confirmed_at))
      )
        return null;
      const baseline = Date.parse(await options.readConfirmationBaseline());
      if (!Number.isFinite(baseline)) throw new EmailProofUnavailable();
      if (Date.parse(user.email_confirmed_at) < baseline) {
        // /user has validated this exact token. An email OTP after the baseline
        // proves a legacy inbox; password login and editable metadata do not.
        // With a phone identity, OTP could mean SMS, so it is not email proof.
        let amr: unknown;
        try { amr = decodeJwt(token).amr; } catch { return null; }
        if (user.phone || !Array.isArray(amr) || !amr.some((entry: unknown) => {
          if (!entry || typeof entry !== 'object') return false;
          const method = entry as { method?: unknown; timestamp?: unknown };
          return method.method === 'otp' && typeof method.timestamp === 'number' && method.timestamp * 1000 >= baseline;
        })) return null;
      }
      return typeof user.email === 'string' ? user.email.trim().toLowerCase() : null;
    } catch {
      throw new EmailProofUnavailable();
    }
  };
}
