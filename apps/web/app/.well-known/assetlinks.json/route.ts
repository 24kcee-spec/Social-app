import { NextResponse } from "next/server";
import { androidAssociation } from "../../../lib/app-links";

export async function GET() {
  const assetlinks = androidAssociation(process.env.ANDROID_PACKAGE, process.env.ANDROID_SIGNING_SHA256);

  return NextResponse.json(assetlinks, {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
