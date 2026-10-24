import { NextResponse } from "next/server";
import { appleAssociation } from "../../../lib/app-links";

export async function GET() {
  const aasa = appleAssociation(process.env.APPLE_TEAM_ID, process.env.IOS_BUNDLE_IDENTIFIER);

  return NextResponse.json(aasa, {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
