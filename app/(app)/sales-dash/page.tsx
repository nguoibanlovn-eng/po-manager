import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/user";
import { getRevenueByChannel, getDailyAdsBreakdown } from "@/lib/db/dashboard";
import { getChannelTarget } from "@/lib/db/tiktok";
import { dateVN } from "@/lib/helpers";
import StaffDashDay from "./StaffDashDay";
import AutoSyncToday from "../components/AutoSyncToday";

export const revalidate = 60;

const CHANNEL_COLORS: Record<string, string> = {
  Facebook: "#1877F2", TikTok: "#FE2C55", Shopee: "#EE4D2D", "Web/App": "#6366F1", WebApp: "#6366F1",
};
const CHANNEL_TARGET_KEY: Record<string, string> = {
  Facebook: "facebook", TikTok: "tiktok", Shopee: "shopee", "Web/App": "web_b2b", WebApp: "web_b2b",
};
const WEB_NAMES = ["Website", "App", "API", "Admin"];

export default async function SalesDashPage({
  searchParams,
}: {
  searchParams: Promise<{ channel?: string; date?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // ADMIN → full dashboard
  if (user.role === "ADMIN") redirect("/dash");

  // Parse channels
  const userChannels = (user.channels || []).filter(Boolean);
  if (userChannels.length === 0) {
    return (
      <section className="section" style={{ textAlign: "center", padding: 40 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>📊</div>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Chưa được phân kênh</div>
        <div style={{ fontSize: 13, color: "#64748B" }}>Liên hệ Admin để được cấp quyền xem kênh bán hàng.</div>
      </section>
    );
  }

  const sp = await searchParams;
  const activeChannel = sp.channel && userChannels.includes(sp.channel) ? sp.channel : userChannels[0];
  const today = sp.date || dateVN();

  // Date navigation
  const shiftDate = (base: string, offset: number) => {
    const [y, m, d] = base.split("-").map(Number);
    const dt = new Date(y, m - 1, d + offset);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
  };
  const prevDay = shiftDate(today, -1);
  const nextDay = shiftDate(today, 1);
  const [tY, tM, tD] = today.split("-").map(Number);
  const daysInMonth = new Date(tY, tM, 0).getDate();
  const monthFrom = `${today.substring(0, 7)}-01`;
  const monthTo = `${today.substring(0, 7)}-${String(daysInMonth).padStart(2, "0")}`;
  const monthKey = `${today.substring(0, 7)}-01`;
  const dayOfWeek = ["Chủ nhật", "Thứ hai", "Thứ ba", "Thứ tư", "Thứ năm", "Thứ sáu", "Thứ bảy"][new Date(tY, tM - 1, tD).getDay()];
  const displayDate = `${String(tD).padStart(2, "0")}/${String(tM).padStart(2, "0")}/${tY}`;
  const dayOfMonth = Math.min(new Date().getDate(), daysInMonth);

  // Fetch data
  const targetKey = CHANNEL_TARGET_KEY[activeChannel] || "facebook";
  const [revToday, revYesterday, adsToday, channelTarget, revMonth] = await Promise.all([
    getRevenueByChannel(today, today),
    getRevenueByChannel(prevDay, prevDay),
    getDailyAdsBreakdown(today),
    getChannelTarget(targetKey, monthKey),
    getRevenueByChannel(monthFrom, monthTo),
  ]);

  // Extract channel data
  const isWeb = activeChannel === "Web/App" || activeChannel === "WebApp";
  const getChannelRev = (channels: typeof revToday.channels) => {
    if (isWeb) return WEB_NAMES.reduce((s, n) => s + (channels.find(c => c.name === n)?.revenue || 0), 0);
    return channels.find(c => c.name === activeChannel)?.revenue || 0;
  };
  const getChannelExp = (channels: typeof revToday.channels) => {
    if (isWeb) return WEB_NAMES.reduce((s, n) => s + (channels.find(c => c.name === n)?.expected || 0), 0);
    return channels.find(c => c.name === activeChannel)?.expected || 0;
  };
  const getChannelOrders = (channels: typeof revToday.channels) => {
    if (isWeb) return WEB_NAMES.reduce((s, n) => s + (channels.find(c => c.name === n)?.orders || 0), 0);
    return channels.find(c => c.name === activeChannel)?.orders || 0;
  };

  const revenue = getChannelRev(revToday.channels);
  const expected = getChannelExp(revToday.channels);
  const orders = getChannelOrders(revToday.channels);
  const revenueYesterday = getChannelRev(revYesterday.channels);
  const dailyTarget = (channelTarget || 0) / daysInMonth;
  const monthRevenue = getChannelRev(revMonth.channels);

  // Sources (sub-channels)
  const sourceKey = isWeb ? "API" : activeChannel;
  const sources = (revToday.sourcesByChannel[sourceKey] || [])
    .concat(isWeb ? (revToday.sourcesByChannel["Admin"] || []).filter(s => s.revenue > 0) : [])
    .sort((a, b) => b.revenue - a.revenue);

  // Ads
  let adsAccounts: { name: string; spend: number }[] = [];
  let adsTotal = 0;
  if (activeChannel === "Facebook") {
    adsAccounts = (adsToday.fbAds || []).map(a => ({ name: String(a.account_name || a.ad_account_id || ""), spend: Number(a.spend || 0) })).sort((a, b) => b.spend - a.spend);
    adsTotal = adsAccounts.reduce((s, a) => s + a.spend, 0);
  } else if (activeChannel === "TikTok") {
    const bm = (adsToday.ttAds || []).map(a => ({ name: "BM " + String(a.advertiser_id || "").slice(-4), spend: Number(a.spend || 0) }));
    const gmv = (adsToday.gmvMax || []).map(a => ({ name: "GMV " + String(a.store_name || ""), spend: Number(a.spend || 0) }));
    adsAccounts = [...bm, ...gmv].sort((a, b) => b.spend - a.spend);
    adsTotal = adsAccounts.reduce((s, a) => s + a.spend, 0);
  } else if (activeChannel === "Shopee") {
    const spTotal = (adsToday.spAds || []).reduce((s, a) => s + Number(a.spend || 0), 0);
    if (spTotal > 0) adsAccounts = [{ name: "Shopee Ads", spend: spTotal }];
    adsTotal = spTotal;
  }

  const adsPct = revenue > 0 ? (adsTotal / revenue) * 100 : 0;
  const roas = adsTotal > 0 ? revenue / adsTotal : 0;
  const color = CHANNEL_COLORS[activeChannel] || "#3B82F6";

  return (
    <section className="section" id="sales-dash" style={{ padding: 0 }}>
      <AutoSyncToday extraSyncs={["/api/tiktok/sync-ads", "/api/tiktok/sync-gmv-max", "/api/fb/sync-ads"]} />

      {/* Channel tabs (if multiple channels) */}
      {userChannels.length > 1 && (
        <div style={{ display: "flex", gap: 4, padding: "8px 10px 0", background: "#F8FAFC" }}>
          {userChannels.map(ch => (
            <a key={ch} href={`/sales-dash?channel=${ch}&date=${today}`}
              style={{ flex: 1, textAlign: "center", padding: "6px 0", borderRadius: 8, fontSize: 11, fontWeight: 700, textDecoration: "none",
                background: ch === activeChannel ? (CHANNEL_COLORS[ch] || "#3B82F6") : "#E2E8F0",
                color: ch === activeChannel ? "#fff" : "#64748B",
              }}>{ch}</a>
          ))}
        </div>
      )}

      <div className="dash-mobile-only">
        <StaffDashDay
          channelName={activeChannel} channelColor={color}
          date={today} prevDay={prevDay} nextDay={nextDay} dayOfWeek={dayOfWeek} displayDate={displayDate}
          revenue={revenue} expected={expected} orders={orders} revenueYesterday={revenueYesterday}
          dailyTarget={dailyTarget}
          sources={sources}
          adsAccounts={adsAccounts} adsTotal={adsTotal} adsPct={adsPct} roas={roas}
          monthRevenue={monthRevenue} monthTarget={channelTarget || 0} dayOfMonth={dayOfMonth} daysInMonth={daysInMonth}
        />
      </div>
    </section>
  );
}
