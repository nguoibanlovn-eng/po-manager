"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { formatDate, formatVND, formatVNDCompact, toNum } from "@/lib/format";
import type { AdsRow, FbNhanhRow, InsightsRow, PageRow } from "@/lib/db/ads";
import SyncButton from "../components/SyncButton";
import TargetProgressBar from "../components/TargetProgressBar";
import Collapsible from "../components/Collapsible";
import AutoSyncToday from "../components/AutoSyncToday";

type Summary = { spend: number; impressions: number; clicks: number; reach: number; purchase_value: number };

function daysAgo(d: number): string { const dt = new Date(); dt.setDate(dt.getDate() + d); const pad = (n: number) => String(n).padStart(2, "0"); return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`; }
function monthRange(offset: number) {
  const now = new Date(); const y = now.getFullYear(); const m = now.getMonth() + offset;
  const first = new Date(y, m, 1); const last = offset === 0 ? now : new Date(y, m + 1, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return { from: fmt(first), to: fmt(last) };
}

const QUICK_RANGES = [
  { key: "today", label: "Hôm nay", from: daysAgo(0), to: daysAgo(0) },
  { key: "yesterday", label: "Hôm qua", from: daysAgo(-1), to: daysAgo(-1) },
  { key: "3d", label: "3 ngày", from: daysAgo(-3), to: daysAgo(0) },
  { key: "7d", label: "7 ngày", from: daysAgo(-7), to: daysAgo(0) },
  { key: "this_month", label: "Tháng này", ...monthRange(0) },
  { key: "last_month", label: "Tháng trước", ...monthRange(-1) },
];

export default function FbPagesView({
  pages, ads, insights, summary, prevAds = [], prevSummary, nhanhRevenue = [], nhanh30d = [], from, to,
  monthTarget = 0, monthActual = 0, monthKey = "",
}: {
  pages: PageRow[]; ads: AdsRow[]; insights: InsightsRow[]; summary: Summary;
  prevAds?: AdsRow[]; prevSummary?: Summary;
  nhanhRevenue?: FbNhanhRow[]; nhanh30d?: FbNhanhRow[];
  from: string; to: string;
  monthTarget?: number; monthActual?: number; monthKey?: string;
}) {
  const router = useRouter();
  const [f, setF] = useState(from);
  const [t, setT] = useState(to);
  const [prevFrom, setPrevFrom] = useState(from);
  const [prevTo, setPrevTo] = useState(to);
  if (from !== prevFrom) { setF(from); setPrevFrom(from); }
  if (to !== prevTo) { setT(to); setPrevTo(to); }
  const [search, setSearch] = useState("");

  function apply() { router.push(`/fb-pages?from=${f}&to=${t}`); }
  function quickRange(qr: { from: string; to: string }) { router.push(`/fb-pages?from=${qr.from}&to=${qr.to}`); }

  // ── Insights totals ──
  const insightsTotals = useMemo(() => insights.reduce(
    (a, r) => ({ new_fans: a.new_fans + toNum(r.new_fans), lost_fans: a.lost_fans + toNum(r.lost_fans), reach: a.reach + toNum(r.reach), impressions: a.impressions + toNum(r.impressions) }),
    { new_fans: 0, lost_fans: 0, reach: 0, impressions: 0 },
  ), [insights]);

  // ── Nhanh totals ──
  const nhanhTotals = useMemo(() => nhanhRevenue.reduce(
    (a, r) => ({ revenue: a.revenue + r.revenue, orders: a.orders + r.orders }),
    { revenue: 0, orders: 0 },
  ), [nhanhRevenue]);

  const roas = summary.spend > 0 ? nhanhTotals.revenue / summary.spend : 0;
  const netFans = insightsTotals.new_fans - insightsTotals.lost_fans;
  const costPerFollow = netFans > 0 && summary.spend > 0 ? summary.spend / netFans : 0;
  const ctr = summary.impressions > 0 ? (summary.clicks / summary.impressions) * 100 : 0;

  // ── Ads by date ──
  const adsByDate = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of ads) { const d = String(a.date).substring(0, 10); m.set(d, (m.get(d) || 0) + toNum(a.spend)); }
    return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [ads]);

  // ── Map ad_account_id → page names ──
  const accountPageNames = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const p of pages) {
      if (!p.ad_account_id) continue;
      const names = m.get(p.ad_account_id) || [];
      names.push((p.page_name || "").replace(/^FACEBOOK - /, ""));
      m.set(p.ad_account_id, names);
    }
    return m;
  }, [pages]);

  // ── Ads by account ──
  const adsByAccount = useMemo(() => {
    const m = new Map<string, { name: string; spend: number; impressions: number; clicks: number; purchase_value: number; reach: number }>();
    for (const a of ads) {
      const k = a.ad_account_id || "—";
      const pageNames = accountPageNames.get(k);
      const displayName = pageNames ? pageNames.join(" + ") : (a.account_name || k);
      const cur = m.get(k) || { name: displayName, spend: 0, impressions: 0, clicks: 0, purchase_value: 0, reach: 0 };
      cur.spend += toNum(a.spend); cur.impressions += toNum(a.impressions); cur.clicks += toNum(a.clicks);
      cur.purchase_value += toNum(a.purchase_value); cur.reach += toNum(a.reach);
      m.set(k, cur);
    }
    return Array.from(m.entries()).map(([id, r]) => ({ id, ...r })).sort((a, b) => b.spend - a.spend);
  }, [ads, accountPageNames]);

  // ── Nhanh by source ──
  const nhanhBySource = useMemo(() => {
    const m = new Map<string, { revenue: number; orders: number }>();
    for (const r of nhanhRevenue) {
      const cur = m.get(r.source) || { revenue: 0, orders: 0 };
      cur.revenue += r.revenue; cur.orders += r.orders;
      m.set(r.source, cur);
    }
    return Array.from(m.entries()).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.revenue - a.revenue);
  }, [nhanhRevenue]);

  // ── Per-page: revenue (nhanh) + ads spend merged ──
  const pageRevenueAds = useMemo(() => {
    // Build ads spend by page using nhanh_id as key
    const adsByPage = new Map<string, { spend: number; reach: number; adsAccount: string }>();
    for (const p of pages) {
      if (!p.nhanh_id || !p.ad_account_id) continue;
      const acct = adsByAccount.find((a) => a.id === p.ad_account_id);
      if (!acct) continue;
      const pageName = p.nhanh_id;
      const cur = adsByPage.get(pageName) || { spend: 0, reach: 0, adsAccount: "" };
      cur.spend += acct.spend;
      cur.reach += acct.reach;
      cur.adsAccount = acct.name;
      adsByPage.set(pageName, cur);
    }
    // Merge with nhanh revenue
    const result: { name: string; revenue: number; orders: number; spend: number; reach: number; roas: number; ratio: number; adsAccount: string }[] = [];
    for (const src of nhanhBySource) {
      const ad = adsByPage.get(src.name);
      const spend = ad?.spend || 0;
      const roas = spend > 0 ? src.revenue / spend : 0;
      const ratio = src.revenue > 0 ? (spend / src.revenue) * 100 : 0;
      result.push({ name: src.name, revenue: src.revenue, orders: src.orders, spend, reach: ad?.reach || 0, roas, ratio, adsAccount: ad?.adsAccount || "" });
    }
    return result.sort((a, b) => b.revenue - a.revenue);
  }, [nhanhBySource, pages, adsByAccount]);

  // ── Nhanh by date ──
  const nhanhByDate = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of nhanhRevenue) m.set(r.date, (m.get(r.date) || 0) + r.revenue);
    return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [nhanhRevenue]);

  // ── Daily comparison ──
  const dailyComparison = useMemo(() => {
    const nhMap = new Map<string, { revenue: number; orders: number }>();
    for (const r of nhanhRevenue) { const c = nhMap.get(r.date) || { revenue: 0, orders: 0 }; c.revenue += r.revenue; c.orders += r.orders; nhMap.set(r.date, c); }
    const adMap = new Map<string, number>();
    for (const a of ads) { const d = String(a.date).substring(0, 10); adMap.set(d, (adMap.get(d) || 0) + toNum(a.spend)); }
    const dates = new Set([...nhMap.keys(), ...adMap.keys()]);
    return Array.from(dates).sort().reverse().map((d) => {
      const n = nhMap.get(d) || { revenue: 0, orders: 0 };
      const spend = adMap.get(d) || 0;
      return { date: d, revenue: n.revenue, spend, roas: spend > 0 ? n.revenue / spend : 0, orders: n.orders };
    });
  }, [nhanhRevenue, ads]);

  // ── Filtered pages ──
  const filteredPages = useMemo(() => {
    if (!search) return pages;
    const s = search.toLowerCase();
    return pages.filter((p) => (p.page_name || "").toLowerCase().includes(s));
  }, [pages, search]);

  return (
    <section className="section">
      <AutoSyncToday onDone={() => router.refresh()} />
      {/* ═══ TARGET PROGRESS ═══ */}
      <TargetProgressBar channel="Facebook" monthTarget={monthTarget} monthActual={monthActual} monthKey={monthKey} color="#1877F2" />

      {/* ═══ HEADER ═══ */}
      <div className="page-hdr">
        <div>
          <div className="page-title"><span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 24, height: 24, borderRadius: "50%", background: "#1877F2", color: "#fff", fontSize: 14, fontWeight: 700, marginRight: 8, verticalAlign: "middle" }}>f</span>Facebook Pages</div>
          <div className="page-sub">{pages.length} pages · {from} → {to}</div>
        </div>
        <div className="row" style={{ gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <SyncButton url="/api/fb/sync-ads" label="⟳ Sync Ads" onDone={() => router.refresh()} style={{ background: "#EFF6FF", border: "1px solid #93C5FD" }} />
          <SyncButton url="/api/fb/sync-insights" label="⟳ Sync Insights" onDone={() => router.refresh()} style={{ background: "#F0FDF4", border: "1px solid #86EFAC" }} />
          <SyncButton url="/api/nhanh/sync-sales" label="⟳ Sync Nhanh" body={{ from, to }} onDone={() => router.refresh()} style={{ background: "#FFF7ED", border: "1px solid #FDBA74" }} />
          <SyncButton url="/api/drive/scan" label="📂 Quét Drive" body={{ from, to }} onDone={() => router.refresh()} style={{ background: "#F3E8FF", border: "1px solid #C084FC" }} />
          <button className="btn btn-ghost btn-xs" onClick={() => router.refresh()}>↻ Tải lại</button>
        </div>
      </div>

      {/* ═══ TIME FILTERS ═══ */}
      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
        {QUICK_RANGES.map((r) => {
          const active = from === r.from && to === r.to;
          return <button key={r.key} className="btn btn-ghost btn-xs" onClick={() => quickRange(r)} style={{ background: active ? "var(--blue)" : undefined, color: active ? "#fff" : undefined }}>{r.label}</button>;
        })}
        <input type="date" value={f} onChange={(e) => setF(e.target.value)} style={{ fontSize: 12, width: 130 }} />
        <span className="muted">→</span>
        <input type="date" value={t} onChange={(e) => setT(e.target.value)} style={{ fontSize: 12, width: 130 }} />
        <button className="btn btn-primary btn-xs" onClick={apply}>Áp dụng</button>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm page..." style={{ marginLeft: "auto", fontSize: 12, width: 150 }} />
      </div>

      {/* ═══ 10 KPI CARDS ═══ */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 8, marginBottom: 14 }}>
        <div className="stat-card"><div className="sl">TỔNG KÊNH</div><div className="sv">{pages.length}</div><div className="muted" style={{ fontSize: 10 }}>{pages.length} pages</div></div>
        <div className="stat-card"><div className="sl">FOLLOWERS MỚI</div><div className="sv" style={{ color: "var(--green)" }}>+{insightsTotals.new_fans.toLocaleString("vi-VN")}</div><div className="muted" style={{ fontSize: 10 }}>tổng kỳ</div></div>
        <div className="stat-card"><div className="sl">UNFOLLOW</div><div className="sv" style={{ color: "var(--red)" }}>-{insightsTotals.lost_fans.toLocaleString("vi-VN")}</div><div className="muted" style={{ fontSize: 10 }}>tổng kỳ</div></div>
        <div className="stat-card"><div className="sl">TĂNG RÒNG</div><div className="sv" style={{ color: netFans >= 0 ? "var(--green)" : "var(--red)" }}>{netFans >= 0 ? "+" : ""}{netFans.toLocaleString("vi-VN")}</div><div className="muted" style={{ fontSize: 10 }}>net growth</div></div>
        <div className="stat-card"><div className="sl">REACH</div><div className="sv">{insightsTotals.reach.toLocaleString("vi-VN")}</div></div>

        <div className="stat-card" style={{ borderLeft: "3px solid #1877F2" }}><div className="sl">DOANH THU</div><div className="sv">{formatVNDCompact(nhanhTotals.revenue)}</div><div className="muted" style={{ fontSize: 10 }}>nhanh.vn</div></div>
        <div className="stat-card" style={{ borderLeft: "3px solid #42A5F5" }}><div className="sl">CHI PHÍ ADS</div><div className="sv">{formatVNDCompact(summary.spend)}</div></div>
        <div className="stat-card" style={{ borderLeft: roas >= 10 ? "3px solid var(--green)" : "3px solid var(--red)" }}><div className="sl">ROAS</div><div className="sv" style={{ color: roas >= 10 ? "var(--green)" : "var(--red)" }}>{roas.toFixed(1)}x</div><div className="muted" style={{ fontSize: 10 }}>doanh thu/ads</div></div>
        <div className="stat-card"><div className="sl">CHI PHÍ/FOLLOW</div><div className="sv">{costPerFollow > 0 ? formatVNDCompact(costPerFollow) : "—"}</div><div className="muted" style={{ fontSize: 10 }}>spend÷tăng ròng</div></div>
        <div className="stat-card"><div className="sl">CTR TB</div><div className="sv">{ctr.toFixed(2)}%</div><div className="muted" style={{ fontSize: 10 }}>weighted avg</div></div>
      </div>

      {/* ═══ CHI PHÍ ADS THEO NGÀY ═══ */}
      <Collapsible title="CHI PHÍ ADS THEO NGÀY" defaultOpen={true}>
        <AdsSection ads={ads} adsByDate={adsByDate} summary={summary} prevAds={prevAds} prevSummary={prevSummary} from={from} to={to} />
      </Collapsible>

      {/* ═══ DOANH THU CHI TIẾT 30 NGÀY ═══ */}
      {nhanh30d.length > 0 && (
        <Collapsible title="DOANH THU CHI TIẾT 30 NGÀY" defaultOpen={true} badge={<span className="chip chip-green" style={{ fontSize: 9 }}>{formatVNDCompact(nhanhTotals.revenue)}</span>}>
          <RevenueDetailSection data={nhanh30d} />
        </Collapsible>
      )}

      {/* ═══ HIỆU QUẢ ADS THEO PAGE — stacked chart ═══ */}
      {pageRevenueAds.length > 0 && (
        <Collapsible title="HIỆU QUẢ ADS THEO PAGE" defaultOpen={false} badge={<span className="chip" style={{ fontSize: 9 }}>{pageRevenueAds.length} pages</span>}>
          <div>
          <div style={{ fontSize: 10, color: "#9CA3AF", marginBottom: 10 }}>
            Doanh thu (Nhanh.vn) vs Chi phí Ads · Tỉ lệ chi phí / doanh thu · ROAS = DT / Spend
          </div>
          <div style={{ display: "flex", gap: 12, fontSize: 10, color: "#6B7280", marginBottom: 10 }}>
            <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: "#1877F2", marginRight: 3, verticalAlign: "middle" }} />Doanh thu</span>
            <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: "#F87171", marginRight: 3, verticalAlign: "middle" }} />Chi phí Ads</span>
          </div>

          {(() => {
            const maxVal = Math.max(...pageRevenueAds.map((p) => p.revenue + p.spend), 1);
            const BAR_H = 170;
            return (
              <div>
                {/* Stacked bars */}
                <div style={{ display: "flex", alignItems: "flex-end", height: BAR_H }}>
                  {pageRevenueAds.map((p) => {
                    const total = p.revenue + p.spend;
                    const h = (total / maxVal) * (BAR_H - 20);
                    const revH = total > 0 ? (p.revenue / total) * h : h;
                    const spendH = total > 0 ? (p.spend / total) * h : 0;
                    return (
                      <div key={p.name} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end" }}>
                        <div style={{ fontSize: 8, fontWeight: 700, marginBottom: 2, whiteSpace: "nowrap" }}>{formatVNDCompact(p.revenue)}</div>
                        <div style={{ width: "80%", borderRadius: "3px 3px 0 0", overflow: "hidden", display: "flex", flexDirection: "column" }}>
                          <div style={{ height: Math.max(revH, 1), background: "#1877F2" }} />
                          {spendH > 0 && (
                            <div style={{ height: Math.max(spendH, 2), background: "#F87171", display: "flex", alignItems: "center", justifyContent: "center" }}>
                              {p.ratio >= 1 && <span style={{ fontSize: 7, fontWeight: 700, color: "#fff" }}>{p.ratio.toFixed(0)}%</span>}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Page names */}
                <div style={{ display: "flex", borderTop: "1px solid var(--border)" }}>
                  {pageRevenueAds.map((p) => (
                    <div key={`n-${p.name}`} style={{ flex: 1, textAlign: "center", padding: "5px 2px 0" }}>
                      <div style={{ fontSize: 10, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</div>
                      <div style={{ fontSize: 7, color: "#9CA3AF" }}>{p.adsAccount || "—"}</div>
                    </div>
                  ))}
                </div>

                {/* Revenue + Spend detail */}
                <div style={{ display: "flex", marginTop: 3 }}>
                  {pageRevenueAds.map((p) => (
                    <div key={`d-${p.name}`} style={{ flex: 1, textAlign: "center", fontSize: 8, color: "#6B7280", lineHeight: 1.4 }}>
                      DT <span style={{ fontWeight: 600, color: "#374151" }}>{formatVNDCompact(p.revenue)}</span><br />
                      Ads <span style={{ fontWeight: 600, color: p.spend > 0 ? "#DC2626" : "#9CA3AF" }}>{p.spend > 0 ? formatVNDCompact(p.spend) : "—"}</span>
                    </div>
                  ))}
                </div>

                {/* ROAS row */}
                <div style={{ display: "flex", marginTop: 4 }}>
                  {pageRevenueAds.map((p) => {
                    const color = p.spend <= 0 ? "#9CA3AF" : p.roas >= 15 ? "#16A34A" : p.roas >= 10 ? "#D97706" : "#DC2626";
                    const bg = p.spend <= 0 ? "#F9FAFB" : p.roas >= 15 ? "#F0FDF4" : p.roas >= 10 ? "#FFFBEB" : "#FEF2F2";
                    return (
                      <div key={`r-${p.name}`} style={{ flex: 1, textAlign: "center", fontSize: 10, fontWeight: 700, padding: "3px 0", borderRadius: 3, margin: "0 1px", color, background: bg }}>
                        {p.spend > 0 ? p.roas.toFixed(1) : "—"}
                      </div>
                    );
                  })}
                </div>

                {/* Orders row */}
                <div style={{ display: "flex", marginTop: 2 }}>
                  {pageRevenueAds.map((p) => (
                    <div key={`o-${p.name}`} style={{ flex: 1, textAlign: "center", fontSize: 8, color: "#6B7280" }}>
                      <span style={{ fontWeight: 600, color: "#374151" }}>{p.orders}</span> đơn
                    </div>
                  ))}
                </div>

                {/* Total row */}
                <div style={{ display: "flex", gap: 16, padding: "8px 12px", background: "#F9FAFB", borderRadius: 6, marginTop: 10, fontSize: 11 }}>
                  <span style={{ color: "#6B7280" }}>Tổng kỳ:</span>
                  <span>DT <strong style={{ color: "#16A34A" }}>{formatVNDCompact(nhanhTotals.revenue)}</strong></span>
                  <span>Ads <strong style={{ color: "#DC2626" }}>{formatVNDCompact(summary.spend)}</strong></span>
                  <span>Tỉ lệ <strong style={{ color: "#DC2626" }}>{summary.spend > 0 && nhanhTotals.revenue > 0 ? ((summary.spend / nhanhTotals.revenue) * 100).toFixed(1) : 0}%</strong></span>
                  <span>ROAS <strong style={{ color: "#16A34A" }}>{roas.toFixed(1)}</strong></span>
                  <span>Đơn <strong>{nhanhTotals.orders.toLocaleString("vi-VN")}</strong></span>
                </div>
              </div>
            );
          })()}
          </div>
        </Collapsible>
      )}

      {/* ═══ PAGE CARDS ═══ */}
      <Collapsible title={`PAGE CARDS (${filteredPages.filter((p) => p.nhanh_id || p.ad_account_id).length})`} defaultOpen={false}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 10 }}>
          {filteredPages.filter((p) => p.nhanh_id || p.ad_account_id).map((p) => (
            <PageCard key={p.page_id} page={p} ads={ads} insights={insights} nhanhRevenue={nhanhRevenue} from={from} to={to} />
          ))}
        </div>
      </Collapsible>
    </section>
  );
}

/* ── Ads Section with stat cards + overlay chart ── */
function AdsSection({ ads, adsByDate, summary, prevAds = [], prevSummary, from, to }: {
  ads: AdsRow[]; adsByDate: [string, number][]; summary: Summary;
  prevAds?: AdsRow[]; prevSummary?: Summary; from: string; to: string;
}) {
  const prevTotal = prevSummary?.spend || 0;
  const pctVsPrev = prevTotal > 0 ? Math.round(((summary.spend - prevTotal) / prevTotal) * 100) : 0;
  const avg = adsByDate.length > 0 ? summary.spend / adsByDate.length : 0;
  const maxDay = adsByDate.length > 0 ? adsByDate.reduce((best, [d, v]) => v > best.v ? { d, v } : best, { d: "", v: 0 }) : { d: "", v: 0 };
  const minDay = adsByDate.length > 0 ? adsByDate.reduce((best, [d, v]) => v < best.v ? { d, v } : best, { d: "", v: Infinity }) : { d: "", v: 0 };

  // Previous period daily for overlay line
  const prevByDate = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of prevAds) { const d = String(a.date).substring(0, 10); m.set(d, (m.get(d) || 0) + toNum(a.spend)); }
    return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [prevAds]);

  const prevMonth = from ? new Date(new Date(from).setMonth(new Date(from).getMonth() - 1)).toISOString().substring(0, 7) : "";

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        {prevMonth && <span className="muted" style={{ fontSize: 10 }}>so với Tháng {prevMonth}</span>}
      </div>

      {/* Stat cards row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8, marginBottom: 12 }}>
        <div style={{ padding: "6px 8px", background: "#FAFAFA", borderRadius: 6 }}>
          <div className="muted" style={{ fontSize: 9, textTransform: "uppercase" }}>Tổng chi</div>
          <div style={{ fontSize: 15, fontWeight: 800, color: "var(--red)" }}>{formatVNDCompact(summary.spend)}</div>
          {prevTotal > 0 && (
            <div style={{ fontSize: 9, color: pctVsPrev > 0 ? "var(--red)" : "var(--green)" }}>
              {pctVsPrev > 0 ? "↑" : "↓"}{Math.abs(pctVsPrev)}% vs T trước
            </div>
          )}
        </div>
        <div style={{ padding: "6px 8px", background: "#FAFAFA", borderRadius: 6 }}>
          <div className="muted" style={{ fontSize: 9, textTransform: "uppercase" }}>Trung bình/ngày</div>
          <div style={{ fontSize: 15, fontWeight: 800 }}>{formatVNDCompact(avg)}</div>
        </div>
        <div style={{ padding: "6px 8px", background: "#FAFAFA", borderRadius: 6 }}>
          <div className="muted" style={{ fontSize: 9, textTransform: "uppercase" }}>Cao nhất</div>
          <div style={{ fontSize: 15, fontWeight: 800, color: "var(--red)" }}>{formatVNDCompact(maxDay.v)}</div>
          <div className="muted" style={{ fontSize: 9 }}>{maxDay.d.substring(5)}</div>
        </div>
        <div style={{ padding: "6px 8px", background: "#FAFAFA", borderRadius: 6 }}>
          <div className="muted" style={{ fontSize: 9, textTransform: "uppercase" }}>Thấp nhất</div>
          <div style={{ fontSize: 15, fontWeight: 800 }}>{formatVNDCompact(minDay.v)}</div>
          <div className="muted" style={{ fontSize: 9 }}>{minDay.d.substring(5)}</div>
        </div>
        <div style={{ padding: "6px 8px", background: "#FAFAFA", borderRadius: 6 }}>
          <div className="muted" style={{ fontSize: 9, textTransform: "uppercase" }}>Cùng kỳ T trước</div>
          <div style={{ fontSize: 15, fontWeight: 800, color: "var(--blue)" }}>{formatVNDCompact(prevTotal)}</div>
        </div>
      </div>

      {/* Combined bar + line chart */}
      <AdsOverlayChart current={adsByDate} prev={prevByDate} />
    </div>
  );
}

/* ── Combined bar (current) + line (prev month) chart ── */
function AdsOverlayChart({ current, prev }: { current: [string, number][]; prev: [string, number][] }) {
  const [hover, setHover] = useState<number | null>(null);

  const prevByDay = useMemo(() => {
    const m = new Map<number, number>();
    for (const [d, v] of prev) {
      const day = new Date(d).getDate();
      m.set(day, (m.get(day) || 0) + v);
    }
    return m;
  }, [prev]);

  if (current.length === 0) return <div className="muted" style={{ padding: 20, textAlign: "center" }}>Không có data.</div>;

  const merged = current.map(([d, v]) => {
    const day = new Date(d).getDate();
    return { date: d, val: v, prevVal: prevByDay.get(day) ?? null };
  });

  const allVals = [...merged.map((m) => m.val), ...merged.filter((m) => m.prevVal !== null).map((m) => m.prevVal!)];
  const max = Math.max(...allVals, 1);
  const BAR_H = 140;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", height: BAR_H, position: "relative" }}>
        {merged.map((m, i) => {
          const h = max > 0 ? (m.val / max) * (BAR_H - 28) : 0;
          return (
            <div key={m.date}
              onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
              style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", cursor: "default", height: "100%" }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", flex: 1, width: "100%" }}>
                {hover === i && <div style={{ fontSize: 9, fontWeight: 600, marginBottom: 2, whiteSpace: "nowrap" }}>{formatVNDCompact(m.val)}</div>}
                <div style={{ width: "85%", height: Math.max(h, 2), background: hover === i ? "#4ADE80" : "#86EFAC", borderRadius: 2, transition: "background 0.1s" }} />
              </div>
            </div>
          );
        })}
        {/* Prev period line + dots */}
        {merged.length > 1 && (() => {
          const VB_W = 1000;
          const pts = merged.map((m, i) => {
            if (m.prevVal === null) return null;
            const x = (i + 0.5) / merged.length * VB_W;
            const y = max > 0 ? (1 - m.prevVal / max) * (BAR_H - 28) + 14 : BAR_H - 14;
            return { x, y, val: m.prevVal };
          }).filter(Boolean) as { x: number; y: number; val: number }[];
          return (
            <svg viewBox={`0 0 ${VB_W} ${BAR_H}`} preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 2, overflow: "visible" }}>
              {pts.length > 1 && <polyline
                fill="none"
                stroke="#3B82F6"
                strokeWidth={2}
                strokeDasharray="6 3"
                points={pts.map((p) => `${p.x},${p.y}`).join(" ")}
                vectorEffect="non-scaling-stroke"
              />}
              {pts.map((p, i) => (
                <circle key={`dot-${i}`} cx={p.x} cy={p.y} r={4} fill="#3B82F6" stroke="#fff" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
              ))}
            </svg>
          );
        })()}
        {/* Tooltip */}
        {hover !== null && merged[hover] && (
          <div style={{
            position: "absolute",
            left: `${((hover + 0.5) / merged.length) * 100}%`,
            top: 4, transform: "translateX(-50%)",
            background: "#1F2937", color: "#fff", borderRadius: 6, padding: "6px 10px",
            fontSize: 11, pointerEvents: "none", zIndex: 50, whiteSpace: "nowrap",
            boxShadow: "0 4px 12px rgba(0,0,0,.3)",
          }}>
            <div style={{ fontWeight: 700, color: "#D1D5DB", marginBottom: 3 }}>{merged[hover].date}</div>
            <div style={{ lineHeight: 1.6 }}>
              <span style={{ color: "#9CA3AF" }}>Hiện tại: </span>
              <span style={{ fontWeight: 700 }}>{formatVNDCompact(merged[hover].val)}</span>
            </div>
            {merged[hover].prevVal !== null && (
              <div style={{ lineHeight: 1.6 }}>
                <span style={{ color: "#9CA3AF" }}>Tháng trước: </span>
                <span style={{ fontWeight: 700 }}>{formatVNDCompact(merged[hover].prevVal!)}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Date labels — same flex:1 = perfect alignment */}
      <div style={{ display: "flex" }}>
        {merged.map((m) => (
          <div key={`dl-${m.date}`} style={{ flex: 1, textAlign: "center", fontSize: 9, color: "#999", padding: "4px 0" }}>
            {m.date.substring(5)}
          </div>
        ))}
      </div>

      {/* % change row — same flex:1 = perfect alignment */}
      <div style={{ display: "flex" }}>
        {merged.map((m, i) => {
          const prevDay = i > 0 ? merged[i - 1].val : m.val;
          const pct = prevDay > 0 ? Math.round(((m.val - prevDay) / prevDay) * 100) : 0;
          return (
            <div key={`pc-${m.date}`} style={{
              flex: 1, textAlign: "center", fontSize: 9, fontWeight: 600, padding: "3px 0",
              background: pct > 0 ? "#F0FDF4" : pct < 0 ? "#FEF2F2" : "#FAFAFA",
              color: pct > 0 ? "#16A34A" : pct < 0 ? "#DC2626" : "#999",
            }}>
              {i === 0 ? "0%" : pct > 0 ? `+${pct}%` : `${pct}%`}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Page Card ── */
function PageCard({ page, ads, insights, nhanhRevenue, from, to }: {
  page: PageRow; ads: AdsRow[]; insights: InsightsRow[]; nhanhRevenue: FbNhanhRow[]; from: string; to: string;
}) {
  const pageName = (page.page_name || "").replace(/^FACEBOOK - /, "");

  // Insights for this page
  const pageInsights = useMemo(() => {
    const filtered = insights.filter((r) => r.page_id === page.fb_page_id || r.page_id === page.page_id);
    const totals = filtered.reduce(
      (a, r) => ({ new_fans: a.new_fans + toNum(r.new_fans), lost_fans: a.lost_fans + toNum(r.lost_fans), reach: a.reach + toNum(r.reach) }),
      { new_fans: 0, lost_fans: 0, reach: 0 },
    );
    const days = new Set(filtered.map((r) => r.date)).size || 1;
    return { ...totals, net: totals.new_fans - totals.lost_fans, reachPerDay: Math.round(totals.reach / days), days };
  }, [insights, page]);

  // Ads for this page's ad account
  const pageAds = useMemo(() => {
    if (!page.ad_account_id) return { spend: 0, reach: 0, clicks: 0, ctr: 0, accountName: "" };
    const filtered = ads.filter((a) => a.ad_account_id === page.ad_account_id);
    const accountName = filtered.find((a) => a.account_name)?.account_name || "";
    const totals = filtered.reduce(
      (a, r) => ({ spend: a.spend + toNum(r.spend), reach: a.reach + toNum(r.reach), clicks: a.clicks + toNum(r.clicks), impressions: a.impressions + toNum(r.impressions) }),
      { spend: 0, reach: 0, clicks: 0, impressions: 0 },
    );
    return { ...totals, ctr: totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0, accountName };
  }, [ads, page]);

  // Nhanh revenue for this page
  const pageNhanh = useMemo(() => {
    if (!page.nhanh_id) return { revenue: 0, orders: 0, daily: [] as number[] };
    const filtered = nhanhRevenue.filter((r) => r.source === page.nhanh_id);
    const totals = filtered.reduce((a, r) => ({ revenue: a.revenue + r.revenue, orders: a.orders + r.orders }), { revenue: 0, orders: 0 });
    // Daily values for mini chart
    const dates = new Set<string>();
    for (const r of nhanhRevenue) dates.add(r.date);
    const sortedDates = Array.from(dates).sort();
    const byDate = new Map<string, number>();
    for (const r of filtered) byDate.set(r.date, (byDate.get(r.date) || 0) + r.revenue);
    const daily = sortedDates.map((d) => byDate.get(d) || 0);
    return { ...totals, daily };
  }, [nhanhRevenue, page]);

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#E8F0FE", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>f</div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 13 }}>{pageName}</div>
        </div>
      </div>

      {/* Insights */}
      <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", marginBottom: 4 }}>Insights</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 12px", fontSize: 11 }}>
          <div>FOLLOWERS MỚI <strong style={{ color: "var(--green)" }}>+{pageInsights.new_fans.toLocaleString("vi-VN")}</strong></div>
          <div>UNFOLLOW <strong style={{ color: "var(--red)" }}>-{pageInsights.lost_fans.toLocaleString("vi-VN")}</strong></div>
          <div>TĂNG RÒNG <strong style={{ color: pageInsights.net >= 0 ? "var(--green)" : "var(--red)" }}>{pageInsights.net >= 0 ? "+" : ""}{pageInsights.net.toLocaleString("vi-VN")}</strong></div>
          <div>REACH/NGÀY <strong style={{ color: "var(--blue)" }}>{pageInsights.reachPerDay.toLocaleString("vi-VN")}</strong></div>
        </div>
        {/* Mini reach chart */}
        {pageNhanh.daily.length > 0 && (
          <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 30, marginTop: 6 }}>
            {pageNhanh.daily.map((v, i) => {
              const max = Math.max(...pageNhanh.daily);
              const h = max > 0 ? (v / max) * 24 : 0;
              return <div key={i} style={{ flex: 1, height: Math.max(h, 1), background: "#86EFAC", borderRadius: 1 }} />;
            })}
          </div>
        )}
      </div>

      {/* Ads */}
      {page.ad_account_id && (
        <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)" }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", marginBottom: 4 }}>Facebook Ads</div>
          <div className="muted" style={{ fontSize: 10, marginBottom: 4 }}>{pageAds.accountName || page.page_name?.replace(/^FACEBOOK - /, "") || page.ad_account_id}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 12px", fontSize: 11 }}>
            <div>CHI PHÍ <strong style={{ color: "var(--red)" }}>{formatVNDCompact(pageAds.spend)}</strong></div>
            <div>REACH <strong style={{ color: "var(--blue)" }}>{pageAds.reach.toLocaleString("vi-VN")}</strong></div>
            <div>CLICKS <strong>{pageAds.clicks.toLocaleString("vi-VN")}</strong></div>
            <div>CTR <strong style={{ color: "var(--green)" }}>{pageAds.ctr.toFixed(2)}%</strong></div>
          </div>
          <div className="muted" style={{ fontSize: 9, marginTop: 4 }}>{from} → {to}</div>
        </div>
      )}

      {/* Nhanh revenue */}
      {page.nhanh_id && (
        <div style={{ padding: "8px 12px" }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", marginBottom: 4 }}>Doanh thu Nhanh.vn</div>
          <div className="muted" style={{ fontSize: 10, marginBottom: 4 }}>Facebook - {page.nhanh_id}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 12px", fontSize: 11 }}>
            <div>ĐƠN THỰC <strong>{pageNhanh.orders.toLocaleString("vi-VN")}</strong></div>
            <div>DT THUẦN <strong style={{ color: "var(--green)" }}>{formatVNDCompact(pageNhanh.revenue)}</strong></div>
          </div>
          <div style={{ fontSize: 11, color: "var(--green)", fontWeight: 700, marginTop: 4 }}>
            THÀNH CÔNG {pageNhanh.orders} đơn · {formatVNDCompact(pageNhanh.revenue)}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Channel Detail with sparklines ── */
const SPARK_COLORS = ["#2563EB", "#DC2626", "#16A34A", "#D97706", "#7C3AED", "#0D9488", "#EC4899", "#F59E0B", "#6366F1", "#10B981", "#3B82F6", "#EF4444", "#8B5CF6"];

function ChannelDetail({ nhanhRevenue, nhanhBySource, nhanhTotal }: {
  nhanhRevenue: FbNhanhRow[];
  nhanhBySource: { name: string; revenue: number; orders: number }[];
  nhanhTotal: number;
}) {
  // Build daily data per source for sparklines
  const sourceDaily = useMemo(() => {
    const m = new Map<string, Map<string, number>>();
    for (const r of nhanhRevenue) {
      if (!m.has(r.source)) m.set(r.source, new Map());
      const dm = m.get(r.source)!;
      dm.set(r.date, (dm.get(r.date) || 0) + r.revenue);
    }
    // Get all dates sorted
    const dates = new Set<string>();
    for (const r of nhanhRevenue) dates.add(r.date);
    const sortedDates = Array.from(dates).sort();
    return { bySource: m, dates: sortedDates };
  }, [nhanhRevenue]);

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div style={{ fontWeight: 700, marginBottom: 10, fontSize: 12, textTransform: "uppercase", color: "var(--muted)" }}>
        Chi tiết theo kênh
        <span style={{ float: "right", fontWeight: 400, fontSize: 11, textTransform: "none" }}>Bấm vào kênh để xem biểu đồ theo ngày</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {nhanhBySource.map((s, i) => {
          const color = SPARK_COLORS[i % SPARK_COLORS.length];
          const pct = nhanhTotal > 0 ? Math.round((s.revenue / nhanhTotal) * 100) : 0;
          const daily = sourceDaily.bySource.get(s.name);
          const vals = sourceDaily.dates.map((d) => daily?.get(d) || 0);
          // % change: last vs second-to-last
          const last = vals.length > 0 ? vals[vals.length - 1] : 0;
          const prev = vals.length > 1 ? vals[vals.length - 2] : last;
          const change = prev > 0 ? Math.round(((last - prev) / prev) * 100) : 0;

          return (
            <div key={s.name} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
              <span style={{ color, fontSize: 10 }}>●</span>
              <span style={{ flex: 1, fontSize: 12, fontWeight: 500 }}>{s.name}</span>
              {/* Sparkline mini bars */}
              <div style={{ display: "flex", alignItems: "flex-end", gap: 1, height: 24, width: 80 }}>
                {vals.map((v, j) => {
                  const max = Math.max(...vals);
                  const h = max > 0 ? (v / max) * 20 : 0;
                  return <div key={j} style={{ flex: 1, height: Math.max(h, 1), background: color, borderRadius: 1, opacity: 0.7 }} />;
                })}
              </div>
              {/* % change */}
              <span style={{ fontSize: 10, fontWeight: 600, width: 42, textAlign: "right", color: change > 0 ? "var(--green)" : change < 0 ? "var(--red)" : "var(--muted)" }}>
                {change > 0 ? `▲+${change}%` : change < 0 ? `▼${change}%` : "—"}
              </span>
              {/* Revenue */}
              <span style={{ fontSize: 12, fontWeight: 700, width: 60, textAlign: "right" }}>{formatVNDCompact(s.revenue)}</span>
              {/* % share */}
              <span style={{ fontSize: 10, color: "var(--muted)", width: 30, textAlign: "right" }}>{pct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}


/* ── Revenue Detail Section (30 days) ── */
function RevenueDetailSection({ data }: { data: FbNhanhRow[] }) {
  const [period, setPeriod] = useState<7 | 14 | 30 | "month" | "custom">("month");
  const [mode, setMode] = useState<"total" | "channel">("total");
  const pad = (n: number) => String(n).padStart(2, "0");
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
  const [customFrom, setCustomFrom] = useState(monthStart);
  const [customTo, setCustomTo] = useState(fmt(now));

  // Filter by period
  const { cutoff, cutoffTo } = useMemo(() => {
    if (period === "month") return { cutoff: monthStart, cutoffTo: fmt(now) };
    if (period === "custom") return { cutoff: customFrom, cutoffTo: customTo };
    const d = new Date(); d.setDate(d.getDate() - period);
    return { cutoff: d.toISOString().substring(0, 10), cutoffTo: fmt(now) };
  }, [period, customFrom, customTo, monthStart]); // eslint-disable-line react-hooks/exhaustive-deps
  const filtered = useMemo(() => data.filter((r) => r.date >= cutoff && r.date <= cutoffTo), [data, cutoff, cutoffTo]);

  // Previous period (same duration, shifted back)
  const { prevCutoff, prevCutoffTo } = useMemo(() => {
    const fromD = new Date(cutoff + "T00:00:00");
    const toD = new Date(cutoffTo + "T00:00:00");
    const days = Math.round((toD.getTime() - fromD.getTime()) / 86400000) + 1;
    const prevTo = new Date(fromD); prevTo.setDate(prevTo.getDate() - 1);
    const prevFrom = new Date(prevTo); prevFrom.setDate(prevFrom.getDate() - days + 1);
    return { prevCutoff: fmt(prevFrom), prevCutoffTo: fmt(prevTo) };
  }, [cutoff, cutoffTo]); // eslint-disable-line react-hooks/exhaustive-deps
  const prevFiltered = useMemo(() => data.filter((r) => r.date >= prevCutoff && r.date <= prevCutoffTo), [data, prevCutoff, prevCutoffTo]);

  // Totals
  const totals = useMemo(() => filtered.reduce(
    (a, r) => ({ revenue: a.revenue + r.revenue, orders: a.orders + r.orders }),
    { revenue: 0, orders: 0 },
  ), [filtered]);
  const prevTotals = useMemo(() => prevFiltered.reduce(
    (a, r) => ({ revenue: a.revenue + r.revenue, orders: a.orders + r.orders }),
    { revenue: 0, orders: 0 },
  ), [prevFiltered]);

  // By date (total)
  const byDate = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of filtered) m.set(r.date, (m.get(r.date) || 0) + r.revenue);
    return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  // Previous period by date (aligned by index, not by date)
  const prevByDate = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of prevFiltered) m.set(r.date, (m.get(r.date) || 0) + r.revenue);
    return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [prevFiltered]);

  // By date per source (for stacked/channel mode)
  const { sources, byDateBySource } = useMemo(() => {
    const srcSet = new Set<string>();
    const m = new Map<string, Map<string, number>>();
    for (const r of filtered) {
      srcSet.add(r.source);
      if (!m.has(r.date)) m.set(r.date, new Map());
      const dm = m.get(r.date)!;
      dm.set(r.source, (dm.get(r.source) || 0) + r.revenue);
    }
    const sources = Array.from(srcSet).sort((a, b) => {
      const aRev = filtered.filter((r) => r.source === a).reduce((s, r) => s + r.revenue, 0);
      const bRev = filtered.filter((r) => r.source === b).reduce((s, r) => s + r.revenue, 0);
      return bRev - aRev;
    });
    return { sources, byDateBySource: m };
  }, [filtered]);

  // By source totals (for channel detail)
  const bySource = useMemo(() => {
    const m = new Map<string, { revenue: number; orders: number }>();
    for (const r of filtered) {
      const cur = m.get(r.source) || { revenue: 0, orders: 0 };
      cur.revenue += r.revenue; cur.orders += r.orders;
      m.set(r.source, cur);
    }
    return Array.from(m.entries()).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.revenue - a.revenue);
  }, [filtered]);

  // Previous period by source
  const prevBySource = useMemo(() => {
    const m = new Map<string, { revenue: number; orders: number }>();
    for (const r of prevFiltered) {
      const cur = m.get(r.source) || { revenue: 0, orders: 0 };
      cur.revenue += r.revenue; cur.orders += r.orders;
      m.set(r.source, cur);
    }
    return m;
  }, [prevFiltered]);

  const avg = byDate.length > 0 ? totals.revenue / byDate.length : 0;
  const prevAvg = prevByDate.length > 0 ? prevTotals.revenue / prevByDate.length : 0;
  const maxDay = byDate.length > 0 ? byDate.reduce((best, [d, v]) => v > best.v ? { d, v } : best, { d: "", v: 0 }) : { d: "", v: 0 };
  const prevMaxDay = prevByDate.length > 0 ? prevByDate.reduce((best, [d, v]) => v > best.v ? { d, v } : best, { d: "", v: 0 }) : { d: "", v: 0 };
  const dateRange = byDate.length > 0 ? `${byDate[0][0].substring(5)} → ${byDate[byDate.length - 1][0].substring(5)}` : "";
  const pctChange = (cur: number, prev: number) => prev > 0 ? Math.round(((cur - prev) / prev) * 100) : 0;
  const hasPrev = prevTotals.revenue > 0;

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12 }}>Chi tiết {period === "month" ? "tháng này" : period === "custom" ? "tuỳ chọn" : `${period} ngày`}</span>
          <span className="chip chip-green" style={{ fontSize: 9 }}>{formatVNDCompact(totals.revenue)} / {byDate.length} ngày</span>
        </div>
        <div style={{ textAlign: "right" }}>
          <div className="muted" style={{ fontSize: 10 }}>{dateRange}</div>
          {hasPrev && <div style={{ fontSize: 9, color: "#9CA3AF" }}>So sánh: {prevCutoff.substring(5)} → {prevCutoffTo.substring(5)}</div>}
        </div>
      </div>

      {/* 3 Stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
        <div style={{ padding: "6px 8px", background: "#FAFAFA", borderRadius: 6 }}>
          <div className="muted" style={{ fontSize: 9, textTransform: "uppercase" }}>Tổng doanh thu</div>
          <div style={{ fontSize: 16, fontWeight: 800 }}>{formatVNDCompact(totals.revenue)}</div>
          <div className="muted" style={{ fontSize: 9 }}>{totals.orders.toLocaleString("vi-VN")} đơn thành công</div>
          {hasPrev && <PrevBadge cur={totals.revenue} prev={prevTotals.revenue} />}
        </div>
        <div style={{ padding: "6px 8px", background: "#FAFAFA", borderRadius: 6 }}>
          <div className="muted" style={{ fontSize: 9, textTransform: "uppercase" }}>Trung bình / ngày</div>
          <div style={{ fontSize: 16, fontWeight: 800 }}>{formatVNDCompact(avg)}</div>
          <div className="muted" style={{ fontSize: 9 }}>{byDate.length} ngày</div>
          {hasPrev && <PrevBadge cur={avg} prev={prevAvg} />}
        </div>
        <div style={{ padding: "6px 8px", background: "#FAFAFA", borderRadius: 6 }}>
          <div className="muted" style={{ fontSize: 9, textTransform: "uppercase" }}>Ngày cao nhất</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: "var(--green)" }}>{formatVNDCompact(maxDay.v)}</div>
          <div className="muted" style={{ fontSize: 9 }}>{maxDay.d}</div>
          {hasPrev && prevMaxDay.v > 0 && <div style={{ fontSize: 8, color: "#9CA3AF", marginTop: 2 }}>CK: {formatVNDCompact(prevMaxDay.v)} ({prevMaxDay.d.substring(5)})</div>}
        </div>
      </div>

      {/* Period + mode filter */}
      <div style={{ display: "flex", gap: 6, marginBottom: 10, alignItems: "center", flexWrap: "wrap" }}>
        {([7, 14, 30] as const).map((p) => (
          <button key={p} className="btn btn-ghost btn-xs" onClick={() => setPeriod(p)}
            style={{ background: period === p ? "var(--blue)" : undefined, color: period === p ? "#fff" : undefined }}>
            {p} ngày
          </button>
        ))}
        <button className="btn btn-ghost btn-xs" onClick={() => setPeriod("month")}
          style={{ background: period === "month" ? "var(--blue)" : undefined, color: period === "month" ? "#fff" : undefined }}>
          Tháng này
        </button>
        <button className="btn btn-ghost btn-xs" onClick={() => setPeriod("custom")}
          style={{ background: period === "custom" ? "var(--blue)" : undefined, color: period === "custom" ? "#fff" : undefined }}>
          Tuỳ chọn
        </button>
        {period === "custom" && (
          <>
            <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} style={{ fontSize: 11, width: 120 }} />
            <span className="muted">→</span>
            <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} style={{ fontSize: 11, width: 120 }} />
          </>
        )}
        <span style={{ width: 1, height: 16, background: "var(--border)", margin: "0 4px" }} />
        <button className="btn btn-ghost btn-xs" onClick={() => setMode("total")}
          style={{ background: mode === "total" ? "var(--blue)" : undefined, color: mode === "total" ? "#fff" : undefined }}>
          Tổng
        </button>
        <button className="btn btn-ghost btn-xs" onClick={() => setMode("channel")}
          style={{ background: mode === "channel" ? "var(--blue)" : undefined, color: mode === "channel" ? "#fff" : undefined }}>
          Theo kênh
        </button>
      </div>

      {/* SVG Chart */}
      {mode === "total" ? (
        <RevenueTotalChart data={byDate} prevData={prevByDate} />
      ) : (
        <RevenueStackedChart dates={byDate.map(([d]) => d)} sources={sources} byDateBySource={byDateBySource} />
      )}

      {/* Comparison footer */}
      {hasPrev && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 1, marginTop: 12, borderRadius: 8, overflow: "hidden", fontSize: 11 }}>
          <div style={{ padding: "8px 12px", background: "#F0FDF4" }}>
            <div style={{ fontSize: 9, color: "#6B7280", marginBottom: 2 }}>KỲ NÀY</div>
            <div style={{ fontWeight: 800, color: "#16A34A", fontSize: 14 }}>{formatVNDCompact(totals.revenue)}</div>
            <div style={{ fontSize: 9, color: "#6B7280" }}>{totals.orders.toLocaleString("vi-VN")} đơn</div>
          </div>
          <div style={{ padding: "8px 12px", background: "#F9FAFB" }}>
            <div style={{ fontSize: 9, color: "#6B7280", marginBottom: 2 }}>CÙNG KỲ</div>
            <div style={{ fontWeight: 800, color: "#6B7280", fontSize: 14 }}>{formatVNDCompact(prevTotals.revenue)}</div>
            <div style={{ fontSize: 9, color: "#6B7280" }}>{prevTotals.orders.toLocaleString("vi-VN")} đơn · {prevCutoff.substring(5)} → {prevCutoffTo.substring(5)}</div>
          </div>
          <div style={{ padding: "8px 12px", background: pctChange(totals.revenue, prevTotals.revenue) >= 0 ? "#F0FDF4" : "#FEF2F2" }}>
            <div style={{ fontSize: 9, color: "#6B7280", marginBottom: 2 }}>TĂNG TRƯỞNG</div>
            <div style={{ fontWeight: 800, fontSize: 14, color: pctChange(totals.revenue, prevTotals.revenue) >= 0 ? "#16A34A" : "#DC2626" }}>
              {pctChange(totals.revenue, prevTotals.revenue) >= 0 ? "▲" : "▼"} {Math.abs(pctChange(totals.revenue, prevTotals.revenue))}%
            </div>
            <div style={{ fontSize: 9, color: "#6B7280" }}>
              {totals.orders - prevTotals.orders >= 0 ? "+" : ""}{(totals.orders - prevTotals.orders).toLocaleString("vi-VN")} đơn
            </div>
          </div>
        </div>
      )}

      {/* Channel detail with sparklines */}
      <div style={{ marginTop: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase" }}>Chi tiết theo kênh</div>
          <div className="muted" style={{ fontSize: 10 }}>Bấm vào kênh để xem biểu đồ theo ngày</div>
        </div>
        {bySource.map((s, i) => {
          const color = SPARK_COLORS[i % SPARK_COLORS.length];
          const pct = totals.revenue > 0 ? Math.round((s.revenue / totals.revenue) * 100) : 0;
          // daily sparkline
          const dates = byDate.map(([d]) => d);
          const vals = dates.map((d) => byDateBySource.get(d)?.get(s.name) || 0);
          // Compare with previous period
          const prevSrc = prevBySource.get(s.name);
          const prevRev = prevSrc?.revenue || 0;
          const chgVsPrev = prevRev > 0 ? Math.round(((s.revenue - prevRev) / prevRev) * 100) : 0;
          return (
            <div key={s.name} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderBottom: "1px solid var(--border)" }}>
              <span style={{ color, fontSize: 10 }}>●</span>
              <span style={{ width: 160, flexShrink: 0, fontSize: 11, fontWeight: 500 }}>Facebook - {s.name}</span>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 1, height: 20, flex: 1, minWidth: 60 }}>
                {vals.map((v, j) => {
                  const mx = Math.max(...vals);
                  const h = mx > 0 ? (v / mx) * 16 : 0;
                  return <div key={j} style={{ flex: 1, height: Math.max(h, 1), background: color, borderRadius: 1, opacity: 0.7 }} />;
                })}
              </div>
              <span style={{ fontSize: 9, fontWeight: 600, width: 50, textAlign: "right", color: chgVsPrev > 0 ? "var(--green)" : chgVsPrev < 0 ? "var(--red)" : "var(--muted)" }}>
                {hasPrev && prevRev > 0 ? (chgVsPrev > 0 ? `▲+${chgVsPrev}%` : chgVsPrev < 0 ? `▼${chgVsPrev}%` : "0%") : "—"}
              </span>
              <div style={{ width: 90, textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 700 }}>{formatVNDCompact(s.revenue)}</div>
                {hasPrev && prevRev > 0 && <div style={{ fontSize: 8, color: "#9CA3AF" }}>CK: {formatVNDCompact(prevRev)}</div>}
              </div>
              <span style={{ fontSize: 9, color: "var(--muted)", width: 28, textAlign: "right" }}>{pct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Revenue Total bar chart with ghost prev bars ── */
function RevenueTotalChart({ data, prevData = [] }: { data: [string, number][]; prevData?: [string, number][] }) {
  if (data.length === 0) return null;
  const allMax = Math.max(...data.map(([, v]) => v), ...prevData.map(([, v]) => v), 1);
  const BAR_H = 160;
  const labelStep = Math.max(1, Math.floor(data.length / 12));

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", height: BAR_H }}>
        {data.map(([d, v], i) => {
          const h = allMax > 0 ? (v / allMax) * (BAR_H - 24) : 0;
          const prevV = prevData[i]?.[1] || 0;
          const prevH = allMax > 0 ? (prevV / allMax) * (BAR_H - 24) : 0;
          return (
            <div key={d} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", position: "relative" }}>
              <div style={{ fontSize: 7, fontWeight: 600, marginBottom: 1, whiteSpace: "nowrap" }}>{formatVNDCompact(v)}</div>
              <div style={{ width: "85%", position: "relative" }}>
                {/* Ghost bar (previous period) */}
                {prevV > 0 && (
                  <div style={{
                    position: "absolute", bottom: 0, left: 0, width: "100%",
                    height: Math.max(prevH, 2), background: "#60A5FA", opacity: 0.15,
                    borderRadius: 2, border: "1px dashed rgba(96,165,250,0.4)",
                  }} />
                )}
                {/* Current bar */}
                <div style={{ position: "relative", width: "100%", height: Math.max(h, 2), background: "#60A5FA", borderRadius: 2 }} />
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex" }}>
        {data.map(([d], i) => (
          <div key={`rl-${d}`} style={{ flex: 1, textAlign: "center", fontSize: 7, color: "#999", padding: "3px 0" }}>
            {i % labelStep === 0 ? d.substring(5) : ""}
          </div>
        ))}
      </div>
      {prevData.length > 0 && (
        <div style={{ display: "flex", gap: 12, fontSize: 9, color: "#9CA3AF", justifyContent: "flex-end", marginTop: 2 }}>
          <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 1, background: "#60A5FA", marginRight: 3, verticalAlign: "middle" }} />Kỳ này</span>
          <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 1, background: "#60A5FA", opacity: 0.2, marginRight: 3, verticalAlign: "middle", border: "1px dashed rgba(96,165,250,0.5)" }} />Cùng kỳ</span>
        </div>
      )}
    </div>
  );
}

/* ── Revenue Stacked bar chart (per channel, HTML flex) ── */
function RevenueStackedChart({ dates, sources, byDateBySource }: {
  dates: string[]; sources: string[]; byDateBySource: Map<string, Map<string, number>>;
}) {
  if (dates.length === 0) return null;
  const maxTotal = Math.max(...dates.map((d) => {
    const dm = byDateBySource.get(d);
    if (!dm) return 0;
    let t = 0; for (const v of dm.values()) t += v;
    return t;
  }), 1);

  const BAR_H = 160;
  const labelStep = Math.max(1, Math.floor(dates.length / 12));

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", height: BAR_H }}>
        {dates.map((d) => {
          const dm = byDateBySource.get(d) || new Map();
          let total = 0;
          for (const v of dm.values()) total += v;
          const totalH = maxTotal > 0 ? (total / maxTotal) * (BAR_H - 4) : 0;
          return (
            <div key={d} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end" }}>
              <div style={{ width: "85%", height: Math.max(totalH, 1), display: "flex", flexDirection: "column-reverse", borderRadius: 2, overflow: "hidden" }}>
                {sources.map((src, si) => {
                  const v = dm.get(src) || 0;
                  const h = maxTotal > 0 ? (v / maxTotal) * (BAR_H - 4) : 0;
                  return <div key={src} style={{ width: "100%", height: h, background: SPARK_COLORS[si % SPARK_COLORS.length], opacity: 0.8 }} />;
                })}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex" }}>
        {dates.map((d, i) => (
          <div key={`sl-${d}`} style={{ flex: 1, textAlign: "center", fontSize: 7, color: "#999", padding: "3px 0" }}>
            {i % labelStep === 0 ? d.substring(5) : ""}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Previous period comparison badge ── */
function PrevBadge({ cur, prev }: { cur: number; prev: number }) {
  const pct = prev > 0 ? Math.round(((cur - prev) / prev) * 100) : 0;
  const up = pct >= 0;
  return (
    <div style={{ fontSize: 8, marginTop: 2, color: up ? "#16A34A" : "#DC2626", fontWeight: 600 }}>
      {up ? "▲" : "▼"}{up ? "+" : ""}{pct}% <span style={{ color: "#9CA3AF", fontWeight: 400 }}>vs {formatVNDCompact(prev)} CK</span>
    </div>
  );
}
