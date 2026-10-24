import { describe, expect, it } from "vitest";
import { androidAssociation, appleAssociation } from "../../web/lib/app-links";

describe("native link release identities", () => {
  it("does not publish placeholder app identities or certificates", () => {
    expect(androidAssociation()).toEqual([]);
    expect(appleAssociation()).toEqual({ applinks: { apps: [], details: [] } });
  });
  it("uses configured package and normalizes valid signing fingerprints", () => {
    expect(androidAssociation("com.sidle.mobile", "ab".repeat(32))[0]?.target).toMatchObject({ package_name: "com.sidle.mobile", sha256_cert_fingerprints: [Array(32).fill("AB").join(":")] });
    expect(() => androidAssociation("com.sidle.mobile", "placeholder")).toThrow();
    expect(appleAssociation("ABC1234567", "com.sidle.mobile").applinks.details[0]?.appID).toBe("ABC1234567.com.sidle.mobile");
  });
});
