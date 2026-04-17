import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/user";
import { generateAuthUrl } from "@/lib/tiktok/shop-api";

export async function POST() {
  const u = await getCurrentUser();
  if (!u || u.role !== "ADMIN") return NextResponse.json({ ok: false, error: "Admin only" }, { status: 403 });

  const authUrl = generateAuthUrl();
  return NextResponse.json({ ok: true, url: authUrl });
}
