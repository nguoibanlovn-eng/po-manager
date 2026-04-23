import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/user";
import { getRevenueByChannel, getDailyAdsBreakdown, getTasksForDate, getArrivedOrders, getDamageItems, getYearlySummary, getYearlyChannelTargets, getDailyAdsTotals } from "@/lib/db/dashboard";
import { getChannelTarget } from "@/lib/db/tiktok";
import { dateVN } from "@/lib/helpers";

export const maxDuration = 60;

/** Returns all mobile dashboard data (day+month+year) in 1 request */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const today = dateVN();
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
  const currentYear = tY;
  const dayOfWeek = ["Chủ nhật", "Thứ hai", "Thứ ba", "Thứ tư", "Thứ năm", "Thứ sáu", "Thứ bảy"][new Date(tY, tM - 1, tD).getDay()];
  const displayDate = `${String(tD).padStart(2, "0")}/${String(tM).padStart(2, "0")}/${tY}`;

  // Fetch ALL data in parallel — 1 big Promise.all
  const [
    revToday, revYesterday, adsToday, adsYesterday,
    arrivedToday, arrivedYesterday, damageItems, tasksToday,
    fbT, tkT, spT, wbT,
    revMonth, yearly, prevYearly, yearChTargets, monthDailyAds,
  ] = await Promise.all([
    getRevenueByChannel(today, today),
    getRevenueByChannel(prevDay, prevDay),
    getDailyAdsBreakdown(today),
    getDailyAdsBreakdown(prevDay),
    getArrivedOrders(today),
    getArrivedOrders(prevDay),
    getDamageItems(),
    getTasksForDate(today),
    getChannelTarget("facebook", monthKey),
    getChannelTarget("tiktok", monthKey),
    getChannelTarget("shopee", monthKey),
    getChannelTarget("web_b2b", monthKey),
    getRevenueByChannel(monthFrom, monthTo),
    getYearlySummary(currentYear),
    getYearlySummary(currentYear - 1),
    getYearlyChannelTargets(currentYear),
    getDailyAdsTotals(monthFrom, monthTo),
  ]);

  // Compute common values
  const totalTarget = (fbT || 0) + (tkT || 0) + (spT || 0) + (wbT || 0);
  const dailyTarget = totalTarget > 0 ? totalTarget / daysInMonth : 0;
  const sumAds = (ad: Awaited<typeof adsToday>) =>
    (ad.fbAds || []).reduce((s, a) => s + Number(a.spend || 0), 0) +
    (ad.ttAds || []).reduce((s, a) => s + Number(a.spend || 0), 0) +
    (ad.gmvMax || []).reduce((s, a) => s + Number(a.spend || 0), 0) +
    (ad.spAds || []).reduce((s, a) => s + Number(a.spend || 0), 0);
  const todayAdsTotal = sumAds(adsToday);
  const yesterdayAdsTotal = sumAds(adsYesterday);
  const todayAdsFb = (adsToday.fbAds || []).reduce((s, a) => s + Number(a.spend || 0), 0);
  const todayAdsTt = (adsToday.ttAds || []).reduce((s, a) => s + Number(a.spend || 0), 0);
  const todayAdsGmv = (adsToday.gmvMax || []).reduce((s, a) => s + Number(a.spend || 0), 0);
  const todayAdsSp = (adsToday.spAds || []).reduce((s, a) => s + Number(a.spend || 0), 0);
  const adsPctToday = revToday.total > 0 ? (todayAdsTotal / revToday.total) * 100 : 0;
  const roasToday = todayAdsTotal > 0 ? revToday.total / todayAdsTotal : 0;
  const pctChange = (cur: number, prev: number) => prev === 0 ? (cur > 0 ? 100 : 0) : Math.round(((cur - prev) / prev) * 100);
  const revChange = pctChange(revToday.total, revYesterday.total);
  const adsChange = pctChange(todayAdsTotal, yesterdayAdsTotal);
  const revPct = dailyTarget > 0 ? Math.round((revToday.total / dailyTarget) * 100) : 0;
  const arrivedTodayValue = arrivedToday.reduce((s, o) => s + Number(o.order_total || 0), 0);
  const tasksDone = tasksToday.filter((t) => t.status === "DONE").length;
  const dayOfMonth = Math.min(new Date().getDate(), daysInMonth);
  const monthlyAvg = dayOfMonth > 0 ? revMonth.total / dayOfMonth : 0;

  const mainCh = [
    { name: "Facebook", color: "#1877F2" }, { name: "TikTok", color: "#FE2C55" },
    { name: "Shopee", color: "#EE4D2D" }, { name: "Web/App", color: "#6366F1" },
  ];
  const wbNames = ["Website", "App", "API", "Admin"];
  const getChRev = (channels: typeof revToday.channels, name: string) => {
    if (name === "Web/App") return wbNames.reduce((s, n) => s + (channels.find(c => c.name === n)?.revenue || 0), 0);
    return channels.find(c => c.name === name)?.revenue || 0;
  };
  const getChExp = (channels: typeof revToday.channels, name: string) => {
    if (name === "Web/App") return wbNames.reduce((s, n) => s + (channels.find(c => c.name === n)?.expected || 0), 0);
    return channels.find(c => c.name === name)?.expected || 0;
  };

  // Month ads
  const totalAdSpendM = todayAdsFb + todayAdsTt + todayAdsGmv + todayAdsSp; // today only
  const monthAdsPct = revMonth.total > 0 ? (totalAdSpendM * dayOfMonth / revMonth.total) * 100 : 0;

  // Year
  const nowMonth = new Date().getMonth() + 1;
  const prevYearRev = prevYearly?.cumRevenue || 0;
  const growthVsPrev = prevYearRev > 0 ? Math.round(((yearly.yearTarget / prevYearRev) - 1) * 100) : 0;
  const cumAdsFb = yearly.months.reduce((s, mm) => s + mm.adsFb, 0);
  const cumAdsShopee = yearly.months.reduce((s, mm) => s + mm.adsShopee, 0);
  const cumAdsTiktok = yearly.months.reduce((s, mm) => s + mm.adsTiktok, 0);
  const cumAdsTotal = cumAdsFb + cumAdsShopee + cumAdsTiktok;
  const adsRevPctYear = yearly.cumRevenue > 0 ? (cumAdsTotal / yearly.cumRevenue * 100) : 0;
  const CHANNEL_TARGET_MAP: Record<string, string> = { Facebook: "facebook", TikTok: "tiktok", Shopee: "shopee", Website: "web_b2b", App: "web_b2b", Admin: "web_b2b", API: "web_b2b" };
  const chRevCum: Record<string, number> = {};
  for (const mm of yearly.months) for (const [ch, rev] of Object.entries(mm.byChannel)) { const key = CHANNEL_TARGET_MAP[ch] || ch; chRevCum[key] = (chRevCum[key] || 0) + rev; }
  const YEAR_CH = [
    { key: "facebook", label: "Facebook", abbr: "FB", color: "#1877F2" },
    { key: "tiktok", label: "TikTok", abbr: "TT", color: "#000000" },
    { key: "shopee", label: "Shopee", abbr: "SP", color: "#EE4D2D" },
    { key: "web_b2b", label: "Web/App B2B", abbr: "WA", color: "#0EA5E9" },
  ];

  return NextResponse.json({
    day: {
      today, prevDay, nextDay, dayOfWeek, displayDate,
      revTotal: revToday.total, revOrders: revToday.totalOrders, revExpected: revToday.totalExpected,
      revYesterday: revYesterday.total, revChange, revPct, dailyTarget, monthlyAvg,
      channels: mainCh.map(ch => ({ name: ch.name, color: ch.color, rev: getChRev(revToday.channels, ch.name), exp: getChExp(revToday.channels, ch.name), revYesterday: getChRev(revYesterday.channels, ch.name) })),
      adsTotal: todayAdsTotal, adsFb: todayAdsFb, adsTt: todayAdsTt + todayAdsGmv, adsTtBm: todayAdsTt, adsTtGmv: todayAdsGmv, adsSp: todayAdsSp,
      adsPct: adsPctToday, roas: roasToday, adsYesterday: yesterdayAdsTotal, adsChange,
      arrivedCount: arrivedToday.length, arrivedValue: arrivedTodayValue, arrivedYesterdayCount: arrivedYesterday.length,
      damageCount: damageItems.length, damageValue: damageItems.reduce((s, d) => s + Number(d.damage_amount || 0), 0),
      tasksTotal: tasksToday.length, tasksDone, monthRevenue: revMonth.total, monthTarget: totalTarget,
    },
    month: {
      month: monthFrom.substring(0, 7), lastDay: daysInMonth, dayOfMonth,
      revTotal: revMonth.total, revOrders: revMonth.totalOrders, revExpected: revMonth.totalExpected,
      totalTarget, totalAdSpend: totalAdSpendM * dayOfMonth, adsPct: monthAdsPct, roas: totalAdSpendM > 0 ? revMonth.total / (totalAdSpendM * dayOfMonth) : 0,
      channels: mainCh.map(ch => ({ name: ch.name, color: ch.color, rev: getChRev(revMonth.channels, ch.name), target: ({ Facebook: fbT, TikTok: tkT, Shopee: spT, "Web/App": wbT }[ch.name] || 0), ads: 0 })),
      daily: revMonth.daily, dailyByChannel: revMonth.dailyByChannel, dailyAds: monthDailyAds,
      sourcesByChannel: revMonth.sourcesByChannel,
      outstanding: 0, damageItems: damageItems.length, damageValue: 0,
    },
    year: {
      year: currentYear, nowMonth, yearTarget: yearly.yearTarget, cumRevenue: yearly.cumRevenue,
      prevYearRev, growthVsPrev, cumAdsTotal, adsRevPct: adsRevPctYear,
      months: yearly.months.map(m => ({ month: m.month, revenue: m.revenue, target: m.target, ads: m.ads, byChannel: m.byChannel })),
      channels: YEAR_CH.map(ch => ({ name: ch.label, abbr: ch.abbr, color: ch.color, rev: chRevCum[ch.key] || 0, target: yearChTargets?.[ch.key] || 0, ads: ch.key === "facebook" ? cumAdsFb : ch.key === "tiktok" ? cumAdsTiktok : ch.key === "shopee" ? cumAdsShopee : 0 })),
      sourcesByChannel: revMonth.sourcesByChannel,
    },
  });
}
