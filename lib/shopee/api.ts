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

  // Auto refresh if expiring in < 30 min
  if (token.expire_at > 0 && Math.floor(Date.now() / 1000) > token.expire_at - 1800) {
    const newAccess = await refreshToken(shopId);
    if (newAccess) {
      token = { ...token, access_token: newAccess };
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

export async function listConnectedShops(): Promise<Array<{
  shop_id: string; shop_name: string; has_token: boolean; token_ok: boolean; expire_in_hours: number;
}>> {
  const db = supabaseAdmin();
  const { data } = await db.from("shopee_tokens").select("*");
  const now = Math.floor(Date.now() / 1000);
  return (data || []).map((t) => ({
    shop_id: t.shop_id,
    shop_name: t.shop_name || SHOP_NAMES[t.shop_id] || t.shop_id,
    has_token: !!t.access_token,
    token_ok: !!t.access_token && t.expire_at > now,
    expire_in_hours: t.expire_at > now ? Math.round((t.expire_at - now) / 3600) : 0,
  }));
}

export async function disconnectShop(shopId: string) {
  await deleteShopToken(shopId);
}

export { shopeeGet, SHOP_NAMES };
