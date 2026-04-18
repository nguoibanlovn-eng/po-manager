import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { nowVN, dateVN } from "@/lib/helpers";
import { toNum } from "@/lib/format";
import { nhanhV3FetchAll } from "./client";

/**
 * Sync product-level sales from Nhanh.vn orders.
 * Fetches orders day-by-day (like GAS syncProductSalesDaily),
 * extracts individual product items, and upserts into product_sales table.
 *
 * Nhanh V3 order/list → parse order.products → one row per SKU per order.
 */

type V3Order = {
  info?: { id?: string | number; status?: string | number; createdAt?: string | number };
  channel?: { saleChannel?: string | number };
  products?: Array<{
    barcode?: string; code?: string; name?: string;
    quantity?: number | string; price?: number | string; originalPrice?: number | string;
  }> | Record<string, {
    barcode?: string; code?: string; name?: string;
    quantity?: number | string; price?: number | string; originalPrice?: number | string;
  }>;
};

const CHANNEL_MAP: Record<string, string> = {
  "0": "Admin", "1": "API", "2": "Facebook", "5": "Shopee",
  "20": "Shopee Levu01", "48": "TikTok Shop",
};

// Cancelled/returned statuses — skip these
const SKIP_STATUS = ["7", "8"];

type ProductSaleRow = {
  date: string; sku: string; product_name: string; order_id: string;
  channel: string; channel_name: string; qty: number; unit_price: number;
  revenue: number; status: string; synced_at: string;
};

/** Sync product sales for a single day */
async function syncProductSalesForDay(day: string): Promise<{ orders: number; rows: number }> {
  const orders = await nhanhV3FetchAll<V3Order>("order/list", {
    filters: { fromDate: day, toDate: day },
  }, { maxPages: 50 });

  const now = nowVN();
  const rows: ProductSaleRow[] = [];

  for (const o of orders) {
    const info = o.info || {};
    const ch = o.channel || {};
    const orderId = String(info.id || "");
    const chCode = String(ch.saleChannel || "0");
    const status = String(info.status || "");
    const lastDigit = status.slice(-1);
    if (SKIP_STATUS.includes(lastDigit)) continue;

    // Parse order date from createdAt (unix timestamp)
    let orderDate = day;
    if (info.createdAt) {
      try {
        const ts = Number(info.createdAt);
        if (ts > 1000000000) {
          const d = new Date(ts * 1000);
          orderDate = d.toISOString().substring(0, 10);
        }
      } catch { /* use day */ }
    }

    // Products can be array or object
    let prods: Array<{ barcode?: string; code?: string; name?: string; quantity?: number | string; price?: number | string; originalPrice?: number | string }> = [];
    if (Array.isArray(o.products)) {
      prods = o.products;
    } else if (o.products && typeof o.products === "object") {
      prods = Object.values(o.products);
    }

    for (const p of prods) {
      const sku = String(p.barcode || p.code || "").trim();
      const qty = toNum(p.quantity);
      const price = toNum(p.price || p.originalPrice);
      if (!sku || qty <= 0) continue;

      rows.push({
        date: orderDate,
        sku,
        product_name: String(p.name || ""),
        order_id: orderId,
        channel: chCode,
        channel_name: CHANNEL_MAP[chCode] || `Kênh ${chCode}`,
        qty,
        unit_price: price,
        revenue: qty * price,
        status,
        synced_at: now,
      });
    }
  }

  // Upsert in batches
  if (rows.length > 0) {
    const db = supabaseAdmin();
    const BATCH = 500;
    for (let i = 0; i < rows.length; i += BATCH) {
      const chunk = rows.slice(i, i + BATCH);
      const { error } = await db
        .from("product_sales")
        .upsert(chunk, { onConflict: "order_id,sku" });
      if (error) console.warn(`product_sales upsert error day=${day}:`, error.message);
    }
  }

  return { orders: orders.length, rows: rows.length };
}

/**
 * Sync product sales for a date range, day by day.
 * Like GAS apiSyncSales30DaysByDay but iterates automatically.
 */
export async function syncProductSales(opts: {
  from?: string; to?: string;
} = {}): Promise<{ totalOrders: number; totalRows: number; days: number; errors: string[] }> {
  const to = opts.to || dateVN(null, -1); // yesterday
  const from = opts.from || dateVN(null, -7); // last 7 days

  const errors: string[] = [];
  let totalOrders = 0, totalRows = 0, days = 0;

  // Iterate day by day
  const startDate = new Date(from + "T00:00:00Z");
  const endDate = new Date(to + "T00:00:00Z");

  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    const day = d.toISOString().substring(0, 10);
    try {
      const result = await syncProductSalesForDay(day);
      totalOrders += result.orders;
      totalRows += result.rows;
      days++;
      // Rate limit
      await new Promise((r) => setTimeout(r, 200));
    } catch (e) {
      errors.push(`${day}: ${(e as Error).message}`);
    }
  }

  return { totalOrders, totalRows, days, errors };
}
