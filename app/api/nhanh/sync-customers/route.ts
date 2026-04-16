import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/user";
import { syncCustomersFromOrders } from "@/lib/nhanh/sync";

export const maxDuration = 300;

export async function POST(req: Request) {
  const u = await getCurrentUser();
  if (!u || u.role !== "ADMIN") {
    return NextResponse.json({ ok: false, error: "Admin only" }, { status: 403 });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const r = await syncCustomersFromOrders({ days: body.days });
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
