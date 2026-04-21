import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { nowVN, dateVN } from "@/lib/helpers";
import { toNum } from "@/lib/format";
import { nhanhReq, nhanhV3FetchAll } from "./client";

type V3Product = {
  id?: number;
  barcode?: string;
  code?: string;
  name?: string;
  status?: number | string;
  categoryName?: string;
  cateName?: string;
  categoryPath?: string;
  units?: { name?: string };
  images?: { avatar?: string };
  prices?: { import?: number; avgCost?: number; retail?: number };
  inventory?: {
    remain?: number;
    available?: number;
    shipping?: number;
    holding?: number;
    sold?: number;
    soldCount?: number;
    totalSold?: number;
    depots?: Array<{ remain?: number }>;
  };
};

// ─── PRODUCTS + INVENTORY (shared fetch) ─────────────────────
// Gộp 2 sync thành 1 call tới Nhanh v3 product/list.
// Tiết kiệm ~50% thời gian cron (trước: 2 × ~2 phút, nay: 1 × ~2 phút).

type ProductRow = {
  id: number; sku: string; product_name: string; category: string; unit: string;
  image_url: string; cost_price: number; sell_price: number;
  stock: number; is_active: boolean; last_sync: string;
};
type InventoryRow = {
  sku: string; product_name: string; category: string;
  available_qty: number; in_transit_qty: number; total_qty: number;
  reserved_qty: number; sold_30d: number; last_sync: string;
};

function buildRows(all: V3Product[], now: string): { products: ProductRow[]; inventory: InventoryRow[] } {
  const byId = new Map<number, ProductRow>();
  const bySku = new Map<string, InventoryRow>();
  for (const p of all) {
    if (!p.id || !p.name) continue;
    const sku = String(p.barcode || p.code || "");
    const inv = p.inventory || {};
    let stock = toNum(inv.remain);
    if (!stock && Array.isArray(inv.depots)) {
      stock = inv.depots.reduce((s, d) => s + toNum(d.remain), 0);
    }
    if (stock < 0) stock = 0;

    // Products: 1 row per Nhanh product.id (variants tách riêng)
    byId.set(Number(p.id), {
      id: Number(p.id),
      sku,
      product_name: p.name || "",
      category: String(p.categoryName || p.cateName || p.categoryPath || ""),
      unit: p.units?.name || "cái",
      image_url: p.images?.avatar || "",
      cost_price: toNum(p.prices?.import || p.prices?.avgCost),
      sell_price: toNum(p.prices?.retail),
      stock,
      is_active: p.status === 1 || p.status === "Active",
      last_sync: now,
    });

    // Inventory: gom variants cùng barcode (cộng dồn tồn)
    if (!sku) continue;
    const remain = toNum(inv.remain);
    const shipping = toNum(inv.shipping);
    const holding = toNum(inv.holding);
    const sold30 = toNum(inv.sold || inv.soldCount || inv.totalSold);
    const existing = bySku.get(sku);
    if (existing) {
      existing.available_qty += remain;
      existing.in_transit_qty += shipping;
      existing.total_qty += remain + shipping;
      existing.reserved_qty += holding;
      existing.sold_30d += sold30;
    } else {
      bySku.set(sku, {
        sku,
        product_name: p.name || "",
        category: "",
        available_qty: remain,
        in_transit_qty: shipping,
        total_qty: remain + shipping,
        reserved_qty: holding,
        sold_30d: sold30,
        last_sync: now,
      });
    }
  }
  return { products: Array.from(byId.values()), inventory: Array.from(bySku.values()) };
}

async function writeBatched<T>(
  table: string,
  rows: T[],
  conflict: string,
): Promise<number> {
  const db = supabaseAdmin();
  await db.rpc("truncate_table", { tbl: table });
  const BATCH = 500;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const { error } = await db.from(table).upsert(chunk as never, { onConflict: conflict });
    if (error) throw error;
    inserted += chunk.length;
  }
  return inserted;
}

