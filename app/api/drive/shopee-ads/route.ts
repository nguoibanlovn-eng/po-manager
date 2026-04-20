import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/user";
import { hasPermission } from "@/lib/auth/roles";
import { scanAndImportShopeeAds } from "@/lib/drive/import-shopee-ads";

export const maxDuration = 300;

export async function POST(req: Request) {
  const u = await requireUser();
  if (!hasPermission(u, "admin_settings"))
    return NextResponse.json({ ok: false, error: "Không có quyền" }, { status: 403 });

  try {
    const body = await req.json().catch(() => ({}));
    const result = await scanAndImportShopeeAds({ from: body.from, to: body.to });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
