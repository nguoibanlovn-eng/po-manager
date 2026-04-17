import { listShopeeAds, listShopeeDaily, listShops } from "@/lib/db/shopee";
import { getChannelTarget } from "@/lib/db/tiktok";
import { dateVN } from "@/lib/helpers";
import { supabaseAdmin } from "@/lib/supabase/admin";
import ShopeeAdsView from "./ShopeeAdsView";

export const dynamic = "force-dynamic";

async function listShopeeNhanhRevenue(from: string, to: string) {
  const db = supabaseAdmin();
  const { data } = await db
    .from("sales_sync")
    .select("period_from, source, revenue_net, order_net")
    .eq("channel", "Shopee")
    .gte("period_from", from)
    .lte("period_from", to)
    .order("period_from", { ascending: true })
    .limit(1000);
  return (data || []).map((r) => ({
    date: r.period_from as string,
    source: (r.source || "") as string,
    revenue: Number(r.revenue_net || 0),
    orders: Number(r.order_net || 0),
  }));
}

export default async function ShopeeAdsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; shop?: string }>;
}) {
  const sp = await searchParams;
  const to = sp.to || dateVN();
  const from = sp.from || dateVN(null, -7);

  // Month target uses current month
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const monthFrom = monthKey.substring(0, 7) + "-01";
  const monthTo = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()).padStart(2, "0")}`;

  const [ads, daily, shops, monthTarget, nhanhRevenue, monthNhanh] = await Promise.all([
    listShopeeAds({ from, to }),
    listShopeeDaily(from.substring(0, 7)),
    listShops(),
    getChannelTarget("shopee", monthKey),
    listShopeeNhanhRevenue(from, to),
    listShopeeNhanhRevenue(monthFrom, monthTo),
  ]);

  const monthActual = monthNhanh.reduce((s, r) => s + r.revenue, 0);

  return (
    <ShopeeAdsView
      ads={ads} daily={daily} shops={shops}
      from={from} to={to} shop={sp.shop || ""}
      monthTarget={monthTarget} monthActual={monthActual} monthKey={monthKey}
      nhanhRevenue={nhanhRevenue}
    />
  );
}
