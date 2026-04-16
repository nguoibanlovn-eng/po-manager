import "server-only";
import { createHmac } from "crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { nowVN } from "@/lib/helpers";

const TKTSHOP = {
  APP_KEY: process.env.TIKTOK_SHOP_APP_KEY || "6jh7svnk812sv",
  APP_SECRET: process.env.TIKTOK_SHOP_APP_SECRET || "",
  API_BASE: "https://open-api.tiktokglobalshop.com",
  REFRESH_URL: "https://auth.tiktok-shops.com/api/v2/token/refresh",
};

export type ShopCred = {
  shop_id: string;
  name: string | null;
  access_token: string;
  refresh_token: string;
  expires_at: number;
};

export async function listShops(): Promise<ShopCred[]> {
  const { data } = await supabaseAdmin()
    .from("tktshop_shops")
    .select("*")
    .order("name", { ascending: true });
  return (data as ShopCred[]) || [];
}

async function saveShopTokens(
  shopId: string,
  accessToken: string,
  refreshToken: string,
  expiresAt: number,
) {
  await supabaseAdmin()
    .from("tktshop_shops")
    .update({
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_at: expiresAt,
      updated_at: nowVN(),
    })
    .eq("shop_id", shopId);
}

// Refresh access_token using refresh_token. Returns new access_token.
async function refreshToken(shopId: string): Promise<string> {
  const { data: shop } = await supabaseAdmin()
    .from("tktshop_shops")
    .select("*")
    .eq("shop_id", shopId)
    .maybeSingle();
  if (!shop) throw new Error("Shop không tồn tại: " + shopId);

  if (!TKTSHOP.APP_SECRET) throw new Error("Thiếu TIKTOK_SHOP_APP_SECRET");

  const params = new URLSearchParams({
    app_key: TKTSHOP.APP_KEY,
    app_secret: TKTSHOP.APP_SECRET,
    refresh_token: shop.refresh_token,
    grant_type: "refresh_token",
  });
  const res = await fetch(`${TKTSHOP.REFRESH_URL}?${params.toString()}`, { method: "GET" });
  const json = (await res.json()) as {
    code?: number;
    message?: string;
    data?: { access_token?: string; refresh_token?: string; access_token_expire_in?: number };
  };
  if (json.code !== 0) throw new Error(`Refresh failed for ${shop.name || shopId}: ${json.message}`);
  const data = json.data || {};
  if (!data.access_token || !data.refresh_token) throw new Error("Refresh response missing tokens");
  await saveShopTokens(
    shopId,
    data.access_token,
    data.refresh_token,
    Number(data.access_token_expire_in || 0),
  );
  return data.access_token;
}

// Get valid access_token for a shop (auto-refreshes if expiring < 2 days).
export async function getShopToken(shopId: string): Promise<{ token: string; shopName: string }> {
  const { data: shop } = await supabaseAdmin()
    .from("tktshop_shops")
    .select("*")
    .eq("shop_id", shopId)
    .maybeSingle();
  if (!shop) throw new Error("Shop không tồn tại: " + shopId);

  const nowSec = Math.floor(Date.now() / 1000);
  const remaining = (shop.expires_at || 0) - nowSec;
  if (remaining < 172800 /* 2 days */) {
    const newToken = await refreshToken(shopId);
    return { token: newToken, shopName: shop.name || shopId };
  }
  return { token: shop.access_token, shopName: shop.name || shopId };
}

// HMAC-SHA256 signing for TikTok Shop API (v202309).
// Signature format: HMAC_SHA256(app_secret, app_secret + path + sorted_query + body + app_secret)
export function signRequest(
  path: string,
  queryParams: Record<string, string | number>,
  body: string,
): string {
  const filteredKeys = Object.keys(queryParams)
    .filter((k) => k !== "sign" && k !== "access_token")
    .sort();
  const sortedQs = filteredKeys.map((k) => `${k}${queryParams[k]}`).join("");
  const input = TKTSHOP.APP_SECRET + path + sortedQs + body + TKTSHOP.APP_SECRET;
  return createHmac("sha256", TKTSHOP.APP_SECRET).update(input).digest("hex");
}

export async function tktshopRequest<T = unknown>(
  path: string,
  shopId: string,
  queryParams: Record<string, string | number> = {},
  method: "GET" | "POST" = "GET",
  body?: unknown,
): Promise<{ code: number; message: string; data: T | null }> {
  const { token } = await getShopToken(shopId);
  const ts = Math.floor(Date.now() / 1000);
  const bodyStr = body ? JSON.stringify(body) : "";
  const baseParams: Record<string, string | number> = {
    app_key: TKTSHOP.APP_KEY,
    timestamp: ts,
    version: "202309",
    shop_id: shopId,
    ...queryParams,
  };
  const sign = signRequest(path, baseParams, bodyStr);
  const allParams: Record<string, string | number> = { ...baseParams, sign, access_token: token };
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(allParams).map(([k, v]) => [k, String(v)])),
  ).toString();
  const url = `${TKTSHOP.API_BASE}${path}?${qs}`;

  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: bodyStr || undefined,
  });
  const json = (await res.json()) as { code?: number; message?: string; data?: T };
  return { code: json.code ?? -1, message: json.message ?? "", data: (json.data as T) ?? null };
}
