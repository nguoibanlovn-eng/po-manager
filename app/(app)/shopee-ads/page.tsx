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
  searchParams: Promise<{ month?: string; shop?: string }>;
}) {
  const sp = await searchParams;
  const month = sp.month || dateVN().substring(0, 7);
  const shop = sp.shop || undefined;

  const monthFrom = `${month}-01`;
  const [y, mo] = month.split("-").map(Number);
  const lastDay = new Date(y, mo, 0).getDate();
  const monthTo = `${month}-${String(lastDay).padStart(2, "0")}`;
  const monthKey = `${month}-01`;

  const [ads, daily, shops, monthTarget, nhanhRevenue] = await Promise.all([
    listShopeeAds({ monthKey: month, shop }),
    listShopeeDaily(month),
    listShops(),
    getChannelTarget("shopee", monthKey),
    listShopeeNhanhRevenue(monthFrom, monthTo),
  ]);

  const monthActual = nhanhRevenue.reduce((s, r) => s + r.revenue, 0);

  return (
    <ShopeeAdsView
      ads={ads} daily={daily} shops={shops} month={month} shop={shop || ""}
      monthTarget={monthTarget} monthActual={monthActual} monthKey={monthKey}
      nhanhRevenue={nhanhRevenue}
    />
  );
}