// Gộp: fetch 1 lần, ghi cả 2 bảng.
export async function syncProductsAndInventory(): Promise<{
  products: number; inventory: number;
}> {
  const all = await nhanhV3FetchAll<V3Product>("product/list", { filters: {} });
  if (!all.length) return { products: 0, inventory: 0 };
  const { products, inventory } = buildRows(all, nowVN());
  // Ghi tuần tự (upsert + truncate lock cùng bảng nếu parallel không an toàn)
  const p = await writeBatched("products", products, "id");
  const i = await writeBatched("inventory", inventory, "sku");
  return { products: p, inventory: i };
}

// Compatibility wrappers — cho admin-settings UI gọi riêng từng nút.
// Cả 2 đều fetch product/list 1 lần và chỉ ghi bảng tương ứng.
export async function syncProducts(): Promise<{ inserted: number }> {
  const all = await nhanhV3FetchAll<V3Product>("product/list", { filters: {} });
  if (!all.length) return { inserted: 0 };
  const { products } = buildRows(all, nowVN());
  const inserted = await writeBatched("products", products, "id");
  return { inserted };
}

export async function syncInventory(): Promise<{ inserted: number }> {
  const all = await nhanhV3FetchAll<V3Product>("product/list", { filters: {} });
  if (!all.length) return { inserted: 0 };
  const { inventory } = buildRows(all, nowVN());
  const inserted = await writeBatched("inventory", inventory, "sku");
  return { inserted };
}

// ─── SALES (by channel) ──────────────────────────────────────
// V3 order structure
type V3SalesOrder = {
  info?: { createdAt?: number; status?: number };
  channel?: { saleChannel?: number; pageId?: string; shopId?: string; appOrderId?: string };
  products?: Array<{ price?: number; priceAfterVAT?: number; quantity?: number }>;
};

// V3 status codes to EXCLUDE (cancelled, returned, failed)
const SKIP_STATUSES = new Set([72, 73, 74, 75]);

// V3 status codes that count as "success" (Đơn thành công)
// 42=Confirmed, 59=Success, 63=Delivered — matches Nhanh report definition
const SUCCESS_STATUSES = new Set([42, 59, 63]);

// Shopee shopId → shop name (from Shopee Open API)
const SHOPEE_SHOP_MAP: Record<string, string> = {
  "10091288": "Levu01",
  "303340636": "Velasboost",
  "998924544": "FlaskWay",
};

// TikTok shopId → shop name (from Nhanh V3 order data)
const TIKTOK_SHOP_MAP: Record<string, string> = {
  "7495209800128629683": "Lỗ Vũ 1",
  "7494954420886079683": "Velasboost",
  "7494688600083827363": "Vuabanlo Shop",
};

// Nhanh saleChannel ID → category name
const CHANNEL_MAP: Record<string, string> = {
  "20": "Facebook",
  "42": "Shopee",
  "48": "TikTok",
  "1": "Admin",
  "10": "API",
};

