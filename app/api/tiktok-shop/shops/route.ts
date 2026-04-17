import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/user";
import { listConnectedShops, disconnectShop } from "@/lib/tiktok/shop-api";

export async function GET() {
  const u = await getCurrentUser();
  if (!u || u.role !== "ADMIN") return NextResponse.json({ ok: false, error: "Admin only" }, { status: 403 });

  const shops = await listConnectedShops();
  return NextResponse.json({ ok: true, shops });
}

export async function DELETE(req: Request) {
  const u = await getCurrentUser();
  if (!u || u.role !== "ADMIN") return NextResponse.json({ ok: false, error: "Admin only" }, { status: 403 });

  const { shop_cipher } = await req.json().catch(() => ({ shop_cipher: "" }));
  if (!shop_cipher) return NextResponse.json({ ok: false, error: "Thieu shop_cipher" }, { status: 400 });

  await disconnectShop(shop_cipher);
  return NextResponse.json({ ok: true, message: `Da ngat shop ${shop_cipher}` });
}
