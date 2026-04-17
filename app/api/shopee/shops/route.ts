import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/user";
import { listConnectedShops, disconnectShop } from "@/lib/shopee/api";

export async function GET() {
  const u = await getCurrentUser();
  if (!u || u.role !== "ADMIN") return NextResponse.json({ ok: false, error: "Admin only" }, { status: 403 });

  const shops = await listConnectedShops();
  return NextResponse.json({ ok: true, shops });
}

export async function DELETE(req: Request) {
  const u = await getCurrentUser();
  if (!u || u.role !== "ADMIN") return NextResponse.json({ ok: false, error: "Admin only" }, { status: 403 });

  const { shop_id } = await req.json().catch(() => ({ shop_id: "" }));
  if (!shop_id) return NextResponse.json({ ok: false, error: "Thiếu shop_id" }, { status: 400 });

  await disconnectShop(shop_id);
  return NextResponse.json({ ok: true, message: `Đã ngắt shop ${shop_id}` });
}
