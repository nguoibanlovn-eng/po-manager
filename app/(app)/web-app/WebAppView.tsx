"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { formatVND, formatVNDCompact, toNum } from "@/lib/format";
import type { AdsRow, InsightsRow, PageRow, FbNhanhRow } from "@/lib/db/ads";
import TargetProgressBar from "../components/TargetProgressBar";
import Collapsible from "../components/Collapsible";
import AutoSyncToday from "../components/AutoSyncToday";

const BRAND = "#6366F1";

const _pad = (n: number) => String(n).padStart(2, "0");
const _fmt = (d: Date) => `${d.getFullYear()}-${_pad(d.getMonth() + 1)}-${_pad(d.getDate())}`;
function daysAgo(d: number): string {
  const dt = new Date(); dt.setDate(dt.getDate() + d);
  return _fmt(dt);
}
function monthRange(offset: number) {
  const now = new Date(); const y = now.getFullYear(); const m = now.getMonth() + offset;
  const first = new Date(y, m, 1); const last = offset === 0 ? now : new Date(y, m + 1, 0);
  return { from: _fmt(first), to: _fmt(last) };
}
const QUICK_RANGES = [
  { key: "today", label: "Hôm nay", from: daysAgo(0), to: daysAgo(0) },
  { key: "yesterday", label: "Hôm qua", from: daysAgo(-1), to: daysAgo(-1) },
  { key: "7d", label: "7 ngày", from: daysAgo(-7), to: daysAgo(0) },
  { key: "30d", label: "30 ngày", from: daysAgo(-30), to: daysAgo(0) },
  { key: "month", label: "Tháng này", ...monthRange(0) },
  { key: "prev", label: "Tháng trước", ...monthRange(-1) },
  { key: "this_year", label: "Năm nay", from: `${new Date().getFullYear()}-01-01`, to: daysAgo(0) },
];

const WEB_KEYWORDS = ["Bán sỉ", "bán buôn", "App Lỗ Vũ", "LynkID", "lovu", "Muagimuadi", "velasboost", "WEB"];
function isWebSource(src: string): boolean {
  // "API" source from V3 sync = web orders (no detailed source available)
  if (src === "API") return true;
  return WEB_KEYWORDS.some((kw) => src.toLowerCase().includes(kw.toLowerCase()));
}

type Summary = { spend: number; impressions: number; clicks: number; reach: number; purchase_value: number };

