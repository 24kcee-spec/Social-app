import { NextResponse } from "next/server";

export async function GET() {
  const assetlinks = [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: "app.social.dev",
        sha256_cert_fingerprints: [
          // Replace with production release keystore SHA256 fingerprint upon store release
          "14:6D:E9:7F:02:4F:92:07:EC:D2:C0:DC:7A:B3:36:99:99:65:21:49:03:0A:7F:57:11:4C:E2:16:B0:09:A6:DC",
        ],
      },
    },
  ];

  return NextResponse.json(assetlinks, {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
