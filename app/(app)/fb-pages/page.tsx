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
  const from = sp.from || dateVN();

  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const monthFrom = monthKey.substring(0, 7) + "-01";
  const monthTo = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()).padStart(2, "0")}`;

  // Previous period (same length, shifted back 1 month)
  const fromDate = new Date(from);
  const toDate = new Date(to);
  const daysDiff = Math.ceil((toDate.getTime() - fromDate.getTime()) / 86400000);
  const prevFrom = new Date(fromDate); prevFrom.setMonth(prevFrom.getMonth() - 1);
  const prevTo = new Date(toDate); prevTo.setMonth(prevTo.getMonth() - 1);
  const prevFromStr = prevFrom.toISOString().substring(0, 10);
  const prevToStr = prevTo.toISOString().substring(0, 10);

  // Fetch 90 days nhanh for "Doanh thu chi tiết" section (needs prev period for comparison)
  const nhanh30From = dateVN(null, -90);
  const nhanh30To = dateVN();

  const [pages, ads, insights, nhanhRevenue, monthTarget, monthNhanh, prevAds, nhanh30d, monthAds] = await Promise.all([
    listPages("Facebook"),
    listAdsCache({ from, to }),
    listInsightsCache({ from, to }),
    listFbNhanhRevenue(from, to),
    getChannelTarget("facebook", monthKey),
    listFbNhanhRevenue(monthFrom, monthTo),
    listAdsCache({ from: prevFromStr, to: prevToStr }),
    listFbNhanhRevenue(nhanh30From, nhanh30To),
    listAdsCache({ from: monthFrom, to: monthTo }),
  ]);

  const summary = summarizeAds(ads);
  const prevSummary = summarizeAds(prevAds);
  const monthSummary = summarizeAds(monthAds);
  const monthActual = monthNhanh.reduce((s, r) => s + r.revenue, 0);

  return (
    <FbPagesView
      pages={pages} ads={ads} insights={insights} summary={summary}
      prevAds={prevAds} prevSummary={prevSummary}
      nhanhRevenue={nhanhRevenue} nhanh30d={nhanh30d}
      from={from} to={to}
      monthTarget={monthTarget} monthActual={monthActual} monthKey={monthKey}
      monthAds={monthAds} monthSummary={monthSummary}
    />
  );
}
