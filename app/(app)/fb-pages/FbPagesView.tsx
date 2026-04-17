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
  pages, ads, insights, summary, nhanhRevenue = [], from, to,
  monthTarget = 0, monthActual = 0, monthKey = "",
}: {
  pages: PageRow[]; ads: AdsRow[]; insights: InsightsRow[]; summary: Summary;
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
      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
          <span style={{ fontWeight: 700 }}>CHI PHÍ ADS THEO NGÀY</span>
          <div style={{ display: "flex", gap: 12, fontSize: 11 }}>
            <span>Tổng chi: <strong style={{ color: "var(--red)" }}>{formatVNDCompact(summary.spend)}</strong></span>
            <span>TB/ngày: <strong>{formatVNDCompact(adsByDate.length > 0 ? summary.spend / adsByDate.length : 0)}</strong></span>
            {adsByDate.length > 0 && <span>Cao nhất: <strong>{formatVNDCompact(Math.max(...adsByDate.map(([, v]) => v)))}</strong></span>}
          </div>
        </div>
        <AdsBarChart data={adsByDate} />
      </div>

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

      {/* ═══ CHI TIẾT THEO KÊNH NHANH.VN ═══ */}
      {nhanhBySource.length > 0 && (
        <div className="card" style={{ marginBottom: 14, padding: 0 }}>
          <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--border)", fontWeight: 700 }}>
            CHI TIẾT THEO KÊNH · {nhanhBySource.length} kênh
          </div>
          <div className="tbl-wrap">
            <table>
              <thead><tr><th>Kênh Facebook</th><th className="text-right">Doanh thu</th><th className="text-right">Đơn</th><th className="text-right">TB/đơn</th></tr></thead>
              <tbody>
                {nhanhBySource.map((s) => (
                  <tr key={s.name}>
                    <td style={{ fontWeight: 600 }}>● {s.name}</td>
                    <td className="text-right" style={{ color: "var(--green)" }}>{formatVNDCompact(s.revenue)}</td>
                    <td className="text-right">{s.orders}</td>
                    <td className="text-right muted">{formatVNDCompact(s.orders > 0 ? s.revenue / s.orders : 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
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

      {/* ═══ FB PAGES ═══ */}
      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--border)", fontWeight: 700 }}>
          FB PAGES · {filteredPages.length} pages
        </div>
        <div className="tbl-wrap">
          <table>
            <thead><tr><th>Page</th><th>Nhân sự</th><th>FB Page ID</th><th>Ad Account</th><th>Sync</th></tr></thead>
            <tbody>
              {filteredPages.map((p) => (
                <tr key={p.page_id}>
                  <td style={{ fontWeight: 600 }}>{p.page_name || "—"}</td>
                  <td className="muted" style={{ fontSize: 12 }}>{p.assigned_name || p.assigned_email || "—"}</td>
                  <td className="muted" style={{ fontSize: 10, fontFamily: "monospace" }}>{p.fb_page_id || "—"}</td>
                  <td className="muted" style={{ fontSize: 10, fontFamily: "monospace" }}>{p.ad_account_id || "—"}</td>
                  <td className="muted" style={{ fontSize: 11 }}>{formatDate(p.last_sync)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

/* ── Bar chart: Ads spend per day ── */
function AdsBarChart({ data }: { data: [string, number][] }) {
  if (data.length === 0) return <div className="muted" style={{ padding: 24, textAlign: "center" }}>Không có data.</div>;
  const max = Math.max(...data.map(([, v]) => v));
  // Calculate daily % change
  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 170, paddingTop: 16 }}>
        {data.map(([d, v], i) => {
          const h = max > 0 ? (v / max) * 110 : 0;
          const prev = i > 0 ? data[i - 1][1] : v;
          const pctChange = prev > 0 ? Math.round(((v - prev) / prev) * 100) : 0;
          return (
            <div key={d} style={{ flex: 1, minWidth: 28, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }} title={`${d}: ${formatVND(v)}`}>
              <div style={{ fontSize: 10, color: "var(--muted)", whiteSpace: "nowrap" }}>{formatVNDCompact(v)}</div>
              <div style={{ width: "70%", height: h, background: "#86EFAC", borderRadius: "2px 2px 0 0", minWidth: 12 }} />
              <div style={{ fontSize: 10, color: "var(--subtle)" }}>{d.substring(5)}</div>
            </div>
          );
        })}
      </div>
      {/* % change row */}
      <div style={{ display: "flex", gap: 2, marginTop: 2 }}>
        {data.map(([d, v], i) => {
          const prev = i > 0 ? data[i - 1][1] : v;
          const pct = prev > 0 ? Math.round(((v - prev) / prev) * 100) : 0;
          return (
            <div key={d} style={{ flex: 1, textAlign: "center", fontSize: 9, fontWeight: 600, color: pct > 0 ? "var(--green)" : pct < 0 ? "var(--red)" : "var(--muted)" }}>
              {i === 0 ? "" : pct > 0 ? `+${pct}%` : `${pct}%`}
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
