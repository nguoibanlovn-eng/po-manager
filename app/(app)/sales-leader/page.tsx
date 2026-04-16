import { listTiktokAds, listTiktokChannels } from "@/lib/db/tiktok";
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
  const from = sp.from || dateVN(null, -30);
  const [ads, channels] = await Promise.all([
    listTiktokAds(from, to),
    listTiktokChannels(from, to),
  ]);
  return <SalesLeaderView ads={ads} channels={channels} from={from} to={to} />;
}
