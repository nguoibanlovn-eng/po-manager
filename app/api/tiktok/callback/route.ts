import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

const TT_BASE = "https://business-api.tiktok.com/open_api/v1.3";

// TikTok redirects here with ?auth_code=xxx after advertiser authorizes
export async function GET(req: Request) {
  const url = new URL(req.url);
  const authCode = url.searchParams.get("auth_code");

  if (!authCode) {
    return NextResponse.redirect(new URL("/sales-leader?error=missing_auth_code", req.url));
  }

  const appId = process.env.TIKTOK_APP_ID;
  const secret = process.env.TIKTOK_APP_SECRET;
  if (!appId || !secret) {
    return NextResponse.redirect(new URL("/sales-leader?error=missing_tiktok_credentials", req.url));
  }

  // Exchange auth_code for access_token
  try {
    const res = await fetch(`${TT_BASE}/oauth2/access_token/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ app_id: appId, secret, auth_code: authCode }),
    });
    const json = await res.json() as {
      code?: number;
      message?: string;
      data?: { access_token?: string; advertiser_ids?: string[] };
    };

    if (json.code !== 0 || !json.data?.access_token) {
      const err = json.message || "unknown";
      return NextResponse.redirect(new URL(`/sales-leader?error=${encodeURIComponent(err)}`, req.url));
    }

    const token = json.data.access_token;
    const advIds = json.data.advertiser_ids || [];

    // Lưu token vào DB để sync dùng (không cần update .env.local thủ công)
    const db = supabaseAdmin();
    await db.from("tiktok_ads_token").upsert({
      app_id: appId,
      access_token: token,
      advertiser_ids: advIds,
      updated_at: new Date().toISOString(),
    }, { onConflict: "app_id" });

    return NextResponse.redirect(
      new URL(`/sales-leader?tiktok_connected=true&advertisers=${advIds.length}`, req.url)
    );
  } catch (e) {
    return NextResponse.redirect(new URL(`/sales-leader?error=${encodeURIComponent((e as Error).message)}`, req.url));
  }
}
