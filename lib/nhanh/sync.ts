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

// ─── PRODUCTS ────────────────────────────────────────────────
export async function syncProducts(): Promise<{ inserted: number }> {
  const db = supabaseAdmin();
  const all = await nhanhV3FetchAll<V3Product>("product/list", { filters: {} });
  if (!all.length) return { inserted: 0 };

  const now = nowVN();
  const byId = new Map<number, {
    id: number; sku: string; product_name: string; category: string; unit: string;
    image_url: string; cost_price: number; sell_price: number;
    stock: number; is_active: boolean; last_sync: string;
  }>();
  for (const p of all) {
    if (!p.id || !p.name) continue;
    const inv = p.inventory || {};
    let stock = toNum(inv.remain);
    if (!stock && Array.isArray(inv.depots)) {
      stock = inv.depots.reduce((s, d) => s + toNum(d.remain), 0);
    }
    if (stock < 0) stock = 0;
    byId.set(Number(p.id), {
      id: Number(p.id),
      sku: String(p.barcode || p.code || ""),
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
  }
  const rows = Array.from(byId.values());

  await db.rpc("truncate_table", { tbl: "products" });
  const BATCH = 500;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const { error } = await db.from("products").upsert(chunk, { onConflict: "id" });
    if (error) throw error;
    inserted += chunk.length;
  }
  return { inserted };
}

// ─── INVENTORY ───────────────────────────────────────────────
export async function syncInventory(): Promise<{ inserted: number }> {
  const db = supabaseAdmin();
  const all = await nhanhV3FetchAll<V3Product>("product/list", { filters: {} });
  if (!all.length) return { inserted: 0 };

  const now = nowVN();
  const bySku = new Map<string, {
    sku: string; product_name: string; category: string;
    available_qty: number; in_transit_qty: number; total_qty: number;
    reserved_qty: number; sold_30d: number; last_sync: string;
  }>();
  for (const p of all) {
    const sku = String(p.barcode || p.code || "");
    if (!sku) continue;
    const inv = p.inventory || {};
    const remain = toNum(inv.remain);
    const shipping = toNum(inv.shipping);
    const holding = toNum(inv.holding);
    const sold30 = toNum(inv.sold || inv.soldCount || inv.totalSold);
    // Sum across variants sharing a barcode instead of overwrite
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
  const rows = Array.from(bySku.values());

  await db.rpc("truncate_table", { tbl: "inventory" });
  const BATCH = 500;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const { error } = await db.from("inventory").upsert(chunk, { onConflict: "sku" });
    if (error) throw error;
    inserted += chunk.length;
  }
  return { inserted };
}

// ─── SALES (by channel) ──────────────────────────────────────
type NhanhOrder = {
  channel?: { saleChannel?: string | number };
  info?: { status?: number | string };
  products?: Array<{ price?: number; quantity?: number }>;
};

export async function syncSalesByChannel(opts: {
  from?: string;
  to?: string;
} = {}): Promise<{ channels: number; orders: number }> {
  const from = opts.from || "2026-01-01";
  const to = opts.to || dateVN();
  const db = supabaseAdmin();

  // Load source names
  const sourceMap = new Map<string, string>([
    ["1", "Facebook (legacy)"],
    ["10", "Facebook (legacy 2)"],
    ["48", "TikTok Shop"],
  ]);
  const srcR = await nhanhReq<Array<{ id: string | number; name: string }>>(
    "/order/source",
    {},
  );
  if (srcR.code === 1 && Array.isArray(srcR.data)) {
    for (const s of srcR.data) sourceMap.set(String(s.id), String(s.name));
  }

  const orders = await import("./client").then(({ nhanhFetchAll }) =>
    nhanhFetchAll<NhanhOrder>("/order/index", {
      filters: { createdFrom: from, createdTo: to },
    }, 30),
  );

  const byChannel = new Map<
    string,
    { name: string; orders: number; cancel: number; rev: number; revCancel: number }
  >();
  for (const o of orders) {
    const pid = String(o.channel?.saleChannel || "__other__");
    if (!byChannel.has(pid)) {
      byChannel.set(pid, {
        name: sourceMap.get(pid) || pid,
        orders: 0, cancel: 0, rev: 0, revCancel: 0,
      });
    }
    const rec = byChannel.get(pid)!;
    rec.orders++;
    const status = toNum(o.info?.status);
    const cancelled = [6, 9, 10, 11, 13].includes(status);
    const amt = (o.products || []).reduce(
      (s, p) => s + toNum(p.price) * toNum(p.quantity || 1),
      0,
    );
    if (cancelled) { rec.cancel++; rec.revCancel += amt; }
    else rec.rev += amt;
  }

  const rows = Array.from(byChannel.entries())
    .filter(([pid]) => pid !== "__other__")
    .map(([pid, r]) => ({
      channel: pid,
      source: r.name,
      period_from: from,
      period_to: to,
      order_total: r.orders,
      order_cancel: r.cancel,
      order_net: r.orders - r.cancel,
      revenue_total: r.rev + r.revCancel,
      revenue_cancel: r.revCancel,
      revenue_net: r.rev,
      order_success: r.orders - r.cancel,
      revenue_success: r.rev,
      synced_at: nowVN(),
    }));

  if (rows.length) {
    const { error } = await db
      .from("sales_sync")
      .upsert(rows, { onConflict: "channel,source,period_from,period_to" });
    if (error) throw error;
  }
  return { channels: rows.length, orders: orders.length };
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
  const orders = await nhanhFetchAll<NhanhOrder & NhanhCustomer>(
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
      (s, p) => s + toNum(p.price) * toNum(p.quantity || 1),
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