export default function WebAppView({
  pages, ads, insights, summary, nhanhRevenue,
  from, to, monthTarget = 0, monthActual = 0, monthKey = "",
}: {
  pages: PageRow[];
  ads: AdsRow[];
  insights: InsightsRow[];
  summary: Summary;
  nhanhRevenue: FbNhanhRow[];
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

  function apply() { router.push(`/web-app?from=${f}&to=${t}`); }
  function quickRange(qr: { from: string; to: string }) { router.push(`/web-app?from=${qr.from}&to=${qr.to}`); }

  // Nhanh totals
  const nhanhTotals = useMemo(() =>
    nhanhRevenue.reduce((a, r) => ({ revenue: a.revenue + r.revenue, orders: a.orders + r.orders }), { revenue: 0, orders: 0 }),
  [nhanhRevenue]);

  // Insights totals
  const insightsTotals = useMemo(() => {
    // Filter insights to only web pages
    const webPageIds = new Set(pages.flatMap((p) => [p.fb_page_id, p.page_id].filter(Boolean)));
    const filtered = webPageIds.size > 0 ? insights.filter((r) => webPageIds.has(r.page_id)) : [];
    return filtered.reduce(
      (a, r) => ({ new_fans: a.new_fans + toNum(r.new_fans), lost_fans: a.lost_fans + toNum(r.lost_fans), reach: a.reach + toNum(r.reach), impressions: a.impressions + toNum(r.impressions) }),
      { new_fans: 0, lost_fans: 0, reach: 0, impressions: 0 },
    );
  }, [insights, pages]);

  const netFans = insightsTotals.new_fans - insightsTotals.lost_fans;
  const roas = summary.spend > 0 ? nhanhTotals.revenue / summary.spend : 0;
  const ctr = summary.impressions > 0 ? (summary.clicks / summary.impressions) * 100 : 0;

  // By source
  const bySource = useMemo(() => {
    const m = new Map<string, { orders: number; revenue: number }>();
    for (const r of nhanhRevenue) {
      const src = r.source || "Khác";
      if (!isWebSource(src)) continue;
      const cur = m.get(src) || { orders: 0, revenue: 0 };
      cur.orders += r.orders;
      cur.revenue += r.revenue;
      m.set(src, cur);
    }
    const webTotal = Array.from(m.values()).reduce((s, v) => s + v.revenue, 0);
    return {
      sources: Array.from(m.entries())
        .map(([name, v]) => ({ name, ...v, pct: webTotal > 0 ? (v.revenue / webTotal) * 100 : 0 }))
        .sort((a, b) => b.revenue - a.revenue),
      total: webTotal,
    };
  }, [nhanhRevenue]);

  // Ads by date for chart
  const adsByDate = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of ads) {
      const d = String(a.date).substring(0, 10);
      m.set(d, (m.get(d) || 0) + toNum(a.spend));
    }
    return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [ads]);

  // Revenue by date for chart
  const nhanhByDate = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of nhanhRevenue) {
      if (!isWebSource(r.source)) continue;
      m.set(r.date, (m.get(r.date) || 0) + r.revenue);
    }
    return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [nhanhRevenue]);

  // Merge daily data
  const allDates = useMemo(() => {
    const s = new Set<string>();
    adsByDate.forEach(([d]) => s.add(d));
    nhanhByDate.forEach(([d]) => s.add(d));
    return Array.from(s).sort();
  }, [adsByDate, nhanhByDate]);

  const adsMap = new Map(adsByDate);
  const nhanhMap = new Map(nhanhByDate);
  const maxAds = Math.max(...adsByDate.map(([, v]) => v), 1);
  const maxRev = Math.max(...nhanhByDate.map(([, v]) => v), 1);
  const labelStep = Math.max(1, Math.ceil(allDates.length / 15));

  return (
    <section className="section">
      <AutoSyncToday onDone={() => router.refresh()} />
      {/* ═══ HEADER ═══ */}
      <div className="page-hdr">
        <div>
          <div className="page-title">
            <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 24, height: 24, borderRadius: "50%", background: BRAND, color: "#fff", fontSize: 12, fontWeight: 700, marginRight: 8, verticalAlign: "middle" }}>W</span>
            Web/App B2B
          </div>
          <div className="page-sub">{pages.length} pages · {from} → {to}</div>
        </div>
        <div className="row" style={{ gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          {QUICK_RANGES.map((r) => {
            const active = from === r.from && to === r.to;
            return (
              <button key={r.key} className="btn btn-ghost btn-xs" onClick={() => quickRange(r)}
                style={{ background: active ? BRAND : undefined, color: active ? "#fff" : undefined }}>
                {r.label}
              </button>
            );
          })}
          <input type="date" value={f} onChange={(e) => setF(e.target.value)} style={{ fontSize: 12, width: 130 }} />
          <span className="muted">→</span>
          <input type="date" value={t} onChange={(e) => setT(e.target.value)} style={{ fontSize: 12, width: 130 }} />
          <button className="btn btn-primary btn-xs" onClick={apply}>Áp dụng</button>
        </div>
      </div>

      {/* ═══ TARGET PROGRESS ═══ */}
      <TargetProgressBar channel="Web/App B2B" monthTarget={monthTarget} monthActual={monthActual} monthKey={monthKey} color={BRAND} />

      {/* ═══ 6 KPI CARDS ═══ */}
      {(() => {
        const webOrders = bySource.sources.reduce((s, src) => s + src.orders, 0);
        const fromDate = new Date(from + "T00:00:00");
        const toDate = new Date(to + "T00:00:00");
        const dayCount = Math.max(1, Math.round((toDate.getTime() - fromDate.getTime()) / 86400000) + 1);
        const avgOrdersPerDay = webOrders / dayCount;
        return (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 8, marginBottom: 12 }}>
            <div style={{ padding: "10px 14px", borderRadius: 8, background: "#F0FDF4", border: "1px solid #BBF7D0" }}>
              <div style={{ fontSize: 9, fontWeight: 600, color: "#166534", letterSpacing: ".3px" }}>DT THANH CONG</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#166534", margin: "2px 0" }}>{formatVNDCompact(bySource.total)}</div>
              <div style={{ fontSize: 9, color: "#166534", opacity: 0.7 }}>don giao xong</div>
            </div>
            <div style={{ padding: "10px 14px", borderRadius: 8, background: "#FFFBEB", border: "1px solid #FDE68A" }}>
              <div style={{ fontSize: 9, fontWeight: 600, color: "#92400E", letterSpacing: ".3px" }}>DT DU KIEN</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#92400E", margin: "2px 0" }}>{formatVNDCompact(nhanhTotals.revenue)}</div>
              <div style={{ fontSize: 9, color: "#92400E", opacity: 0.7 }}>tong Nhanh.vn</div>
            </div>
            <div style={{ padding: "10px 14px", borderRadius: 8, background: "#fff", border: "1px solid #E5E7EB" }}>
              <div style={{ fontSize: 9, fontWeight: 600, color: "#374151", letterSpacing: ".3px" }}>SO DON</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#374151", margin: "2px 0" }}>{webOrders.toLocaleString("vi-VN")}</div>
              <div style={{ fontSize: 9, color: "#6B7280" }}>don thanh cong</div>
            </div>
            <div style={{ padding: "10px 14px", borderRadius: 8, background: "#fff", border: "1px solid #E5E7EB" }}>
              <div style={{ fontSize: 9, fontWeight: 600, color: "#374151", letterSpacing: ".3px" }}>TB DON/NGAY</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#374151", margin: "2px 0" }}>{avgOrdersPerDay.toFixed(1)}</div>
              <div style={{ fontSize: 9, color: "#6B7280" }}>{dayCount} ngay</div>
            </div>
            <div style={{ padding: "10px 14px", borderRadius: 8, background: summary.spend > 0 ? "#FEF2F2" : "#fff", border: summary.spend > 0 ? "1px solid #FECACA" : "1px solid #E5E7EB" }}>
              <div style={{ fontSize: 9, fontWeight: 600, color: summary.spend > 0 ? "#991B1B" : "#374151", letterSpacing: ".3px" }}>CHI PHI ADS</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: summary.spend > 0 ? "#991B1B" : "#9CA3AF", margin: "2px 0" }}>{summary.spend > 0 ? formatVNDCompact(summary.spend) : "---"}</div>
              <div style={{ fontSize: 9, color: summary.spend > 0 ? "#991B1B" : "#6B7280", opacity: 0.7 }}>{summary.spend > 0 ? `ROAS ${roas.toFixed(1)}x` : "Cho ket noi"}</div>
            </div>
            <div style={{ padding: "10px 14px", borderRadius: 8, background: "#fff", border: "1px solid #E5E7EB" }}>
              <div style={{ fontSize: 9, fontWeight: 600, color: "#374151", letterSpacing: ".3px" }}>NGUON</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#374151", margin: "2px 0" }}>{bySource.sources.length}</div>
              <div style={{ fontSize: 9, color: "#6B7280" }}>{bySource.sources.length > 0 ? bySource.sources[0].name : "---"}</div>
            </div>
          </div>
        );
      })()}

      {/* ═══ CHART ═══ */}
      {allDates.length > 0 && (
        <Collapsible title="Biểu đồ DT & Ads theo ngày" defaultOpen
          badge={<div style={{ display: "flex", gap: 10, fontSize: 10 }}>
            <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: BRAND, marginRight: 4 }} />DT</span>
            <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: "#1F2937", marginRight: 4, border: "1px solid #fff" }} />Ads</span>
          </div>}>
          <WebComboChart
            data={allDates.map((d) => ({ date: d, revenue: nhanhMap.get(d) || 0, spend: adsMap.get(d) || 0 }))}
            nhanhTotals={nhanhTotals}
            adsTotals={{ spend: summary.spend }}
            roas={roas}
          />
        </Collapsible>
      )}

      {/* ═══ PAGE CARDS ═══ */}
      <Collapsible title={`Facebook Pages (${pages.filter((p) => p.fb_page_id || p.ad_account_id).length})`} defaultOpen={false}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 10 }}>
          {pages.filter((p) => p.fb_page_id || p.ad_account_id).map((p) => (
            <WebPageCard key={p.page_id} page={p} ads={ads} insights={insights} nhanhRevenue={nhanhRevenue} from={from} to={to} />
          ))}
          {pages.length === 0 && (
            <div style={{ padding: 20, textAlign: "center", color: "#9CA3AF", gridColumn: "1/-1" }}>
              Chưa có page nào.
            </div>
          )}
        </div>
      </Collapsible>

      {/* ═══ KẾT QUẢ TÀI CHÍNH ═══ */}
      <Collapsible title="Kết quả tài chính" defaultOpen={false}
        badge={<span style={{ fontSize: 11, fontWeight: 600, color: "#16A34A" }}>{formatVNDCompact(bySource.total)}</span>}>
        {/* Doanh thu */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontWeight: 700, fontSize: 12 }}>
            <span>Doanh thu Web/App B2B</span>
            <span style={{ color: "#16A34A" }}>{formatVND(bySource.total)}</span>
          </div>
          {bySource.sources.map((s, i) => (
            <div key={s.name} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0 5px 8px", borderBottom: i < bySource.sources.length - 1 ? "1px solid #F9FAFB" : "none", fontSize: 12 }}>
              <span style={{ width: 160, flexShrink: 0, color: "#374151" }}>{s.name}</span>
              <div style={{ flex: 1, height: 6, background: "#F3F4F6", borderRadius: 3, overflow: "hidden" }}>
                <div style={{ width: `${Math.min(s.pct, 100)}%`, height: "100%", background: BRAND, borderRadius: 3, opacity: 0.7 }} />
              </div>
              <span style={{ fontWeight: 600, minWidth: 100, textAlign: "right", fontSize: 11 }}>{formatVND(s.revenue)}</span>
              <span style={{ fontSize: 10, color: "#9CA3AF", minWidth: 30, textAlign: "right" }}>{s.pct.toFixed(0)}%</span>
            </div>
          ))}
        </div>

        {/* Chi phí Ads */}
        <div style={{ borderTop: "1px solid #E5E7EB", paddingTop: 10, marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontWeight: 700, fontSize: 12 }}>
            <span>Chi phí Ads Facebook</span>
            <span style={{ color: "#DC2626" }}>{summary.spend > 0 ? formatVND(summary.spend) : "—"}</span>
          </div>
          {summary.spend > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 0, borderRadius: 6, overflow: "hidden", border: "1px solid #F3F4F6" }}>
              {[
                { label: "Impressions", value: summary.impressions.toLocaleString("vi-VN"), color: "#374151" },
                { label: "Clicks", value: summary.clicks.toLocaleString("vi-VN"), color: "#374151" },
                { label: "CPC", value: summary.clicks > 0 ? formatVND(Math.round(summary.spend / summary.clicks)) : "—", color: "#DC2626" },
                { label: "CTR", value: `${ctr.toFixed(2)}%`, color: "#16A34A" },
              ].map((m, i) => (
                <div key={m.label} style={{ padding: "6px 10px", borderRight: i < 3 ? "1px solid #F3F4F6" : "none", textAlign: "center" }}>
                  <div style={{ fontSize: 9, color: "#9CA3AF", textTransform: "uppercase", marginBottom: 1 }}>{m.label}</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: m.color }}>{m.value}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ROAS + Lợi nhuận gộp */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <div style={{ padding: "8px 12px", background: roas >= 5 ? "#F0FDF4" : "#FEF2F2", borderRadius: 6 }}>
            <div style={{ fontSize: 9, color: "#9CA3AF", textTransform: "uppercase", marginBottom: 1 }}>ROAS</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: roas >= 10 ? "#16A34A" : roas >= 5 ? "#D97706" : roas > 0 ? "#DC2626" : "#9CA3AF" }}>
              {roas > 0 ? `${roas.toFixed(1)}x` : "—"}
            </div>
          </div>
          <div style={{ padding: "8px 12px", background: bySource.total - summary.spend > 0 ? "#F0FDF4" : "#FEF2F2", borderRadius: 6 }}>
            <div style={{ fontSize: 9, color: "#9CA3AF", textTransform: "uppercase", marginBottom: 1 }}>LỢI NHUẬN GỘP</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: bySource.total - summary.spend > 0 ? "#16A34A" : "#DC2626" }}>
              {summary.spend > 0 ? formatVNDCompact(bySource.total - summary.spend) : "—"}
            </div>
          </div>
        </div>
      </Collapsible>
    </section>
  );
}

