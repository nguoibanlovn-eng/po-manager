import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";

const TT_BASE = "https://business-api.tiktok.com/open_api/v1.3";

/** Lấy token từ DB (OAuth callback lưu) hoặc fallback .env.local */
export async function getAccessToken(): Promise<string> {
  const db = supabaseAdmin();
  const { data } = await db
    .from("tiktok_ads_token")
    .select("access_token")
    .order("updated_at", { ascending: false })
    .limit(1)
    .single();
  if (data?.access_token) return data.access_token;
  if (process.env.TIKTOK_ACCESS_TOKEN) return process.env.TIKTOK_ACCESS_TOKEN;
  throw new Error("Chưa có TikTok access token. Cần authorize tại TikTok Business Center.");
}

/** Validate TikTok token before syncing */
export async function validateTiktokToken(token: string): Promise<void> {
  const url = `${TT_BASE}/user/info/?access_token=${token}`;
  const res = await fetch(url, { headers: { "Access-Token": token } });
  const json = (await res.json()) as { code?: number; message?: string };
  if (json.code !== 0) {
    const msg = json.message || "Token không hợp lệ";
    if (msg.includes("expired") || msg.includes("invalid") || json.code === 40105) {
      throw new Error("TIKTOK_ACCESS_TOKEN đã hết hạn. Cần re-auth tại TikTok Business Center.");
    }
    throw new Error(`TikTok token error: ${msg}`);
  }
}
