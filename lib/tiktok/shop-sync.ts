import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { nowVN } from "@/lib/helpers";
import { toNum } from "@/lib/format";
import { getShopToken, listShops, tktshopRequest } from "./shop-client";

type OrderSearchResult = {
  orders?: Array<{
    id: string;
    status?: string;
    buyer_email?: string;
    payment?: { total_amount?: string | number; currency?: string };
    create_time?: number;
    update_time?: number;
  }>;
  next_page_token?: string;
  total_count?: number;
};

// Sync TikTok Shop orders for a date range (default 7 days back)
export async function syncShopOrders(
  shopId: string,
  opts: { from?: string; to?: string } = {},
): Promise<{ shop: string; fetched: number; errors: string[] }> {
  const db = supabaseAdmin();
  const errors: string[] = [];
  // Resolve shop name
  await getShopToken(shopId);
  const to = opts.to || new Date().toISOString().substring(0, 10);
  const from = opts.from || new Date(Date.now() - 7 * 86400_000).toISOString().substring(0, 10);
  const createTimeGe = Math.floor(new Date(from + "T00:00:00Z").getTime() / 1000);
  const createTimeLt = Math.floor(new Date(to + "T23:59:59Z").getTime() / 1000);

  let nextPageToken: string | undefined;
  let fetched = 0;
  for (let page = 0; page < 50; page++) {
    try {
      const params: Record<string, string | number> = {
        page_size: 50,
        sort_field: "create_time",
        sort_order: "ASC",
      };
      if (nextPageToken) params.page_token = nextPageToken;
      const body = { filter: { create_time_ge: createTimeGe, create_time_lt: createTimeLt } };
      const res = await tktshopRequest<OrderSearchResult>(
        "/order/202309/orders/search",
        shopId,
        params,
        "POST",
        body,
      );
      if (res.code !== 0) {
        errors.push(`${shopId} page ${page}: ${res.message}`);
        break;
      }
      const orders = res.data?.orders || [];
      if (orders.length === 0) break;
      const rows = orders.map((o) => ({
        shop_id: shopId,
        order_id: o.id,
        order_status: o.status || null,
        buyer_email: o.buyer_email || null,
        total_amount: toNum(o.payment?.total_amount),
        currency: o.payment?.currency || "VND",
        order_date: o.create_time ? new Date(o.create_time * 1000).toISOString() : null,
        synced_at: nowVN(),
        raw: o,
      }));
      const { error } = await db
        .from("tiktok_shop_orders")
        .upsert(rows, { onConflict: "shop_id,order_id" });
      if (error) errors.push(`${shopId} upsert: ${error.message}`);
      else fetched += rows.length;
      nextPageToken = res.data?.next_page_token;
      if (!nextPageToken) break;
      await new Promise((r) => setTimeout(r, 300));
    } catch (e) {
      errors.push(`${shopId} page ${page}: ${(e as Error).message}`);
      break;
    }
  }
  const { data: shop } = await db.from("tktshop_shops").select("name").eq("shop_id", shopId).maybeSingle();
  return { shop: shop?.name || shopId, fetched, errors };
}

export async function syncAllShopsOrders(opts: { from?: string; to?: string } = {}): Promise<{
  totalFetched: number;
  shops: Array<{ shop: string; fetched: number; errors: string[] }>;
}> {
  const shops = await listShops();
  const results: Array<{ shop: string; fetched: number; errors: string[] }> = [];
  let totalFetched = 0;
  for (const s of shops) {
    const r = await syncShopOrders(s.shop_id, opts);
    results.push(r);
    totalFetched += r.fetched;
  }
  return { totalFetched, shops: results };
}
