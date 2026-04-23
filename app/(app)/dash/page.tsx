import Link from "next/link";
import { getDashboardStats, getRecentOrders, getRevenueByChannel, getYearlySummary, getYearlyChannelTargets, getDailyAdsBreakdown, getTasksForDate, getArrivedOrders, getDamageItems, getDailyAdsTotals } from "@/lib/db/dashboard";
import { getChannelTarget } from "@/lib/db/tiktok";
import { getCurrentUser } from "@/lib/auth/user";
import { dateVN } from "@/lib/helpers";
import { formatDate, formatVND, formatVNDCompact } from "@/lib/format";
import AutoSyncToday from "../components/AutoSyncToday";
import DashDaySwitch from "./DashDaySwitch";
import DashMonthSwitch from "./DashMonthSwitch";
import DashYearSwitch from "./DashYearSwitch";
import DashMobileWrapper from "./DashMobileWrapper";
import type { DashDayMobileProps } from "./DashDayMobile";
import type { DashMonthMobileProps } from "./DashMonthMobile";
import type { DashYearMobileProps } from "./DashYearMobile";

export const dynamic = "force-dynamic";

const STAGE_LABEL: Record<string, string> = {
  DRAFT: "Nháp", ORDERED: "Đã đặt", ARRIVED: "Hàng về",
  QC_DONE: "QC xong", ON_SHELF: "Lên kệ", SELLING: "Đang bán", COMPLETED: "Hoàn tất",
};

const CHANNEL_COLORS: Record<string, string> = {
  Facebook: "#1877F2", TikTok: "#FE2C55", Shopee: "#EE4D2D",
  Website: "#6366F1", App: "#8B5CF6", "Nội bộ": "#9CA3AF",
};

const CHANNEL_TARGET_MAP: Record<string, string> = {
  Facebook: "facebook", TikTok: "tiktok", Shopee: "shopee",
  Website: "web_b2b", App: "web_b2b", Admin: "web_b2b", API: "web_b2b",
};
const YEAR_CHANNELS = [
  { key: "facebook", label: "Facebook", abbr: "FB", allocPct: "55%", color: "#1877F2" },
  { key: "tiktok", label: "TikTok", abbr: "TT", allocPct: "25%", color: "#000000" },
  { key: "shopee", label: "Shopee", abbr: "SP", allocPct: "10%", color: "#EE4D2D" },
  { key: "web_b2b", label: "Web/App B2B", abbr: "WA", allocPct: "10%", color: "#0EA5E9" },
];
const BUDGET_PCT = 0.55;
const BUDGET_SOURCES = [
  { name: "TQ Order", pct: 20, color: "#16A34A" },
  { name: "TQ Trữ sẵn", pct: 35, color: "#3B82F6" },
  { name: "Nội địa", pct: 45, color: "#7C3AED" },
];

function fmtTy(v: number): string {
  return (v / 1e9).toFixed(2) + " tỷ";
}

