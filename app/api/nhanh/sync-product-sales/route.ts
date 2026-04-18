import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/user";
import { syncProductSales } from "@/lib/nhanh/sync-product-sales";

export const maxDuration = 300;

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ ok: false, error: "Admin only" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const result = await syncProductSales({
    from: body.from,
    to: body.to,
  });

  return NextResponse.json({ ok: true, ...result });
}
