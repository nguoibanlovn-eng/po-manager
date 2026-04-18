import { listSalesSync } from "@/lib/db/webapp";
import { getChannelTarget } from "@/lib/db/tiktok";
import { dateVN } from "@/lib/helpers";
import WebAppView from "./WebAppView";

export const dynamic = "force-dynamic";

// Web/App B2B = everything except Facebook, TikTok, Shopee marketplace channels
const EXCLUDE_CHANNELS = ["Facebook", "TikTok", "Shopee"];

export default async function WebAppPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const to = sp.to || dateVN();
  const from = sp.from || dateVN(null, -30);

  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const monthFrom = monthKey.substring(0, 7) + "-01";
  const monthTo = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()).padStart(2, "0")}`;

  const [allRows, monthTarget, monthRows] = await Promise.all([
    listSalesSync({ from, to }),
    getChannelTarget("web_b2b", monthKey),
    listSalesSync({ from: monthFrom, to: monthTo }),
  ]);

  // Filter out marketplace channels
  const rows = allRows.filter((r) => !EXCLUDE_CHANNELS.includes(r.channel));
  const monthFiltered = monthRows.filter((r) => !EXCLUDE_CHANNELS.includes(r.channel));
  const monthActual = monthFiltered.reduce((s, r) => s + Number(r.revenue_net || 0), 0);

  return (
    <WebAppView
      rows={rows}
      from={from}
      to={to}
      monthTarget={monthTarget}
      monthActual={monthActual}
      monthKey={monthKey}
    />
  );
}
