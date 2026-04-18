import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/user";
import { syncProductSales } from "@/lib/nhanh/sync-product-sales";

export const maxDuration = 300;

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ ok: false, error: "Admin only" }, { status: 403 });
  }

  try {
    const body = await req.json().catch(() => ({}));

    const from = body.from;
    const to = body.to;
    if (from && to) {
      const diffDays = Math.ceil((new Date(to).getTime() - new Date(from).getTime()) / 86400000);
      if (diffDays > 35) {
        return NextResponse.json({ ok: false, error: `Khoảng ${diffDays} ngày quá dài — giới hạn 35 ngày/lần.` }, { status: 400 });
      }
    }

    const result = await syncProductSales({ from, to });
    return NextResponse.json({ ok: true, fetched: result.totalRows, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("sync-product-sales error:", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
