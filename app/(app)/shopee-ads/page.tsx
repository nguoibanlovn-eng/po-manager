import { listShopeeAds, listShopeeDaily, listShops } from "@/lib/db/shopee";
import { dateVN } from "@/lib/helpers";
import ShopeeAdsView from "./ShopeeAdsView";

export const dynamic = "force-dynamic";

export default async function ShopeeAdsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; shop?: string }>;
}) {
  const sp = await searchParams;
  const month = sp.month || dateVN().substring(0, 7);
  const shop = sp.shop || undefined;
  const [ads, daily, shops] = await Promise.all([
    listShopeeAds({ monthKey: month, shop }),
    listShopeeDaily(month),
    listShops(),
  ]);
  return <ShopeeAdsView ads={ads} daily={daily} shops={shops} month={month} shop={shop || ""} />;
}