export async function syncSalesByChannel(opts: {
  from?: string;
  to?: string;
} = {}): Promise<{ channels: number; orders: number; logs?: string[] }> {
  const isCron = !opts.from && !opts.to; // no explicit range = cron/background
  const to = opts.to || dateVN();
  const from = opts.from || dateVN(null, -7);
  const db = supabaseAdmin();
  const logs: string[] = [];

  // Load FB page names from insights_cache (has FB page_id → page_name)
  const { data: insightsPages } = await db.from("insights_cache")
    .select("page_id, page_name")
    .order("date", { ascending: false })
    .limit(500);
  const pageNameMap = new Map<string, string>();
  for (const p of insightsPages || []) {
    if (p.page_id && p.page_name && !pageNameMap.has(p.page_id)) {
      pageNameMap.set(p.page_id, p.page_name);
    }
  }

  // V3 API returns orders sorted by newest first
  // Stop early when we've passed the date range (no need to fetch all 20k orders)
  logs.push(`[syncSales] Fetching orders via V3... (from=${from}, to=${to})`);
  const allOrders = await nhanhV3FetchAll<V3SalesOrder>("order/list", {}, {
    maxPages: 200,
    onPage: (chunk, page) => {
      // V3 returns newest first — stop when oldest order in chunk is before date range
      const oldest = chunk.reduce((min, o) => {
        const ts = o.info?.createdAt || Infinity;
        return ts < min ? ts : min;
      }, Infinity);
      const oldestDate = oldest < Infinity ? new Date(oldest * 1000).toISOString().substring(0, 10) : from;
      if (oldestDate < from) {
        logs.push(`[syncSales] Stopped at page ${page} (reached ${oldestDate})`);
        return false; // stop pagination
      }
    },
  });
  logs.push(`[syncSales] Fetched ${allOrders.length} orders`);

  // Group by (date, channel, source)
  // Track both total (all non-cancelled) and success (status 59 only)
  type Bucket = { orders: number; rev: number; ordersSuccess: number; revSuccess: number };
  const buckets = new Map<string, Bucket>();
  let inRangeCount = 0;

  for (const o of allOrders) {
    const ts = o.info?.createdAt;
    const date = ts ? new Date(ts * 1000).toISOString().substring(0, 10) : null;
    if (!date || date < from || date > to) continue;

    // Skip cancelled/returned orders
    const status = o.info?.status ?? 0;
    if (SKIP_STATUSES.has(status)) continue;
    inRangeCount++;

    const chId = String(o.channel?.saleChannel ?? "__other__");
    // API (10) and Admin (1) channels rarely update status on Nhanh,
    // so treat all non-cancelled orders as success for these channels.
    const isSuccess = (chId === "10" || chId === "1")
      ? true  // API/Admin: all non-cancelled = success
      : SUCCESS_STATUSES.has(status);
    const chName = CHANNEL_MAP[chId] || chId;

    // For Facebook orders, use pageId → page name
    let source = chName;
    if (chId === "20" && o.channel?.pageId) {
      source = pageNameMap.get(o.channel.pageId) || o.channel.pageId;
    }
    // For Shopee orders, use shopId → shop name
    if (chId === "42" && o.channel?.shopId) {
      source = SHOPEE_SHOP_MAP[o.channel.shopId] || o.channel.shopId;
    }
    // For TikTok orders, use shopId → shop name
    if (chId === "48" && o.channel?.shopId) {
      source = TIKTOK_SHOP_MAP[o.channel.shopId] || o.channel.shopId;
    }

    // Revenue = sum of price × qty (giá khách trả, khớp báo cáo Nhanh)
    const rev = (o.products || []).reduce(
      (s, p) => s + toNum(p.price) * toNum(p.quantity || 1), 0,
    );

    const key = `${date}|${chName}|${source}`;
    const b = buckets.get(key) || { orders: 0, rev: 0, ordersSuccess: 0, revSuccess: 0 };
    b.orders++;
    b.rev += rev;
    if (isSuccess) { b.ordersSuccess++; b.revSuccess += rev; }
    buckets.set(key, b);
  }

  logs.push(`[syncSales] In range ${from}→${to}: ${inRangeCount} orders`);

  // Check which dates already have Drive data (Drive imports ALL channels at once,
  // so a date with >= 3 distinct channels = complete Drive import → skip entirely)
  const apiDates = new Set<string>();
  for (const [key] of buckets) apiDates.add(key.split("|")[0]);

  const { data: existingRows } = await db.from("sales_sync")
    .select("period_from, channel")
    .gte("period_from", from)
    .lte("period_from", to)
    .limit(10000);
  // Count distinct channels per date
  const channelsByDate = new Map<string, Set<string>>();
  for (const r of existingRows || []) {
    const d = r.period_from as string;
    if (!channelsByDate.has(d)) channelsByDate.set(d, new Set());
    channelsByDate.get(d)!.add(r.channel as string);
  }

  // Cron (no explicit from/to): force re-sync last 3 days for status updates.
  // User trigger (explicit from/to): only sync requested range, skip dates with data.
  const today = dateVN();
  const recentDates = isCron
    ? new Set([today, dateVN(null, -1), dateVN(null, -2)])
    : new Set<string>(); // user trigger: don't force re-sync old dates

  const newDates = [...apiDates].filter((d) =>
    recentDates.has(d) || (channelsByDate.get(d)?.size || 0) < 5,
  );
  const skippedDates = [...apiDates].filter((d) =>
    !recentDates.has(d) && (channelsByDate.get(d)?.size || 0) >= 5,
  );
  if (skippedDates.length) {
    logs.push(`[syncSales] Skipped ${skippedDates.length} days (have Drive data): ${skippedDates.slice(-3).join(", ")}`);
  }

  // Delete old data for new dates (replace with fresh API data)
  for (const d of newDates) {
    await db.from("sales_sync").delete().eq("period_from", d).eq("period_to", d);
  }
  if (newDates.length) logs.push(`[syncSales] Writing ${newDates.length} days: ${newDates.join(", ")}`);

  // Write to DB — only new dates
  const rows = Array.from(buckets.entries())
    .filter(([key]) => newDates.includes(key.split("|")[0]))
    .map(([key, b]) => {
    const parts = key.split("|");
    const date = parts[0];
    const channel = parts[1];
    const source = parts[2];
    return {
      channel,
      source,
      period_from: date,
      period_to: date,
      order_total: b.orders,
      order_cancel: 0,
      order_net: b.orders,
      revenue_total: b.rev,
      revenue_cancel: 0,
      revenue_net: b.revSuccess,
      order_success: b.ordersSuccess,
      revenue_success: b.revSuccess,
      synced_at: nowVN(),
    };
  });

  if (rows.length) {
    for (let i = 0; i < rows.length; i += 200) {
      const chunk = rows.slice(i, i + 200);
      const { error } = await db
        .from("sales_sync")
        .upsert(chunk, { onConflict: "channel,source,period_from,period_to" });
      if (error) throw error;
    }
  }

  // Log summary per day
  const byDate = new Map<string, { orders: number; rev: number }>();
  for (const [key, b] of buckets) {
    const date = key.split("|")[0];
    const d = byDate.get(date) || { orders: 0, rev: 0 };
    d.orders += b.orders;
    d.rev += b.rev;
    byDate.set(date, d);
  }
  for (const [date, d] of [...byDate.entries()].sort()) {
    logs.push(`  ${date}: ${d.orders} đơn, ${(d.rev / 1e6).toFixed(1)}M`);
  }

  logs.push(`[syncSales] Saved ${rows.length} rows`);
  return { channels: rows.length, orders: allOrders.length, logs };
}

