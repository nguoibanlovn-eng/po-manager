import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { dateVN } from "@/lib/helpers";

export type DashStats = {
  orders: {
    total: number;
    draft: number;
    ordered: number;
    arrived: number;
    onShelf: number;
    selling: number;
    completed: number;
  };
  finance: {
    totalOrderValue: number;
    totalDeposited: number;
    outstanding: number;
  };
  damage: {
    pendingItems: number;
    pendingValue: number;
  };
  inventory: {
    totalSkus: number;
    outOfStock: number;
    lowStock: number;
  };
  revenue: {
    fromAds: number;
    adSpend: number;
    shopeeRevenue: number;
    shopeeAdSpend: number;
    tiktokAdSpend: number;
    tiktokRevenue: number;
    salesSyncRevenue: number;
  };
  customers: number;
};

export async function getDashboardStats(monthKey?: string): Promise<DashStats> {
  const db = supabaseAdmin();
  const month = monthKey || dateVN().substring(0, 7);
  const [y, m] = month.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const from = `${month}-01`;
  const to = `${month}-${String(lastDay).padStart(2, "0")}`;

  // Orders
  const { data: orderStageRows = [] } = await db
    .from("orders")
    .select("stage, order_total, deposit_amount")
    .eq("is_deleted", false);
  const ords = orderStageRows || [];
  const byStage = {
    total: ords.length,
    draft: ords.filter((o) => o.stage === "DRAFT").length,
    ordered: ords.filter((o) => o.stage === "ORDERED").length,
    arrived: ords.filter((o) => o.stage === "ARRIVED").length,
    onShelf: ords.filter((o) => o.stage === "ON_SHELF").length,
    selling: ords.filter((o) => o.stage === "SELLING").length,
    completed: ords.filter((o) => o.stage === "COMPLETED").length,
  };
  const totalOrderValue = ords.reduce((s, o) => s + Number(o.order_total || 0), 0);
  const totalDeposited = ords.reduce((s, o) => s + Number(o.deposit_amount || 0), 0);

  // Damage
  const { data: damageItems = [] } = await db
    .from("items")
    .select("damage_amount")
    .eq("is_deleted", false)
    .eq("damage_handled", false)
    .gt("damage_qty", 0);
  const pendingItems = (damageItems || []).length;
  const pendingValue = (damageItems || []).reduce((s, it) => s + Number(it.damage_amount || 0), 0);

  // Inventory
  const { count: totalSkus } = await db.from("inventory").select("*", { count: "exact", head: true });
  const { count: outOfStock } = await db
    .from("inventory").select("*", { count: "exact", head: true })
    .lte("available_qty", 0);
  const { count: lowStock } = await db
    .from("inventory").select("*", { count: "exact", head: true })
    .gt("available_qty", 0).lte("available_qty", 5);

  // Revenue
  const { data: ads = [] } = await db
    .from("ads_cache").select("spend, purchase_value")
    .gte("date", from).lte("date", to);
  const adSpend = (ads || []).reduce((s, a) => s + Number(a.spend || 0), 0);
  const fromAds = (ads || []).reduce((s, a) => s + Number(a.purchase_value || 0), 0);

  const { data: shopeeAds = [] } = await db
    .from("shopee_ads").select("spend, revenue")
    .gte("date", from).lte("date", to);
  const shopeeAdSpend = (shopeeAds || []).reduce((s, a) => s + Number(a.spend || 0), 0);
  const { data: shopeeDaily = [] } = await db
    .from("shopee_daily").select("revenue")
    .gte("date", from).lte("date", to);
  const shopeeRevenue = (shopeeDaily || []).reduce((s, d) => s + Number(d.revenue || 0), 0);

  const { data: tiktokAds = [] } = await db
    .from("tiktok_ads").select("spend, conversion_value")
    .gte("date", from).lte("date", to);
  const tiktokAdSpend = (tiktokAds || []).reduce((s, a) => s + Number(a.spend || 0), 0);
  const tiktokRevenue = (tiktokAds || []).reduce((s, a) => s + Number(a.conversion_value || 0), 0);

  const { data: salesSync = [] } = await db
    .from("sales_sync").select("revenue_net")
    .gte("period_from", from).lte("period_to", to);
  const salesSyncRevenue = (salesSync || []).reduce((s, r) => s + Number(r.revenue_net || 0), 0);

  // Customers
  const { count: customers } = await db.from("customers").select("*", { count: "exact", head: true });

  return {
    orders: byStage,
    finance: {
      totalOrderValue,
      totalDeposited,
      outstanding: totalOrderValue - totalDeposited,
    },
    damage: { pendingItems, pendingValue },
    inventory: {
      totalSkus: totalSkus || 0,
      outOfStock: outOfStock || 0,
      lowStock: lowStock || 0,
    },
    revenue: {
      fromAds, adSpend,
      shopeeRevenue, shopeeAdSpend,
      tiktokAdSpend, tiktokRevenue,
      salesSyncRevenue,
    },
    customers: customers || 0,
  };
}

