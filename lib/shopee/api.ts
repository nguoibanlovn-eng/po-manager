import "server-only";
import { createHmac } from "crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";

const SHOPEE_BASE = process.env.SHOPEE_BASE || "https://partner.shopeemobile.com";
const PARTNER_ID = Number(process.env.SHOPEE_PARTNER_ID || "2032911");
const PARTNER_KEY = process.env.SHOPEE_PARTNER_KEY || "";

const SHOP_NAMES: Record<string, string> = {
  "10091288": "Levu01",
  "303340636": "Velasboost",
};

function sign(baseStr: string): string {
  return createHmac("sha256", PARTNER_KEY).update(baseStr).digest("hex");
}

function authSign(path: string) {
  const ts = Math.floor(Date.now() / 1000);
  const base = `${PARTNER_ID}${path}${ts}`;
  return { partnerId: PARTNER_ID, timestamp: ts, sign: sign(base) };
}

// ─── Token storage (DB) ─────────────────────────────────────

type ShopToken = {
  shop_id: string;
  shop_name: string;
  access_token: string;
  refresh_token: string;
  expire_at: number; // unix timestamp
};

async function getShopToken(shopId: string): Promise<ShopToken | null> {
  const db = supabaseAdmin();
  const { data } = await db
    .from("shopee_tokens")
    .select("*")
    .eq("shop_id", shopId)
    .maybeSingle();
  return data as ShopToken | null;
}

async function saveShopToken(token: ShopToken) {
  const db = supabaseAdmin();
  await db.from("shopee_tokens").upsert(token, { onConflict: "shop_id" });
}

async function deleteShopToken(shopId: string) {
  const db = supabaseAdmin();
  await db.from("shopee_tokens").delete().eq("shop_id", shopId);
}

// ─── Auth flow ──────────────────────────────────────────────

export function generateAuthUrl(redirectUrl: string): string {
  const path = "/api/v2/shop/auth_partner";
  const s = authSign(path);
  return `${SHOPEE_BASE}${path}?partner_id=${s.partnerId}&timestamp=${s.timestamp}&sign=${s.sign}&redirect=${encodeURIComponent(redirectUrl)}`;
}

export async function exchangeCode(code: string, shopId: number): Promise<{ ok: boolean; error?: string; shop_name?: string }> {
  const path = "/api/v2/auth/token/get";
  const s = authSign(path);
  const url = `${SHOPEE_BASE}${path}?partner_id=${s.partnerId}&timestamp=${s.timestamp}&sign=${s.sign}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, shop_id: shopId, partner_id: PARTNER_ID }),
  });
  const d = await res.json() as {
    error?: string; message?: string;
    access_token?: string; refresh_token?: string; expire_in?: number;
  };

  if (d.error && d.error !== "") return { ok: false, error: `${d.error} ${d.message || ""}` };

  const shopName = SHOP_NAMES[String(shopId)] || String(shopId);
  await saveShopToken({
    shop_id: String(shopId),
    shop_name: shopName,
    access_token: d.access_token || "",
    refresh_token: d.refresh_token || "",
    expire_at: Math.floor(Date.now() / 1000) + (d.expire_in || 3600),
  });

  return { ok: true, shop_name: shopName };
}

async function refreshToken(shopId: string): Promise<string | null> {
  const token = await getShopToken(shopId);
  if (!token?.refresh_token) return null;

  const path = "/api/v2/auth/access_token/get";
  const s = authSign(path);
  const url = `${SHOPEE_BASE}${path}?partner_id=${s.partnerId}&timestamp=${s.timestamp}&sign=${s.sign}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: token.refresh_token, shop_id: Number(shopId), partner_id: PARTNER_ID }),
  });
  const d = await res.json() as {
    error?: string; access_token?: string; refresh_token?: string; expire_in?: number;
  };

  if (d.error && d.error !== "") return null;

  await saveShopToken({
    ...token,
    access_token: d.access_token || "",
    refresh_token: d.refresh_token || token.refresh_token,
    expire_at: Math.floor(Date.now() / 1000) + (d.expire_in || 3600),
  });

  return d.access_token || null;
}

