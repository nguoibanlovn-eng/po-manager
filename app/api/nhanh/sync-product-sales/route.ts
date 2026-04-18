import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/user";
import { syncProductSales } from "@/lib/nhanh/sync-product-sales";

export const maxDuration = 300;

/**
 * POST /api/nhanh/sync-product-sales
 * Body: { from?: string, to?: string }
 * Default: last 7 days. For full sync, call multiple times with monthly ranges.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ ok: false, error: "Admin only" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));

  // Safety: limit range to max 35 days per call to avoid Vercel 300s timeout
  const from = body.from;
  const to = body.to;
  if (from && to) {
    const diffDays = Math.ceil((new Date(to).getTime() - new Date(from).getTime()) / 86400000);
    if (diffDays > 35) {
      return NextResponse.json({
        ok: false,
        error: `Khoảng ${diffDays} ngày quá dài — giới hạn 35 ngày/lần để tránh timeout. Hãy sync từng tháng.`,
      }, { status: 400 });
    }
  }

  const result = await syncProductSales({ from, to });
  return NextResponse.json({ ok: true, fetched: result.totalRows, ...result });
}
