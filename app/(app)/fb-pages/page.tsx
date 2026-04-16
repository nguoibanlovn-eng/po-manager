import { listAdsCache, listInsightsCache, listPages, summarizeAds } from "@/lib/db/ads";
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
  const from = sp.from || dateVN(null, -30);

  const [pages, ads, insights] = await Promise.all([
    listPages("Facebook"),
    listAdsCache({ from, to }),
    listInsightsCache({ from, to }),
  ]);

  const summary = summarizeAds(ads);

  return <FbPagesView pages={pages} ads={ads} insights={insights} summary={summary} from={from} to={to} />;
}
