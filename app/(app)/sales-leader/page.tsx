import { getChannelTarget, getTiktokProductStats, listTiktokAds, listTiktokChannels, listTiktokNhanhRevenue } from "@/lib/db/tiktok";
import { dateVN } from "@/lib/helpers";
import SalesLeaderView from "./SalesLeaderView";

export const dynamic = "force-dynamic";

export default async function SalesLeaderPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const to = sp.to || dateVN();
  const from = sp.from || dateVN(null, -7);

  // Current month target
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

  const [ads, channels, productStats, nhanhRevenue, monthTarget] = await Promise.all([
    listTiktokAds(from, to),
    listTiktokChannels(from, to),
    getTiktokProductStats({ from, to }),
    listTiktokNhanhRevenue(from, to),
    getChannelTarget("tiktok", monthKey),
  ]);

  // Get full month revenue for progress bar (always current month, regardless of filter)
  const monthFrom = monthKey.substring(0, 7) + "-01";
  const monthTo = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()).padStart(2, "0")}`;
  const monthRevenue = await listTiktokNhanhRevenue(monthFrom, monthTo);
  const monthActual = monthRevenue.reduce((s, r) => s + r.revenue, 0);

  return (
    <SalesLeaderView
      ads={ads}
      channels={channels}
      productStats={productStats.products}
      shops={productStats.shops}
      nhanhRevenue={nhanhRevenue}
      from={from}
      to={to}
      monthTarget={monthTarget}
      monthActual={monthActual}
      monthKey={monthKey}
    />
  );
}
