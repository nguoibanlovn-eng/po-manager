"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { formatDate, formatVND, formatVNDCompact, toNum } from "@/lib/format";
import type { AdsRow, FbNhanhRow, InsightsRow, PageRow } from "@/lib/db/ads";
import SyncButton from "../components/SyncButton";

type Summary = { spend: number; impressions: number; clicks: number; reach: number; purchase_value: number };

function daysAgo(d: number): string { const dt = new Date(); dt.setDate(dt.getDate() + d); return dt.toISOString().substring(0, 10); }
function monthRange(offset: number) {
  const now = new Date(); const y = now.getFullYear(); const m = now.getMonth() + offset;
  const first = new Date(y, m, 1); const last = offset === 0 ? now : new Date(y, m + 1, 0);
  return { from: first.toISOString().substring(0, 10), to: last.toISOString().substring(0, 10) };
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
  pages, ads, insights, summary, prevAds = [], prevSummary, nhanhRevenue = [], from, to,
  monthTarget = 0, monthActual = 0, monthKey = "",
}: {
  pages: PageRow[]; ads: AdsRow[]; insights: InsightsRow[]; summary: Summary;
  prevAds?: AdsRow[]; prevSummary?: Summary;
  nhanhRevenue?: FbNhanhRow[];
  from: string; to: string;
  monthTarget?: number; monthActual?: number; monthKey?: string;
}) {
  const router = useRouter();
  const [f, setF] = useState(from);
  const [t, setT] = useState(to);
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

  // ── Ads by account ──
  const adsByAccount = useMemo(() => {
    const m = new Map<string, { name: string; spend: number; impressions: number; clicks: number; purchase_value: number; reach: number }>();
    for (const a of ads) {
      const k = a.ad_account_id || "—";
      const cur = m.get(k) || { name: a.account_name || k, spend: 0, impressions: 0, clicks: 0, purchase_value: 0, reach: 0 };
      cur.spend += toNum(a.spend); cur.impressions += toNum(a.impressions); cur.clicks += toNum(a.clicks);
      cur.purchase_value += toNum(a.purchase_value); cur.reach += toNum(a.reach);
      if (a.account_name) cur.name = a.account_name;
      m.set(k, cur);
    }
    return Array.from(m.entries()).map(([id, r]) => ({ id, ...r })).sort((a, b) => b.spend - a.spend);
  }, [ads]);

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

  // ── Target progress ──
  const targetPct = monthTarget > 0 ? Math.round((monthActual / monthTarget) * 100) : 0;

  return (
    <section className="section">
      {/* ═══ HEADER ═══ */}
      <div className="page-hdr">
        <div>
          <div className="page-title">Facebook Pages</div>
          <div className="page-sub">{pages.length} pages · {from} → {to}</div>
          {monthTarget > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: targetPct >= 100 ? "var(--green)" : "var(--amber)" }}>
                {targetPct}% KH · {formatVNDCompact(monthActual)} / {formatVNDCompact(monthTarget)}
              </div>
              <div style={{ flex: 1, maxWidth: 200, height: 4, background: "#E5E7EB", borderRadius: 2, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${Math.min(targetPct, 100)}%`, background: targetPct >= 100 ? "var(--green)" : targetPct >= 50 ? "var(--blue)" : "var(--red)", borderRadius: 2, transition: "width .3s" }} />
              </div>
            </div>
          )}
        </div>
        <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
          <SyncButton url="/api/fb/sync-ads" label="Sync Ads" onDone={() => router.refresh()} />
          <SyncButton url="/api/fb/sync-insights" label="Sync Insights" onDone={() => router.refresh()} />
          <SyncButton url="/api/nhanh/sync-sales" label="Sync Nhanh" onDone={() => router.refresh()} />
          <button className="btn btn-ghost btn-xs" onClick={() => router.refresh()}>Tải lại</button>
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

        <div className="stat-card c-green"><div className="sl">DOANH THU</div><div className="sv">{formatVNDCompact(nhanhTotals.revenue)}</div><div className="muted" style={{ fontSize: 10 }}>nhanh.vn</div></div>
        <div className="stat-card c-red"><div className="sl">CHI PHÍ ADS</div><div className="sv">{formatVNDCompact(summary.spend)}</div></div>
        <div className="stat-card" style={{ borderLeft: roas >= 10 ? "3px solid var(--green)" : "3px solid var(--red)" }}><div className="sl">ROAS</div><div className="sv" style={{ color: roas >= 10 ? "var(--green)" : "var(--red)" }}>{roas.toFixed(1)}x</div><div className="muted" style={{ fontSize: 10 }}>doanh thu/ads</div></div>
        <div className="stat-card"><div className="sl">CHI PHÍ/FOLLOW</div><div className="sv">{costPerFollow > 0 ? formatVNDCompact(costPerFollow) : "—"}</div><div className="muted" style={{ fontSize: 10 }}>spend÷tăng ròng</div></div>
        <div className="stat-card"><div className="sl">CTR TB</div><div className="sv">{ctr.toFixed(2)}%</div><div className="muted" style={{ fontSize: 10 }}>weighted avg</div></div>
      </div>

      {/* ═══ CHI PHÍ ADS THEO NGÀY ═══ */}
      <AdsSection ads={ads} adsByDate={adsByDate} summary={summary} prevAds={prevAds} prevSummary={prevSummary} from={from} to={to} />

      {/* ═══ DOANH THU NHANH.VN THEO NGÀY ═══ */}
      {nhanhByDate.length > 0 && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
            <span style={{ fontWeight: 700 }}>DOANH THU NHANH.VN THEO NGÀY</span>
            <div style={{ display: "flex", gap: 12, fontSize: 11 }}>
              <span>Tổng: <strong style={{ color: "var(--green)" }}>{formatVNDCompact(nhanhTotals.revenue)}</strong></span>
              <span>{nhanhTotals.orders.toLocaleString("vi-VN")} đơn</span>
            </div>
          </div>
          <RevenueBarChart data={nhanhByDate} />
        </div>
      )}

      {/* ═══ SO SÁNH DOANH THU THEO NGÀY ═══ */}
      {dailyComparison.length > 0 && (
        <div className="card" style={{ marginBottom: 14, padding: 0 }}>
          <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--border)", fontWeight: 700 }}>
            SO SÁNH DOANH THU THEO NGÀY
            <span className="muted" style={{ fontWeight: 400, fontSize: 11, marginLeft: 8 }}>
              ROAS: <span style={{ color: "var(--red)" }}>● &lt;10</span> <span style={{ color: "var(--amber)" }}>● 10-12</span> <span style={{ color: "var(--green)" }}>● &gt;12</span>
            </span>
          </div>
          <div className="tbl-wrap">
            <table>
              <thead><tr><th>NGÀY</th><th className="text-right">DT NHANH.VN</th><th className="text-right">SPEND</th><th className="text-right">ROAS</th><th className="text-right">ĐƠN</th></tr></thead>
              <tbody>
                {dailyComparison.map((d) => (
                  <tr key={d.date}>
                    <td style={{ fontWeight: 600 }}>{d.date.substring(5)}</td>
                    <td className="text-right" style={{ color: "var(--green)" }}>{formatVNDCompact(d.revenue)}</td>
                    <td className="text-right" style={{ color: "var(--red)" }}>{formatVNDCompact(d.spend)}</td>
                    <td className="text-right font-bold" style={{ color: d.roas >= 12 ? "var(--green)" : d.roas >= 10 ? "var(--amber)" : d.roas > 0 ? "var(--red)" : "var(--muted)" }}>
                      {d.spend > 0 ? d.roas.toFixed(1) : "—"}
                    </td>
                    <td className="text-right muted">{d.orders}</td>
                  </tr>
                ))}
                <tr style={{ fontWeight: 700, background: "#1a1a1a", color: "#fff" }}>
                  <td>Tổng kỳ</td>
                  <td className="text-right">{formatVNDCompact(nhanhTotals.revenue)}</td>
                  <td className="text-right">{formatVNDCompact(summary.spend)}</td>
                  <td className="text-right">{roas.toFixed(1)}</td>
                  <td className="text-right">{nhanhTotals.orders}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══ CHI TIẾT THEO KÊNH ═══ */}
      {nhanhBySource.length > 0 && (
        <ChannelDetail nhanhRevenue={nhanhRevenue} nhanhBySource={nhanhBySource} nhanhTotal={nhanhTotals.revenue} />
      )}

      {/* ═══ CHI TIÊU THEO TÀI KHOẢN ADS ═══ */}
      <div className="card" style={{ marginBottom: 14, padding: 0 }}>
        <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--border)", fontWeight: 700 }}>
          CHI TIÊU THEO TÀI KHOẢN ADS · {adsByAccount.length} tài khoản
        </div>
        <div className="tbl-wrap">
          <table>
            <thead><tr><th>Tài khoản</th><th className="text-right">Spend</th><th className="text-right">Impressions</th><th className="text-right">Clicks</th><th className="text-right">Reach</th><th className="text-right">ROAS</th></tr></thead>
            <tbody>
              {adsByAccount.map((r) => (
                <tr key={r.id}>
                  <td><div style={{ fontWeight: 600 }}>{r.name}</div><div className="muted" style={{ fontSize: 10 }}>{r.id}</div></td>
                  <td className="text-right font-bold" style={{ color: "var(--red)" }}>{formatVND(r.spend)}</td>
                  <td className="text-right muted">{r.impressions.toLocaleString("vi-VN")}</td>
                  <td className="text-right muted">{r.clicks.toLocaleString("vi-VN")}</td>
                  <td className="text-right muted">{r.reach.toLocaleString("vi-VN")}</td>
                  <td className="text-right font-bold" style={{ color: r.spend > 0 && r.purchase_value / r.spend >= 1 ? "var(--green)" : "var(--red)" }}>
                    {r.spend > 0 ? (r.purchase_value / r.spend).toFixed(2) + "x" : "—"}
                  </td>
                </tr>
              ))}
              {adsByAccount.length === 0 && <tr><td colSpan={6} className="muted" style={{ textAlign: "center", padding: 24 }}>Không có data ads.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* ═══ PAGE CARDS ═══ */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 10 }}>
        {filteredPages.filter((p) => p.nhanh_id || p.ad_account_id).map((p) => (
          <PageCard key={p.page_id} page={p} ads={ads} insights={insights} nhanhRevenue={nhanhRevenue} from={from} to={to} />
        ))}
      </div>
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
    <div className="card" style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={{ fontWeight: 700, fontSize: 13 }}>CHI PHÍ ADS THEO NGÀY</span>
        {prevMonth && <span className="muted" style={{ fontSize: 10 }}>— Tháng {prevMonth}</span>}
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
  if (current.length === 0) return <div className="muted" style={{ padding: 20, textAlign: "center" }}>Không có data.</div>;

  // Build prev lookup by day-of-month so line aligns with bars
  const prevByDay = useMemo(() => {
    const m = new Map<number, number>();
    for (const [d, v] of prev) {
      const day = new Date(d).getDate();
      m.set(day, (m.get(day) || 0) + v);
    }
    return m;
  }, [prev]);

  // For each current bar, find matching prev value by same day-of-month
  const merged = current.map(([d, v]) => {
    const day = new Date(d).getDate();
    return { date: d, val: v, prevVal: prevByDay.get(day) ?? null };
  });

  const allVals = [...merged.map((m) => m.val), ...merged.filter((m) => m.prevVal !== null).map((m) => m.prevVal!)];
  const max = Math.max(...allVals, 1);
  const W = 700, H = 160, PL = 10, PR = 10, PT = 20, PB = 40;
  const chartW = W - PL - PR, chartH = H - PT - PB;
  const barW = merged.length > 0 ? chartW / merged.length : chartW;

  function xBar(i: number) { return PL + i * barW; }
  function y(v: number) { return PT + chartH - (v / max) * chartH; }

  // Build line points only for days that have prev data
  const linePoints = merged
    .map((m, i) => m.prevVal !== null ? { x: xBar(i) + barW / 2, y: y(m.prevVal!), val: m.prevVal! } : null)
    .filter(Boolean) as { x: number; y: number; val: number }[];

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: 160 }}>
        {/* Bars — current period */}
        {merged.map((m, i) => {
          const bx = xBar(i) + barW * 0.1;
          const bw = barW * 0.8;
          return (
            <g key={m.date}>
              <rect x={bx} y={y(m.val)} width={bw} height={(m.val / max) * chartH} fill="#86EFAC" rx={2} />
              <text x={bx + bw / 2} y={y(m.val) - 4} textAnchor="middle" fill="var(--text)" fontSize={8} fontWeight={600}>
                {formatVNDCompact(m.val)}
              </text>
              <text x={bx + bw / 2} y={H - PB + 12} textAnchor="middle" fill="#999" fontSize={8}>
                {m.date.substring(5)}
              </text>
            </g>
          );
        })}

        {/* Line — previous period overlay (aligned by day-of-month) */}
        {linePoints.length > 1 && (
          <g>
            <path
              d={linePoints.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ")}
              fill="none" stroke="var(--blue)" strokeWidth={1.5} strokeDasharray="4 3" opacity={0.6}
            />
            {linePoints.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r={3} fill="var(--blue)" opacity={0.7} />
            ))}
          </g>
        )}
      </svg>

      {/* % change row */}
      <div style={{ display: "flex", gap: 0 }}>
        {merged.map((m, i) => {
          const prevDay = i > 0 ? merged[i - 1].val : m.val;
          const pct = prevDay > 0 ? Math.round(((m.val - prevDay) / prevDay) * 100) : 0;
          return (
            <div key={m.date} style={{
              flex: 1, textAlign: "center", fontSize: 9, fontWeight: 600, padding: "3px 0",
              background: pct > 0 ? "#F0FDF4" : pct < 0 ? "#FEF2F2" : "#FAFAFA",
              color: pct > 0 ? "var(--green)" : pct < 0 ? "var(--red)" : "var(--muted)",
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
    if (!page.ad_account_id) return { spend: 0, reach: 0, clicks: 0, ctr: 0 };
    const filtered = ads.filter((a) => a.ad_account_id === page.ad_account_id);
    const totals = filtered.reduce(
      (a, r) => ({ spend: a.spend + toNum(r.spend), reach: a.reach + toNum(r.reach), clicks: a.clicks + toNum(r.clicks), impressions: a.impressions + toNum(r.impressions) }),
      { spend: 0, reach: 0, clicks: 0, impressions: 0 },
    );
    return { ...totals, ctr: totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0 };
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
          <div className="muted" style={{ fontSize: 10, marginBottom: 4 }}>{page.ad_account_id}</div>
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


/* ── Bar chart: Revenue per day ── */
function RevenueBarChart({ data }: { data: [string, number][] }) {
  if (data.length === 0) return <div className="muted" style={{ padding: 24, textAlign: "center" }}>Không có data.</div>;
  const max = Math.max(...data.map(([, v]) => v));
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 170, paddingTop: 16 }}>
      {data.map(([d, v]) => {
        const h = max > 0 ? (v / max) * 110 : 0;
        return (
          <div key={d} style={{ flex: 1, minWidth: 28, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }} title={`${d}: ${formatVND(v)}`}>
            <div style={{ fontSize: 10, color: "var(--muted)", whiteSpace: "nowrap" }}>{formatVNDCompact(v)}</div>
            <div style={{ width: "70%", height: h, background: "#60A5FA", borderRadius: "2px 2px 0 0", minWidth: 12 }} />
            <div style={{ fontSize: 10, color: "var(--subtle)" }}>{d.substring(5)}</div>
          </div>
        );
      })}
    </div>
  );
}
