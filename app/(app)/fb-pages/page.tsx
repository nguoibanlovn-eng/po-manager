import { listAdsCache, listFbNhanhRevenue, listInsightsCache, listPages, summarizeAds } from "@/lib/db/ads";
import { getChannelTarget } from "@/lib/db/tiktok";
import { dateVN } from "@/lib/helpers";
import FbPagesView from "./FbPagesView";

export const dynamic = "force-dynamic";

export default async function FbPagesPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const to = sp.to || dateVN();
  const from = sp.from || dateVN(null, -7);

  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const monthFrom = monthKey.substring(0, 7) + "-01";
  const monthTo = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()).padStart(2, "0")}`;

  const [pages, ads, insights, nhanhRevenue, monthTarget, monthNhanh] = await Promise.all([
    listPages("Facebook"),
    listAdsCache({ from, to }),
    listInsightsCache({ from, to }),
    listFbNhanhRevenue(from, to),
    getChannelTarget("facebook", monthKey),
    listFbNhanhRevenue(monthFrom, monthTo),
  ]);

  const summary = summarizeAds(ads);
  const monthActual = monthNhanh.reduce((s, r) => s + r.revenue, 0);

  return (
    <FbPagesView
      pages={pages} ads={ads} insights={insights} summary={summary}
      nhanhRevenue={nhanhRevenue}
      from={from} to={to}
      monthTarget={monthTarget} monthActual={monthActual} monthKey={monthKey}
    />
  );
}
