import { NextResponse } from "next/server";

export async function GET() {
  const aasa = {
    applinks: {
      apps: [],
      details: [
        {
          appID: "TEAMID.app.social.dev",
          paths: ["/share/*"],
        },
      ],
    },
  };

  return NextResponse.json(aasa, {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
