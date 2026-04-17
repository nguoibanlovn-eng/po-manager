import "server-only";
import { createHmac } from "crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";

// TikTok Shop OAuth + API (separate from Business Ads API).
// Uses tiktok_shop_tokens table (shop_cipher PK).

const TTS = {
  APP_KEY: process.env.TIKTOK_SHOP_APP_KEY || "6jh7svnk812sv",
  APP_SECRET: process.env.TIKTOK_SHOP_APP_SECRET || "",
  BASE: "https://open-api.tiktokglobalshop.com",
  AUTH_BASE: "https://auth.tiktok-shops.com",
  AUTH_URL: "https://services.tiktokshop.com/open/authorize",
};

const SHOP_NAMES: Record<string, string> = {
  velasboost: "Velasboost",
  "lo-vu-i": "Lo Vu I",
  muagimuadi: "Muagimuadi.vn",
};

type ShopToken = {
  shop_cipher: string;
  shop_name: string | null;
  access_token: string;
  refresh_token: string;
  expire_at: number;
};

// ── Signing (HMAC-SHA256) ──────────────────────────────────

function signRequest(
  path: string,
  params: Record<string, string | number>,
  body = "",
): string {
  const filtered = Object.keys(params)
    .filter((k) => k !== "sign" && k !== "access_token")
    .sort();
  const sorted = filtered.map((k) => `${k}${params[k]}`).join("");
  const input = TTS.APP_SECRET + path + sorted + body + TTS.APP_SECRET;
  return createHmac("sha256", TTS.APP_SECRET).update(input).digest("hex");
}

// ── Token storage ──────────────────────────────────────────

async function getToken(shopCipher: string): Promise<ShopToken | null> {
  const { data } = await supabaseAdmin()
    .from("tiktok_shop_tokens")
    .select("*")
    .eq("shop_cipher", shopCipher)
    .maybeSingle();
  return data as ShopToken | null;
}

async function saveToken(t: ShopToken) {
  await supabaseAdmin()
    .from("tiktok_shop_tokens")
    .upsert(t, { onConflict: "shop_cipher" });
}

async function deleteToken(shopCipher: string) {
  await supabaseAdmin()
    .from("tiktok_shop_tokens")
    .delete()
    .eq("shop_cipher", shopCipher);
}

// ── Auth flow ──────────────────────────────────────────────

export function generateAuthUrl(state = "tktshop"): string {
  return `${TTS.AUTH_URL}?app_key=${TTS.APP_KEY}&state=${state}`;
}

export async function exchangeCode(
  authCode: string,
): Promise<{ ok: boolean; error?: string; shops?: Array<{ cipher: string; name: string }>; raw?: unknown }> {
  if (!TTS.APP_SECRET) return { ok: false, error: "Missing TIKTOK_SHOP_APP_SECRET" };

  // TikTok Shop API v2 token endpoint — GET, no sign needed
  const qs = new URLSearchParams({
    app_key: TTS.APP_KEY,
    app_secret: TTS.APP_SECRET,
    auth_code: authCode,
    grant_type: "authorized_code",
  }).toString();
  const res = await fetch(`${TTS.AUTH_BASE}/api/v2/token/get?${qs}`);
  const json = (await res.json()) as Record<string, unknown>;

  const code = json.code as number | undefined;
  const data = json.data as Record<string, unknown> | undefined;

  if (code !== 0 || !data?.access_token) {
    return { ok: false, error: (json.message as string) || "Token exchange failed", raw: json };
  }

  const accessToken = String(data.access_token || "");
  const refreshToken = String(data.refresh_token || "");
  const expireAt = Number(data.access_token_expire_in || 0);

  // Try multiple possible fields for shop list
  const grantedShops = (data.granted_shops || data.shops || []) as Array<Record<string, unknown>>;
  const openId = String(data.open_id || data.seller_id || "");

  // If granted_shops exists, save per shop
  if (grantedShops.length > 0) {
    for (const s of grantedShops) {
      const cipher = String(s.shop_cipher || s.cipher || s.shop_id || "");
      if (!cipher) continue;
      await saveToken({
        shop_cipher: cipher,
        shop_name: String(s.shop_name || s.name || SHOP_NAMES[cipher] || cipher),
        access_token: accessToken,
        refresh_token: refreshToken,
        expire_at: expireAt,
      });
    }
  } else {
    // No shop list — save with open_id or "default" as key
    const key = openId || "default";
    await saveToken({
      shop_cipher: key,
      shop_name: "TikTok Shop",
      access_token: accessToken,
      refresh_token: refreshToken,
      expire_at: expireAt,
    });
  }

  return {
    ok: true,
    shops: grantedShops.length > 0
      ? grantedShops.map((s) => ({ cipher: String(s.shop_cipher || s.shop_id || ""), name: String(s.shop_name || "") }))
      : [{ cipher: openId || "default", name: "TikTok Shop" }],
    raw: data,
  };
}