// ─── CUSTOMERS (aggregate from orders) ───────────────────────
type NhanhCustomer = {
  customerId?: string | number;
  customerMobile?: string;
  customerName?: string;
  customerEmail?: string;
  customerAddress?: string;
  customerCityName?: string;
};

export async function syncCustomersFromOrders(opts: {
  days?: number;
} = {}): Promise<{ customers: number }> {
  const days = opts.days ?? 90;
  const from = dateVN(null, -days);
  const to = dateVN();
  const db = supabaseAdmin();

  const { nhanhFetchAll } = await import("./client");
  const orders = await nhanhFetchAll<V3SalesOrder & NhanhCustomer>(
    "/order/index",
    { filters: { createdFrom: from, createdTo: to } },
    50,
  );

  const byId = new Map<string, {
    customer_id: string;
    name: string;
    phone: string;
    email: string;
    address: string;
    city: string;
    total_orders: number;
    total_revenue: number;
    last_order_date: string | null;
  }>();

  for (const o of orders) {
    const id = String(o.customerId || o.customerMobile || "");
    if (!id) continue;
    if (!byId.has(id)) {
      byId.set(id, {
        customer_id: id,
        name: o.customerName || "",
        phone: o.customerMobile || "",
        email: o.customerEmail || "",
        address: o.customerAddress || "",
        city: o.customerCityName || "",
        total_orders: 0,
        total_revenue: 0,
        last_order_date: null,
      });
    }
    const rec = byId.get(id)!;
    rec.total_orders++;
    const amt = (o.products || []).reduce(
      (s: number, p: { price?: number; quantity?: number }) => s + toNum(p.price) * toNum(p.quantity || 1),
      0,
    );
    rec.total_revenue += amt;
  }

  const rows = Array.from(byId.values()).map((r) => ({ ...r, synced_at: nowVN() }));
  const BATCH = 500;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const { error } = await db.from("customers").upsert(chunk, { onConflict: "customer_id" });
    if (error) throw error;
  }
  return { customers: rows.length };
}