// ─── API calls (shop-level) ─────────────────────────────────

async function shopeeGet(shopId: string, path: string, extraParams: Record<string, string | number> = {}): Promise<Record<string, unknown>> {
  let token = await getShopToken(shopId);
  if (!token?.access_token) return { error: "no_token", message: `Chưa kết nối shop ${shopId}` };

  // Auto refresh if expired or expiring in < 1 hour
  const now = Math.floor(Date.now() / 1000);
  if (token.expire_at > 0 && now > token.expire_at - 3600) {
    const newAccess = await refreshToken(shopId);
    if (newAccess) {
      token = { ...token, access_token: newAccess };
    } else if (now > token.expire_at) {
      return { error: "token_expired", message: `Token shop ${shopId} đã hết hạn, cần kết nối lại` };
    }
  }

  const ts = Math.floor(Date.now() / 1000);
  const baseStr = `${PARTNER_ID}${path}${ts}${token.access_token}${shopId}`;
  const sig = sign(baseStr);

  const qs = new URLSearchParams({
    partner_id: String(PARTNER_ID),
    timestamp: String(ts),
    sign: sig,
    access_token: token.access_token,
    shop_id: shopId,
    ...Object.fromEntries(Object.entries(extraParams).map(([k, v]) => [k, String(v)])),
  });

  const res = await fetch(`${SHOPEE_BASE}${path}?${qs}`, { method: "GET" });
  return (await res.json()) as Record<string, unknown>;
}

// ─── Public API ─────────────────────────────────────────────

const DEFAULT_SHOPS = [
  { shop_id: "10091288", shop_name: "Levu01" },
  { shop_id: "303340636", shop_name: "Velasboost" },
];

export async function listConnectedShops(): Promise<Array<{
  shop_id: string; shop_name: string; has_token: boolean; token_ok: boolean; expire_in_hours: number;
}>> {
  const db = supabaseAdmin();
  const { data } = await db.from("shopee_tokens").select("*");
  const tokenMap = new Map<string, { shop_name?: string; access_token?: string; expire_at?: number }>();
  for (const t of data || []) tokenMap.set(t.shop_id as string, t);
  const now = Math.floor(Date.now() / 1000);

  return DEFAULT_SHOPS.map((s) => {
    const t = tokenMap.get(s.shop_id);
    return {
      shop_id: s.shop_id,
      shop_name: t?.shop_name || s.shop_name,
      has_token: !!t?.access_token,
      token_ok: !!t?.access_token && (t?.expire_at || 0) > now,
      expire_in_hours: t && (t.expire_at || 0) > now ? Math.round(((t.expire_at || 0) - now) / 3600) : 0,
    };
  });
}

/** Proactively refresh ALL Shopee tokens (Shopee only gives 4h tokens) */
export async function refreshAllShopeeTokens(): Promise<{ refreshed: number; errors: string[] }> {
  const db = supabaseAdmin();
  // Always refresh all tokens — Shopee tokens only last 4 hours
  const { data } = await db.from("shopee_tokens").select("shop_id, shop_name, expire_at");
  const errors: string[] = [];
  let refreshed = 0;
  for (const t of data || []) {
    try {
      const newToken = await refreshToken(t.shop_id);
      if (newToken) refreshed++;
      else errors.push(`${t.shop_name || t.shop_id}: refresh returned null`);
    } catch (e) {
      errors.push(`${t.shop_name || t.shop_id}: ${(e as Error).message}`);
    }
  }
  return { refreshed, errors };
}

export async function disconnectShop(shopId: string) {
  await deleteShopToken(shopId);
}

export { shopeeGet, SHOP_NAMES };