export async function refreshToken(shopCipher: string): Promise<string | null> {
  const token = await getToken(shopCipher);
  if (!token?.refresh_token) return null;
  if (!TTS.APP_SECRET) return null;

  // TikTok Shop API v2 refresh — GET, no sign needed
  const qs = new URLSearchParams({
    app_key: TTS.APP_KEY,
    app_secret: TTS.APP_SECRET,
    refresh_token: token.refresh_token,
    grant_type: "refresh_token",
  }).toString();
  const res = await fetch(`${TTS.AUTH_BASE}/api/v2/token/refresh?${qs}`);
  const json = (await res.json()) as {
    code?: number;
    message?: string;
    data?: {
      access_token?: string;
      refresh_token?: string;
      access_token_expire_in?: number;
    };
  };

  if (json.code !== 0 || !json.data?.access_token) return null;

  const d = json.data;
  await saveToken({
    ...token,
    access_token: d.access_token || "",
    refresh_token: d.refresh_token || token.refresh_token,
    expire_at: d.access_token_expire_in || 0,
  });

  return d.access_token || null;
}

// ── API call with auto-refresh ─────────────────────────────

export async function ttsRequest<T = unknown>(
  path: string,
  shopCipher: string,
  queryParams: Record<string, string | number> = {},
  method: "GET" | "POST" = "GET",
  body?: unknown,
): Promise<{ code: number; message: string; data: T | null }> {
  let token = await getToken(shopCipher);
  if (!token?.access_token) {
    return { code: -1, message: `No token for shop ${shopCipher}`, data: null };
  }

  // Auto refresh if < 30 min remaining
  const nowSec = Math.floor(Date.now() / 1000);
  if (token.expire_at > 0 && nowSec > token.expire_at - 1800) {
    const newAccess = await refreshToken(shopCipher);
    if (newAccess) token = { ...token, access_token: newAccess };
  }

  const ts = Math.floor(Date.now() / 1000);
  const bodyStr = body ? JSON.stringify(body) : "";
  const baseParams: Record<string, string | number> = {
    app_key: TTS.APP_KEY,
    timestamp: ts,
    shop_cipher: shopCipher,
    ...queryParams,
  };
  const sign = signRequest(path, baseParams, bodyStr);
  const allParams = { ...baseParams, sign, access_token: token.access_token };
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(allParams).map(([k, v]) => [k, String(v)])),
  ).toString();

  const res = await fetch(`${TTS.BASE}${path}?${qs}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: bodyStr || undefined,
  });
  const json = (await res.json()) as { code?: number; message?: string; data?: T };
  return { code: json.code ?? -1, message: json.message ?? "", data: (json.data as T) ?? null };
}

// ── Public helpers ─────────────────────────────────────────

export async function listConnectedShops(): Promise<
  Array<{ shop_cipher: string; shop_name: string; has_token: boolean; token_ok: boolean; expire_in_hours: number }>
> {
  const { data } = await supabaseAdmin()
    .from("tiktok_shop_tokens")
    .select("*")
    .order("shop_name", { ascending: true });

  const now = Math.floor(Date.now() / 1000);
  return ((data as ShopToken[]) || []).map((t) => ({
    shop_cipher: t.shop_cipher,
    shop_name: t.shop_name || t.shop_cipher,
    has_token: !!t.access_token,
    token_ok: !!t.access_token && t.expire_at > now,
    expire_in_hours: t.expire_at > now ? Math.round((t.expire_at - now) / 3600) : 0,
  }));
}

export async function disconnectShop(shopCipher: string) {
  await deleteToken(shopCipher);
}
