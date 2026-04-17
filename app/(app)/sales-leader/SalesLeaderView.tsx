"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { formatDate, formatVND, formatVNDCompact, toNum } from "@/lib/format";
import type { TiktokAdsRow, TiktokChannelRow, TiktokNhanhRow, TiktokProductStat } from "@/lib/db/tiktok";
import SyncButton from "../components/SyncButton";

type Tab = "overview" | "ads" | "channel" | "shop" | "products";

const QUICK_RANGES = [
  { key: "today", label: "Hôm nay", days: 0 },
  { key: "yesterday", label: "Hôm qua", days: -1 },
  { key: "7d", label: "7N", days: -7 },
  { key: "14d", label: "14N", days: -14 },
  { key: "30d", label: "30N", days: -30 },
];

function daysAgo(d: number): string {
  const dt = new Date();
  dt.setDate(dt.getDate() + d);
  return dt.toISOString().substring(0, 10);
}

/* ═══════════════════════════════════════════════════════════
   MAIN VIEW
   ═══════════════════════════════════════════════════════════ */
export default function SalesLeaderView({
  ads, channels, productStats, shops = [], nhanhRevenue = [], from, to,
  monthTarget = 0, monthActual = 0, monthKey = "",
}: {
  ads: TiktokAdsRow[];
  channels: TiktokChannelRow[];
  productStats: TiktokProductStat[];
  shops?: string[];
  nhanhRevenue?: TiktokNhanhRow[];
  from: string;
  to: string;
  monthTarget?: number;
  monthActual?: number;
  monthKey?: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("overview");
  const [f, setF] = useState(from);
  const [t, setT] = useState(to);

  function apply() { router.push(`/sales-leader?from=${f}&to=${t}`); }
  function quickRange(days: number) {
    const newTo = days === -1 ? daysAgo(-1) : daysAgo(0);
    const newFrom = days === -1 ? daysAgo(-1) : daysAgo(days);
    router.push(`/sales-leader?from=${newFrom}&to=${newTo}`);
  }

  // ── Totals ──
  const adsTotals = useMemo(() => ads.reduce(
    (a, r) => ({ spend: a.spend + toNum(r.spend), impressions: a.impressions + toNum(r.impressions), clicks: a.clicks + toNum(r.clicks), conversions: a.conversions + toNum(r.conversions), conversion_value: a.conversion_value + toNum(r.conversion_value), reach: a.reach + toNum(r.reach) }),
    { spend: 0, impressions: 0, clicks: 0, conversions: 0, conversion_value: 0, reach: 0 },
  ), [ads]);

  const nhanhTotals = useMemo(() => nhanhRevenue.reduce(
    (a, r) => ({ revenue: a.revenue + r.revenue, orders: a.orders + r.orders }),
    { revenue: 0, orders: 0 },
  ), [nhanhRevenue]);

  const roas = adsTotals.spend > 0 ? nhanhTotals.revenue / adsTotals.spend : 0;

  return (
    <section className="section">
      {/* ═══ HEADER ═══ */}
      <div className="page-hdr">
        <div>
          <div className="page-title">TikTok Overview</div>
          <div className="page-sub">Ads · Kênh · Shop</div>
        </div>
        <div className="row" style={{ gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          {QUICK_RANGES.map((r) => (
            <button key={r.key} className="btn btn-ghost btn-xs" onClick={() => quickRange(r.days)}
              style={{ background: from === (r.days === -1 ? daysAgo(-1) : daysAgo(r.days)) ? "var(--blue)" : undefined, color: from === (r.days === -1 ? daysAgo(-1) : daysAgo(r.days)) ? "#fff" : undefined }}>
              {r.label}
            </button>
          ))}
          <input type="date" value={f} onChange={(e) => setF(e.target.value)} style={{ fontSize: 12, width: 130 }} />
          <span className="muted">→</span>
          <input type="date" value={t} onChange={(e) => setT(e.target.value)} style={{ fontSize: 12, width: 130 }} />
          <button className="btn btn-primary btn-xs" onClick={apply}>Áp dụng</button>
          <span style={{ width: 1, height: 20, background: "var(--border)" }} />
          <SyncButton url="/api/nhanh/sync-sales" label="NHANH.VN" onDone={() => router.refresh()} />
          <SyncButton url="/api/tiktok/sync-ads" label="Sync Ads" onDone={() => router.refresh()} />
        </div>
      </div>

      {/* ═══ MONTHLY TARGET PROGRESS ═══ */}
      {monthTarget > 0 && (
        <TargetProgress monthTarget={monthTarget} monthActual={monthActual} monthKey={monthKey} />
      )}

      {/* ═══ KPI CARDS ═══ */}
      <div className="stat-grid" style={{ gridTemplateColumns: "repeat(5, minmax(0, 1fr))" }}>
        <div className="stat-card c-green" style={{ borderLeft: "4px solid var(--green)" }}>
          <div className="sl">ROAS</div>
          <div className="sv" style={{ color: roas >= 10 ? "var(--green)" : roas >= 5 ? "var(--amber)" : "var(--red)" }}>{roas.toFixed(2)}x</div>
          <div className="muted" style={{ fontSize: 10 }}>GMV / Spend</div>
        </div>
        <div className="stat-card">
          <div className="sl">GMV TỔNG</div>
          <div className="sv">{formatVNDCompact(nhanhTotals.revenue)}</div>
          <div className="muted" style={{ fontSize: 10 }}>nhanh.vn</div>
        </div>
        <div className="stat-card c-red">
          <div className="sl">ADS SPEND</div>
          <div className="sv">{formatVNDCompact(adsTotals.spend)}</div>
          <div className="muted" style={{ fontSize: 10 }}>API</div>
        </div>
        <div className="stat-card">
          <div className="sl">SHOP GMV</div>
          <div className="sv">{formatVNDCompact(adsTotals.conversion_value)}</div>
          <div className="muted" style={{ fontSize: 10 }}>{shops.length} shop · API</div>
        </div>
        <div className="stat-card">
          <div className="sl">ĐƠN THÀNH CÔNG</div>
          <div className="sv">{nhanhTotals.orders.toLocaleString("vi-VN")}</div>
          <div className="muted" style={{ fontSize: 10 }}>Thành công</div>
        </div>
      </div>

      {/* ═══ TABS ═══ */}
      <div className="mini-tabs" style={{ marginBottom: 14 }}>
        {([["overview", "Tổng quan"], ["ads", "Ads"], ["channel", "Kênh"], ["shop", "Shop"], ["products", "Hàng hoá"]] as const).map(([k, v]) => (
          <button key={k} className={"mini-tab" + (tab === k ? " active" : "")} onClick={() => setTab(k)}>{v}</button>
        ))}
      </div>

      {tab === "overview" && <OverviewTab ads={ads} nhanhRevenue={nhanhRevenue} adsTotals={adsTotals} nhanhTotals={nhanhTotals} roas={roas} from={from} to={to} />}
      {tab === "ads" && <AdsTab ads={ads} />}
      {tab === "channel" && <ChannelTab channels={channels} />}
      {tab === "shop" && <ShopTab nhanhRevenue={nhanhRevenue} from={from} to={to} />}
      {tab === "products" && <ProductsTab products={productStats} />}
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════
   MONTHLY TARGET PROGRESS BAR
   ═══════════════════════════════════════════════════════════ */
function TargetProgress({ monthTarget, monthActual, monthKey }: { monthTarget: number; monthActual: number; monthKey: string }) {
  const pct = monthTarget > 0 ? Math.min((monthActual / monthTarget) * 100, 150) : 0;
  const pctDisplay = monthTarget > 0 ? Math.round((monthActual / monthTarget) * 100) : 0;
  const remaining = Math.max(0, monthTarget - monthActual);

  // Days progress in month
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const dayOfMonth = now.getDate();
  const dayPct = Math.round((dayOfMonth / daysInMonth) * 100);

  // Expected pace
  const expectedPct = dayPct;
  const isAhead = pctDisplay >= expectedPct;

  const monthLabel = monthKey ? monthKey.substring(0, 7) : "";

  return (
    <div className="card" style={{ marginBottom: 14, padding: "12px 16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontWeight: 700, fontSize: 13 }}>MỤC TIÊU TIKTOK THÁNG {monthLabel.substring(5)}/2026</span>
          <span className="chip" style={{
            fontSize: 10, fontWeight: 700, padding: "2px 8px",
            background: isAhead ? "#DCFCE7" : "#FEF3C7",
            color: isAhead ? "#15803D" : "#92400E",
          }}>
            {isAhead ? "Vượt tiến độ" : "Chậm tiến độ"}
          </span>
        </div>
        <div style={{ display: "flex", gap: 16, fontSize: 12 }}>
          <span>Thực tế: <strong style={{ color: "var(--green)" }}>{formatVNDCompact(monthActual)}</strong></span>
          <span>Mục tiêu: <strong>{formatVNDCompact(monthTarget)}</strong></span>
          <span>Còn: <strong style={{ color: remaining > 0 ? "var(--red)" : "var(--green)" }}>{formatVNDCompact(remaining)}</strong></span>
        </div>
      </div>
      {/* Progress bar */}
      <div style={{ position: "relative", height: 28, background: "#F3F4F6", borderRadius: 6, overflow: "hidden" }}>
        {/* Actual progress */}
        <div style={{
          position: "absolute", top: 0, left: 0, height: "100%", borderRadius: 6,
          width: `${Math.min(pct, 100)}%`,
          background: pctDisplay >= 100 ? "var(--green)" : pctDisplay >= expectedPct ? "#3B82F6" : "#F59E0B",
          transition: "width .5s",
        }} />
        {/* Day marker */}
        <div style={{
          position: "absolute", top: 0, left: `${dayPct}%`, width: 2, height: "100%",
          background: "#000", opacity: 0.3,
        }} />
        {/* Labels on bar */}
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: pctDisplay > 40 ? "#fff" : "var(--text)" }}>
          {pctDisplay}% · Ngày {dayOfMonth}/{daysInMonth} ({dayPct}% thời gian)
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   TAB 1: TỔNG QUAN
   ═══════════════════════════════════════════════════════════ */
function OverviewTab({ ads, nhanhRevenue, adsTotals, nhanhTotals, roas, from, to }: {
  ads: TiktokAdsRow[]; nhanhRevenue: TiktokNhanhRow[];
  adsTotals: { spend: number; reach: number; clicks: number; impressions: number };
  nhanhTotals: { revenue: number; orders: number }; roas: number; from: string; to: string;
}) {
  // Ads by date
  const adsByDate = useMemo(() => {
    const m = new Map<string, { spend: number; reach: number }>();
    for (const a of ads) {
      const d = String(a.date).substring(0, 10);
      const cur = m.get(d) || { spend: 0, reach: 0 };
      cur.spend += toNum(a.spend);
      cur.reach += toNum(a.reach);
      m.set(d, cur);
    }
    return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [ads]);

  // Ads by advertiser
  const adsByAdv = useMemo(() => {
    const m = new Map<string, { name: string; spend: number; reach: number; clicks: number; ctr: number }>();
    for (const a of ads) {
      const k = a.advertiser_id || "—";
      const cur = m.get(k) || { name: a.advertiser_name || k, spend: 0, reach: 0, clicks: 0, ctr: 0 };
      cur.spend += toNum(a.spend);
      cur.reach += toNum(a.reach);
      cur.clicks += toNum(a.clicks);
      if (a.advertiser_name) cur.name = a.advertiser_name;
      m.set(k, cur);
    }
    return Array.from(m.entries()).map(([id, r]) => ({ id, ...r, ctr: r.reach > 0 ? (r.clicks / r.reach * 100) : 0 })).sort((a, b) => b.spend - a.spend);
  }, [ads]);

  // Nhanh by source (shop cards)
  const shopCards = useMemo(() => {
    const m = new Map<string, { revenue: number; orders: number; cancel: number }>();
    for (const r of nhanhRevenue) {
      const cur = m.get(r.source) || { revenue: 0, orders: 0, cancel: 0 };
      cur.revenue += r.revenue;
      cur.orders += r.orders;
      m.set(r.source, cur);
    }
    return Array.from(m.entries()).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.revenue - a.revenue);
  }, [nhanhRevenue]);

  // Daily comparison table (DT NHANH.VN + GMV SHOP)
  const dailyComparison = useMemo(() => {
    const nhanhByDate = new Map<string, { revenue: number; orders: number }>();
    for (const r of nhanhRevenue) {
      const cur = nhanhByDate.get(r.date) || { revenue: 0, orders: 0 };
      cur.revenue += r.revenue;
      cur.orders += r.orders;
      nhanhByDate.set(r.date, cur);
    }
    const adsByDateMap = new Map<string, number>();
    for (const a of ads) {
      const d = String(a.date).substring(0, 10);
      adsByDateMap.set(d, (adsByDateMap.get(d) || 0) + toNum(a.spend));
    }
    const dates = new Set([...nhanhByDate.keys(), ...adsByDateMap.keys()]);
    return Array.from(dates).sort().reverse().map((d) => {
      const n = nhanhByDate.get(d) || { revenue: 0, orders: 0 };
      const spend = adsByDateMap.get(d) || 0;
      const r = spend > 0 ? n.revenue / spend : 0;
      return { date: d, revenue: n.revenue, spend, roas: r, orders: n.orders, gmvShop: n.revenue };
    });
  }, [nhanhRevenue, ads]);

  return (
    <>
      {/* TÀI KHOẢN ADS */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
          <div>
            <span style={{ fontWeight: 700 }}>TÀI KHOẢN ADS</span>
            <span className="muted" style={{ fontSize: 11, marginLeft: 8 }}>TIKTOK ADS</span>
          </div>
          <span className="muted" style={{ fontSize: 11 }}>{adsByAdv.length} tài khoản · {formatVND(adsTotals.spend)}</span>
        </div>
        <div className="muted" style={{ fontSize: 11, marginBottom: 6 }}>Chi tiêu theo ngày</div>
        <SimpleBar data={adsByDate.map(([d, v]) => [d, v.spend] as [string, number])} color="#FF6B8A" />

        {/* Advertiser table */}
        <div className="tbl-wrap" style={{ marginTop: 10 }}>
          <table>
            <thead><tr><th>Tài khoản</th><th className="text-right">Spend</th><th className="text-right">Reach</th><th className="text-right">CTR</th></tr></thead>
            <tbody>
              {adsByAdv.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontSize: 12 }}>{r.name}</td>
                  <td className="text-right font-bold" style={{ color: "var(--red)" }}>{formatVND(r.spend)}</td>
                  <td className="text-right muted">{r.reach.toLocaleString("vi-VN")}</td>
                  <td className="text-right muted">{r.ctr.toFixed(2)}%</td>
                </tr>
              ))}
              <tr style={{ fontWeight: 700, background: "#1a1a1a", color: "#fff" }}>
                <td>Tổng cộng</td>
                <td className="text-right">{formatVND(adsTotals.spend)}</td>
                <td className="text-right"></td><td className="text-right"></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* TIKTOK SHOP API — shop cards */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
          <div>
            <span style={{ fontWeight: 700 }}>TIKTOK SHOP API</span>
            <span className="chip chip-green" style={{ marginLeft: 8, fontSize: 9 }}>TIKTOK SHOP</span>
          </div>
          <span className="muted" style={{ fontSize: 11 }}>{from} → {to}</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(shopCards.length, 4)}, 1fr)`, gap: 10 }}>
          {shopCards.map((s) => (
            <div key={s.name} className="card" style={{ padding: 12, border: "1px solid var(--border)" }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>{s.name}</div>
              <div style={{ fontSize: 11, color: "var(--muted)" }}>{s.orders} đơn</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: "var(--green)" }}>{formatVNDCompact(s.revenue)}</div>
              <div className="muted" style={{ fontSize: 10 }}>TB {formatVNDCompact(s.orders > 0 ? s.revenue / s.orders : 0)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* GMV SHOP THEO NGÀY — line chart */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
          <div>
            <span style={{ fontWeight: 700 }}>GMV SHOP THEO NGÀY</span>
            {shopCards.map((s, i) => (
              <span key={s.name} style={{ marginLeft: 10, fontSize: 11 }}>
                <span style={{ color: LINE_COLORS[i % LINE_COLORS.length] }}>●</span> {s.name}
              </span>
            ))}
          </div>
        </div>
        <LineChart nhanhRevenue={nhanhRevenue} />
      </div>

      {/* SO SÁNH DOANH THU THEO NGÀY */}
      <div className="card" style={{ marginBottom: 14, padding: 0 }}>
        <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <div>
            <span style={{ fontWeight: 700 }}>SO SÁNH DOANH THU THEO NGÀY</span>
            <span className="chip chip-amber" style={{ marginLeft: 8, fontSize: 9 }}>NHANH.VN</span>
            <span className="chip chip-green" style={{ marginLeft: 4, fontSize: 9 }}>TIKTOK SHOP</span>
          </div>
          <div style={{ display: "flex", gap: 8, fontSize: 10 }}>
            <span>ROAS: <span style={{ color: "var(--red)" }}>● &lt;10</span> <span style={{ color: "var(--amber)" }}>● 10-12</span> <span style={{ color: "var(--green)" }}>● &gt;12</span></span>
          </div>
        </div>
        <div className="tbl-wrap">
          <table>
            <thead><tr>
              <th>NGÀY</th><th className="text-right">DT NHANH.VN</th><th className="text-right">SPEND</th><th className="text-right">ROAS</th><th className="text-right">GMV SHOP</th><th className="text-right">ĐƠN</th><th className="text-right">ROAS SHOP</th>
            </tr></thead>
            <tbody>
              {dailyComparison.map((d) => {
                const roasShop = d.spend > 0 ? d.gmvShop / d.spend : 0;
                return (
                <tr key={d.date}>
                  <td style={{ fontWeight: 600 }}>{d.date.substring(5)}</td>
                  <td className="text-right" style={{ color: "var(--green)" }}>{formatVNDCompact(d.revenue)}</td>
                  <td className="text-right" style={{ color: "var(--red)" }}>{formatVNDCompact(d.spend)}</td>
                  <td className="text-right font-bold" style={{ color: d.roas >= 12 ? "var(--green)" : d.roas >= 10 ? "var(--amber)" : "var(--red)" }}>
                    {d.spend > 0 ? d.roas.toFixed(1) : "—"}
                  </td>
                  <td className="text-right" style={{ color: "var(--blue)" }}>{formatVNDCompact(d.gmvShop)}</td>
                  <td className="text-right muted">{d.orders}</td>
                  <td className="text-right font-bold" style={{ color: roasShop >= 12 ? "var(--green)" : roasShop >= 10 ? "var(--amber)" : roasShop > 0 ? "var(--red)" : "var(--muted)" }}>
                    {d.spend > 0 && d.gmvShop > 0 ? roasShop.toFixed(1) : "—"}
                  </td>
                </tr>
                );
              })}
              {dailyComparison.length > 0 && (
                <tr style={{ fontWeight: 700, background: "#1a1a1a", color: "#fff" }}>
                  <td>Tổng kỳ</td>
                  <td className="text-right">{formatVNDCompact(nhanhTotals.revenue)}</td>
                  <td className="text-right">{formatVNDCompact(adsTotals.spend)}</td>
                  <td className="text-right">{roas.toFixed(1)}</td>
                  <td className="text-right">{formatVNDCompact(dailyComparison.reduce((s, d) => s + d.gmvShop, 0))}</td>
                  <td className="text-right">{nhanhTotals.orders}</td>
                  <td className="text-right">{adsTotals.spend > 0 ? (dailyComparison.reduce((s, d) => s + d.gmvShop, 0) / adsTotals.spend).toFixed(1) : "—"}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CẢNH BÁO TỰ ĐỘNG */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 12, textTransform: "uppercase", color: "var(--muted)" }}>Cảnh báo tự động</div>
        {roas >= 10 && <div style={{ fontSize: 12, color: "var(--green)", marginBottom: 4 }}>● ROAS {roas.toFixed(2)}x — hiệu quả ads tốt</div>}
        {roas > 0 && roas < 10 && <div style={{ fontSize: 12, color: "var(--red)", marginBottom: 4 }}>● ROAS {roas.toFixed(2)}x — cần tối ưu ads</div>}
        {adsTotals.spend === 0 && <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>● Chưa có data ads trong kỳ</div>}
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════
   TAB 2: ADS
   ═══════════════════════════════════════════════════════════ */
function AdsTab({ ads }: { ads: TiktokAdsRow[] }) {
  const byAdv = useMemo(() => {
    const m = new Map<string, { name: string; spend: number; impressions: number; clicks: number; conversions: number; conversion_value: number; reach: number }>();
    for (const a of ads) {
      const k = a.advertiser_id || "—";
      const cur = m.get(k) || { name: a.advertiser_name || k, spend: 0, impressions: 0, clicks: 0, conversions: 0, conversion_value: 0, reach: 0 };
      cur.spend += toNum(a.spend); cur.impressions += toNum(a.impressions); cur.clicks += toNum(a.clicks);
      cur.conversions += toNum(a.conversions); cur.conversion_value += toNum(a.conversion_value); cur.reach += toNum(a.reach);
      if (a.advertiser_name) cur.name = a.advertiser_name;
      m.set(k, cur);
    }
    return Array.from(m.entries()).map(([id, r]) => ({ id, ...r })).sort((a, b) => b.spend - a.spend);
  }, [ads]);

  const byDate = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of ads) { const d = String(a.date).substring(0, 10); m.set(d, (m.get(d) || 0) + toNum(a.spend)); }
    return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [ads]);

  return (
    <>
      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Chi tiêu Ads theo ngày</div>
        <SimpleBar data={byDate} color="#FF6B8A" />
      </div>
      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--border)", fontWeight: 700 }}>Chi tiết theo Advertiser</div>
        <div className="tbl-wrap">
          <table>
            <thead><tr><th>Advertiser</th><th className="text-right">Spend</th><th className="text-right">Impressions</th><th className="text-right">Clicks</th><th className="text-right">Conversions</th><th className="text-right">Revenue</th><th className="text-right">ROAS</th></tr></thead>
            <tbody>
              {byAdv.map((r) => (
                <tr key={r.id}>
                  <td><div style={{ fontWeight: 600 }}>{r.name}</div><div className="muted" style={{ fontSize: 10 }}>{r.id}</div></td>
                  <td className="text-right font-bold">{formatVND(r.spend)}</td>
                  <td className="text-right muted">{r.impressions.toLocaleString("vi-VN")}</td>
                  <td className="text-right muted">{r.clicks.toLocaleString("vi-VN")}</td>
                  <td className="text-right">{r.conversions.toLocaleString("vi-VN")}</td>
                  <td className="text-right">{formatVND(r.conversion_value)}</td>
                  <td className="text-right font-bold" style={{ color: r.spend > 0 && r.conversion_value / r.spend >= 1 ? "var(--green)" : "var(--red)" }}>
                    {r.spend > 0 ? (r.conversion_value / r.spend).toFixed(2) + "x" : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════
   TAB 3: KÊNH
   ═══════════════════════════════════════════════════════════ */
function ChannelTab({ channels }: { channels: TiktokChannelRow[] }) {
  const latest = useMemo(() => {
    const m = new Map<string, TiktokChannelRow>();
    for (const c of channels) {
      const existing = m.get(c.account_id);
      if (!existing || String(c.date) > String(existing.date)) m.set(c.account_id, c);
    }
    return Array.from(m.values());
  }, [channels]);

  return (
    <div className="card" style={{ padding: 0 }}>
      <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--border)", fontWeight: 700 }}>TikTok Channels (state mới nhất)</div>
      <div className="tbl-wrap">
        <table>
          <thead><tr><th>Account</th><th className="text-right">Followers</th><th className="text-right">Video views</th><th className="text-right">Likes</th><th className="text-right">Comments</th><th className="text-right">Shares</th><th>Ngày</th></tr></thead>
          <tbody>
            {latest.map((c) => (
              <tr key={c.account_id}>
                <td><div style={{ fontWeight: 600 }}>{c.username || "—"}</div><div className="muted" style={{ fontSize: 10 }}>{c.account_id}</div></td>
                <td className="text-right">{toNum(c.followers).toLocaleString("vi-VN")}</td>
                <td className="text-right muted">{toNum(c.video_views).toLocaleString("vi-VN")}</td>
                <td className="text-right muted">{toNum(c.likes).toLocaleString("vi-VN")}</td>
                <td className="text-right muted">{toNum(c.comments).toLocaleString("vi-VN")}</td>
                <td className="text-right muted">{toNum(c.shares).toLocaleString("vi-VN")}</td>
                <td className="muted" style={{ fontSize: 12 }}>{formatDate(c.date)}</td>
              </tr>
            ))}
            {latest.length === 0 && <tr><td colSpan={7} className="muted" style={{ textAlign: "center", padding: 24 }}>Chưa có data channel.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   TAB 4: SHOP
   ═══════════════════════════════════════════════════════════ */
function ShopTab({ nhanhRevenue, from, to }: { nhanhRevenue: TiktokNhanhRow[]; from: string; to: string }) {
  const sources = useMemo(() => {
    const s = new Set<string>();
    for (const r of nhanhRevenue) s.add(r.source);
    return Array.from(s).sort();
  }, [nhanhRevenue]);
  const [shopFilter, setShopFilter] = useState("all");

  const filtered = useMemo(() => shopFilter === "all" ? nhanhRevenue : nhanhRevenue.filter((r) => r.source === shopFilter), [nhanhRevenue, shopFilter]);

  const totals = useMemo(() => filtered.reduce(
    (a, r) => ({ revenue: a.revenue + r.revenue, orders: a.orders + r.orders }),
    { revenue: 0, orders: 0 },
  ), [filtered]);

  // By date for chart
  const byDate = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of filtered) { m.set(r.date, (m.get(r.date) || 0) + r.revenue); }
    return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  // By date detail table
  const byDateDetail = useMemo(() => {
    const m = new Map<string, { revenue: number; orders: number }>();
    for (const r of filtered) {
      const cur = m.get(r.date) || { revenue: 0, orders: 0 };
      cur.revenue += r.revenue; cur.orders += r.orders;
      m.set(r.date, cur);
    }
    return Array.from(m.entries()).sort(([a], [b]) => b.localeCompare(a));
  }, [filtered]);

  const avgOrder = totals.orders > 0 ? totals.revenue / totals.orders : 0;

  return (
    <>
      {/* Date range */}
      <div className="muted" style={{ marginBottom: 10, fontSize: 12 }}>{from} → {to}</div>

      {/* Shop filter tabs */}
      <div className="mini-tabs" style={{ marginBottom: 14 }}>
        <button className={"mini-tab" + (shopFilter === "all" ? " active" : "")} onClick={() => setShopFilter("all")}>Tất cả</button>
        {sources.map((s) => (
          <button key={s} className={"mini-tab" + (shopFilter === s ? " active" : "")} onClick={() => setShopFilter(s)}>{s}</button>
        ))}
      </div>

      {/* KPI cards */}
      <div className="stat-grid" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))", marginBottom: 14 }}>
        <div className="stat-card c-green"><div className="sl">GMV THÀNH CÔNG</div><div className="sv">{formatVNDCompact(totals.revenue)}</div><div className="muted" style={{ fontSize: 10 }}>Không tính huỷ/hoàn</div></div>
        <div className="stat-card c-blue"><div className="sl">SỐ ĐƠN</div><div className="sv">{totals.orders.toLocaleString("vi-VN")}</div><div className="muted" style={{ fontSize: 10 }}>Đơn thành công</div></div>
        <div className="stat-card c-amber"><div className="sl">TB / ĐƠN</div><div className="sv">{formatVNDCompact(avgOrder)}</div></div>
        <div className="stat-card c-red"><div className="sl">HUỶ / HOÀN</div><div className="sv">—</div><div className="muted" style={{ fontSize: 10 }}>Chưa có data</div></div>
      </div>

      {/* GMV chart */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>GMV theo ngày</div>
        <SimpleBar data={byDate} color="#FF6B8A" />
      </div>

      {/* Daily table */}
      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--border)", fontWeight: 700 }}>Chi tiết theo ngày</div>
        <div className="tbl-wrap">
          <table>
            <thead><tr><th>Ngày</th><th className="text-right">Doanh thu</th><th className="text-right">Đơn</th><th className="text-right">TB/đơn</th></tr></thead>
            <tbody>
              {byDateDetail.map(([d, v]) => (
                <tr key={d}>
                  <td style={{ fontWeight: 600 }}>{d.substring(5)}</td>
                  <td className="text-right" style={{ color: "var(--green)" }}>{formatVNDCompact(v.revenue)}</td>
                  <td className="text-right">{v.orders}</td>
                  <td className="text-right muted">{formatVNDCompact(v.orders > 0 ? v.revenue / v.orders : 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════
   TAB 5: HÀNG HOÁ
   ═══════════════════════════════════════════════════════════ */
function ProductsTab({ products }: { products: TiktokProductStat[] }) {
  return (
    <div className="card" style={{ padding: 0 }}>
      <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--border)", fontWeight: 700 }}>
        Top sản phẩm bán trên TikTok Shop
        <span className="muted" style={{ fontWeight: 400, fontSize: 12, marginLeft: 8 }}>{products.length} SP</span>
      </div>
      <div className="tbl-wrap" style={{ maxHeight: 600, overflowY: "auto" }}>
        <table>
          <thead><tr><th>Sản phẩm</th><th>Shop</th><th className="text-right">SL bán</th><th className="text-right">Doanh thu</th><th className="text-right">SL huỷ</th><th className="text-right">% huỷ</th></tr></thead>
          <tbody>
            {products.slice(0, 100).map((p, i) => (
              <tr key={i}>
                <td style={{ maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={p.name}>{p.name}</td>
                <td className="muted" style={{ fontSize: 12 }}>{p.shop}</td>
                <td className="text-right font-bold">{p.sold.toLocaleString("vi-VN")}</td>
                <td className="text-right">{formatVND(p.revenue)}</td>
                <td className="text-right" style={{ color: p.cancel > 0 ? "var(--red)" : "var(--muted)" }}>{p.cancel.toLocaleString("vi-VN")}</td>
                <td className="text-right" style={{ color: p.cancel_rate > 20 ? "var(--red)" : p.cancel_rate > 10 ? "var(--amber)" : "var(--muted)" }}>{p.cancel_rate}%</td>
              </tr>
            ))}
            {products.length === 0 && <tr><td colSpan={6} className="muted" style={{ textAlign: "center", padding: 24 }}>Chưa có data sản phẩm.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   LINE CHART — GMV per shop per day (SVG)
   ═══════════════════════════════════════════════════════════ */
const LINE_COLORS = ["#EF4444", "#22C55E", "#6366F1", "#F59E0B", "#0EA5E9"];

function LineChart({ nhanhRevenue }: { nhanhRevenue: TiktokNhanhRow[] }) {
  const { dates, sources, series, maxVal } = useMemo(() => {
    const dateSet = new Set<string>();
    const sourceSet = new Set<string>();
    for (const r of nhanhRevenue) { dateSet.add(r.date); sourceSet.add(r.source); }
    const dates = Array.from(dateSet).sort();
    const sources = Array.from(sourceSet).sort((a, b) => {
      const aRev = nhanhRevenue.filter((r) => r.source === a).reduce((s, r) => s + r.revenue, 0);
      const bRev = nhanhRevenue.filter((r) => r.source === b).reduce((s, r) => s + r.revenue, 0);
      return bRev - aRev;
    });
    const m = new Map<string, Map<string, number>>();
    for (const src of sources) m.set(src, new Map());
    for (const r of nhanhRevenue) {
      const srcMap = m.get(r.source)!;
      srcMap.set(r.date, (srcMap.get(r.date) || 0) + r.revenue);
    }
    let maxVal = 0;
    for (const [, srcMap] of m) for (const [, v] of srcMap) if (v > maxVal) maxVal = v;
    return { dates, sources, series: m, maxVal };
  }, [nhanhRevenue]);

  if (dates.length === 0) return <div className="muted" style={{ padding: 24, textAlign: "center" }}>Không có data.</div>;

  const W = 700, H = 200, PL = 55, PR = 10, PT = 20, PB = 30;
  const chartW = W - PL - PR, chartH = H - PT - PB;

  function x(i: number) { return PL + (dates.length > 1 ? (i / (dates.length - 1)) * chartW : chartW / 2); }
  function y(v: number) { return PT + chartH - (maxVal > 0 ? (v / maxVal) * chartH : 0); }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: 220 }}>
      {/* Y-axis grid */}
      {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
        const val = maxVal * pct;
        const yy = y(val);
        return (
          <g key={pct}>
            <line x1={PL} x2={W - PR} y1={yy} y2={yy} stroke="#E5E7EB" strokeWidth={0.5} />
            <text x={PL - 4} y={yy + 3} textAnchor="end" fill="#999" fontSize={9}>{formatVNDCompact(val)}</text>
          </g>
        );
      })}
      {/* X-axis labels */}
      {dates.map((d, i) => (
        <text key={d} x={x(i)} y={H - 6} textAnchor="middle" fill="#999" fontSize={9}>{d.substring(5)}</text>
      ))}
      {/* Lines per source */}
      {sources.map((src, si) => {
        const srcMap = series.get(src)!;
        const points = dates.map((d, i) => ({ x: x(i), y: y(srcMap.get(d) || 0), val: srcMap.get(d) || 0 }));
        const color = LINE_COLORS[si % LINE_COLORS.length];
        const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
        return (
          <g key={src}>
            <path d={pathD} fill="none" stroke={color} strokeWidth={2} />
            {points.map((p, i) => (
              <g key={i}>
                <circle cx={p.x} cy={p.y} r={3} fill={color} />
                {p.val > 0 && (
                  <text x={p.x} y={p.y - 8} textAnchor="middle" fill={color} fontSize={8} fontWeight={600}>
                    {formatVNDCompact(p.val)}
                  </text>
                )}
              </g>
            ))}
          </g>
        );
      })}
    </svg>
  );
}

/* ═══════════════════════════════════════════════════════════
   SIMPLE BAR CHART
   ═══════════════════════════════════════════════════════════ */
function SimpleBar({ data, color = "#FF6B8A" }: { data: [string, number][]; color?: string }) {
  if (data.length === 0) return <div className="muted" style={{ padding: 24, textAlign: "center" }}>Không có data.</div>;
  const max = Math.max(...data.map(([, v]) => v));
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 170, overflowX: "auto", paddingTop: 16 }}>
      {data.map(([d, v]) => {
        const h = max > 0 ? (v / max) * 110 : 0;
        return (
          <div key={d} style={{ flex: 1, minWidth: 28, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }} title={`${d}: ${formatVND(v)}`}>
            <div style={{ fontSize: 10, color: "var(--muted)", whiteSpace: "nowrap" }}>{formatVNDCompact(v)}</div>
            <div style={{ width: "70%", height: h, background: color, borderRadius: "2px 2px 0 0", minWidth: 12 }} />
            <div style={{ fontSize: 10, color: "var(--subtle)" }}>{d.substring(5)}</div>
          </div>
        );
      })}
    </div>
  );
}
