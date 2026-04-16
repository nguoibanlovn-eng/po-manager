import { listAllChannels, listSalesSync } from "@/lib/db/webapp";
import { dateVN } from "@/lib/helpers";
import WebAppView from "./WebAppView";

export const dynamic = "force-dynamic";

export default async function WebAppPage({
  searchParams,
}: {
  searchParams: Promise<{ channel?: string; from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const from = sp.from || dateVN(null, -30);
  const to = sp.to || dateVN();
  const [channels, rows] = await Promise.all([
    listAllChannels(),
    listSalesSync({ channel: sp.channel, from, to }),
  ]);
  return <WebAppView channels={channels} rows={rows} channel={sp.channel || ""} from={from} to={to} />;
}
