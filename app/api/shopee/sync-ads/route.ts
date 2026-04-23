import { NextRequest, NextResponse } from "next/server";
import { syncShopeeAdsDaily } from "@/lib/shopee/sync-ads";
import { getCurrentUser } from "@/lib/auth/user";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  // Auth: admin session or cron token
  const cronToken = req.headers.get("authorization")?.replace("Bearer ", "");
  const isAuthedCron = cronToken === process.env.CRON_SECRET;

  if (!isAuthedCron) {
    const user = await getCurrentUser();
    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const body = await req.json().catch(() => ({}));
  const from = body.from as string | undefined;
  const to = body.to as string | undefined;

  const result = await syncShopeeAdsDaily({ from, to });
  return NextResponse.json(result);
}
