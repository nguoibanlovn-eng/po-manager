import { getTiktokProductStats, listTiktokAds, listTiktokChannels, listTiktokNhanhRevenue } from "@/lib/db/tiktok";
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
  const [ads, channels, productStats, nhanhRevenue] = await Promise.all([
    listTiktokAds(from, to),
    listTiktokChannels(from, to),
    getTiktokProductStats({ from, to }),
    listTiktokNhanhRevenue(from, to),
  ]);
  return (
    <SalesLeaderView
      ads={ads}
      channels={channels}
      productStats={productStats.products}
      shops={productStats.shops}
      nhanhRevenue={nhanhRevenue}
      from={from}
      to={to}
    />
  );
}
