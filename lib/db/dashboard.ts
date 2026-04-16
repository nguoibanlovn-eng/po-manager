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

export async function getRecentOrders(limit = 10) {
  const { data } = await supabaseAdmin()
    .from("orders")
    .select("order_id, order_name, supplier_name, stage, order_total, created_at, owner")
    .eq("is_deleted", false)
    .order("created_at", { ascending: false })
    .limit(limit);
  return data || [];
}
