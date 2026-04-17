import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/user";
import { generateAuthUrl } from "@/lib/shopee/api";

// Generate Shopee auth URL for shop authorization
export async function POST(req: Request) {
  const u = await getCurrentUser();
  if (!u || u.role !== "ADMIN") return NextResponse.json({ ok: false, error: "Admin only" }, { status: 403 });

  const origin = new URL(req.url).origin;
  const redirectUrl = `${origin}/api/shopee/callback`;
  const authUrl = generateAuthUrl(redirectUrl);

  return NextResponse.json({ ok: true, url: authUrl });
}
