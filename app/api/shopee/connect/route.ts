import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/user";
import { generateAuthUrl } from "@/lib/shopee/api";

// Generate Shopee auth URL for shop authorization
export async function POST(req: Request) {
  const u = await getCurrentUser();
  if (!u || u.role !== "ADMIN") return NextResponse.json({ ok: false, error: "Admin only" }, { status: 403 });

  // Redirect URL must match domain declared in Shopee Partner Console
  const redirectUrl = "https://quanly.lovu.vn/api/shopee/callback";
  const authUrl = generateAuthUrl(redirectUrl);

  return NextResponse.json({ ok: true, url: authUrl });
}
