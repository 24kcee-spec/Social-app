/** Missing release identities produce no association, never a development identity. */
export function androidAssociation(packageName?: string, fingerprintList?: string) {
  if (!packageName || !fingerprintList) return [];
  if (!/^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/.test(packageName)) throw new Error("Invalid ANDROID_PACKAGE");
  const fingerprints = fingerprintList.split(",").map((value) => {
    const hex = value.trim().replace(/:/g, "").toUpperCase();
    if (!/^[0-9A-F]{64}$/.test(hex)) throw new Error("Invalid ANDROID_SIGNING_SHA256");
    return hex.match(/.{2}/g)!.join(":");
  });
  return [{ relation: ["delegate_permission/common.handle_all_urls"], target: { namespace: "android_app", package_name: packageName, sha256_cert_fingerprints: fingerprints } }];
}

export function appleAssociation(teamId?: string, bundleId?: string) {
  if (!teamId || !bundleId) return { applinks: { apps: [], details: [] } };
  if (!/^[A-Z0-9]{10}$/.test(teamId) || !/^[A-Za-z][A-Za-z0-9-]*(\.[A-Za-z][A-Za-z0-9-]*)+$/.test(bundleId)) throw new Error("Invalid Apple app association identity");
  return { applinks: { apps: [], details: [{ appID: `${teamId}.${bundleId}`, paths: ["/share/*"] }] } };
}
