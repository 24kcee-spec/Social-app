type Bindings = Record<string, string | undefined>;

// Verification only: this never loads Google's advertising JavaScript or ads.
// Keep the current non-commercial host untouched when adding a future account.
export function adsenseVerification(env: Bindings) {
  if (env.ADSENSE_VERIFICATION_ENABLED !== 'true' || env.COMMERCIAL_DEPLOYMENT_APPROVED !== 'true')
    return null;

  const publisherId = env.ADSENSE_PUBLISHER_ID?.trim();
  if (!publisherId || !/^ca-pub-[0-9]{16}$/.test(publisherId))
    throw new Error(
      'AdSense verification requires a valid ADSENSE_PUBLISHER_ID from your account.',
    );

  const record = env.ADSENSE_ADS_TXT?.trim();
  let adsTxt: string | null = null;
  if (record) {
    const fields = record.split(',').map((field) => field.trim());
    if (
      /[\r\n\x00-\x1f]/.test(record) ||
      fields.length !== 4 ||
      fields[0] !== 'google.com' ||
      fields[1] !== publisherId.slice(3) ||
      fields[2] !== 'DIRECT' ||
      fields[3] !== 'f08c47fec0942fa0'
    )
      throw new Error(
        'ADSENSE_ADS_TXT must be the single Google DIRECT record for this publisher.',
      );
    adsTxt = fields.join(', ') + '\n';
  }
  return { publisherId, adsTxt };
}