/* ── Page Card (same pattern as FbPagesView) ── */
function WebPageCard({ page, ads, insights, nhanhRevenue, from, to }: {
  page: PageRow; ads: AdsRow[]; insights: InsightsRow[]; nhanhRevenue: FbNhanhRow[]; from: string; to: string;
}) {
  const pageName = (page.page_name || "").replace(/^WEB - /, "");

  // Insights for this page
  const pageInsights = useMemo(() => {
    const filtered = insights.filter((r) => r.page_id === page.fb_page_id || r.page_id === page.page_id);
    const totals = filtered.reduce(
      (a, r) => ({ new_fans: a.new_fans + toNum(r.new_fans), lost_fans: a.lost_fans + toNum(r.lost_fans), reach: a.reach + toNum(r.reach), impressions: a.impressions + toNum(r.impressions) }),
      { new_fans: 0, lost_fans: 0, reach: 0, impressions: 0 },
    );
    const days = new Set(filtered.map((r) => r.date)).size || 1;
    return { ...totals, net: totals.new_fans - totals.lost_fans, reachPerDay: Math.round(totals.reach / days), days };
  }, [insights, page]);

  // Ads for this page's ad account
  const pageAds = useMemo(() => {
    if (!page.ad_account_id) return { spend: 0, reach: 0, clicks: 0, impressions: 0, ctr: 0 };
    const filtered = ads.filter((a) => a.ad_account_id === page.ad_account_id);
    const totals = filtered.reduce(
      (a, r) => ({ spend: a.spend + toNum(r.spend), reach: a.reach + toNum(r.reach), clicks: a.clicks + toNum(r.clicks), impressions: a.impressions + toNum(r.impressions) }),
      { spend: 0, reach: 0, clicks: 0, impressions: 0 },
    );
    return { ...totals, ctr: totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0 };
  }, [ads, page]);

  // Nhanh revenue for this page's linked sources
  const pageNhanh = useMemo(() => {
    if (!page.nhanh_id) return { revenue: 0, orders: 0, daily: [] as number[] };
    // nhanh_id can be comma-separated for multiple sources
    const nhanhIds = page.nhanh_id.split(",").map((s) => s.trim());
    const filtered = nhanhRevenue.filter((r) => nhanhIds.includes(r.source));
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

  const cpc = pageAds.clicks > 0 ? pageAds.spend / pageAds.clicks : 0;

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "10px 12px", background: BRAND, color: "#fff", display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ width: 28, height: 28, borderRadius: "50%", background: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, flexShrink: 0 }}>f</div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 13 }}>{pageName}</div>
        </div>
      </div>

      {/* Insights */}
      <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", marginBottom: 4 }}>INSIGHTS</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 12px", fontSize: 11 }}>
          <div>FOLLOWERS MỚI <strong style={{ color: "var(--green)" }}>+{pageInsights.new_fans.toLocaleString("vi-VN")}</strong></div>
          <div>UNFOLLOW <strong style={{ color: "var(--red)" }}>-{pageInsights.lost_fans.toLocaleString("vi-VN")}</strong></div>
          <div>TĂNG RÒNG <strong style={{ color: pageInsights.net >= 0 ? "var(--green)" : "var(--red)" }}>{pageInsights.net >= 0 ? "+" : ""}{pageInsights.net.toLocaleString("vi-VN")}</strong></div>
          <div>REACH/NGÀY <strong style={{ color: "var(--blue)" }}>{pageInsights.reachPerDay.toLocaleString("vi-VN")}</strong></div>
          <div>ENGAGEMENT <strong style={{ color: "var(--green)" }}>{pageInsights.impressions.toLocaleString("vi-VN")}</strong></div>
        </div>
        {/* Mini chart */}
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

      {/* Facebook Ads */}
      {page.ad_account_id && (
        <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)" }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", marginBottom: 4 }}>FACEBOOK ADS</div>
          <div className="muted" style={{ fontSize: 10, marginBottom: 4 }}>{page.ad_account_id}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 12px", fontSize: 11 }}>
            <div>CHI TIÊU <strong style={{ color: "var(--red)" }}>{formatVNDCompact(pageAds.spend)}</strong></div>
            <div>IMPRESSIONS <strong style={{ color: "var(--blue)" }}>{pageAds.impressions.toLocaleString("vi-VN")}</strong></div>
            <div>CLICKS <strong>{pageAds.clicks.toLocaleString("vi-VN")}</strong></div>
            <div>CPC <strong style={{ color: "var(--red)" }}>{cpc > 0 ? formatVNDCompact(cpc) : "—"}</strong></div>
          </div>
        </div>
      )}

      {/* Revenue */}
      {page.nhanh_id && (
        <div style={{ padding: "8px 12px" }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", marginBottom: 4 }}>DOANH THU</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 12px", fontSize: 11 }}>
            <div>ĐƠN <strong>{pageNhanh.orders.toLocaleString("vi-VN")}</strong></div>
            <div>DT THUẦN <strong style={{ color: "var(--green)" }}>{formatVNDCompact(pageNhanh.revenue)}</strong></div>
          </div>
          {pageAds.spend > 0 && pageNhanh.revenue > 0 && (
            <div style={{ fontSize: 11, fontWeight: 700, marginTop: 4, color: "var(--green)" }}>
              ROAS {(pageNhanh.revenue / pageAds.spend).toFixed(1)}x
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── ComboChart: bars (DT) + line (Ads) + hover tooltip ── */
function WebComboChart({ data, nhanhTotals, adsTotals, roas }: {
  data: Array<{ date: string; revenue: number; spend: number }>;
  nhanhTotals: { revenue: number; orders: number };
  adsTotals: { spend: number };
  roas: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const maxRev = Math.max(...data.map((d) => d.revenue), 1);
  const maxSpend = Math.max(...data.map((d) => d.spend), 1);
  const BAR_H = 180;
  const chartH = BAR_H - 10;
  const today = new Date().toISOString().substring(0, 10);
  const labelStep = Math.max(1, Math.ceil(data.length / 15));
  const adsMaxH = chartH * 0.75;

  return (
    <div>
      <div style={{ position: "relative", height: BAR_H }}>
        {/* Bars — revenue */}
        <div style={{ display: "flex", alignItems: "flex-end", height: BAR_H, position: "relative", zIndex: 1, padding: "0 4px" }}>
          {data.map((d, i) => {
            const h = maxRev > 0 ? (d.revenue / maxRev) * chartH : 0;
            const isFuture = d.date > today;
            return (
              <div key={d.date} style={{ flex: 1, minWidth: 0, padding: "0 1px" }}>
                <div style={{
                  width: "100%",
                  height: d.revenue > 0 ? Math.max(h, 4) : isFuture ? chartH * 0.08 : chartH * 0.03,
                  background: hover === i
                    ? "#4338CA"
                    : isFuture ? "rgba(99,102,241,0.08)" : d.revenue > 0 ? BRAND : "rgba(99,102,241,0.12)",
                  borderRadius: "3px 3px 0 0",
                  transition: "background 0.1s",
                }} />
              </div>
            );
          })}
        </div>

        {/* Invisible hover zones */}
        <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: BAR_H, display: "flex", zIndex: 4, padding: "0 4px" }}>
          {data.map((_, i) => (
            <div key={i}
              onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
              style={{ flex: 1, cursor: "default" }} />
          ))}
        </div>

        {/* Line overlay — ads spend */}
        <svg style={{ position: "absolute", top: 0, left: 0, width: "100%", height: BAR_H, pointerEvents: "none", zIndex: 2 }}
          viewBox={`0 0 ${data.length * 100} ${BAR_H}`} preserveAspectRatio="none">
          {(() => {
            const pts = data.map((d, i) => ({
              x: i * 100 + 50,
              y: BAR_H - (maxSpend > 0 ? (d.spend / maxSpend) * adsMaxH : 0) - 5,
              val: d.spend,
            }));
            const validPts = pts.filter((p) => p.val > 0);
            if (validPts.length < 2) return null;
            return (
              <g>
                <path d={validPts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ")}
                  fill="none" stroke="#1F2937" strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
                {validPts.map((p, i) => (
                  <circle key={i} cx={p.x} cy={p.y} r={3.5} fill="#1F2937" stroke="#fff" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
                ))}
              </g>
            );
          })()}
        </svg>

        {/* Tooltip */}
        {hover !== null && data[hover] && (
          <div style={{
            position: "absolute",
            left: `${((hover + 0.5) / data.length) * 100}%`,
            top: 8, transform: "translateX(-50%)",
            background: "#1F2937", color: "#fff", borderRadius: 6, padding: "8px 12px",
            fontSize: 11, pointerEvents: "none", zIndex: 50, whiteSpace: "nowrap",
            boxShadow: "0 4px 12px rgba(0,0,0,.3)",
          }}>
            <div style={{ fontWeight: 700, color: "#D1D5DB", marginBottom: 4 }}>{data[hover].date}</div>
            <div style={{ display: "flex", gap: 6, alignItems: "center", lineHeight: 1.6 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: BRAND }} />
              <span style={{ color: "#9CA3AF" }}>Doanh thu:</span>
              <span style={{ fontWeight: 700 }}>{formatVNDCompact(data[hover].revenue)}</span>
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center", lineHeight: 1.6 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: "#1F2937", border: "1px solid #fff" }} />
              <span style={{ color: "#9CA3AF" }}>Chi phí ads:</span>
              <span style={{ fontWeight: 700 }}>{formatVNDCompact(data[hover].spend)}</span>
            </div>
            {data[hover].spend > 0 && data[hover].revenue > 0 && (
              <div style={{ display: "flex", gap: 6, alignItems: "center", lineHeight: 1.6 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: "#F59E0B" }} />
                <span style={{ color: "#9CA3AF" }}>ROAS:</span>
                <span style={{ fontWeight: 700 }}>{(data[hover].revenue / data[hover].spend).toFixed(1)}x</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Date labels */}
      <div style={{ display: "flex", padding: "0 4px", borderTop: "1px solid #E5E7EB" }}>
        {data.map((d, i) => (
          <div key={d.date} style={{
            flex: 1, textAlign: "center", fontSize: 10, padding: "5px 0", minWidth: 0,
            color: hover === i ? BRAND : d.date > today ? "#EF4444" : "#6B7280",
            fontWeight: hover === i || d.date > today ? 600 : 400,
          }}>
            {i % labelStep === 0 ? d.date.substring(8) : ""}
          </div>
        ))}
      </div>

      {/* Summary footer */}
      <div style={{ display: "flex", gap: 1, marginTop: 8, borderRadius: 8, overflow: "hidden", fontSize: 11 }}>
        <div style={{ flex: 1, padding: "10px 14px", background: "#F0FDF4" }}>
          <div style={{ color: "#6B7280", fontSize: 9, marginBottom: 2 }}>Doanh thu</div>
          <div style={{ fontWeight: 800, color: "#16A34A", fontSize: 15 }}>{formatVNDCompact(nhanhTotals.revenue)}</div>
        </div>
        <div style={{ flex: 1, padding: "10px 14px", background: "#FEF2F2" }}>
          <div style={{ color: "#6B7280", fontSize: 9, marginBottom: 2 }}>Chi phí Ads</div>
          <div style={{ fontWeight: 800, color: "#DC2626", fontSize: 15 }}>{formatVNDCompact(adsTotals.spend)}</div>
        </div>
        <div style={{ flex: 1, padding: "10px 14px", background: "#F9FAFB" }}>
          <div style={{ color: "#6B7280", fontSize: 9, marginBottom: 2 }}>Ads/DT</div>
          <div style={{ fontWeight: 800, color: "#D97706", fontSize: 15 }}>{nhanhTotals.revenue > 0 ? ((adsTotals.spend / nhanhTotals.revenue) * 100).toFixed(1) : 0}%</div>
        </div>
        <div style={{ flex: 1, padding: "10px 14px", background: roas >= 5 ? "#F0FDF4" : "#FEF2F2" }}>
          <div style={{ color: "#6B7280", fontSize: 9, marginBottom: 2 }}>ROAS</div>
          <div style={{ fontWeight: 800, color: roas >= 5 ? "#16A34A" : "#DC2626", fontSize: 15 }}>{roas > 0 ? `${roas.toFixed(1)}x` : "—"}</div>
        </div>
        <div style={{ flex: 1, padding: "10px 14px", background: "#F9FAFB" }}>
          <div style={{ color: "#6B7280", fontSize: 9, marginBottom: 2 }}>Đơn hàng</div>
          <div style={{ fontWeight: 800, fontSize: 15 }}>{nhanhTotals.orders.toLocaleString("vi-VN")}</div>
        </div>
      </div>
    </div>
  );
}