export default async function DashPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; view?: string; date?: string }>;
}) {
  const sp = await searchParams;
  const view = sp.view || "day";
  const month = sp.month || dateVN().substring(0, 7);
  const [y, m] = month.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const from = `${month}-01`;
  const to = `${month}-${String(lastDay).padStart(2, "0")}`;

  // Last 7 days for chart
  const d7from = dateVN(null, -7);
  const d7to = dateVN();

  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

  const currentYear = Number(month.split("-")[0]);

  // ═══════════════════════════════════════════════════════
  // NOTE: Mobile instant tab switching removed — caused Vercel timeout
  // (30+ parallel queries). Using per-view DashXxxSwitch instead.
  // ═══════════════════════════════════════════════════════
  /* eslint-disable @typescript-eslint/no-unused-vars */
  const _mobileAllPropsRemoved = null;
  if (false as boolean) { // dead code — keep types for future use
    const today = sp.date || dateVN();
    const shiftDate = (base: string, offset: number) => {
      const [yy, mm, dd] = base.split("-").map(Number);
      const d = new Date(yy, mm - 1, dd + offset);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    };
    const prevDay = shiftDate(today, -1);
    const nextDay = shiftDate(today, 1);
    const yesterdayFromToday = shiftDate(today, -1);
    const [tY, tM] = today.substring(0, 7).split("-").map(Number);
    const daysInMonth = new Date(tY, tM, 0).getDate();
    const mFrom = `${today.substring(0, 7)}-01`;
    const mTo = `${today.substring(0, 7)}-${String(daysInMonth).padStart(2, "0")}`;
    const mKey = `${today.substring(0, 7)}-01`;
    const todayDateLocal = new Date(tY, tM - 1, Number(today.substring(8)));
    const dayOfWeek = ["Chủ nhật","Thứ hai","Thứ ba","Thứ tư","Thứ năm","Thứ sáu","Thứ bảy"][todayDateLocal.getDay()];
    const displayDate = `${today.substring(8)}/${today.substring(5, 7)}/${today.substring(0, 4)}`;

    const [revToday, revYesterday, adsToday, adsYesterday, arrivedToday, arrivedYesterday, damageItems, tasksToday,
      fbT, tkT, spT, wbT, revMonth, yearly, prevYearly, yearChTargets, monthDailyAds] = await Promise.all([
      getRevenueByChannel(today, today),
      getRevenueByChannel(yesterdayFromToday, yesterdayFromToday),
      getDailyAdsBreakdown(today),
      getDailyAdsBreakdown(yesterdayFromToday),
      getArrivedOrders(today),
      getArrivedOrders(yesterdayFromToday),
      getDamageItems(),
      getTasksForDate(today),
      getChannelTarget("facebook", mKey),
      getChannelTarget("tiktok", mKey),
      getChannelTarget("shopee", mKey),
      getChannelTarget("web_b2b", mKey),
      getRevenueByChannel(from, to),
      getYearlySummary(currentYear),
      getYearlySummary(currentYear - 1),
      getYearlyChannelTargets(currentYear),
      getDailyAdsTotals(from, to),
    ]);

    const totalTarget = (fbT || 0) + (tkT || 0) + (spT || 0) + (wbT || 0);
    const dailyTarget = totalTarget > 0 ? totalTarget / daysInMonth : 0;
    const todayAdsFb = (adsToday.fbAds || []).reduce((s: number, a: Record<string, unknown>) => s + Number(a.spend || 0), 0);
    const todayAdsTt = (adsToday.ttAds || []).reduce((s: number, a: Record<string, unknown>) => s + Number(a.spend || 0), 0);
    const todayAdsGmv = (adsToday.gmvMax || []).reduce((s: number, a: Record<string, unknown>) => s + Number(a.spend || 0), 0);
    const todayAdsSp = (adsToday.spAds || []).reduce((s: number, a: Record<string, unknown>) => s + Number(a.spend || 0), 0);
    const todayAdsTotal = todayAdsFb + todayAdsTt + todayAdsGmv + todayAdsSp;
    const yesterdayAdsTotal = (adsYesterday.fbAds || []).reduce((s: number, a: Record<string, unknown>) => s + Number(a.spend || 0), 0) + (adsYesterday.ttAds || []).reduce((s: number, a: Record<string, unknown>) => s + Number(a.spend || 0), 0) + (adsYesterday.gmvMax || []).reduce((s: number, a: Record<string, unknown>) => s + Number(a.spend || 0), 0) + (adsYesterday.spAds || []).reduce((s: number, a: Record<string, unknown>) => s + Number(a.spend || 0), 0);
    const adsPctToday = revToday.total > 0 ? (todayAdsTotal / revToday.total) * 100 : 0;
    const roasToday = todayAdsTotal > 0 ? revToday.total / todayAdsTotal : 0;
    const pctChange = (cur: number, prev: number) => prev === 0 ? (cur > 0 ? 100 : 0) : Math.round(((cur - prev) / prev) * 100);
    const revChange = pctChange(revToday.total, revYesterday.total);
    const adsChange = pctChange(todayAdsTotal, yesterdayAdsTotal);
    const revPct = dailyTarget > 0 ? Math.round((revToday.total / dailyTarget) * 100) : 0;
    const arrivedTodayValue = arrivedToday.reduce((s: number, o: Record<string, unknown>) => s + Number(o.order_total || 0), 0);
    const tasksDone = tasksToday.filter((t: Record<string, unknown>) => t.status === "DONE").length;
    const dayOfMonth = Math.min(new Date().getDate(), daysInMonth);
    const monthlyAvg = dayOfMonth > 0 ? revMonth.total / dayOfMonth : 0;

    const mainCh = [
      { name: "Facebook", color: "#1877F2" },
      { name: "TikTok", color: "#FE2C55" },
      { name: "Shopee", color: "#EE4D2D" },
      { name: "Web/App", color: "#6366F1" },
    ];
    const wbNames = ["Website", "App", "API", "Admin"];
    const getChRev = (chMap: Record<string, number>, name: string) => name === "Web/App" ? wbNames.reduce((s, n) => s + (chMap[n] || 0), 0) : chMap[name] || 0;
    const chRevToday: Record<string, number> = {};
    const chExpToday: Record<string, number> = {};
    revToday.channels.forEach(c => { chRevToday[c.name] = c.revenue; chExpToday[c.name] = c.expected; });
    const chRevYesterday: Record<string, number> = {};
    revYesterday.channels.forEach(c => { chRevYesterday[c.name] = c.revenue; });

    const totalAdSpendM = revMonth ? ((revMonth.channels.find(c => c.name === "Facebook")?.revenue || 0) > 0 ? todayAdsFb * daysInMonth / dayOfMonth : 0) : 0;
    // Use stats-level ads for month (approximate from day × days ratio)
    const statsAdsFb = todayAdsFb * dayOfMonth; // rough month estimate
    const statsAdsTt = (todayAdsTt + todayAdsGmv) * dayOfMonth;
    const statsAdsSp = todayAdsSp * dayOfMonth;
    const totalAdSpendMonth = statsAdsFb + statsAdsTt + statsAdsSp;
    const adsPctMonth = revMonth.total > 0 ? (totalAdSpendMonth / revMonth.total) * 100 : 0;
    const roasMonth = totalAdSpendMonth > 0 ? revMonth.total / totalAdSpendMonth : 0;

    // Year
    const nowMonth = new Date().getMonth() + 1;
    const prevYearRev = prevYearly?.cumRevenue || 0;
    const growthVsPrev = prevYearRev > 0 ? Math.round(((yearly.yearTarget / prevYearRev) - 1) * 100) : 0;
    const cumAdsFb = yearly.months.reduce((s, mm) => s + mm.adsFb, 0);
    const cumAdsShopee = yearly.months.reduce((s, mm) => s + mm.adsShopee, 0);
    const cumAdsTiktok = yearly.months.reduce((s, mm) => s + mm.adsTiktok, 0);
    const cumAdsTotal = cumAdsFb + cumAdsShopee + cumAdsTiktok;
    const adsRevPctYear = yearly.cumRevenue > 0 ? (cumAdsTotal / yearly.cumRevenue * 100) : 0;
    const chRevCum: Record<string, number> = {};
    const CHANNEL_TARGET_MAP: Record<string, string> = { Facebook: "facebook", TikTok: "tiktok", Shopee: "shopee", Website: "web_b2b", App: "web_b2b", Admin: "web_b2b", API: "web_b2b" };
    for (const mm of yearly.months) for (const [ch, rev] of Object.entries(mm.byChannel)) { const key = CHANNEL_TARGET_MAP[ch] || ch; chRevCum[key] = (chRevCum[key] || 0) + rev; }
    const chTargets: Record<string, number> = {};
    const YEAR_CH = [
      { key: "facebook", label: "Facebook", abbr: "FB", color: "#1877F2" },
      { key: "tiktok", label: "TikTok", abbr: "TT", color: "#000000" },
      { key: "shopee", label: "Shopee", abbr: "SP", color: "#EE4D2D" },
      { key: "web_b2b", label: "Web/App B2B", abbr: "WA", color: "#0EA5E9" },
    ];
    for (const ch of YEAR_CH) chTargets[ch.key] = yearChTargets?.[ch.key] || 0;

    const day: DashDayMobileProps = {
      today, prevDay, nextDay, dayOfWeek, displayDate,
      revTotal: revToday.total, revOrders: revToday.totalOrders, revExpected: revToday.totalExpected,
      revYesterday: revYesterday.total, revChange, revPct, dailyTarget, monthlyAvg,
      channels: mainCh.map(ch => ({ name: ch.name, color: ch.color, rev: getChRev(chRevToday, ch.name), exp: getChRev(chExpToday, ch.name), revYesterday: getChRev(chRevYesterday, ch.name) })),
      adsTotal: todayAdsTotal, adsFb: todayAdsFb, adsTt: todayAdsTt + todayAdsGmv, adsTtBm: todayAdsTt, adsTtGmv: todayAdsGmv, adsSp: todayAdsSp,
      adsPct: adsPctToday, roas: roasToday, adsYesterday: yesterdayAdsTotal, adsChange,
      arrivedCount: arrivedToday.length, arrivedValue: arrivedTodayValue, arrivedYesterdayCount: arrivedYesterday.length,
      damageCount: damageItems.length, damageValue: damageItems.reduce((s: number, d: Record<string, unknown>) => s + Number(d.damage_amount || 0), 0),
      tasksTotal: tasksToday.length, tasksDone, monthRevenue: revMonth.total, monthTarget: totalTarget,
    };

    const monthProps: DashMonthMobileProps = {
      month: from.substring(0, 7), lastDay, dayOfMonth,
      revTotal: revMonth.total, revOrders: revMonth.totalOrders, revExpected: revMonth.totalExpected,
      totalTarget, totalAdSpend: totalAdSpendMonth, adsPct: adsPctMonth, roas: roasMonth,
      channels: mainCh.map(ch => ({ name: ch.name, color: ch.color, rev: revMonth.channels.find(c => c.name === ch.name)?.revenue || (ch.name === "Web/App" ? wbNames.reduce((s, n) => s + (revMonth.channels.find(c => c.name === n)?.revenue || 0), 0) : 0), target: ({ Facebook: fbT, TikTok: tkT, Shopee: spT, "Web/App": wbT }[ch.name] || 0), ads: ({ Facebook: statsAdsFb, TikTok: statsAdsTt, Shopee: statsAdsSp, "Web/App": 0 }[ch.name] || 0) })),
      daily: revMonth.daily, dailyByChannel: revMonth.dailyByChannel, dailyAds: monthDailyAds,
      sourcesByChannel: revMonth.sourcesByChannel, outstanding: 0, damageItems: damageItems.length, damageValue: 0,
    };

    const yearProps: DashYearMobileProps = {
      year: currentYear, nowMonth, yearTarget: yearly.yearTarget, cumRevenue: yearly.cumRevenue,
      prevYearRev, growthVsPrev, cumAdsTotal, adsRevPct: adsRevPctYear,
      months: yearly.months.map(mm => ({ month: mm.month, revenue: mm.revenue, target: mm.target, ads: mm.ads, byChannel: mm.byChannel })),
      channels: YEAR_CH.map(ch => ({ name: ch.label, abbr: ch.abbr, color: ch.color, rev: chRevCum[ch.key] || 0, target: chTargets[ch.key] || 0, ads: ch.key === "facebook" ? cumAdsFb : ch.key === "tiktok" ? cumAdsTiktok : ch.key === "shopee" ? cumAdsShopee : 0 })),
      sourcesByChannel: revMonth.sourcesByChannel,
    };

  }

  // ═══════════════════════════════════════════════════════
  // DAILY VIEW
  // ═══════════════════════════════════════════════════════
  if (view === "day") {
    const today = sp.date || dateVN();
    // Use dateVN-style calculation to avoid UTC timezone issues
    const shiftDate = (base: string, offset: number) => {
      const [yy, mm, dd] = base.split("-").map(Number);
      const d = new Date(yy, mm - 1, dd + offset);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    };
    const yesterday = dateVN(null, -1);
    const yesterdayFromToday = shiftDate(today, -1);

    // Month info for daily target
    const [tY, tM] = today.substring(0, 7).split("-").map(Number);
    const daysInMonth = new Date(tY, tM, 0).getDate();
    const monthFrom = `${today.substring(0, 7)}-01`;
    const monthTo = `${today.substring(0, 7)}-${String(daysInMonth).padStart(2, "0")}`;
    const monthKey = `${today.substring(0, 7)}-01`;

    const [
      user,
      revToday,
      revYesterday,
      adsToday,
      adsYesterday,
      arrivedToday,
      arrivedYesterday,
      damageItems,
      tasksToday,
      fbTarget,
      tkTarget,
      spTarget,
      wbTarget,
      revMonth,
    ] = await Promise.all([
      getCurrentUser(),
      getRevenueByChannel(today, today),
      getRevenueByChannel(yesterdayFromToday, yesterdayFromToday),
      getDailyAdsBreakdown(today),
      getDailyAdsBreakdown(yesterdayFromToday),
      getArrivedOrders(today),
      getArrivedOrders(yesterdayFromToday),
      getDamageItems(),
      getTasksForDate(today),
      getChannelTarget("facebook", monthKey),
      getChannelTarget("tiktok", monthKey),
      getChannelTarget("shopee", monthKey),
      getChannelTarget("web_b2b", monthKey),
      getRevenueByChannel(monthFrom, monthTo),
    ]);

    // Compute KPIs
    const totalTarget = (fbTarget || 0) + (tkTarget || 0) + (spTarget || 0) + (wbTarget || 0);
    const dailyTarget = totalTarget > 0 ? totalTarget / daysInMonth : 0;

    const todayAdsFb = (adsToday.fbAds || []).reduce((s, a) => s + Number(a.spend || 0), 0);
    const todayAdsTt = (adsToday.ttAds || []).reduce((s, a) => s + Number(a.spend || 0), 0);
    const todayAdsGmv = (adsToday.gmvMax || []).reduce((s, a) => s + Number(a.spend || 0), 0);
    const todayAdsSp = (adsToday.spAds || []).reduce((s, a) => s + Number(a.spend || 0), 0);
    const todayAdsTotal = todayAdsFb + todayAdsTt + todayAdsGmv + todayAdsSp;

    const yesterdayAdsFb = (adsYesterday.fbAds || []).reduce((s, a) => s + Number(a.spend || 0), 0);
    const yesterdayAdsTt = (adsYesterday.ttAds || []).reduce((s, a) => s + Number(a.spend || 0), 0);
    const yesterdayAdsGmv = (adsYesterday.gmvMax || []).reduce((s, a) => s + Number(a.spend || 0), 0);
    const yesterdayAdsSp = (adsYesterday.spAds || []).reduce((s, a) => s + Number(a.spend || 0), 0);
    const yesterdayAdsTotal = yesterdayAdsFb + yesterdayAdsTt + yesterdayAdsGmv + yesterdayAdsSp;

    const adsPctToday = revToday.total > 0 ? (todayAdsTotal / revToday.total) * 100 : 0;
    const adsPctYesterday = revYesterday.total > 0 ? (yesterdayAdsTotal / revYesterday.total) * 100 : 0;
    const roasToday = todayAdsTotal > 0 ? revToday.total / todayAdsTotal : 0;

    const arrivedTodayValue = arrivedToday.reduce((s, o) => s + Number(o.order_total || 0), 0);

    // Comparison helper
    const pctChange = (cur: number, prev: number) => {
      if (prev === 0) return cur > 0 ? 100 : 0;
      return Math.round(((cur - prev) / prev) * 100);
    };
    const revChange = pctChange(revToday.total, revYesterday.total);
    const adsChange = pctChange(todayAdsTotal, yesterdayAdsTotal);

    // Progress
    const revPct = dailyTarget > 0 ? Math.round((revToday.total / dailyTarget) * 100) : 0;

    // Day navigation — use string math to avoid timezone issues
    const prevDay = shiftDate(today, -1);
    const nextDay = shiftDate(today, 1);
    const [tYear, tMonth, tDay] = today.split("-").map(Number);
    const todayDateLocal = new Date(tYear, tMonth - 1, tDay);
    const dayOfWeek = ["Chủ nhật", "Thứ hai", "Thứ ba", "Thứ tư", "Thứ năm", "Thứ sáu", "Thứ bảy"][todayDateLocal.getDay()];
    const displayDate = `${String(tDay).padStart(2, "0")}/${String(tMonth).padStart(2, "0")}/${tYear}`;

    // Channel revenue for today vs yesterday
    const chRevToday: Record<string, number> = {};
    const chExpToday: Record<string, number> = {};
    revToday.channels.forEach((c) => { chRevToday[c.name] = c.revenue; chExpToday[c.name] = c.expected; });
    const chRevYesterday: Record<string, number> = {};
    const chExpYesterday: Record<string, number> = {};
    revYesterday.channels.forEach((c) => { chRevYesterday[c.name] = c.revenue; chExpYesterday[c.name] = c.expected; });
    const wbNamesToday = ["Website", "App", "API", "Admin", "Nội bộ"];

    const mainChannels = [
      { name: "Facebook", color: "#1877F2" },
      { name: "TikTok", color: "#FE2C55" },
      { name: "Shopee", color: "#EE4D2D" },
      { name: "Web/App", color: "#6366F1" },
    ];

    const getChVal = (chMap: Record<string, number>, name: string) => {
      if (name === "Web/App") return wbNamesToday.reduce((s, n) => s + (chMap[n] || 0), 0);
      return chMap[name] || 0;
    };
    const getChRev = (chMap: Record<string, number>, name: string) => getChVal(chMap, name);

    // Monthly avg
    const dayOfMonth = Math.min(new Date().getDate(), daysInMonth);
    const monthlyAvg = dayOfMonth > 0 ? revMonth.total / dayOfMonth : 0;

    // Tasks stats
    const tasksDone = tasksToday.filter((t) => t.status === "DONE").length;
    const tasksTotal = tasksToday.length;

    // Ads top accounts
    const fbAccountsSorted = [...(adsToday.fbAds || [])]
      .sort((a, b) => Number(b.spend || 0) - Number(a.spend || 0))
      .slice(0, 3);
    const ttBmSorted = [...(adsToday.ttAds || [])]
      .sort((a, b) => Number(b.spend || 0) - Number(a.spend || 0))
      .slice(0, 3);
    const gmvSorted = [...(adsToday.gmvMax || [])]
      .sort((a, b) => Number(b.spend || 0) - Number(a.spend || 0))
      .slice(0, 3);

    // TikTok total (BM + GMV)
    const ttTotalSpend = todayAdsTt + todayAdsGmv;
    const ttTotalRev = (adsToday.ttAds || []).reduce((s, a) => s + Number(a.conversion_value || 0), 0)
      + (adsToday.gmvMax || []).reduce((s, a) => s + Number(a.gross_revenue || 0), 0);

    // Shopee total
    const spTotalSpend = todayAdsSp;
    const spTotalRev = (adsToday.spAds || []).reduce((s, a) => s + Number(a.revenue || 0), 0);

    // FB total
    const fbTotalRev = (adsToday.fbAds || []).reduce((s, a) => s + Number(a.purchase_value || 0), 0);

    const S = {
      green: { bg: "#F0FDF4", border: "#BBF7D0", text: "#166534" },
      blue: { bg: "#EFF6FF", border: "#BFDBFE", text: "#1E40AF" },
      red: { bg: "#FEF2F2", border: "#FECACA", text: "#991B1B" },
      amber: { bg: "#FFFBEB", border: "#FDE68A", text: "#92400E" },
      neutral: { bg: "#FFFFFF", border: "#E5E7EB", text: "#18181B" },
    };

    const revStatus = revPct >= 100 ? S.green : revPct >= 70 ? S.amber : revToday.total > 0 ? S.red : S.neutral;
    const adsStatus = adsPctToday <= 5 ? S.green : adsPctToday <= 7 ? S.amber : adsPctToday > 0 ? S.red : S.neutral;

    return (
      <section className="section" id="dash-day">
        <DashDaySwitch mobileProps={{
          today: today, prevDay: prevDay, nextDay: nextDay, dayOfWeek: dayOfWeek, displayDate: displayDate,
          revTotal: revToday.total, revOrders: revToday.totalOrders, revExpected: revToday.totalExpected,
          revYesterday: revYesterday.total, revChange: revChange, revPct: revPct, dailyTarget: dailyTarget, monthlyAvg: monthlyAvg,
          channels: mainChannels.map(ch => ({ name: ch.name, color: ch.color, rev: getChRev(chRevToday, ch.name), exp: getChVal(chExpToday, ch.name), revYesterday: getChRev(chRevYesterday, ch.name) })),
          adsTotal: todayAdsTotal, adsFb: todayAdsFb, adsTt: todayAdsTt + todayAdsGmv, adsTtBm: todayAdsTt, adsTtGmv: todayAdsGmv, adsSp: todayAdsSp,
          adsPct: adsPctToday, roas: roasToday, adsYesterday: yesterdayAdsTotal, adsChange: adsChange,
          arrivedCount: arrivedToday.length, arrivedValue: arrivedTodayValue, arrivedYesterdayCount: arrivedYesterday.length,
          damageCount: damageItems.length, damageValue: damageItems.reduce((s, d) => s + Number(d.damage_amount || 0), 0),
          tasksTotal: tasksTotal, tasksDone: tasksDone, monthRevenue: revMonth.total, monthTarget: totalTarget,
        }} />
        <AutoSyncToday extraSyncs={["/api/tiktok/sync-ads", "/api/tiktok/sync-gmv-max"]} />
        {/* ─── HEADER ─── */}
        <div className="page-hdr">
          <div>
            <div className="page-title">Dashboard</div>
            <div className="page-sub">{dayOfWeek}, {displayDate}</div>
          </div>
          <div className="dash-day-nav" style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <Link href="/dash?view=day" className="btn btn-primary btn-sm dash-hide-mobile" style={{ textDecoration: "none" }}>Ngày</Link>
            <Link href="/dash?view=month" className="btn btn-ghost btn-sm dash-hide-mobile" style={{ textDecoration: "none" }}>Tháng</Link>
            <Link href="/dash?view=year" className="btn btn-ghost btn-sm dash-hide-mobile" style={{ textDecoration: "none" }}>Năm</Link>
            <span className="dash-hide-mobile" style={{ width: 1, height: 20, background: "#E5E7EB" }} />
            <Link href={`/dash?view=day&date=${prevDay}`} className="btn btn-ghost btn-sm" style={{ textDecoration: "none", fontSize: 14 }}>&larr;</Link>
            <span style={{ fontSize: 14, fontWeight: 700, minWidth: 100, textAlign: "center" }}>{displayDate}</span>
            <Link href={`/dash?view=day&date=${nextDay}`} className="btn btn-ghost btn-sm" style={{ textDecoration: "none", fontSize: 14 }}>&rarr;</Link>
            <span className="dash-hide-mobile" style={{ width: 1, height: 20, background: "#E5E7EB" }} />
            <Link href="/dash?view=day" className="btn btn-sm" style={{ textDecoration: "none", fontSize: 11, background: "#1F2937", color: "#fff" }}>Hôm nay</Link>
            <Link href={`/dash?view=day&date=${yesterday}`} className="btn btn-ghost btn-sm" style={{ textDecoration: "none", fontSize: 11 }}>Hôm qua</Link>
          </div>
        </div>

        {/* ─── KPI STRIP (6 cards) ─── */}
        <div id="dash-day-kpi" style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 8, marginBottom: 12 }}>
          {/* DT thực tế */}
          <div style={{ padding: "10px 14px", borderRadius: 8, background: revStatus.bg, border: `1px solid ${revStatus.border}` }}>
            <div style={{ fontSize: 9, fontWeight: 600, color: revStatus.text, letterSpacing: ".3px" }}>DT THỰC TẾ</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: revStatus.text, margin: "2px 0" }}>{formatVNDCompact(revToday.total)}</div>
            <div style={{ fontSize: 9, color: revStatus.text, opacity: 0.7 }}>
              {revToday.totalOrders} đơn · <strong>{revChange >= 0 ? "+" : ""}{revChange}%</strong> vs hôm qua
            </div>
          </div>
          {/* DT dự kiến */}
          <div style={{ padding: "10px 14px", borderRadius: 8, background: S.amber.bg, border: `1px solid ${S.amber.border}` }}>
            <div style={{ fontSize: 9, fontWeight: 600, color: S.amber.text, letterSpacing: ".3px" }}>DT DỰ KIẾN</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: S.amber.text, margin: "2px 0" }}>{formatVNDCompact(revToday.totalExpected)}</div>
            <div style={{ fontSize: 9, color: S.amber.text, opacity: 0.7 }}>tạo - hoàn hủy · KH {formatVNDCompact(dailyTarget)}/ngày</div>
          </div>
          {/* Chi phí Ads */}
          <div style={{ padding: "10px 14px", borderRadius: 8, background: adsStatus.bg, border: `1px solid ${adsStatus.border}` }}>
            <div style={{ fontSize: 9, fontWeight: 600, color: adsStatus.text, letterSpacing: ".3px" }}>CHI PHÍ ADS</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: adsStatus.text, margin: "2px 0" }}>{formatVNDCompact(todayAdsTotal)}</div>
            <div style={{ fontSize: 9, color: adsStatus.text, opacity: 0.7 }}>
              Hôm qua {formatVNDCompact(yesterdayAdsTotal)} · <strong>{adsChange >= 0 ? "+" : ""}{adsChange}%</strong>
            </div>
          </div>
          {/* Ads/DT */}
          <div style={{ padding: "10px 14px", borderRadius: 8, background: adsStatus.bg, border: `1px solid ${adsStatus.border}` }}>
            <div style={{ fontSize: 9, fontWeight: 600, color: adsStatus.text, letterSpacing: ".3px" }}>ADS / DOANH THU</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: adsStatus.text, margin: "2px 0" }}>{adsPctToday.toFixed(1)}%</div>
            <div style={{ fontSize: 9, color: adsStatus.text, opacity: 0.7 }}>Hôm qua {adsPctYesterday.toFixed(1)}% · ROAS {roasToday.toFixed(1)}x</div>
          </div>
          {/* Hàng nhập */}
          <div style={{ padding: "10px 14px", borderRadius: 8, background: "#fff", border: "1px solid #E5E7EB" }}>
            <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: ".3px" }}>HÀNG NHẬP HÔM NAY</div>
            <div style={{ fontSize: 20, fontWeight: 800, margin: "2px 0" }}>{arrivedToday.length} đơn</div>
            <div style={{ fontSize: 9, opacity: 0.7 }}>{formatVNDCompact(arrivedTodayValue)} · hôm qua {arrivedYesterday.length} đơn</div>
          </div>
          {/* Thiệt hại */}
          <div style={{ padding: "10px 14px", borderRadius: 8, background: damageItems.length > 0 ? S.red.bg : "#fff", border: `1px solid ${damageItems.length > 0 ? S.red.border : "#E5E7EB"}` }}>
            <div style={{ fontSize: 9, fontWeight: 600, color: damageItems.length > 0 ? S.red.text : undefined, letterSpacing: ".3px" }}>THIỆT HẠI</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: damageItems.length > 0 ? "#DC2626" : undefined, margin: "2px 0" }}>{damageItems.length} SP</div>
            <div style={{ fontSize: 9, opacity: 0.7, color: damageItems.length > 0 ? S.red.text : undefined }}>
              {formatVNDCompact(damageItems.reduce((s, d) => s + Number(d.damage_amount || 0), 0))} chờ xử lý
            </div>
          </div>
        </div>

        {/* ─── PROGRESS BAR ─── */}
        <div className="card" style={{ marginBottom: 12, padding: "10px 16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <div>
              <span style={{ fontSize: 12, fontWeight: 700 }}>Tiến độ ngày</span>
            </div>
            <div style={{ fontSize: 10 }}>
              <span style={{ color: revPct >= 100 ? "#16A34A" : "#D97706", fontWeight: 700 }}>{formatVNDCompact(revToday.total)}</span>
              <span style={{ color: "#6B7280" }}> / KH </span>
              <span style={{ fontWeight: 700 }}>{formatVNDCompact(dailyTarget)}</span>
              <span style={{ color: revPct >= 100 ? "#16A34A" : "#D97706", fontWeight: 700, marginLeft: 4 }}>{revPct}%</span>
            </div>
          </div>
          <div style={{ height: 10, background: "#F3F4F6", borderRadius: 5, overflow: "hidden", position: "relative" }}>
            <div style={{ width: `${Math.min(revPct, 100)}%`, height: "100%", background: revPct >= 100 ? "#22C55E" : revPct >= 70 ? "#3B82F6" : "#F59E0B", borderRadius: 5, transition: "width 0.3s" }} />
          </div>
          <div style={{ display: "flex", gap: 16, marginTop: 4, fontSize: 10, color: "#6B7280" }}>
            {revPct >= 100
              ? <span>Vượt KH <b style={{ color: "#16A34A" }}>+{formatVNDCompact(revToday.total - dailyTarget)}</b></span>
              : <span>Còn <b style={{ color: "#D97706" }}>{formatVNDCompact(Math.max(0, dailyTarget - revToday.total))}</b></span>}
            <span>|</span>
            <span>Hôm qua: <b>{formatVNDCompact(revYesterday.total)}</b></span>
            <span>TB tháng: <b>{formatVNDCompact(monthlyAvg)}</b></span>
          </div>
        </div>

        {/* ─── MAIN LAYOUT: Left (Revenue + Quick panels) | Right (Ads breakdown) ─── */}
        <div id="dash-day-main" style={{ display: "grid", gridTemplateColumns: "5fr 7fr", gap: 10, marginBottom: 12 }}>
          {/* LEFT COLUMN */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {/* Revenue by channel */}
          <div className="card" style={{ padding: "12px 14px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontWeight: 700, fontSize: 12 }}>Doanh thu theo kênh</span>
              <span style={{ fontSize: 10, color: "#9CA3AF" }}>Hôm nay vs hôm qua</span>
            </div>
            {/* Header */}
            <div style={{ display: "grid", gridTemplateColumns: "70px 1fr 55px 55px 55px 40px", gap: "0 6px", fontSize: 9, color: "#9CA3AF", marginBottom: 4, paddingLeft: 16 }}>
              <span></span><span></span><span style={{ textAlign: "right" }}>TC</span><span style={{ textAlign: "right" }}>DK</span><span style={{ textAlign: "right" }}>Hôm qua</span><span style={{ textAlign: "right" }}>+/-%</span>
            </div>
            {mainChannels.map((ch) => {
              const todayRev = getChRev(chRevToday, ch.name);
              const todayExp = getChVal(chExpToday, ch.name);
              const yesterdayRev = getChRev(chRevYesterday, ch.name);
              const change = pctChange(todayRev, yesterdayRev);
              const barW = revToday.total > 0 ? Math.round((todayRev / revToday.total) * 100) : 0;
              return (
                <div key={ch.name} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: ch.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 11, fontWeight: 600, width: 70 }}>{ch.name}</span>
                  <div style={{ flex: 1, height: 8, background: "#F3F4F6", borderRadius: 2, overflow: "hidden" }}>
                    <div style={{ width: `${barW}%`, height: "100%", background: ch.color, borderRadius: 2 }} />
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, width: 55, textAlign: "right", color: ch.color }}>{formatVNDCompact(todayRev)}</span>
                  <span style={{ fontSize: 10, fontWeight: 600, width: 55, textAlign: "right", color: "#D97706" }}>{formatVNDCompact(todayExp)}</span>
                  <span style={{ fontSize: 10, width: 55, textAlign: "right", color: "#9CA3AF" }}>{formatVNDCompact(yesterdayRev)}</span>
                  <span style={{ fontSize: 9, width: 40, textAlign: "right", fontWeight: 700, color: change >= 0 ? "#16A34A" : "#DC2626" }}>
                    {change >= 0 ? "+" : ""}{change}%
                  </span>
                </div>
              );
            })}
            {/* Total */}
            <div style={{ borderTop: "1px solid var(--border)", marginTop: 6, paddingTop: 6, display: "grid", gridTemplateColumns: "1fr 55px 55px 55px 40px", fontSize: 11, fontWeight: 700 }}>
              <span>Tổng</span>
              <span style={{ textAlign: "right", color: "#16A34A" }}>{formatVNDCompact(revToday.total)}</span>
              <span style={{ textAlign: "right", color: "#D97706" }}>{formatVNDCompact(revToday.totalExpected)}</span>
              <span style={{ textAlign: "right", color: "#9CA3AF" }}>{formatVNDCompact(revYesterday.total)}</span>
              <span style={{ textAlign: "right", color: revChange >= 0 ? "#16A34A" : "#DC2626" }}>{revChange >= 0 ? "+" : ""}{revChange}%</span>
            </div>
            {/* Stacked bar */}
            {revToday.total > 0 && (
              <div style={{ display: "flex", height: 14, borderRadius: 7, overflow: "hidden", marginTop: 8 }}>
                {mainChannels.map((ch) => {
                  const rev = getChRev(chRevToday, ch.name);
                  const pct = revToday.total > 0 ? (rev / revToday.total * 100) : 0;
                  if (pct < 1) return null;
                  return (
                    <div key={ch.name} style={{ width: `${pct}%`, background: ch.color, display: "flex", alignItems: "center", justifyContent: "center", minWidth: 16 }}>
                      <span style={{ fontSize: 8, color: "#fff", fontWeight: 700, whiteSpace: "nowrap" }}>
                        {pct >= 12 ? `${ch.name.substring(0, 2)} ${Math.round(pct)}%` : ch.name.substring(0, 2)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Quick panels in left column */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {/* Hàng nhập mini */}
            <div className="card" style={{ padding: "10px 12px" }}>
              <div style={{ fontWeight: 700, fontSize: 11, marginBottom: 6 }}>Hàng nhập hôm nay</div>
              {arrivedToday.length > 0 ? arrivedToday.slice(0, 3).map((o) => (
                <div key={o.order_id} style={{ display: "flex", justifyContent: "space-between", fontSize: 10, padding: "3px 0", borderBottom: "1px solid var(--border)" }}>
                  <Link href={`/create?order_id=${o.order_id}`} style={{ color: "var(--blue)", fontWeight: 600 }}>{o.order_id}</Link>
                  <span style={{ fontWeight: 700 }}>{formatVNDCompact(Number(o.order_total || 0))}</span>
                </div>
              )) : <div style={{ fontSize: 10, color: "#9CA3AF", padding: "8px 0" }}>Không có đơn về</div>}
              {arrivedToday.length > 0 && <div style={{ fontSize: 9, color: "#9CA3AF", marginTop: 4 }}>Tổng: {formatVNDCompact(arrivedTodayValue)} · {arrivedToday.length} đơn</div>}
            </div>
            {/* Thiệt hại mini */}
            <div className="card" style={{ padding: "10px 12px" }}>
              <div style={{ fontWeight: 700, fontSize: 11, marginBottom: 6, color: damageItems.length > 0 ? "#DC2626" : undefined }}>Thiệt hại chờ xử lý</div>
              {damageItems.length > 0 ? damageItems.slice(0, 3).map((d) => (
                <div key={d.item_id} style={{ display: "flex", justifyContent: "space-between", fontSize: 10, padding: "3px 0", borderBottom: "1px solid var(--border)" }}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "70%" }}>{d.item_name || "—"}</span>
                  <span style={{ fontWeight: 700, color: "#DC2626" }}>{formatVNDCompact(Number(d.damage_amount || 0))}</span>
                </div>
              )) : <div style={{ fontSize: 10, color: "#9CA3AF", padding: "8px 0" }}>Không có thiệt hại</div>}
              {damageItems.length > 3 && <Link href="/damage-mgmt" style={{ fontSize: 9, color: "var(--blue)" }}>+{damageItems.length - 3} nữa →</Link>}
            </div>
          </div>

          {/* Việc hôm nay mini */}
          <div className="card" style={{ padding: "10px 12px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontWeight: 700, fontSize: 11 }}>Việc hôm nay</span>
              <span style={{ fontSize: 9, color: "#9CA3AF" }}>{tasksDone}/{tasksTotal} xong</span>
            </div>
            {tasksToday.length > 0 ? tasksToday.slice(0, 4).map((t) => {
              const isDone = t.status === "DONE";
              return (
                <div key={t.task_id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 0", borderBottom: "1px solid var(--border)", fontSize: 11 }}>
                  <div style={{ width: 14, height: 14, borderRadius: "50%", border: isDone ? "none" : "2px solid #E5E7EB", background: isDone ? "#16A34A" : "transparent", flexShrink: 0 }} />
                  <span style={{ flex: 1, textDecoration: isDone ? "line-through" : "none", color: isDone ? "#9CA3AF" : undefined }}>{t.title}</span>
                  {t.priority === "HIGH" || t.priority === "URGENT" ? <span style={{ fontSize: 8, padding: "1px 4px", borderRadius: 3, background: "#FEF2F2", color: "#DC2626", fontWeight: 600 }}>!</span> : null}
                </div>
              );
            }) : <div style={{ fontSize: 10, color: "#9CA3AF", padding: "8px 0" }}>Không có việc deadline hôm nay</div>}
          </div>
          </div>{/* End left column */}

          {/* RIGHT: Ads cost table */}
          <div className="card" style={{ padding: "12px 14px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontWeight: 700, fontSize: 12 }}>Chi phí Ads theo kênh</span>
              <span style={{ fontSize: 10, color: "#9CA3AF" }}>Tổng: {formatVNDCompact(todayAdsTotal)} · {adsPctToday.toFixed(1)}% DT</span>
            </div>
            <div className="tbl-wrap">
              <table>
                <thead><tr>
                  <th>Kênh</th>
                  <th className="text-right">Ads Spend</th>
                  <th className="text-right">DT kênh</th>
                  <th className="text-right">Ads/DT</th>
                  <th className="text-right">ROAS</th>
                </tr></thead>
                <tbody>
                  {/* Facebook */}
                  <tr>
                    <td><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#1877F2", marginRight: 4, verticalAlign: "middle" }} />Facebook</td>
                    <td className="text-right" style={{ color: "#DC2626" }}>{formatVNDCompact(todayAdsFb)}</td>
                    <td className="text-right" style={{ color: "#16A34A" }}>{formatVNDCompact(getChRev(chRevToday, "Facebook"))}</td>
                    <td className="text-right font-bold" style={{ color: getChRev(chRevToday, "Facebook") > 0 && (todayAdsFb / getChRev(chRevToday, "Facebook") * 100) <= 7 ? "#16A34A" : "#DC2626" }}>
                      {getChRev(chRevToday, "Facebook") > 0 ? (todayAdsFb / getChRev(chRevToday, "Facebook") * 100).toFixed(1) : "0.0"}%
                    </td>
                    <td className="text-right font-bold" style={{ color: todayAdsFb > 0 && fbTotalRev / todayAdsFb >= 10 ? "#16A34A" : "#D97706" }}>
                      {todayAdsFb > 0 ? (fbTotalRev / todayAdsFb).toFixed(1) : "0.0"}x
                    </td>
                  </tr>
                  {/* TikTok */}
                  <tr>
                    <td><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#FE2C55", marginRight: 4, verticalAlign: "middle" }} />TikTok</td>
                    <td className="text-right" style={{ color: "#DC2626" }}>{formatVNDCompact(ttTotalSpend)}</td>
                    <td className="text-right" style={{ color: "#16A34A" }}>{formatVNDCompact(getChRev(chRevToday, "TikTok"))}</td>
                    <td className="text-right font-bold" style={{ color: getChRev(chRevToday, "TikTok") > 0 && (ttTotalSpend / getChRev(chRevToday, "TikTok") * 100) <= 7 ? "#16A34A" : "#DC2626" }}>
                      {getChRev(chRevToday, "TikTok") > 0 ? (ttTotalSpend / getChRev(chRevToday, "TikTok") * 100).toFixed(1) : "0.0"}%
                    </td>
                    <td className="text-right font-bold" style={{ color: ttTotalSpend > 0 && ttTotalRev / ttTotalSpend >= 10 ? "#16A34A" : "#D97706" }}>
                      {ttTotalSpend > 0 ? (ttTotalRev / ttTotalSpend).toFixed(1) : "0.0"}x
                    </td>
                  </tr>
                  {/* TikTok sub-rows */}
                  <tr>
                    <td style={{ paddingLeft: 24, color: "#9CA3AF", fontSize: 10 }}>- BM Ads</td>
                    <td className="text-right" style={{ color: "#9CA3AF", fontSize: 10 }}>{formatVNDCompact(todayAdsTt)}</td>
                    <td className="text-right" style={{ color: "#9CA3AF", fontSize: 10 }}>—</td>
                    <td className="text-right" style={{ color: "#9CA3AF", fontSize: 10 }}>—</td>
                    <td className="text-right" style={{ color: "#9CA3AF", fontSize: 10 }}>—</td>
                  </tr>
                  <tr>
                    <td style={{ paddingLeft: 24, color: "#9CA3AF", fontSize: 10 }}>- GMV Max</td>
                    <td className="text-right" style={{ color: "#9CA3AF", fontSize: 10 }}>{formatVNDCompact(todayAdsGmv)}</td>
                    <td className="text-right" style={{ color: "#16A34A", fontSize: 10 }}>
                      {formatVNDCompact((adsToday.gmvMax || []).reduce((s, a) => s + Number(a.gross_revenue || 0), 0))}
                    </td>
                    <td className="text-right font-bold" style={{ fontSize: 10, color: (() => {
                      const gmvRev = (adsToday.gmvMax || []).reduce((s, a) => s + Number(a.gross_revenue || 0), 0);
                      return gmvRev > 0 && (todayAdsGmv / gmvRev * 100) <= 7 ? "#16A34A" : "#DC2626";
                    })() }}>
                      {(() => {
                        const gmvRev = (adsToday.gmvMax || []).reduce((s, a) => s + Number(a.gross_revenue || 0), 0);
                        return gmvRev > 0 ? (todayAdsGmv / gmvRev * 100).toFixed(1) : "0.0";
                      })()}%
                    </td>
                    <td className="text-right font-bold" style={{ fontSize: 10, color: (() => {
                      const gmvRev = (adsToday.gmvMax || []).reduce((s, a) => s + Number(a.gross_revenue || 0), 0);
                      return todayAdsGmv > 0 && gmvRev / todayAdsGmv >= 10 ? "#16A34A" : "#D97706";
                    })() }}>
                      {(() => {
                        const gmvRev = (adsToday.gmvMax || []).reduce((s, a) => s + Number(a.gross_revenue || 0), 0);
                        return todayAdsGmv > 0 ? (gmvRev / todayAdsGmv).toFixed(1) : "0.0";
                      })()}x
                    </td>
                  </tr>
                  {/* Shopee */}
                  <tr>
                    <td><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#EE4D2D", marginRight: 4, verticalAlign: "middle" }} />Shopee</td>
                    <td className="text-right" style={{ color: "#DC2626" }}>{formatVNDCompact(spTotalSpend)}</td>
                    <td className="text-right" style={{ color: "#16A34A" }}>{formatVNDCompact(getChRev(chRevToday, "Shopee"))}</td>
                    <td className="text-right font-bold" style={{ color: getChRev(chRevToday, "Shopee") > 0 && (spTotalSpend / getChRev(chRevToday, "Shopee") * 100) <= 7 ? "#16A34A" : "#DC2626" }}>
                      {getChRev(chRevToday, "Shopee") > 0 ? (spTotalSpend / getChRev(chRevToday, "Shopee") * 100).toFixed(1) : "0.0"}%
                    </td>
                    <td className="text-right font-bold" style={{ color: spTotalSpend > 0 && spTotalRev / spTotalSpend >= 10 ? "#16A34A" : "#D97706" }}>
                      {spTotalSpend > 0 ? (spTotalRev / spTotalSpend).toFixed(1) : "0.0"}x
                    </td>
                  </tr>
                  {/* Total row */}
                  <tr style={{ background: "#F9FAFB", fontWeight: 700 }}>
                    <td>Tổng</td>
                    <td className="text-right" style={{ color: "#DC2626" }}>{formatVNDCompact(todayAdsTotal)}</td>
                    <td className="text-right" style={{ color: "#16A34A" }}>{formatVNDCompact(revToday.total)}</td>
                    <td className="text-right font-bold" style={{ color: adsPctToday <= 7 ? "#16A34A" : "#DC2626" }}>{adsPctToday.toFixed(1)}%</td>
                    <td className="text-right font-bold">{roasToday.toFixed(1)}x</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Cost summary mini */}
            <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
              <div style={{ background: "#F9FAFB", borderRadius: 6, padding: "6px 10px" }}>
                <div style={{ fontSize: 9, color: "#6B7280" }}>Chi phí / Tổng DT</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: adsPctToday <= 5 ? "#16A34A" : adsPctToday <= 7 ? "#D97706" : "#DC2626" }}>{adsPctToday.toFixed(1)}%</div>
                <div style={{ fontSize: 9, color: adsPctToday <= 7 ? "#16A34A" : "#DC2626" }}>{adsPctToday <= 5 ? "Tốt" : adsPctToday <= 7 ? "Trung bình" : "Cao — mục tiêu <7%"}</div>
              </div>
              <div style={{ background: "#F9FAFB", borderRadius: 6, padding: "6px 10px" }}>
                <div style={{ fontSize: 9, color: "#6B7280" }}>Chi phí / Tổng (tháng)</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: (() => {
                  const monthAdsPct = revMonth.total > 0
                    ? ((adsToday.fbAds || []).reduce((s, a) => s + Number(a.spend || 0), 0)
                      + todayAdsTotal) / revMonth.total * 100
                    : 0;
                  return monthAdsPct <= 5 ? "#16A34A" : monthAdsPct <= 7 ? "#D97706" : "#DC2626";
                })() }}>—</div>
                <div style={{ fontSize: 9, color: "#9CA3AF" }}>Xem tab Tháng</div>
              </div>
            </div>

            {/* Top accounts */}
            <div style={{ borderTop: "1px solid var(--border)", paddingTop: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 6 }}>Top tài khoản chi phí cao nhất</div>

              {/* Facebook accounts */}
              {fbAccountsSorted.length > 0 && (
                <div style={{ marginBottom: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#1877F2" }} />
                    <span style={{ fontSize: 10, fontWeight: 700, color: "#1877F2" }}>Facebook</span>
                    <span style={{ fontSize: 9, color: "#9CA3AF", marginLeft: "auto" }}>{(adsToday.fbAds || []).length} TK · Tổng {formatVNDCompact(todayAdsFb)}</span>
                  </div>
                  {fbAccountsSorted.map((a, i) => (
                    <div key={a.ad_account_id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 0 3px 12px", fontSize: 10 }}>
                      <span style={{ color: "#9CA3AF", width: 12, textAlign: "center" }}>{i + 1}</span>
                      <span style={{ flex: 1, fontWeight: 600 }}>{a.account_name || a.ad_account_id}</span>
                      <div style={{ width: 60, height: 5, background: "#F3F4F6", borderRadius: 2, overflow: "hidden" }}>
                        <div style={{ width: `${todayAdsFb > 0 ? Math.round(Number(a.spend || 0) / todayAdsFb * 100) : 0}%`, height: "100%", background: "#1877F2", borderRadius: 2 }} />
                      </div>
                      <span style={{ fontWeight: 700, width: 45, textAlign: "right" }}>{formatVNDCompact(Number(a.spend || 0))}</span>
                      <span style={{ color: "#9CA3AF", width: 30, textAlign: "right", fontSize: 9 }}>{todayAdsFb > 0 ? Math.round(Number(a.spend || 0) / todayAdsFb * 100) : 0}%</span>
                    </div>
                  ))}
                </div>
              )}

              {/* TikTok accounts */}
              {(gmvSorted.length > 0 || ttBmSorted.length > 0) && (
                <div style={{ marginBottom: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#FE2C55" }} />
                    <span style={{ fontSize: 10, fontWeight: 700, color: "#FE2C55" }}>TikTok</span>
                    <span style={{ fontSize: 9, color: "#9CA3AF", marginLeft: "auto" }}>Tổng {formatVNDCompact(ttTotalSpend)}</span>
                  </div>
                  {gmvSorted.map((a, i) => (
                    <div key={`gmv-${i}`} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 0 3px 12px", fontSize: 10 }}>
                      <span style={{ color: "#9CA3AF", width: 12, textAlign: "center" }}>{i + 1}</span>
                      <span style={{ flex: 1, fontWeight: 600 }}>GMV Max ({a.store_name})</span>
                      <div style={{ width: 60, height: 5, background: "#F3F4F6", borderRadius: 2, overflow: "hidden" }}>
                        <div style={{ width: `${ttTotalSpend > 0 ? Math.round(Number(a.spend || 0) / ttTotalSpend * 100) : 0}%`, height: "100%", background: "#FE2C55", borderRadius: 2 }} />
                      </div>
                      <span style={{ fontWeight: 700, width: 45, textAlign: "right" }}>{formatVNDCompact(Number(a.spend || 0))}</span>
                      <span style={{ color: "#9CA3AF", width: 30, textAlign: "right", fontSize: 9 }}>{ttTotalSpend > 0 ? Math.round(Number(a.spend || 0) / ttTotalSpend * 100) : 0}%</span>
                    </div>
                  ))}
                  {ttBmSorted.map((a, i) => (
                    <div key={`bm-${i}`} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 0 3px 12px", fontSize: 10 }}>
                      <span style={{ color: "#9CA3AF", width: 12, textAlign: "center" }}>{gmvSorted.length + i + 1}</span>
                      <span style={{ flex: 1, fontWeight: 600 }}>{a.advertiser_name || a.advertiser_id} (BM)</span>
                      <div style={{ width: 60, height: 5, background: "#F3F4F6", borderRadius: 2, overflow: "hidden" }}>
                        <div style={{ width: `${ttTotalSpend > 0 ? Math.round(Number(a.spend || 0) / ttTotalSpend * 100) : 0}%`, height: "100%", background: "#FE2C55", borderRadius: 2 }} />
                      </div>
                      <span style={{ fontWeight: 700, width: 45, textAlign: "right" }}>{formatVNDCompact(Number(a.spend || 0))}</span>
                      <span style={{ color: "#9CA3AF", width: 30, textAlign: "right", fontSize: 9 }}>{ttTotalSpend > 0 ? Math.round(Number(a.spend || 0) / ttTotalSpend * 100) : 0}%</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Shopee */}
              {todayAdsSp > 0 && (
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#EE4D2D" }} />
                    <span style={{ fontSize: 10, fontWeight: 700, color: "#EE4D2D" }}>Shopee</span>
                    <span style={{ fontSize: 9, color: "#9CA3AF", marginLeft: "auto" }}>Tổng {formatVNDCompact(spTotalSpend)}</span>
                  </div>
                  {(adsToday.spAds || []).map((a, i) => (
                    <div key={`sp-${i}`} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 0 3px 12px", fontSize: 10 }}>
                      <span style={{ color: "#9CA3AF", width: 12, textAlign: "center" }}>{i + 1}</span>
                      <span style={{ flex: 1, fontWeight: 600 }}>Shopee Ads</span>
                      <span style={{ fontWeight: 700, width: 45, textAlign: "right" }}>{formatVNDCompact(Number(a.spend || 0))}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ─── ALERTS ─── */}
        <div style={{ marginBottom: 12 }}>
          {revPct >= 100 && (
            <div style={{ padding: "8px 12px", borderRadius: 6, fontSize: 12, border: "1px solid #86EFAC", background: "#F0FDF4", color: "#166534", marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontWeight: 700 }}>&#10003;</span>
              DT hôm nay vượt KH ngày +{revPct - 100}%
            </div>
          )}
          {adsPctToday > 7 && (
            <div style={{ padding: "8px 12px", borderRadius: 6, fontSize: 12, border: "1px solid #FECACA", background: "#FEF2F2", color: "#991B1B", marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontWeight: 700 }}>!</span>
              Chi phí Ads/DT = {adsPctToday.toFixed(1)}% — cao hơn mục tiêu 7%
            </div>
          )}
          {damageItems.length > 0 && (
            <div style={{ padding: "8px 12px", borderRadius: 6, fontSize: 12, border: "1px solid #FCD34D", background: "#FFFBEB", color: "#92400E", marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontWeight: 700 }}>&#9888;</span>
              {damageItems.length} SP thiệt hại chờ xử lý — {formatVNDCompact(damageItems.reduce((s, d) => s + Number(d.damage_amount || 0), 0))}
            </div>
          )}
        </div>
      </section>
    );
  }

  // Only fetch what's needed for the current view — reduces query count from 13 to 5-8
  const [user, fbTarget, tkTarget, spTarget, wbTarget] = await Promise.all([
    getCurrentUser(),
    getChannelTarget("facebook", monthKey),
    getChannelTarget("tiktok", monthKey),
    getChannelTarget("shopee", monthKey),
    getChannelTarget("web_b2b", monthKey),
  ]);

  // Year view only needs yearly + channel targets
  const [yearly, prevYearly, yearChTargets] = await Promise.all([
    getYearlySummary(currentYear),
    getYearlySummary(currentYear - 1),
    getYearlyChannelTargets(currentYear),
  ]);

  // Month/default view needs more data — skip for year view
  const needMonthData = view !== "year";
  const [stats, recent, revMonth, rev7d, monthDailyAds] = needMonthData
    ? await Promise.all([
        getDashboardStats(month),
        getRecentOrders(10),
        getRevenueByChannel(from, to),
        getRevenueByChannel(d7from, d7to),
        getDailyAdsTotals(from, to),
      ])
    : [null as Awaited<ReturnType<typeof getDashboardStats>> | null, [] as Awaited<ReturnType<typeof getRecentOrders>>, null as Awaited<ReturnType<typeof getRevenueByChannel>> | null, null as Awaited<ReturnType<typeof getRevenueByChannel>> | null, [] as { date: string; spend: number }[]];

  const totalAdSpend = stats ? (stats.revenue.adSpend + stats.revenue.shopeeAdSpend + stats.revenue.tiktokAdSpend) : 0;
  const overallRoas = totalAdSpend > 0 && revMonth ? revMonth.total / totalAdSpend : 0;
  const adsPct = revMonth && revMonth.total > 0 ? (totalAdSpend / revMonth.total) * 100 : 0;

  // 7-day chart data
  const max7d = rev7d ? Math.max(...rev7d.daily.map((d) => d.revenue), 1) : 1;
  const avg7d = rev7d && rev7d.daily.length > 0 ? rev7d.total / rev7d.daily.length : 0;
  const best7d = rev7d ? rev7d.daily.reduce((best, d) => d.revenue > best.revenue ? d : best, { date: "", revenue: 0 }) : { date: "", revenue: 0 };

  // Year summary
  const yearPct = yearly.yearTarget > 0 ? Math.round((yearly.cumRevenue / yearly.yearTarget) * 100) : 0;
  const yearRemaining = Math.max(0, yearly.yearTarget - yearly.cumRevenue);
  const yearAdsPct = yearly.cumRevenue > 0 ? (yearly.cumAds / yearly.cumRevenue) * 100 : 0;

  // ═══════════════════════════════════════════════════════
  // YEARLY VIEW
  // ═══════════════════════════════════════════════════════
  if (view === "year") {
    const yearRevData = await getRevenueByChannel(`${currentYear}-01-01`, `${currentYear}-12-31`);
    const nowMonth = now.getMonth() + 1;
    const prevYearRev = prevYearly?.cumRevenue || 0;
    const growthVsPrev = prevYearRev > 0 ? Math.round(((yearly.yearTarget / prevYearRev) - 1) * 100) : 0;
    const cumTargetToNow = yearly.months.slice(0, nowMonth).reduce((s, mm) => s + mm.target, 0);
    const surplus = yearly.cumRevenue - cumTargetToNow;
    const cumAchievePct = cumTargetToNow > 0 ? Math.round((yearly.cumRevenue / cumTargetToNow) * 100) : 0;
    const yearPctActual = yearly.yearTarget > 0 ? (yearly.cumRevenue / yearly.yearTarget * 100) : 0;
    const yearPctRemain = Math.max(0, 100 - yearPctActual);
    const cumTargetPctOfYear = yearly.yearTarget > 0 ? (cumTargetToNow / yearly.yearTarget * 100) : 0;

    // Channel cumulative revenue (mapped to target keys)
    const chRevCum: Record<string, number> = {};
    for (const mm of yearly.months) {
      for (const [ch, rev] of Object.entries(mm.byChannel)) {
        const key = CHANNEL_TARGET_MAP[ch] || ch;
        chRevCum[key] = (chRevCum[key] || 0) + rev;
      }
    }

    // Cumulative ads by platform
    const cumAdsFb = yearly.months.reduce((s, mm) => s + mm.adsFb, 0);
    const cumAdsShopee = yearly.months.reduce((s, mm) => s + mm.adsShopee, 0);
    const cumAdsTiktok = yearly.months.reduce((s, mm) => s + mm.adsTiktok, 0);
    const cumAdsTotal = cumAdsFb + cumAdsShopee + cumAdsTiktok;
    const adsRevPctYear = yearly.cumRevenue > 0 ? (cumAdsTotal / yearly.cumRevenue * 100) : 0;

    // Budget
    const budgetTotal = yearly.yearTarget * BUDGET_PCT;

    // Channel targets for year
    const chTargets: Record<string, number> = {};
    for (const ch of YEAR_CHANNELS) {
      chTargets[ch.key] = yearChTargets?.[ch.key] || 0;
    }

    return (
      <section className="section" id="dash-year">
        <DashYearSwitch mobileProps={{
          year: currentYear, nowMonth, yearTarget: yearly.yearTarget, cumRevenue: yearly.cumRevenue,
          prevYearRev, growthVsPrev, cumAdsTotal, adsRevPct: adsRevPctYear,
          months: yearly.months.map(m => ({ month: m.month, revenue: m.revenue, target: m.target, ads: m.ads, byChannel: m.byChannel })),
          channels: YEAR_CHANNELS.map(ch => ({ name: ch.label, abbr: ch.abbr, color: ch.color, rev: chRevCum[ch.key] || 0, target: chTargets[ch.key] || 0, ads: ch.key === "facebook" ? cumAdsFb : ch.key === "tiktok" ? cumAdsTiktok : ch.key === "shopee" ? cumAdsShopee : 0 })),
          sourcesByChannel: yearRevData.sourcesByChannel,
        }} />
        <AutoSyncToday />
        {/* ─── HEADER ─── */}
        <div className="page-hdr">
          <div>
            <div className="page-title">Dashboard</div>
            <div className="page-sub">Năm {currentYear} · KH: {fmtTy(yearly.yearTarget)} · {currentYear - 1}: {fmtTy(prevYearRev)}</div>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <Link href="/dash?view=day" className="btn btn-ghost btn-sm" style={{ textDecoration: "none" }}>Ngày</Link>
            <Link href="/dash?view=month" className="btn btn-ghost btn-sm" style={{ textDecoration: "none" }}>Tháng</Link>
            <Link href={`/dash?view=year&month=${currentYear}-01`} className="btn btn-primary btn-sm" style={{ textDecoration: "none" }}>Năm</Link>
            <Link href={`/dash?view=year&month=${currentYear - 1}-01`} className="btn btn-ghost btn-sm" style={{ textDecoration: "none", fontSize: 10 }}>{currentYear - 1} TT</Link>
            <Link href={`/dash?view=year&month=${currentYear}-01`} className="btn btn-sm" style={{ textDecoration: "none", fontSize: 10, background: "#1F2937", color: "#fff" }}>{currentYear} KH</Link>
            <Link href={`/dash?view=year&month=${currentYear}-01`} className="btn btn-ghost btn-sm" style={{ fontSize: 12 }}>↻</Link>
          </div>
        </div>

        {/* ─── TOP 3 KPI CARDS ─── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 12 }}>
          {/* DOANH THU */}
          <div className="card" style={{ padding: "12px 16px" }}>
            <div style={{ fontWeight: 700, fontSize: 11, color: "#6B7280", marginBottom: 8, letterSpacing: 0.5 }}>DOANH THU</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <div style={{ fontSize: 10, color: "#6B7280" }}>Kế hoạch năm</div>
                <div style={{ fontSize: 22, fontWeight: 800 }}>{fmtTy(yearly.yearTarget)}</div>
                <div style={{ fontSize: 10, color: "#16A34A" }}>+{growthVsPrev}% vs {currentYear - 1} ({fmtTy(prevYearRev)})</div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: "#6B7280" }}>Đã đạt lũy kế T1–T{nowMonth}</div>
                <div style={{ fontSize: 22, fontWeight: 800 }}>{fmtTy(yearly.cumRevenue)}</div>
                <div style={{ fontSize: 10 }}>
                  {cumAchievePct}% KH · {surplus >= 0
                    ? <span style={{ color: "#16A34A" }}>Vượt {fmtTy(surplus)}</span>
                    : <span style={{ color: "#DC2626" }}>Thiếu {fmtTy(Math.abs(surplus))}</span>}
                </div>
              </div>
            </div>
          </div>

          {/* NGÂN SÁCH NHẬP HÀNG */}
          <div className="card" style={{ padding: "12px 16px" }}>
            <div style={{ fontWeight: 700, fontSize: 11, color: "#6B7280", marginBottom: 8, letterSpacing: 0.5 }}>NGÂN SÁCH NHẬP HÀNG</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <div style={{ fontSize: 10, color: "#6B7280" }}>Ngân sách năm</div>
                <div style={{ fontSize: 22, fontWeight: 800 }}>{fmtTy(budgetTotal)}</div>
                <div style={{ fontSize: 10, color: "#6B7280" }}>= {Math.round(BUDGET_PCT * 100)}% kế hoạch DT</div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: "#6B7280" }}>Đã tiêu lũy kế T1–T{nowMonth}</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: "#9CA3AF" }}>—</div>
                <div style={{ fontSize: 10, color: "#9CA3AF" }}>Chờ đồng bộ từ Nhập hàng</div>
              </div>
            </div>
          </div>

          {/* CHI PHÍ QUẢNG CÁO */}
          <div className="card" style={{ padding: "12px 16px" }}>
            <div style={{ fontWeight: 700, fontSize: 11, color: "#6B7280", marginBottom: 8, letterSpacing: 0.5 }}>CHI PHÍ QUẢNG CÁO</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <div style={{ fontSize: 10, color: "#6B7280" }}>Tổng chi Ads T1–T{nowMonth}</div>
                <div style={{ fontSize: 22, fontWeight: 800 }}>{fmtTy(cumAdsTotal)}</div>
                <div style={{ fontSize: 10, color: "#6B7280" }}>FB {fmtTy(cumAdsFb)} · TT {fmtTy(cumAdsTiktok)} · SP {fmtTy(cumAdsShopee)}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: "#6B7280" }}>Chi Ads / Doanh thu</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: adsRevPctYear < 5 ? "#16A34A" : adsRevPctYear <= 7 ? "#D97706" : "#DC2626" }}>{adsRevPctYear.toFixed(1)}%</div>
                <div style={{ fontSize: 10 }}>
                  <span style={{ color: "#16A34A" }}>Xanh &lt;5%</span>{" "}
                  <span style={{ color: "#D97706" }}>Vàng 5–7%</span>{" "}
                  <span style={{ color: "#DC2626" }}>Đỏ &gt;7%</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ─── PROGRESS BAR ─── */}
        <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 6, padding: "10px 16px", marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <div>
              <div style={{ fontSize: 10, color: "#6B7280" }}>Đã đạt</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#16A34A" }}>
                {fmtTy(yearly.cumRevenue)} <span style={{ fontSize: 12, fontWeight: 600 }}>↑ {yearPctActual.toFixed(1)}%</span>
              </div>
            </div>
            <div style={{ textAlign: "center", alignSelf: "center" }}>
              <div style={{ fontSize: 12 }}>KH {currentYear}: <strong>{fmtTy(yearly.yearTarget)}</strong></div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 10, color: "#DC2626" }}>Còn phải đạt</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#DC2626" }}>
                {fmtTy(yearRemaining)} <span style={{ fontSize: 12, fontWeight: 600 }}>↓ {yearPctRemain.toFixed(1)}%</span>
              </div>
            </div>
          </div>

          <div style={{ height: 22, background: "#E5E7EB", borderRadius: 4, overflow: "hidden", display: "flex" }}>
            <div style={{ width: `${Math.min(yearPctActual, 100)}%`, height: "100%", background: "#16A34A", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "4px 0 0 4px", minWidth: yearPctActual > 2 ? 40 : 0 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#fff" }}>{yearPctActual.toFixed(1)}%</span>
            </div>
            <div style={{ flex: 1, display: "flex", alignItems: "center", paddingLeft: 8 }}>
              <span style={{ fontSize: 10, color: "#6B7280" }}>{yearPctRemain.toFixed(1)}% còn lại</span>
            </div>
          </div>

          {/* T1-T12 milestones */}
          <div style={{ display: "flex", marginTop: 8 }}>
            {yearly.months.map((mm, i) => {
              const mi = i + 1;
              const isPast = mi < nowMonth;
              const isCurrent = mi === nowMonth;
              return (
                <div key={mm.month} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <div style={{
                    width: isPast || isCurrent ? 10 : 8,
                    height: isPast || isCurrent ? 10 : 8,
                    borderRadius: "50%",
                    background: isPast ? "#16A34A" : isCurrent ? "#D97706" : "transparent",
                    border: isPast || isCurrent ? "none" : "1.5px solid #D1D5DB",
                  }} />
                  <div style={{ fontSize: 9, color: isCurrent ? "#D97706" : isPast ? "#374151" : "#D1D5DB", marginTop: 2, fontWeight: isCurrent ? 700 : 400 }}>T{mi}</div>
                  {isCurrent && (
                    <div style={{ fontSize: 8, color: "#D97706", marginTop: 1, whiteSpace: "nowrap" }}>
                      KH T{mi}: {cumTargetPctOfYear.toFixed(1)}%
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ─── 3-COLUMN LAYOUT ─── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, alignItems: "start" }}>

          {/* ─── LEFT: Doanh thu + Ads từng tháng ─── */}
          <div className="card" style={{ padding: "12px 14px" }}>
            <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 4 }}>Doanh thu + Ads từng tháng</div>
            <div style={{ display: "flex", gap: 4, fontSize: 9, color: "#9CA3AF", marginBottom: 8, alignItems: "center" }}>
              <span style={{ width: 20 }}>T</span>
              <span style={{ flex: 1 }}>KH {currentYear} · {currentYear - 1} · % KH</span>
              <span style={{ width: 50, textAlign: "right" }}>TT</span>
              <span style={{ width: 40, textAlign: "right" }}>Ads</span>
              <span style={{ width: 30, textAlign: "right" }}>%DT</span>
            </div>
            {yearly.months.map((mm, i) => {
              const mi = i + 1;
              const hasData = mm.revenue > 0 || mm.ads > 0;
              const pctKH = mm.target > 0 ? Math.round((mm.revenue / mm.target) * 100) : 0;
              const barBg = pctKH >= 100 ? "#DCFCE7" : pctKH >= 70 ? "#FEF3C7" : pctKH > 0 ? "#FEE2E2" : "#F9FAFB";
              const pctColor = pctKH >= 100 ? "#16A34A" : pctKH >= 70 ? "#D97706" : pctKH > 0 ? "#DC2626" : "#D1D5DB";
              const prevRev = prevYearly?.months?.[i]?.revenue || 0;
              const ttVal = hasData ? mm.revenue : mm.target;

              return (
                <div key={mm.month} style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 3 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, width: 20, color: mi === nowMonth ? "#3B82F6" : "#374151" }}>T{mi}</span>
                  <div style={{ flex: 1, position: "relative", height: 20, background: "#F9FAFB", borderRadius: 3, overflow: "hidden" }}>
                    {hasData && (
                      <div style={{ position: "absolute", top: 0, left: 0, height: "100%", width: `${Math.min(pctKH, 100)}%`, background: barBg, borderRadius: 3 }} />
                    )}
                    <div style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", height: "100%", paddingLeft: 4 }}>
                      <span style={{ fontSize: 8, color: hasData ? "#374151" : "#D1D5DB", whiteSpace: "nowrap" }}>
                        KH {fmtTy(mm.target)} · {prevRev > 0 ? fmtTy(prevRev) : "—"}
                      </span>
                    </div>
                  </div>
                  <span style={{ fontSize: 9, fontWeight: 700, width: 48, textAlign: "right", color: pctColor, whiteSpace: "nowrap" }}>
                    {pctKH > 0 ? `${pctKH}% KH` : ""}
                  </span>
                  <span style={{ fontSize: 9, fontWeight: 600, width: 50, textAlign: "right", color: hasData ? "#374151" : "#D1D5DB" }}>
                    {ttVal > 0 ? fmtTy(ttVal) : "—"}
                  </span>
                  <span style={{ fontSize: 9, width: 40, textAlign: "right", color: "#DC2626" }}>
                    {mm.ads > 0 ? fmtTy(mm.ads) : "—"}
                  </span>
                  <span style={{ fontSize: 9, width: 30, textAlign: "right", color: "#6B7280" }}>
                    {mm.revenue > 0 && mm.ads > 0 ? `${((mm.ads / mm.revenue) * 100).toFixed(1)}%` : "—"}
                  </span>
                </div>
              );
            })}
          </div>

          {/* ─── MIDDLE: Kênh bán + Chi phí Ads ─── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {/* Kênh bán — lũy kế / KH năm */}
            <div className="card" style={{ padding: "12px 14px" }}>
              <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 2 }}>Kênh bán — lũy kế / KH năm</div>
              <div style={{ fontSize: 9, color: "#9CA3AF", marginBottom: 8 }}>Số thực từ SALES_SYNC</div>

              {YEAR_CHANNELS.map((ch) => {
                const rev = chRevCum[ch.key] || 0;
                const target = chTargets[ch.key] || 0;
                const pctCh = target > 0 ? Math.round((rev / target) * 100) : 0;
                return (
                  <div key={ch.key} style={{ marginBottom: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 2 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: ch.color, flexShrink: 0 }} />
                        <span style={{ fontSize: 11, fontWeight: 700 }}>{ch.label}</span>
                        <span style={{ fontSize: 9, background: ch.color, color: "#fff", borderRadius: 3, padding: "0 5px", fontWeight: 600 }}>{ch.allocPct}</span>
                      </div>
                      <div style={{ fontSize: 9, color: "#6B7280" }}>
                        KH: {fmtTy(target)} <span style={{ fontWeight: 700, color: pctCh >= 30 ? "#16A34A" : "#D97706" }}>{pctCh}%</span>
                      </div>
                    </div>
                    <div style={{ height: 8, background: "#F3F4F6", borderRadius: 4, overflow: "hidden", marginBottom: 2 }}>
                      <div style={{ height: "100%", width: `${Math.min(pctCh, 100)}%`, background: ch.color, borderRadius: 4 }} />
                    </div>
                    <div style={{ fontSize: 9, color: "#6B7280" }}>
                      Lũy kế: {fmtTy(rev)} / KH năm: {fmtTy(target)}
                    </div>
                  </div>
                );
              })}

              {/* Stacked proportion bar */}
              <div style={{ display: "flex", height: 20, borderRadius: 10, overflow: "hidden", marginTop: 8 }}>
                {YEAR_CHANNELS.map((ch) => {
                  const rev = chRevCum[ch.key] || 0;
                  const pctBar = yearly.cumRevenue > 0 ? (rev / yearly.cumRevenue * 100) : 0;
                  if (pctBar < 1) return null;
                  return (
                    <div key={ch.key} style={{ width: `${pctBar}%`, background: ch.color, display: "flex", alignItems: "center", justifyContent: "center", minWidth: 20 }}>
                      <span style={{ fontSize: 8, color: "#fff", fontWeight: 700, whiteSpace: "nowrap" }}>
                        {pctBar >= 15 ? `${ch.abbr} ${Math.round(pctBar)}%` : ch.abbr}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div style={{ fontSize: 8, color: "#9CA3AF", marginTop: 2 }}>Tỉ trọng kênh / tổng doanh thu</div>
            </div>

            {/* Chi phí Ads lũy kế */}
            <div className="card" style={{ padding: "12px 14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 12 }}>Chi phí Ads lũy kế</div>
                  <div style={{ fontSize: 9, color: "#9CA3AF" }}>Ads kênh / DT kênh đó · lũy kế T1–T{nowMonth}</div>
                </div>
                <div style={{ display: "flex", gap: 6, fontSize: 9 }}>
                  <span style={{ color: "#16A34A" }}>&lt;5%</span>
                  <span style={{ color: "#D97706" }}>5–7%</span>
                  <span style={{ color: "#DC2626" }}>&gt;7%</span>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                <div style={{ background: "#F9FAFB", borderRadius: 6, padding: "8px 10px" }}>
                  <div style={{ fontSize: 9, color: "#6B7280" }}>Tổng chi Ads</div>
                  <div style={{ fontSize: 18, fontWeight: 800 }}>{fmtTy(cumAdsTotal)}</div>
                </div>
                <div style={{ background: "#F9FAFB", borderRadius: 6, padding: "8px 10px" }}>
                  <div style={{ fontSize: 9, color: "#6B7280" }}>Ads / DT tổng</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: adsRevPctYear < 5 ? "#16A34A" : adsRevPctYear <= 7 ? "#D97706" : "#DC2626" }}>{adsRevPctYear.toFixed(1)}%</div>
                  <div style={{ fontSize: 9, color: "#6B7280" }}>{adsRevPctYear < 5 ? "Tốt — dưới 5%" : adsRevPctYear <= 7 ? "Trung bình" : "Cao — trên 7%"}</div>
                </div>
              </div>

              {/* Scale bar */}
              <div style={{ display: "flex", height: 4, borderRadius: 2, overflow: "hidden", marginBottom: 4 }}>
                <div style={{ flex: 5, background: "#16A34A" }} />
                <div style={{ flex: 2, background: "#D97706" }} />
                <div style={{ flex: 4, background: "#DC2626" }} />
              </div>
              <div style={{ display: "flex", fontSize: 8, color: "#9CA3AF", marginBottom: 8 }}>
                <span style={{ flex: 5 }}>0%</span>
                <span style={{ flex: 2, textAlign: "center" }}>5%</span>
                <span style={{ flex: 4, textAlign: "center" }}>7%</span>
                <span>11%+</span>
              </div>

              {/* Per-channel ads */}
              {[
                { label: "Facebook Ads", spend: cumAdsFb, dt: chRevCum.facebook || 0, color: "#1877F2" },
                { label: "TikTok Ads", spend: cumAdsTiktok, dt: chRevCum.tiktok || 0, color: "#000" },
                { label: "Shopee Ads", spend: cumAdsShopee, dt: chRevCum.shopee || 0, color: "#EE4D2D" },
              ].map((ch) => {
                const pctAd = ch.dt > 0 ? (ch.spend / ch.dt * 100) : 0;
                const barW = Math.min(pctAd / 11 * 100, 100);
                const barClr = pctAd < 5 ? "#16A34A" : pctAd <= 7 ? "#D97706" : "#DC2626";
                return (
                  <div key={ch.label} style={{ marginBottom: 6 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 2 }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: ch.color, flexShrink: 0 }} />
                      <span style={{ fontSize: 10, fontWeight: 600 }}>{ch.label}</span>
                      <span style={{ fontSize: 9, color: "#6B7280", marginLeft: "auto" }}>
                        {fmtTy(ch.spend)} / DT: {fmtTy(ch.dt)}
                      </span>
                      <span style={{ fontSize: 10, fontWeight: 700, color: barClr }}>{pctAd.toFixed(2)}%</span>
                    </div>
                    <div style={{ height: 6, background: "#F3F4F6", borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${barW}%`, background: barClr, borderRadius: 3 }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ─── RIGHT: Ngân sách nhập hàng + Tiến độ ─── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {/* Ngân sách nhập hàng */}
            <div className="card" style={{ padding: "12px 14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <div style={{ fontWeight: 700, fontSize: 12 }}>Ngân sách nhập hàng</div>
                <Link href="/list" style={{ fontSize: 10, color: "var(--blue)" }}>Kết nối</Link>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
                <div style={{ background: "#EFF6FF", borderRadius: 6, padding: "8px 10px" }}>
                  <div style={{ fontSize: 9, color: "#3B82F6" }}>KH năm</div>
                  <div style={{ fontSize: 16, fontWeight: 800 }}>{fmtTy(budgetTotal)}</div>
                  <div style={{ fontSize: 9, color: "#3B82F6" }}>{Math.round(BUDGET_PCT * 100)}% DT KH</div>
                </div>
                <div style={{ background: "#F9FAFB", borderRadius: 6, padding: "8px 10px" }}>
                  <div style={{ fontSize: 9, color: "#6B7280" }}>Đã nhập</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: "#9CA3AF" }}>—</div>
                  <div style={{ fontSize: 9, color: "#9CA3AF" }}>Chờ đồng bộ</div>
                </div>
              </div>

              {BUDGET_SOURCES.map((src) => (
                <div key={src.name} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: src.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 10, fontWeight: 600, flex: 1 }}>{src.name}</span>
                  <span style={{ fontSize: 9, background: src.color, color: "#fff", borderRadius: 3, padding: "0 5px", fontWeight: 600 }}>{src.pct}%</span>
                  <span style={{ fontSize: 9, color: "#6B7280" }}>KH: {fmtTy(budgetTotal * src.pct / 100)}</span>
                </div>
              ))}
            </div>

            {/* Tiến độ từng tháng */}
            <div className="card" style={{ padding: "12px 14px" }}>
              <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 8 }}>Tiến độ từng tháng</div>
              {yearly.months.map((mm, i) => {
                const budgetMonth = mm.target * BUDGET_PCT;
                return (
                  <div key={mm.month} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, width: 20, color: i + 1 === nowMonth ? "#3B82F6" : "#6B7280" }}>T{i + 1}</span>
                    <div style={{ flex: 1, height: 6, background: "#F3F4F6", borderRadius: 2, overflow: "hidden" }} />
                    <span style={{ fontSize: 9, color: "#6B7280", width: 50, textAlign: "right" }}>{fmtTy(budgetMonth)}</span>
                    <span style={{ fontSize: 9, color: "#9CA3AF" }}>—</span>
                  </div>
                );
              })}
              <div style={{ fontSize: 9, color: "#9CA3AF", marginTop: 6, borderTop: "1px solid #E5E7EB", paddingTop: 6 }}>
                Tự cập nhật khi đơn → <strong>Đã về kho</strong>. Chi xem.
              </div>
            </div>
          </div>
        </div>
      </section>
    );
  }

  // ═══════════════════════════════════════════════════════
  // MONTHLY VIEW (default)
  // ═══════════════════════════════════════════════════════

  // Month view — revMonth/stats guaranteed non-null here (needMonthData=true)
  const rm = revMonth!;
  const st = stats!;

  return (
    <section className="section" id="dash-month-view">
      <DashMonthSwitch mobileProps={{
        month, lastDay, dayOfMonth: Math.min(new Date().getDate(), lastDay),
        revTotal: rm.total, revOrders: rm.totalOrders, revExpected: rm.totalExpected,
        totalTarget: (fbTarget || 0) + (tkTarget || 0) + (spTarget || 0) + (wbTarget || 0),
        totalAdSpend, adsPct, roas: overallRoas,
        channels: [
          { name: "Facebook", color: "#1877F2", rev: rm.channels.find(c => c.name === "Facebook")?.revenue || 0, target: fbTarget || 0, ads: st.revenue.adSpend },
          { name: "TikTok", color: "#FE2C55", rev: rm.channels.find(c => c.name === "TikTok")?.revenue || 0, target: tkTarget || 0, ads: st.revenue.tiktokAdSpend },
          { name: "Shopee", color: "#EE4D2D", rev: rm.channels.find(c => c.name === "Shopee")?.revenue || 0, target: spTarget || 0, ads: st.revenue.shopeeAdSpend },
          { name: "Web/App", color: "#6366F1", rev: ["Website","App","API","Admin"].reduce((s,n) => s + (rm.channels.find(c=>c.name===n)?.revenue || 0), 0), target: wbTarget || 0, ads: 0 },
        ],
        daily: rm.daily, dailyByChannel: rm.dailyByChannel, dailyAds: monthDailyAds,
        sourcesByChannel: rm.sourcesByChannel,
        outstanding: st.finance.outstanding,
        damageItems: st.damage.pendingItems, damageValue: st.damage.pendingValue,
      }} />
      <AutoSyncToday />
      <div className="page-hdr">
        <div>
          <div className="page-title">Dashboard</div>
          <div className="page-sub">
            Xin chào <b>{user?.name || user?.email}</b> · Tháng {month}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <Link href="/dash?view=day" className="btn btn-ghost btn-sm" style={{ textDecoration: "none" }}>Ngày</Link>
          <Link href="/dash?view=month" className="btn btn-primary btn-sm" style={{ textDecoration: "none" }}>Tháng</Link>
          <Link href="/dash?view=year" className="btn btn-ghost btn-sm" style={{ textDecoration: "none" }}>Năm</Link>
          <form style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input id="dash-month" type="month" name="month" defaultValue={month} style={{ fontSize: 12 }} />
            <button type="submit" className="btn btn-ghost btn-sm">Áp dụng</button>
          </form>
        </div>
      </div>

      {/* ═══ ROW 1: Top KPIs ═══ */}
      {(() => {
        // Tiến độ doanh thu so với timeline
        const totalTarget = (fbTarget || 0) + (tkTarget || 0) + (spTarget || 0) + (wbTarget || 0);
        const dayOfMonth = Math.min(new Date().getDate(), lastDay);
        const timePct = dayOfMonth / lastDay;
        const revPct = totalTarget > 0 ? rm.total / totalTarget : 1;
        // xanh = đạt/vượt timeline, vàng = chậm nhẹ (<80% timeline), đỏ = chậm nặng (<60%)
        const revStatus = revPct >= timePct ? "green" : revPct >= timePct * 0.8 ? "yellow" : "red";
        // ads: <=5% xanh, 5-7% vàng, >7% đỏ
        const adsStatus = adsPct <= 5 ? "green" : adsPct <= 7 ? "yellow" : "red";
        // công nợ: 0 = xanh, >0 = đỏ
        const debtStatus = st.finance.outstanding <= 0 ? "green" : "red";
        // thiệt hại: 0 = xanh, >0 = đỏ
        const dmgStatus = st.damage.pendingItems <= 0 ? "green" : "red";

        const S = { green: { bg: "#F0FDF4", border: "#BBF7D0", text: "#166534" }, yellow: { bg: "#FFFBEB", border: "#FDE68A", text: "#92400E" }, red: { bg: "#FEF2F2", border: "#FECACA", text: "#991B1B" } };

        const cards = [
          { label: "DOANH THU THÁNG", value: formatVNDCompact(rm.total), sub: `${rm.totalOrders.toLocaleString("vi-VN")} đơn`, s: S[revStatus] },
          { label: "CHI PHÍ ADS", value: formatVNDCompact(totalAdSpend), sub: "FB + Shopee + TikTok", s: S[adsStatus] },
          { label: "ADS / DOANH THU", value: `${adsPct.toFixed(1)}%`, sub: `ROAS ${overallRoas.toFixed(1)}x`, s: S[adsStatus] },
          { label: "CÔNG NỢ", value: formatVNDCompact(st.finance.outstanding), sub: `TT ${formatVNDCompact(st.finance.totalDeposited)}`, s: S[debtStatus] },
          { label: "THIỆT HẠI", value: st.damage.pendingItems > 0 ? formatVNDCompact(st.damage.pendingValue) : "0", sub: `${st.damage.pendingItems} SP chờ xử lý`, s: S[dmgStatus] },
        ];

        return (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8, marginBottom: 10 }}>
            {cards.map((k) => (
              <div key={k.label} style={{ padding: "10px 14px", background: k.s.bg, borderRadius: 8, border: `1px solid ${k.s.border}` }}>
                <div style={{ fontSize: 9, fontWeight: 600, color: k.s.text, letterSpacing: ".3px" }}>{k.label}</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: k.s.text, margin: "2px 0" }}>{k.value}</div>
                <div style={{ fontSize: 9, color: k.s.text, opacity: 0.6 }}>{k.sub}</div>
              </div>
            ))}
          </div>
        );
      })()}

      {/* ═══ TIẾN ĐỘ TỔNG THÁNG ═══ */}
      {(() => {
        const totalTarget = (fbTarget || 0) + (tkTarget || 0) + (spTarget || 0) + (wbTarget || 0);
        const dayOfMonth = Math.min(new Date().getDate(), lastDay);
        const timePct = Math.round((dayOfMonth / lastDay) * 100);
        const revPct = totalTarget > 0 ? Math.round((rm.total / totalTarget) * 100) : 0;
        const avgDaily = dayOfMonth > 0 ? rm.total / dayOfMonth : 0;
        const projected = avgDaily * lastDay;
        const projPct = totalTarget > 0 ? Math.round((projected / totalTarget) * 100) : 0;
        return totalTarget > 0 ? (
          <div className="card" style={{ marginBottom: 10, padding: "10px 16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <div style={{ fontSize: 12, fontWeight: 700 }}>Tiến độ tháng {month.substring(5)}</div>
              <div style={{ fontSize: 10, color: "#6B7280" }}>
                Ngày {dayOfMonth}/{lastDay} · {timePct}% thời gian · TB {formatVNDCompact(avgDaily)}/ngày
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ flex: 1, height: 10, background: "#F3F4F6", borderRadius: 5, overflow: "hidden", position: "relative" }}>
                <div style={{ width: `${Math.min(revPct, 100)}%`, height: "100%", background: revPct >= 100 ? "#22C55E" : revPct >= timePct ? "#3B82F6" : "#F59E0B", borderRadius: 5, transition: "width 0.3s" }} />
                <div style={{ position: "absolute", left: `${timePct}%`, top: 0, width: 1, height: "100%", background: "#DC2626", opacity: 0.5 }} />
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, color: revPct >= timePct ? "#16A34A" : "#D97706", minWidth: 35 }}>{revPct}%</span>
            </div>
            <div style={{ display: "flex", gap: 16, marginTop: 4, fontSize: 10, color: "#6B7280" }}>
              <span>Đạt <b style={{ color: "#16A34A" }}>{formatVNDCompact(rm.total)}</b></span>
              <span>KH <b>{formatVNDCompact(totalTarget)}</b></span>
              <span>Còn <b style={{ color: "#D97706" }}>{formatVNDCompact(Math.max(0, totalTarget - rm.total))}</b></span>
              <span>Dự kiến <b style={{ color: projPct >= 100 ? "#16A34A" : "#DC2626" }}>{formatVNDCompact(projected)}</b> ({projPct}%)</span>
            </div>
          </div>
        ) : null;
      })()}

      {/* ═══ ROW 2: Channel revenue + Ads breakdown + 7-day chart ═══ */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 12 }}>
        {/* Channel revenue vs target */}
        {(() => {
          const dayOfMonth = Math.min(new Date().getDate(), lastDay);
          const timePct = dayOfMonth / lastDay;
          const mainChannels = [
            { name: "Facebook", target: fbTarget || 0 },
            { name: "TikTok", target: tkTarget || 0 },
            { name: "Shopee", target: spTarget || 0 },
            { name: "Web/App B2B", target: wbTarget || 0 },
          ];
          const chRevMap: Record<string, number> = {};
          rm.channels.forEach((c) => { chRevMap[c.name] = c.revenue; });
          const wbNames = ["Website", "App", "API", "Admin", "Nội bộ"];
          const wbRevenue = wbNames.reduce((s, n) => s + (chRevMap[n] || 0), 0);
          return (
            <div className="card" style={{ padding: "12px 14px" }}>
              <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 8 }}>DT theo kênh</div>
              <div style={{ display: "grid", gridTemplateColumns: "60px 1fr 55px 55px 32px", gap: "0 6px", alignItems: "center", fontSize: 10, color: "#9CA3AF", marginBottom: 4 }}>
                <span>Kênh</span><span></span><span style={{ textAlign: "right" }}>Đạt</span><span style={{ textAlign: "right" }}>KH</span><span style={{ textAlign: "right" }}>%</span>
              </div>
              {mainChannels.map((ch) => {
                const actual = ch.name === "Web/App B2B" ? wbRevenue : (chRevMap[ch.name] || 0);
                const targetPct = ch.target > 0 ? Math.round((actual / ch.target) * 100) : 0;
                const revRatio = ch.target > 0 ? actual / ch.target : 1;
                const clr = revRatio >= timePct ? "#16A34A" : revRatio >= timePct * 0.8 ? "#D97706" : "#DC2626";
                const barW = ch.target > 0 ? Math.min(targetPct, 100) : 0;
                return (
                  <div key={ch.name} style={{ display: "grid", gridTemplateColumns: "60px 1fr 55px 55px 32px", gap: "0 6px", alignItems: "center", marginBottom: 5 }}>
                    <span style={{ fontSize: 11, fontWeight: 600 }}>{ch.name}</span>
                    <div style={{ height: 8, background: "#F3F4F6", borderRadius: 2, overflow: "hidden", position: "relative" }}>
                      <div style={{ width: `${barW}%`, height: "100%", background: clr, borderRadius: 2 }} />
                      <div style={{ position: "absolute", top: 0, left: `${Math.round(timePct * 100)}%`, width: 1, height: "100%", background: "#000", opacity: 0.3 }} />
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 700, textAlign: "right", color: clr }}>{formatVNDCompact(actual)}</span>
                    <span style={{ fontSize: 10, textAlign: "right", color: "#6B7280" }}>{formatVNDCompact(ch.target)}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, textAlign: "right", color: clr }}>{targetPct}%</span>
                  </div>
                );
              })}
              <div style={{ borderTop: "1px solid var(--border)", marginTop: 4, paddingTop: 6, display: "grid", gridTemplateColumns: "60px 1fr 55px 55px 32px", gap: "0 6px", fontSize: 11, fontWeight: 700 }}>
                <span>Tổng</span><span></span>
                <span style={{ textAlign: "right", color: "#16A34A" }}>{formatVNDCompact(rm.total)}</span>
                <span style={{ textAlign: "right", color: "#6B7280" }}>{formatVNDCompact(mainChannels.reduce((s, c) => s + c.target, 0))}</span>
                <span style={{ textAlign: "right", color: "#16A34A" }}>{mainChannels.reduce((s, c) => s + c.target, 0) > 0 ? Math.round((rm.total / mainChannels.reduce((s, c) => s + c.target, 0)) * 100) : 0}%</span>
              </div>
            </div>
          );
        })()}

        {/* Ads breakdown */}
        {(() => {
          const chRevenues: Record<string, number> = {};
          rm.channels.forEach((c) => { chRevenues[c.name] = c.revenue; });
          const adsChannels = [
            { name: "Facebook", spend: st.revenue.adSpend, color: "#1877F2" },
            { name: "Shopee", spend: st.revenue.shopeeAdSpend, color: "#EE4D2D" },
            { name: "TikTok", spend: st.revenue.tiktokAdSpend, color: "#FE2C55" },
          ];
          return (
            <div className="card" style={{ padding: "12px 14px" }}>
              <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 8 }}>Chi phí Ads theo kênh</div>
              {adsChannels.map((ch) => {
                const pct = totalAdSpend > 0 ? (ch.spend / totalAdSpend) * 100 : 0;
                const chRev = chRevenues[ch.name] || 0;
                const chAdsPct = chRev > 0 ? (ch.spend / chRev) * 100 : 0;
                const clr = chAdsPct <= 5 ? "#16A34A" : chAdsPct <= 7 ? "#D97706" : "#DC2626";
                return (
                  <div key={ch.name} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: clr, flexShrink: 0 }} />
                    <span style={{ fontSize: 11, flex: 1 }}>{ch.name}</span>
                    <div style={{ width: 80, height: 8, background: "#F3F4F6", borderRadius: 2, overflow: "hidden" }}>
                      <div style={{ width: `${Math.min(pct, 100)}%`, height: "100%", background: clr, borderRadius: 2 }} />
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 600, width: 50, textAlign: "right", color: clr }}>{formatVNDCompact(ch.spend)}</span>
                    <span style={{ fontSize: 9, color: clr, width: 28, textAlign: "right" }}>{chAdsPct.toFixed(0)}%</span>
                  </div>
                );
              })}
              <div style={{ borderTop: "1px solid var(--border)", marginTop: 6, paddingTop: 6, display: "flex", justifyContent: "space-between", fontSize: 11, fontWeight: 700 }}>
                <span>Tổng</span>
                <span style={{ color: adsPct <= 5 ? "#16A34A" : adsPct <= 7 ? "#D97706" : "#DC2626" }}>{formatVNDCompact(totalAdSpend)}</span>
              </div>
              <div style={{ marginTop: 6, fontSize: 10, color: "#6B7280" }}>
                Tỉ lệ Ads/DT: <strong style={{ color: adsPct <= 5 ? "#16A34A" : adsPct <= 7 ? "#D97706" : "#DC2626" }}>{adsPct.toFixed(1)}%</strong> · ROAS: <strong style={{ color: overallRoas >= 10 ? "#16A34A" : "#DC2626" }}>{overallRoas.toFixed(1)}x</strong>
              </div>
            </div>
          );
        })()}

        {/* 7-day revenue chart */}
        <div className="card" style={{ padding: "12px 14px" }}>
          <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 4 }}>Doanh thu 7 ngày</div>
          <div style={{ fontSize: 10, color: "#9CA3AF", marginBottom: 8 }}>
            Cao nhất <strong style={{ color: "#16A34A" }}>{formatVNDCompact(best7d.revenue)}</strong> {best7d.date.substring(5)} · TB <strong>{formatVNDCompact(avg7d)}</strong>/ngày
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", height: 80 }}>
            {rev7d!.daily.map((d) => {
              const h = (d.revenue / max7d) * 60;
              return (
                <div key={d.date}
                  title={`${d.date}\n${d.revenue.toLocaleString("vi-VN")}đ`}
                  style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", cursor: "default", height: "100%" }}>
                  <div style={{ width: "80%", height: Math.max(h, 2), background: "#4ADE80", borderRadius: 2 }} />
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex" }}>
            {rev7d!.daily.map((d) => (
              <div key={`l-${d.date}`} style={{ flex: 1, textAlign: "center", fontSize: 8, color: "#999", paddingTop: 2 }}>
                {d.date.substring(8)}
              </div>
            ))}
          </div>
        </div>
      </div>


      {/* ═══ ROW 4: Pipeline + Inventory + Sức khoẻ ═══ */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 12 }}>
        {/* Pipeline */}
        <div className="card" style={{ padding: "12px 14px" }}>
          <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 8 }}>Pipeline đơn hàng</div>
          {(["DRAFT", "ARRIVED", "ON_SHELF"] as const).map((stage) => {
            const count = st.orders[stage.toLowerCase() as keyof typeof st.orders] as number || 0;
            const pct = st.orders.total > 0 ? (count / st.orders.total) * 100 : 0;
            const colors: Record<string, string> = { DRAFT: "#6B7280", ARRIVED: "#D97706", ON_SHELF: "#16A34A" };
            return (
              <div key={stage} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span className={`stage-badge stage-${stage}`} style={{ fontSize: 10, minWidth: 60 }}>{STAGE_LABEL[stage]}</span>
                <div style={{ flex: 1, height: 8, background: "#F3F4F6", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{ width: `${pct}%`, height: "100%", background: colors[stage] || "#3B82F6", borderRadius: 2 }} />
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, minWidth: 24, textAlign: "right" }}>{count}</span>
              </div>
            );
          })}
          <Link href="/list" style={{ fontSize: 10, color: "var(--blue)" }}>Xem tất cả →</Link>
        </div>

        {/* Inventory */}
        {(() => {
          const oosRatio = st.inventory.totalSkus > 0 ? st.inventory.outOfStock / st.inventory.totalSkus : 0;
          const oosColor = oosRatio <= 0.3 ? "#16A34A" : oosRatio <= 0.5 ? "#D97706" : "#DC2626";
          const lowRatio = st.inventory.totalSkus > 0 ? st.inventory.lowStock / st.inventory.totalSkus : 0;
          const lowColor = lowRatio <= 0.1 ? "#16A34A" : lowRatio <= 0.2 ? "#D97706" : "#DC2626";
          return (
            <div className="card" style={{ padding: "12px 14px" }}>
              <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 8 }}>Tồn kho</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                  <span>Tổng SKU</span><span style={{ fontWeight: 700 }}>{st.inventory.totalSkus.toLocaleString("vi-VN")}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                  <span style={{ color: oosColor }}>Hết hàng</span><span style={{ fontWeight: 700, color: oosColor }}>{st.inventory.outOfStock.toLocaleString("vi-VN")}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                  <span style={{ color: lowColor }}>Sắp hết (≤5)</span><span style={{ fontWeight: 700, color: lowColor }}>{st.inventory.lowStock.toLocaleString("vi-VN")}</span>
                </div>
              </div>
              <Link href="/inventory" style={{ fontSize: 10, color: "var(--blue)", marginTop: 6, display: "block" }}>Chi tiết →</Link>
            </div>
          );
        })()}

        {/* Sức khoẻ vận hành */}
        <div className="card" style={{ padding: "12px 14px" }}>
          <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 8 }}>Sức khoẻ vận hành</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 11 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Thanh toán NCC</span>
              <span style={{ fontWeight: 700, color: st.finance.outstanding > 0 ? "#DC2626" : "#16A34A" }}>
                {st.finance.totalDeposited > 0 ? Math.round((st.finance.totalDeposited / st.finance.totalOrderValue) * 100) : 0}% đã TT
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Hàng hỏng</span>
              <span style={{ fontWeight: 700, color: st.damage.pendingItems > 0 ? "#DC2626" : "#16A34A" }}>
                {st.damage.pendingItems > 0 ? `${st.damage.pendingItems} chờ` : "OK"}
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Hết hàng</span>
              <span style={{ fontWeight: 700, color: st.inventory.outOfStock > 0 ? "#DC2626" : "#16A34A" }}>
                {st.inventory.outOfStock > 0 ? st.inventory.outOfStock : "OK"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ ROW 5: Recent orders ═══ */}
      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", fontWeight: 700, fontSize: 12, display: "flex", justifyContent: "space-between" }}>
          <span>Đơn gần nhất</span>
          <Link href="/list" style={{ fontSize: 10, color: "var(--blue)" }}>Tất cả →</Link>
        </div>
        <div className="tbl-wrap">
          <table>
            <thead><tr>
              <th>Mã đơn</th><th>Tên</th><th>NCC</th><th>Owner</th><th>Giai đoạn</th><th className="text-right">Giá trị</th><th>Ngày tạo</th>
            </tr></thead>
            <tbody>
              {recent.map((o) => (
                <tr key={o.order_id}>
                  <td style={{ fontWeight: 700 }}><Link href={`/create?order_id=${o.order_id}`} style={{ color: "var(--blue)" }}>{o.order_id}</Link></td>
                  <td>{o.order_name || "—"}</td>
                  <td className="muted" style={{ fontSize: 11 }}>{o.supplier_name || "—"}</td>
                  <td className="muted" style={{ fontSize: 11 }}>{o.owner || "—"}</td>
                  <td><span className={`stage-badge stage-${o.stage}`}>{STAGE_LABEL[String(o.stage || "DRAFT")]}</span></td>
                  <td className="text-right font-bold">{formatVND(o.order_total)}</td>
                  <td className="muted" style={{ fontSize: 11 }}>{formatDate(o.created_at)}</td>
                </tr>
              ))}
              {recent.length === 0 && <tr><td colSpan={7} className="muted" style={{ textAlign: "center", padding: 24 }}>Chưa có đơn nào.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
