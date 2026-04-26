import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/user";
import { getRevenueByChannel } from "@/lib/db/dashboard";
import { dateVN } from "@/lib/helpers";

export const dynamic = "force-dynamic";

/** Get channel revenue for a custom date range */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from") || dateVN(null, -30);
  const to = searchParams.get("to") || dateVN();

  const rev = await getRevenueByChannel(from, to);

  return NextResponse.json({
    ok: true,
    channels: rev.channels,
    sourcesByChannel: rev.sourcesByChannel,
    totalRevenue: rev.total,
    totalOrders: rev.totalOrders,
    totalExpected: rev.totalExpected,
    from,
    to,
  });
}