/** Revenue by channel from sales_sync (nhanh.vn) for a date range */
export async function getRevenueByChannel(from: string, to: string) {
  const db = supabaseAdmin();
  const { data } = await db
    .from("sales_sync")
    .select("period_from, channel, revenue_net, order_net")
    .gte("period_from", from)
    .lte("period_from", to)
    .order("period_from", { ascending: true })
    .limit(5000);

  const byChannel = new Map<string, { revenue: number; orders: number }>();
  const byDate = new Map<string, number>();

  for (const r of data || []) {
    const ch = String(r.channel || "Khác");
    const cur = byChannel.get(ch) || { revenue: 0, orders: 0 };
    cur.revenue += Number(r.revenue_net || 0);
    cur.orders += Number(r.order_net || 0);
    byChannel.set(ch, cur);

    const d = String(r.period_from || "");
    byDate.set(d, (byDate.get(d) || 0) + Number(r.revenue_net || 0));
  }

  return {
    channels: Array.from(byChannel.entries())
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.revenue - a.revenue),
    daily: Array.from(byDate.entries())
      .map(([date, revenue]) => ({ date, revenue }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    total: Array.from(byChannel.values()).reduce((s, v) => s + v.revenue, 0),
    totalOrders: Array.from(byChannel.values()).reduce((s, v) => s + v.orders, 0),
  };
}

/** Yearly summary: revenue per month + targets per month + ads per month */
export async function getYearlySummary(year: number) {
  const db = supabaseAdmin();
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;

  // Revenue by month from sales_sync
  const { data: salesData } = await db
    .from("sales_sync")
    .select("period_from, channel, revenue_net, order_net")
    .gte("period_from", from).lte("period_from", to)
    .limit(10000);

  const revByMonth = new Map<string, { total: number; byChannel: Map<string, number> }>();
  for (const r of salesData || []) {
    const m = String(r.period_from || "").substring(0, 7);
    if (!m) continue;
    const entry = revByMonth.get(m) || { total: 0, byChannel: new Map() };
    const rev = Number(r.revenue_net || 0);
    entry.total += rev;
    const ch = String(r.channel || "Khác");
    entry.byChannel.set(ch, (entry.byChannel.get(ch) || 0) + rev);
    revByMonth.set(m, entry);
  }

  // Targets by month
  const { data: targetData } = await db
    .from("targets")
    .select("ref_id, month_key, rev_target")
    .eq("type", "channel")
    .gte("month_key", from).lte("month_key", to);

  const targetByMonth = new Map<string, number>();
  const targetByMonthChannel = new Map<string, Map<string, number>>();
  for (const t of targetData || []) {
    const m = String(t.month_key || "").substring(0, 7);
    targetByMonth.set(m, (targetByMonth.get(m) || 0) + Number(t.rev_target || 0));
    const chMap = targetByMonthChannel.get(m) || new Map();
    chMap.set(String(t.ref_id || ""), Number(t.rev_target || 0));
    targetByMonthChannel.set(m, chMap);
  }

  // Ads spend by month
  const { data: fbAds } = await db.from("ads_cache").select("date, spend").gte("date", from).lte("date", to);
  const { data: spAds } = await db.from("shopee_ads").select("date, spend").gte("date", from).lte("date", to);
  const { data: tkAds } = await db.from("tiktok_ads").select("date, spend").gte("date", from).lte("date", to);

  const adsByMonth = new Map<string, { fb: number; shopee: number; tiktok: number; total: number }>();
  for (const a of fbAds || []) {
    const m = String(a.date || "").substring(0, 7);
    const e = adsByMonth.get(m) || { fb: 0, shopee: 0, tiktok: 0, total: 0 };
    e.fb += Number(a.spend || 0); e.total += Number(a.spend || 0);
    adsByMonth.set(m, e);
  }
  for (const a of spAds || []) {
    const m = String(a.date || "").substring(0, 7);
    const e = adsByMonth.get(m) || { fb: 0, shopee: 0, tiktok: 0, total: 0 };
    e.shopee += Number(a.spend || 0); e.total += Number(a.spend || 0);
    adsByMonth.set(m, e);
  }
  for (const a of tkAds || []) {
    const m = String(a.date || "").substring(0, 7);
    const e = adsByMonth.get(m) || { fb: 0, shopee: 0, tiktok: 0, total: 0 };
    e.tiktok += Number(a.spend || 0); e.total += Number(a.spend || 0);
    adsByMonth.set(m, e);
  }

  // Build 12-month array
  const months: Array<{
    month: string; revenue: number; target: number; ads: number;
    adsFb: number; adsShopee: number; adsTiktok: number;
    byChannel: Record<string, number>;
  }> = [];
  let cumRevenue = 0, cumTarget = 0, cumAds = 0;
  for (let mi = 1; mi <= 12; mi++) {
    const m = `${year}-${String(mi).padStart(2, "0")}`;
    const rev = revByMonth.get(m)?.total || 0;
    const tgt = targetByMonth.get(m) || 0;
    const ad = adsByMonth.get(m) || { fb: 0, shopee: 0, tiktok: 0, total: 0 };
    cumRevenue += rev; cumTarget += tgt; cumAds += ad.total;
    const byChannel: Record<string, number> = {};
    for (const [ch, v] of revByMonth.get(m)?.byChannel || []) byChannel[ch] = v;
    months.push({ month: m, revenue: rev, target: tgt, ads: ad.total, adsFb: ad.fb, adsShopee: ad.shopee, adsTiktok: ad.tiktok, byChannel });
  }

  return { year, months, cumRevenue, cumTarget, cumAds, yearTarget: cumTarget };
}

/** Channel targets aggregated for a full year */
export async function getYearlyChannelTargets(year: number): Promise<Record<string, number>> {
  const db = supabaseAdmin();
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;
  const { data } = await db
    .from("targets")
    .select("ref_id, rev_target")
    .eq("type", "channel")
    .gte("month_key", from)
    .lte("month_key", to);

  const byChannel: Record<string, number> = {};
  for (const t of data || []) {
    const ch = String(t.ref_id || "");
    byChannel[ch] = (byChannel[ch] || 0) + Number(t.rev_target || 0);
  }
  return byChannel;
}

export async function getRecentOrders(limit = 10) {
  const { data } = await supabaseAdmin()
    .from("orders")
    .select("order_id, order_name, supplier_name, stage, order_total, created_at, owner")
    .eq("is_deleted", false)
    .order("created_at", { ascending: false })
    .limit(limit);
  return data || [];
}
