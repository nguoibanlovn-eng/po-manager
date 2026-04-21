import { listAdsCache, listInsightsCache, listPages, listWebNhanhRevenue, summarizeAds } from "@/lib/db/ads";
import { getChannelTarget } from "@/lib/db/tiktok";
import { dateVN } from "@/lib/helpers";
import WebAppView from "./WebAppView";

export const dynamic = "force-dynamic";

export default async function WebAppPage({
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

  const [pages, ads, insights, nhanhRevenue, monthTarget, monthNhanh] = await Promise.all([
    listPages("web"),
    listAdsCache({ from, to }),
    listInsightsCache({ from, to }),
    listWebNhanhRevenue(from, to),
    getChannelTarget("web_b2b", monthKey),
    listWebNhanhRevenue(monthFrom, monthTo),
  ]);

  const summary = summarizeAds(ads);
  const monthActual = monthNhanh.reduce((s, r) => s + r.revenue, 0);

  // Filter ads to only web page ad accounts
  const webAdAccountIds = new Set(pages.map((p) => p.ad_account_id).filter(Boolean));
  const webAds = webAdAccountIds.size > 0
    ? ads.filter((a) => webAdAccountIds.has(a.ad_account_id))
    : ads; // fallback: show all if no pages configured
  const webSummary = summarizeAds(webAds);

  return (
    <WebAppView
      pages={pages}
      ads={webAds}
      insights={insights}
      summary={webSummary}
      nhanhRevenue={nhanhRevenue}
      from={from}
      to={to}
      monthTarget={monthTarget}
      monthActual={monthActual}
      monthKey={monthKey}
    />
  );
}
