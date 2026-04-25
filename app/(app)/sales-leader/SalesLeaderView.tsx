"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { formatDate, formatVND, formatVNDCompact, toNum } from "@/lib/format";
import type { TiktokAdsRow, TiktokChannelRow, TiktokNhanhRow, TiktokProductStat, GmvMaxRow, GmvMaxProductRow } from "@/lib/db/tiktok";
import SyncButton from "../components/SyncButton";
import AutoSyncToday from "../components/AutoSyncToday";
import TargetProgressBar from "../components/TargetProgressBar";
import Collapsible from "../components/Collapsible";

type Tab = "overview" | "ads" | "gmv_max" | "channel" | "shop" | "products";

const _pad = (n: number) => String(n).padStart(2, "0");
const _fmt = (d: Date) => `${d.getFullYear()}-${_pad(d.getMonth() + 1)}-${_pad(d.getDate())}`;

function daysAgo(d: number): string {
  const dt = new Date();
  dt.setDate(dt.getDate() + d);
  return _fmt(dt);
}

function monthRange(offset: number): { from: string; to: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + offset;
  const first = new Date(y, m, 1);
  const last = offset === 0 ? now : new Date(y, m + 1, 0);
  return { from: _fmt(first), to: _fmt(last) };
}

const QUICK_RANGES: { key: string; label: string; from: string; to: string }[] = [
  { key: "today", label: "Hôm nay", from: daysAgo(0), to: daysAgo(0) },
  { key: "yesterday", label: "Hôm qua", from: daysAgo(-1), to: daysAgo(-1) },
  { key: "3d", label: "3N", from: daysAgo(-3), to: daysAgo(0) },
  { key: "7d", label: "7N", from: daysAgo(-7), to: daysAgo(0) },
  { key: "14d", label: "14N", from: daysAgo(-14), to: daysAgo(0) },
  { key: "30d", label: "30N", from: daysAgo(-30), to: daysAgo(0) },
  { key: "this_month", label: "Tháng này", ...monthRange(0) },
  { key: "last_month", label: "Tháng trước", ...monthRange(-1) },
];

/* ═══════════════════════════════════════════════════════════
   MAIN VIEW
   ═══════════════════════════════════════════════════════════ */
export default function SalesLeaderView({
  ads, channels, productStats, shops = [], nhanhRevenue = [], gmvMax = [], gmvMaxProducts = [], from, to,
  monthTarget = 0, monthActual = 0, monthKey = "",
}: {
  ads: TiktokAdsRow[];
  channels: TiktokChannelRow[];
  productStats: TiktokProductStat[];
  shops?: string[];
  nhanhRevenue?: TiktokNhanhRow[];
  gmvMax?: GmvMaxRow[];
  gmvMaxProducts?: GmvMaxProductRow[];
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
  const [prevFrom, setPrevFrom] = useState(from);
  const [prevTo, setPrevTo] = useState(to);
  if (from !== prevFrom) { setF(from); setPrevFrom(from); }
  if (to !== prevTo) { setT(to); setPrevTo(to); }

  function apply() { router.push(`/sales-leader?from=${f}&to=${t}`); }
  function quickRange(qr: { from: string; to: string }) {
    router.push(`/sales-leader?from=${qr.from}&to=${qr.to}`);
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

  const gmvTotals = useMemo(() => gmvMax.reduce(
    (a, r) => ({ spend: a.spend + Number(r.spend || 0), revenue: a.revenue + Number(r.gross_revenue || 0), orders: a.orders + Number(r.orders || 0) }),
    { spend: 0, revenue: 0, orders: 0 },
  ), [gmvMax]);

  const totalSpend = adsTotals.spend + gmvTotals.spend;
  // Nhanh revenue đã bao gồm GMV Max → không cộng thêm
  const roas = totalSpend > 0 ? nhanhTotals.revenue / totalSpend : 0;

  return (
    <section className="section">
      <AutoSyncToday onDone={() => router.refresh()} extraSyncs={["/api/tiktok/sync-ads", "/api/tiktok/sync-gmv-max"]} />
      {/* ═══ HEADER ═══ */}
      <div className="page-hdr">
        <div>
          <div className="page-title"><span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 24, height: 24, borderRadius: "50%", background: "#000000", color: "#fff", fontSize: 14, fontWeight: 700, marginRight: 8, verticalAlign: "middle" }}>&#9834;</span>TikTok Overview</div>
          <div className="page-sub">Ads · Kênh · Shop</div>
        </div>
        <div className="row" style={{ gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          {QUICK_RANGES.map((r) => {
            const active = from === r.from && to === r.to;
            return (
              <button key={r.key} className="btn btn-ghost btn-xs" onClick={() => quickRange(r)}
                style={{ background: active ? "var(--blue)" : undefined, color: active ? "#fff" : undefined }}>
                {r.label}
              </button>
            );
          })}
          <input type="date" value={f} onChange={(e) => setF(e.target.value)} style={{ fontSize: 12, width: 130 }} />
          <span className="muted">→</span>
          <input type="date" value={t} onChange={(e) => setT(e.target.value)} style={{ fontSize: 12, width: 130 }} />
          <button className="btn btn-primary btn-xs" onClick={apply}>Áp dụng</button>
          <span style={{ width: 1, height: 20, background: "var(--border)" }} />
          <SyncButton url="/api/nhanh/sync-sales" label="NHANH.VN" body={{ from, to }} onDone={() => router.refresh()} />
          <SyncButton url="/api/tiktok/sync-ads" label="Sync Ads" onDone={() => router.refresh()} />
          <SyncButton url="/api/tiktok/sync-gmv-max" label="Sync GMV Max" onDone={() => router.refresh()} />
          <SyncButton url="/api/tiktok/sync-shop-orders" label="Sync Orders" onDone={() => router.refresh()} />
          <CsvUploadButton onDone={() => router.refresh()} />
        </div>
      </div>

      {/* ═══ MONTHLY TARGET PROGRESS ═══ */}
      <TargetProgressBar channel="TikTok" monthTarget={monthTarget} monthActual={monthActual} monthKey={monthKey} color="#FE2C55" />

      {/* ═══ 6 KPI CARDS ═══ */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 8, marginBottom: 12 }}>
        {(() => {
          const roasStyle = roas >= 10 ? { background: "#F0FDF4", border: "1px solid #BBF7D0", color: "#166534" } : roas >= 5 ? { background: "#FFFBEB", border: "1px solid #FDE68A", color: "#92400E" } : { background: "#FEF2F2", border: "1px solid #FECACA", color: "#991B1B" };
          return (
            <div style={{ padding: "10px 14px", borderRadius: 8, ...roasStyle }}>
              <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: ".3px" }}>ROAS TỔNG</div>
              <div style={{ fontSize: 20, fontWeight: 800, margin: "2px 0" }}>{roas.toFixed(2)}x</div>
              <div style={{ fontSize: 9, opacity: 0.7 }}>GMV / (BM + GMV Max)</div>
            </div>
          );
        })()}
        <div style={{ padding: "10px 14px", borderRadius: 8, background: "#F0FDF4", border: "1px solid #BBF7D0" }}>
          <div style={{ fontSize: 9, fontWeight: 600, color: "#166534", letterSpacing: ".3px" }}>DOANH THU</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#166534", margin: "2px 0" }}>{formatVNDCompact(nhanhTotals.revenue)}</div>
          <div style={{ fontSize: 9, color: "#166534", opacity: 0.7 }}>Từ Nhanh (đã gồm GMV Max)</div>
        </div>
        <div style={{ padding: "10px 14px", borderRadius: 8, background: "#FEF2F2", border: "1px solid #FECACA" }}>
          <div style={{ fontSize: 9, fontWeight: 600, color: "#991B1B", letterSpacing: ".3px" }}>ADS SPEND</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#991B1B", margin: "2px 0" }}>{formatVNDCompact(totalSpend)}</div>
          <div style={{ fontSize: 9, color: "#991B1B", opacity: 0.7 }}>BM {formatVNDCompact(adsTotals.spend)} + Max {formatVNDCompact(gmvTotals.spend)}</div>
        </div>
        <div style={{ padding: "10px 14px", borderRadius: 8, background: "#FFFBEB", border: "1px solid #FDE68A" }}>
          <div style={{ fontSize: 9, fontWeight: 600, color: "#92400E", letterSpacing: ".3px" }}>GMV MAX REV</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#92400E", margin: "2px 0" }}>{formatVNDCompact(gmvTotals.revenue)}</div>
          <div style={{ fontSize: 9, color: "#92400E", opacity: 0.7 }}>{gmvTotals.orders.toLocaleString("vi-VN")} don · ROI {gmvTotals.spend > 0 ? (gmvTotals.revenue / gmvTotals.spend).toFixed(1) : "---"}</div>
        </div>
        <div style={{ padding: "10px 14px", borderRadius: 8, background: "#fff", border: "1px solid #E5E7EB" }}>
          <div style={{ fontSize: 9, fontWeight: 600, color: "#374151", letterSpacing: ".3px" }}>DON THANH CONG</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#374151", margin: "2px 0" }}>{nhanhTotals.orders.toLocaleString("vi-VN")}</div>
          <div style={{ fontSize: 9, color: "#6B7280" }}>Nhanh {nhanhTotals.orders} (gồm GMV Max)</div>
        </div>
        <div style={{ padding: "10px 14px", borderRadius: 8, background: "#fff", border: "1px solid #E5E7EB" }}>
          <div style={{ fontSize: 9, fontWeight: 600, color: "#374151", letterSpacing: ".3px" }}>CTR / CONVERSION</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#374151", margin: "2px 0" }}>{adsTotals.impressions > 0 ? ((adsTotals.clicks / adsTotals.impressions) * 100).toFixed(2) : "0"}%</div>
          <div style={{ fontSize: 9, color: "#6B7280" }}>{adsTotals.conversions.toLocaleString("vi-VN")} conversions</div>
        </div>
      </div>

      {/* ═══ TABS ═══ */}
      <div className="mini-tabs" style={{ marginBottom: 14 }}>
        {([["overview", "Tổng quan"], ["ads", "Ads"], ["gmv_max", "GMV Max"], ["channel", "Kênh"], ["shop", "Shop"], ["products", "Hàng hoá"]] as const).map(([k, v]) => (
          <button key={k} className={"mini-tab" + (tab === k ? " active" : "")} onClick={() => setTab(k)}>{v}</button>
        ))}
      </div>

      {tab === "overview" && <OverviewTab ads={ads} nhanhRevenue={nhanhRevenue} gmvMax={gmvMax} adsTotals={adsTotals} nhanhTotals={nhanhTotals} gmvTotals={gmvTotals} roas={roas} from={from} to={to} />}
      {tab === "ads" && <AdsTab ads={ads} />}
      {tab === "gmv_max" && <GmvMaxTab gmvMax={gmvMax} gmvMaxProducts={gmvMaxProducts} from={from} to={to} />}
      {tab === "channel" && <ChannelTab channels={channels} />}
      {tab === "shop" && <ShopTab nhanhRevenue={nhanhRevenue} from={from} to={to} />}
      {tab === "products" && <ProductsTab products={productStats} />}
    </section>
  );
}

/* TargetProgress moved to shared component: ../components/TargetProgressBar */

/* ═══════════════════════════════════════════════════════════
   TAB 1: TỔNG QUAN
   ═══════════════════════════════════════════════════════════ */
function OverviewTab({ ads, nhanhRevenue, gmvMax, adsTotals, nhanhTotals, gmvTotals, roas, from, to }: {
  ads: TiktokAdsRow[]; nhanhRevenue: TiktokNhanhRow[]; gmvMax: GmvMaxRow[];
  adsTotals: { spend: number; reach: number; clicks: number; impressions: number };
  nhanhTotals: { revenue: number; orders: number };
  gmvTotals: { spend: number; revenue: number; orders: number };
  roas: number; from: string; to: string;
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

  // Daily comparison table (DT NHANH.VN + GMV SHOP + GMV Max)
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
    const gmvByDate = new Map<string, { spend: number; revenue: number; orders: number }>();
    for (const g of gmvMax) {
      const d = String(g.date).substring(0, 10);
      const cur = gmvByDate.get(d) || { spend: 0, revenue: 0, orders: 0 };
      cur.spend += Number(g.spend || 0);
      cur.revenue += Number(g.gross_revenue || 0);
      cur.orders += Number(g.orders || 0);
      gmvByDate.set(d, cur);
    }
    const dates = new Set([...nhanhByDate.keys(), ...adsByDateMap.keys(), ...gmvByDate.keys()]);
    return Array.from(dates).sort().reverse().map((d) => {
      const n = nhanhByDate.get(d) || { revenue: 0, orders: 0 };
      const bmSpend = adsByDateMap.get(d) || 0;
      const gm = gmvByDate.get(d) || { spend: 0, revenue: 0, orders: 0 };
      const totalSpend = bmSpend + gm.spend;
      const totalRevenue = n.revenue + gm.revenue;
      const r = totalSpend > 0 ? totalRevenue / totalSpend : 0;
      return { date: d, revenue: n.revenue, spend: bmSpend, roas: r, orders: n.orders, gmvRevenue: gm.revenue, gmvSpend: gm.spend, gmvOrders: gm.orders, gmvRoi: gm.spend > 0 ? gm.revenue / gm.spend : 0, totalSpend, totalRevenue };
    });
  }, [nhanhRevenue, ads, gmvMax]);

  return (
    <>
      {/* TÀI KHOẢN ADS */}
      <Collapsible title="TÀI KHOẢN ADS" defaultOpen badge={<span className="muted" style={{ fontSize: 11 }}>{adsByAdv.length} tài khoản · BM {formatVNDCompact(adsTotals.spend)} + GMV Max {formatVNDCompact(gmvTotals.spend)}</span>}>
        <AdsRevenueChart ads={ads} gmvMax={gmvMax} nhanhRevenue={nhanhRevenue} />

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
      </Collapsible>

      {/* TIKTOK SHOP API — shop cards */}
      <Collapsible title="TIKTOK SHOP API" defaultOpen badge={<span className="muted" style={{ fontSize: 11 }}>{from} → {to}</span>}>
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
      </Collapsible>

      {/* GMV SHOP THEO NGÀY — line chart */}
      <Collapsible title="GMV SHOP THEO NGÀY" defaultOpen badge={<>{shopCards.map((s, i) => (<span key={s.name} style={{ marginLeft: 10, fontSize: 11 }}><span style={{ color: LINE_COLORS[i % LINE_COLORS.length] }}>●</span> {s.name}</span>))}</>}>
        <LineChart nhanhRevenue={nhanhRevenue} />
      </Collapsible>

      {/* DOANH THU & ADS THEO NGÀY */}
      <Collapsible title="DOANH THU & ADS THEO NGÀY" defaultOpen badge={<span className="chip chip-amber" style={{ fontSize: 9 }}>NHANH.VN + GMV MAX</span>}>
        <div className="tbl-wrap">
          <table>
            <thead><tr>
              <th>NGÀY</th><th className="text-right">DT NHANH</th><th className="text-right">ĐƠN</th>
              <th className="text-right" style={{ borderLeft: "2px solid #FE2C55", color: "#FE2C55" }}>GMV MAX REV</th>
              <th className="text-right" style={{ color: "#FE2C55" }}>GMV SPEND</th>
              <th className="text-right" style={{ color: "#FE2C55" }}>ROI</th>
              <th className="text-right" style={{ borderLeft: "2px solid var(--border)" }}>BM SPEND</th>
              <th className="text-right">ROAS TỔNG</th>
            </tr></thead>
            <tbody>
              {dailyComparison.map((d) => (
                <tr key={d.date}>
                  <td style={{ fontWeight: 600 }}>{d.date.substring(5)}</td>
                  <td className="text-right" style={{ color: "var(--green)" }}>{formatVNDCompact(d.revenue)}</td>
                  <td className="text-right">{d.orders}</td>
                  <td className="text-right font-bold" style={{ color: "var(--green)", borderLeft: "2px solid #FE2C55" }}>{d.gmvRevenue > 0 ? formatVNDCompact(d.gmvRevenue) : "—"}</td>
                  <td className="text-right" style={{ color: "#FE2C55" }}>{d.gmvSpend > 0 ? formatVNDCompact(d.gmvSpend) : "—"}</td>
                  <td className="text-right" style={{ color: d.gmvRoi >= 12 ? "var(--green)" : d.gmvRoi >= 8 ? "var(--amber)" : d.gmvRoi > 0 ? "var(--red)" : "var(--muted)" }}>{d.gmvRoi > 0 ? d.gmvRoi.toFixed(1) : "—"}</td>
                  <td className="text-right" style={{ color: "var(--red)", borderLeft: "2px solid var(--border)" }}>{d.spend > 0 ? formatVNDCompact(d.spend) : "0"}</td>
                  <td className="text-right font-bold" style={{ color: d.roas >= 12 ? "var(--green)" : d.roas >= 10 ? "var(--amber)" : d.roas > 0 ? "var(--red)" : "var(--muted)" }}>
                    {d.totalSpend > 0 ? d.roas.toFixed(1) : "—"}
                  </td>
                </tr>
              ))}
              {dailyComparison.length > 0 && (() => {
                const gmvRoiTotal = gmvTotals.spend > 0 ? gmvTotals.revenue / gmvTotals.spend : 0;
                return (
                <tr style={{ fontWeight: 700, background: "var(--blue)", color: "#fff" }}>
                  <td>Tổng kỳ</td>
                  <td className="text-right">{formatVNDCompact(nhanhTotals.revenue)}</td>
                  <td className="text-right">{nhanhTotals.orders}</td>
                  <td className="text-right" style={{ borderLeft: "2px solid #FE2C55" }}>{formatVNDCompact(gmvTotals.revenue)}</td>
                  <td className="text-right">{formatVNDCompact(gmvTotals.spend)}</td>
                  <td className="text-right">{gmvRoiTotal > 0 ? gmvRoiTotal.toFixed(1) : "—"}</td>
                  <td className="text-right" style={{ borderLeft: "2px solid rgba(255,255,255,.2)" }}>{formatVNDCompact(adsTotals.spend)}</td>
                  <td className="text-right">{roas.toFixed(1)}</td>
                </tr>
                );
              })()}
            </tbody>
          </table>
        </div>
      </Collapsible>

      {/* CẢNH BÁO TỰ ĐỘNG */}
      <Collapsible title="Cảnh báo tự động" defaultOpen={false}>
        {roas >= 10 && <div style={{ fontSize: 12, color: "var(--green)", marginBottom: 4 }}>● ROAS {roas.toFixed(2)}x — hiệu quả ads tốt</div>}
        {roas > 0 && roas < 10 && <div style={{ fontSize: 12, color: "var(--red)", marginBottom: 4 }}>● ROAS {roas.toFixed(2)}x — cần tối ưu ads</div>}
        {adsTotals.spend === 0 && <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>● Chưa có data ads trong kỳ</div>}
      </Collapsible>
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
   TAB: GMV MAX
   ═══════════════════════════════════════════════════════════ */
function GmvMaxTab({ gmvMax, gmvMaxProducts, from, to }: {
  gmvMax: GmvMaxRow[]; gmvMaxProducts: GmvMaxProductRow[]; from: string; to: string;
}) {
  const totals = useMemo(() => gmvMax.reduce(
    (a, r) => ({ spend: a.spend + Number(r.spend || 0), revenue: a.revenue + Number(r.gross_revenue || 0), orders: a.orders + Number(r.orders || 0) }),
    { spend: 0, revenue: 0, orders: 0 },
  ), [gmvMax]);

  // By store
  const storeCards = useMemo(() => {
    const m = new Map<string, { name: string; code: string; spend: number; revenue: number; orders: number }>();
    for (const r of gmvMax) {
      const cur = m.get(r.store_id) || { name: r.store_name || r.store_id, code: r.store_code || "", spend: 0, revenue: 0, orders: 0 };
      cur.spend += Number(r.spend || 0);
      cur.revenue += Number(r.gross_revenue || 0);
      cur.orders += Number(r.orders || 0);
      m.set(r.store_id, cur);
    }
    return Array.from(m.entries()).map(([id, v]) => ({ id, ...v })).sort((a, b) => b.revenue - a.revenue);
  }, [gmvMax]);

  // By date
  const byDate = useMemo(() => {
    const m = new Map<string, { spend: number; revenue: number; orders: number }>();
    for (const r of gmvMax) {
      const d = String(r.date).substring(0, 10);
      const cur = m.get(d) || { spend: 0, revenue: 0, orders: 0 };
      cur.spend += Number(r.spend || 0);
      cur.revenue += Number(r.gross_revenue || 0);
      cur.orders += Number(r.orders || 0);
      m.set(d, cur);
    }
    return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [gmvMax]);

  // Top & worst products
  const { topProducts, worstProducts } = useMemo(() => {
    const prodMap = new Map<string, { id: string; spend: number; revenue: number; orders: number }>();
    for (const p of gmvMaxProducts) {
      const cur = prodMap.get(p.item_group_id) || { id: p.item_group_id, spend: 0, revenue: 0, orders: 0 };
      cur.spend += Number(p.spend || 0);
      cur.revenue += Number(p.gross_revenue || 0);
      cur.orders += Number(p.orders || 0);
      prodMap.set(p.item_group_id, cur);
    }
    const all = Array.from(prodMap.values());
    const topProducts = [...all].sort((a, b) => b.revenue - a.revenue).slice(0, 10);
    const worstProducts = all.filter((p) => p.spend > 1000 && p.orders > 0)
      .map((p) => ({ ...p, roi: p.spend > 0 ? p.revenue / p.spend : 0 }))
      .sort((a, b) => a.roi - b.roi).slice(0, 5);
    return { topProducts, worstProducts };
  }, [gmvMaxProducts]);

  // Monthly summary
  const monthly = useMemo(() => {
    const m = new Map<string, { spend: number; revenue: number; orders: number }>();
    for (const r of gmvMax) {
      const month = String(r.date).substring(0, 7);
      const cur = m.get(month) || { spend: 0, revenue: 0, orders: 0 };
      cur.spend += Number(r.spend || 0);
      cur.revenue += Number(r.gross_revenue || 0);
      cur.orders += Number(r.orders || 0);
      m.set(month, cur);
    }
    return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [gmvMax]);

  const roi = totals.spend > 0 ? totals.revenue / totals.spend : 0;
  const cpa = totals.orders > 0 ? totals.spend / totals.orders : 0;
  const avgOrder = totals.orders > 0 ? totals.revenue / totals.orders : 0;

  return (
    <>
      {/* KPI */}
      <div className="stat-grid" style={{ gridTemplateColumns: "repeat(5, minmax(0, 1fr))" }}>
        <div className="stat-card" style={{ borderLeft: "4px solid #FE2C55" }}>
          <div className="sl">GMV MAX SPEND</div>
          <div className="sv" style={{ color: "#FE2C55" }}>{formatVNDCompact(totals.spend)}</div>
        </div>
        <div className="stat-card" style={{ borderLeft: "4px solid var(--green)" }}>
          <div className="sl">DOANH THU</div>
          <div className="sv" style={{ color: "var(--green)" }}>{formatVNDCompact(totals.revenue)}</div>
        </div>
        <div className="stat-card" style={{ borderLeft: "4px solid #25F4EE" }}>
          <div className="sl">ĐƠN HÀNG</div>
          <div className="sv">{totals.orders.toLocaleString("vi-VN")}</div>
        </div>
        <div className="stat-card" style={{ borderLeft: "4px solid var(--amber)" }}>
          <div className="sl">ROI</div>
          <div className="sv" style={{ color: roi >= 10 ? "var(--green)" : roi >= 5 ? "var(--amber)" : "var(--red)" }}>{roi.toFixed(2)}x</div>
        </div>
        <div className="stat-card" style={{ borderLeft: "4px solid var(--border)" }}>
          <div className="sl">CPA / TB ĐƠN</div>
          <div className="sv">{formatVNDCompact(cpa)}</div>
          <div className="muted" style={{ fontSize: 10 }}>TB/đơn {formatVNDCompact(avgOrder)}</div>
        </div>
      </div>

      {/* Store cards */}
      {storeCards.length > 0 && (
        <Collapsible title="CỬA HÀNG GMV MAX" defaultOpen badge={<span className="muted" style={{ fontSize: 11 }}>{storeCards.length} store</span>}>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(storeCards.length, 4)}, 1fr)`, gap: 10 }}>
            {storeCards.map((s) => {
              const sRoi = s.spend > 0 ? s.revenue / s.spend : 0;
              return (
                <div key={s.id} className="card" style={{ padding: 12, border: "1px solid var(--border)", position: "relative" }}>
                  <div style={{ position: "absolute", top: 8, right: 10, fontSize: 9, padding: "2px 6px", borderRadius: 4, fontWeight: 600, background: s.revenue > 0 ? "var(--green-lt)" : "var(--bg)", color: s.revenue > 0 ? "var(--green)" : "var(--muted)" }}>
                    {s.revenue > 0 ? "Active" : "Inactive"}
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 2 }}>{s.name}</div>
                  <div className="muted" style={{ fontSize: 10, marginBottom: 8 }}>{s.code}</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: s.revenue > 0 ? "var(--green)" : "var(--muted)" }}>{formatVNDCompact(s.revenue)}</div>
                  <div className="muted" style={{ fontSize: 10, marginTop: 4 }}>{s.orders} đơn · ROI {sRoi > 0 ? sRoi.toFixed(1) : "—"}</div>
                  <div className="muted" style={{ fontSize: 10 }}>Spend: {formatVNDCompact(s.spend)}</div>
                </div>
              );
            })}
          </div>
        </Collapsible>
      )}

      {/* Dual bar chart */}
      <Collapsible title="SPEND & REVENUE THEO NGÀY" defaultOpen badge={
        <span className="muted" style={{ fontSize: 11 }}>
          <span style={{ color: "#FE2C55" }}>●</span> Spend &nbsp;
          <span style={{ color: "var(--green)" }}>●</span> Revenue
        </span>
      }>
        <DualBar data={byDate} />
      </Collapsible>

      {/* Top & Worst products */}
      {(topProducts.length > 0 || worstProducts.length > 0) && (
        <Collapsible title="SẢN PHẨM GMV MAX" defaultOpen badge={<span className="muted" style={{ fontSize: 11 }}>{gmvMaxProducts.length} SP</span>}>
          <div style={{ display: "grid", gridTemplateColumns: worstProducts.length > 0 ? "1fr 1fr" : "1fr", gap: 0 }}>
            {/* Top */}
            <div style={{ borderRight: worstProducts.length > 0 ? "1px solid var(--border)" : "none" }}>
              <div style={{ padding: "8px 12px", fontWeight: 700, fontSize: 12, borderBottom: "1px solid var(--border)", color: "var(--green)" }}>▲ Top bán chạy</div>
              {topProducts.map((p, i) => {
                const pRoi = p.spend > 0 ? p.revenue / p.spend : 0;
                const pCpa = p.orders > 0 ? p.spend / p.orders : 0;
                return (
                  <div key={p.id} style={{ display: "flex", alignItems: "center", padding: "6px 12px", borderBottom: "1px solid var(--border)", gap: 8 }}>
                    <div style={{ width: 22, height: 22, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, background: i < 3 ? "var(--green)" : "var(--green-lt)", color: i < 3 ? "#fff" : "var(--green)", flexShrink: 0 }}>{i + 1}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>SP {p.id.substring(0, 12)}...</div>
                      <div className="muted" style={{ fontSize: 10 }}>{p.orders} đơn · ROI {pRoi.toFixed(1)}</div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 800, color: "var(--green)" }}>{formatVNDCompact(p.revenue)}</div>
                      <div className="muted" style={{ fontSize: 10 }}>CPA {formatVNDCompact(pCpa)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
            {/* Worst */}
            {worstProducts.length > 0 && (
              <div>
                <div style={{ padding: "8px 12px", fontWeight: 700, fontSize: 12, borderBottom: "1px solid var(--border)", color: "var(--red)" }}>▼ ROI thấp nhất</div>
                {worstProducts.map((p) => {
                  const pCpa = p.orders > 0 ? p.spend / p.orders : 0;
                  return (
                    <div key={p.id} style={{ display: "flex", alignItems: "center", padding: "6px 12px", borderBottom: "1px solid var(--border)", gap: 8 }}>
                      <div style={{ width: 22, height: 22, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, background: p.roi < 5 ? "var(--red)" : "var(--amber)", color: "#fff", flexShrink: 0 }}>!</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>SP {p.id.substring(0, 12)}...</div>
                        <div className="muted" style={{ fontSize: 10 }}>{p.orders} đơn · <span style={{ color: p.roi < 5 ? "var(--red)" : "var(--amber)" }}>ROI {p.roi.toFixed(1)}</span></div>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 800 }}>{formatVNDCompact(p.revenue)}</div>
                        <div style={{ fontSize: 10, color: "var(--red)" }}>CPA {formatVNDCompact(pCpa)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Collapsible>
      )}

      {/* Daily table */}
      <Collapsible title="CHI TIẾT THEO NGÀY" defaultOpen>
        <div className="tbl-wrap">
          <table>
            <thead><tr>
              <th>NGÀY</th><th className="text-right">SPEND</th><th className="text-right">REVENUE</th><th className="text-right">ĐƠN</th><th className="text-right">TB/ĐƠN</th><th className="text-right">ROI</th><th className="text-right">CPA</th>
            </tr></thead>
            <tbody>
              {byDate.slice().reverse().map(([d, v]) => {
                const dRoi = v.spend > 0 ? v.revenue / v.spend : 0;
                const dCpa = v.orders > 0 ? v.spend / v.orders : 0;
                const dAvg = v.orders > 0 ? v.revenue / v.orders : 0;
                return (
                  <tr key={d}>
                    <td style={{ fontWeight: 600 }}>{d.substring(5)}</td>
                    <td className="text-right" style={{ color: "#FE2C55" }}>{formatVNDCompact(v.spend)}</td>
                    <td className="text-right" style={{ color: "var(--green)" }}>{formatVNDCompact(v.revenue)}</td>
                    <td className="text-right">{v.orders}</td>
                    <td className="text-right muted">{dAvg > 0 ? formatVNDCompact(dAvg) : "—"}</td>
                    <td className="text-right font-bold" style={{ color: dRoi >= 12 ? "var(--green)" : dRoi >= 8 ? "var(--amber)" : dRoi > 0 ? "var(--red)" : "var(--muted)" }}>{dRoi > 0 ? dRoi.toFixed(1) : "—"}</td>
                    <td className="text-right muted">{dCpa > 0 ? formatVNDCompact(dCpa) : "—"}</td>
                  </tr>
                );
              })}
              {byDate.length > 0 && (
                <tr style={{ fontWeight: 700, background: "var(--blue)", color: "#fff" }}>
                  <td>Tổng kỳ</td>
                  <td className="text-right">{formatVNDCompact(totals.spend)}</td>
                  <td className="text-right">{formatVNDCompact(totals.revenue)}</td>
                  <td className="text-right">{totals.orders}</td>
                  <td className="text-right">{formatVNDCompact(avgOrder)}</td>
                  <td className="text-right">{roi.toFixed(1)}</td>
                  <td className="text-right">{formatVNDCompact(cpa)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Collapsible>

      {/* Monthly summary */}
      {monthly.length > 1 && (
        <Collapsible title="TỔNG HỢP THEO THÁNG" defaultOpen={false}>
          <div className="tbl-wrap">
            <table>
              <thead><tr>
                <th>THÁNG</th><th className="text-right">SPEND</th><th className="text-right">REVENUE</th><th className="text-right">ĐƠN</th><th className="text-right">ROI</th><th className="text-right">CPA</th>
              </tr></thead>
              <tbody>
                {monthly.map(([month, v]) => {
                  const mRoi = v.spend > 0 ? v.revenue / v.spend : 0;
                  const mCpa = v.orders > 0 ? v.spend / v.orders : 0;
                  return (
                    <tr key={month}>
                      <td style={{ fontWeight: 600 }}>{month}</td>
                      <td className="text-right" style={{ color: "#FE2C55" }}>{formatVNDCompact(v.spend)}</td>
                      <td className="text-right" style={{ color: "var(--green)" }}>{formatVNDCompact(v.revenue)}</td>
                      <td className="text-right">{v.orders.toLocaleString("vi-VN")}</td>
                      <td className="text-right font-bold" style={{ color: mRoi >= 10 ? "var(--green)" : "var(--amber)" }}>{mRoi.toFixed(2)}</td>
                      <td className="text-right muted">{formatVNDCompact(mCpa)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Collapsible>
      )}
    </>
  );
}

/* ═══════════════════════════════════════════════════════════
   DUAL BAR CHART — Spend + Revenue
   ═══════════════════════════════════════════════════════════ */
function DualBar({ data }: { data: [string, { spend: number; revenue: number }][] }) {
  if (data.length === 0) return <div className="muted" style={{ padding: 24, textAlign: "center" }}>Không có data.</div>;
  const maxRev = Math.max(...data.map(([, v]) => v.revenue));
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 180, overflowX: "auto", paddingTop: 16 }}>
      {data.map(([d, v]) => {
        const hR = maxRev > 0 ? (v.revenue / maxRev) * 130 : 0;
        const hS = maxRev > 0 ? (v.spend / maxRev) * 130 : 0;
        return (
          <div key={d} style={{ flex: 1, minWidth: 36, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }} title={`${d}\nSpend: ${formatVND(v.spend)}\nRevenue: ${formatVND(v.revenue)}`}>
            <div style={{ fontSize: 9, color: "var(--muted)", whiteSpace: "nowrap" }}>{formatVNDCompact(v.revenue)}</div>
            <div style={{ display: "flex", gap: 2, alignItems: "flex-end" }}>
              <div style={{ width: 10, height: Math.max(hS, 2), background: "#FE2C55", borderRadius: "2px 2px 0 0", opacity: 0.7 }} />
              <div style={{ width: 10, height: Math.max(hR, 2), background: "var(--green)", borderRadius: "2px 2px 0 0", opacity: 0.7 }} />
            </div>
            <div style={{ fontSize: 9, color: "var(--subtle)" }}>{d.substring(5)}</div>
          </div>
        );
      })}
    </div>
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
        <div className="stat-card" style={{ borderLeft: "3px solid #25F4EE" }}><div className="sl">GMV THÀNH CÔNG</div><div className="sv">{formatVNDCompact(totals.revenue)}</div><div className="muted" style={{ fontSize: 10 }}>Không tính huỷ/hoàn</div></div>
        <div className="stat-card" style={{ borderLeft: "3px solid #FE2C55" }}><div className="sl">SỐ ĐƠN</div><div className="sv">{totals.orders.toLocaleString("vi-VN")}</div><div className="muted" style={{ fontSize: 10 }}>Đơn thành công</div></div>
        <div className="stat-card" style={{ borderLeft: "3px solid #000000" }}><div className="sl">TB / ĐƠN</div><div className="sv">{formatVNDCompact(avgOrder)}</div></div>
        <div className="stat-card" style={{ borderLeft: "3px solid #FE2C55" }}><div className="sl">HUỶ / HOÀN</div><div className="sv">—</div><div className="muted" style={{ fontSize: 10 }}>Chưa có data</div></div>
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
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>
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
        // Only show value labels for every Nth point to avoid overlap, offset by series index
        const labelStep = Math.max(1, Math.ceil(dates.length / 7));
        const labelOffset = si % labelStep;
        return (
          <g key={src}>
            <path d={pathD} fill="none" stroke={color} strokeWidth={2} />
            {points.map((p, i) => (
              <g key={i}>
                <circle cx={p.x} cy={p.y} r={3} fill={color} />
                {p.val > 0 && (i % labelStep === labelOffset) && (
                  <text x={p.x} y={p.y - 6 - si * 10} textAnchor="middle" fill={color} fontSize={8} fontWeight={600}>
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
/* ═══════════════════════════════════════════════════════════
   CSV UPLOAD BUTTON — for GMV Max / manual ads data
   ═══════════════════════════════════════════════════════════ */
function CsvUploadButton({ onDone }: { onDone?: () => void }) {
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setResult(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("promotion_type", "GMV_MAX");
      form.append("advertiser_id", "gmv_max");
      const res = await fetch("/api/tiktok/upload-ads", { method: "POST", body: form });
      const json = await res.json();
      if (json.ok) {
        setResult(`✓ ${json.fetched} dòng · ${json.dateRange || ""}`);
        onDone?.();
      } else {
        setResult(json.error || "Lỗi");
      }
    } catch (err) {
      setResult((err as Error).message);
    } finally {
      setUploading(false);
      e.target.value = "";
      setTimeout(() => setResult(null), 5000);
    }
  }

  return (
    <label className="btn btn-ghost btn-xs" style={{ cursor: "pointer", minWidth: 90, position: "relative" }}>
      {uploading ? (
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 12, height: 12, border: "2px solid var(--border)", borderTopColor: "var(--blue)", borderRadius: "50%", display: "inline-block", animation: "spin .6s linear infinite" }} />
          Uploading...
        </span>
      ) : result ? (
        <span style={{ color: result.startsWith("✓") ? "var(--green)" : "var(--red)", fontSize: 10 }}>{result.substring(0, 40)}</span>
      ) : (
        <>↑ GMV Max CSV</>
      )}
      <input type="file" accept=".csv,.tsv,.txt" onChange={handleFile} style={{ display: "none" }} disabled={uploading} />
    </label>
  );
}

/* ═══ STACKED ADS + REVENUE CHART ═══ */
function AdsRevenueChart({ ads, gmvMax, nhanhRevenue }: {
  ads: TiktokAdsRow[]; gmvMax: GmvMaxRow[]; nhanhRevenue: TiktokNhanhRow[];
}) {
  // Build daily data
  const daily = useMemo(() => {
    const map = new Map<string, { bm: number; gmvSpend: number; gmvRev: number; rev: number }>();
    for (const a of ads) {
      const d = String(a.date).substring(0, 10);
      const cur = map.get(d) || { bm: 0, gmvSpend: 0, gmvRev: 0, rev: 0 };
      cur.bm += toNum(a.spend);
      map.set(d, cur);
    }
    for (const g of gmvMax) {
      const d = String(g.date).substring(0, 10);
      const cur = map.get(d) || { bm: 0, gmvSpend: 0, gmvRev: 0, rev: 0 };
      cur.gmvSpend += Number(g.spend || 0);
      cur.gmvRev += Number(g.gross_revenue || 0);
      map.set(d, cur);
    }
    for (const r of nhanhRevenue) {
      const d = String(r.date).substring(0, 10);
      const cur = map.get(d) || { bm: 0, gmvSpend: 0, gmvRev: 0, rev: 0 };
      cur.rev += r.revenue;
      map.set(d, cur);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [ads, gmvMax, nhanhRevenue]);

  if (daily.length === 0) return <div className="muted" style={{ padding: 24, textAlign: "center" }}>Không có data.</div>;

  const maxSpend = Math.max(...daily.map(([, d]) => d.bm + d.gmvSpend));
  const maxRev = Math.max(...daily.map(([, d]) => d.rev));
  const totalBm = daily.reduce((s, [, d]) => s + d.bm, 0);
  const totalGmv = daily.reduce((s, [, d]) => s + d.gmvSpend, 0);
  const totalRev = daily.reduce((s, [, d]) => s + d.rev, 0);
  const barH = 200;

  // Revenue line: scale to top 40% of chart (bars take bottom 60%)
  const revPoints = daily.map(([, d], i) => {
    const x = ((i + 0.5) / daily.length) * 100;
    const y = maxRev > 0 ? 15 + (1 - d.rev / maxRev) * 50 : 65;
    return `${x},${y}`;
  });

  return (
    <>
      {/* Chart 1: Stacked Ads + Revenue Line */}
      <div style={{ position: "relative", height: barH + 30, marginBottom: 8 }}>
        {/* Bars — scale to bottom 55% */}
        <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: barH, position: "relative", zIndex: 2, borderBottom: "1px solid #E2E8F0", paddingTop: 20 }}>
          {daily.map(([date, d]) => {
            const total = d.bm + d.gmvSpend;
            const bmH = maxSpend > 0 ? (d.bm / maxSpend) * barH * 0.5 : 0;
            const gmvH = maxSpend > 0 ? (d.gmvSpend / maxSpend) * barH * 0.5 : 0;
            return (
              <div key={date} style={{ flex: 1, minWidth: 20, display: "flex", flexDirection: "column", alignItems: "center" }} title={`${date}: BM ${formatVNDCompact(d.bm)} + GMV ${formatVNDCompact(d.gmvSpend)} = ${formatVNDCompact(total)}`}>
                <div style={{ fontSize: 8, fontWeight: 700, color: "#374151", marginBottom: 2, whiteSpace: "nowrap" }}>{formatVNDCompact(total)}</div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%" }}>
                  <div style={{ width: "60%", height: gmvH, background: "#FF9500", borderRadius: "3px 3px 0 0", minWidth: 14 }} />
                  <div style={{ width: "60%", height: bmH, background: "#FE2C55", borderRadius: "0 0 3px 3px", minWidth: 14 }} />
                </div>
              </div>
            );
          })}
        </div>
        {/* Revenue Line Overlay — in top portion */}
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: "absolute", top: 0, left: 0, width: "100%", height: barH, zIndex: 3, pointerEvents: "none" }}>
          <polygon points={`0,65 ${revPoints.join(" ")} 100,65`} fill="rgba(22,163,74,0.08)" />
          <polyline points={revPoints.join(" ")} fill="none" stroke="#16A34A" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
          {/* circles removed — non-scaling-stroke không fix circle stretch */}
        </svg>
        {/* Date labels */}
        <div style={{ display: "flex", gap: 3, marginTop: 6 }}>
          {daily.map(([date]) => (
            <div key={date} style={{ flex: 1, textAlign: "center", fontSize: 9, color: "#94A3B8" }}>{date.substring(5)}</div>
          ))}
        </div>
      </div>
      {/* Legend */}
      <div style={{ display: "flex", gap: 14, alignItems: "center", paddingTop: 8, borderTop: "1px solid #F1F5F9", fontSize: 10, color: "#64748B", flexWrap: "wrap" }}>
        <span><span style={{ display: "inline-block", width: 9, height: 9, borderRadius: 2, background: "#FE2C55", verticalAlign: "middle", marginRight: 4 }} />BM {formatVNDCompact(totalBm)}</span>
        <span><span style={{ display: "inline-block", width: 9, height: 9, borderRadius: 2, background: "#FF9500", verticalAlign: "middle", marginRight: 4 }} />GMV Max {formatVNDCompact(totalGmv)}</span>
        <span><span style={{ display: "inline-block", width: 14, height: 2, borderRadius: 1, background: "#16A34A", verticalAlign: "middle", marginRight: 4 }} />Doanh thu</span>
        <span style={{ marginLeft: "auto", fontWeight: 700, color: "#18181B" }}>Tổng Ads: {formatVNDCompact(totalBm + totalGmv)} · ROAS: {(totalBm + totalGmv) > 0 ? (totalRev / (totalBm + totalGmv)).toFixed(1) + "x" : "—"}</span>
      </div>

      {/* Chart 2: GMV Max Detail */}
      <div style={{ marginTop: 20, paddingTop: 14, borderTop: "1px solid #E2E8F0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#92400E" }}>GMV MAX CHI TIẾT</div>
          <div style={{ fontSize: 9, padding: "2px 8px", borderRadius: 4, background: "#FFF7ED", color: "#92400E", fontWeight: 600 }}>
            {formatVNDCompact(daily.reduce((s, [, d]) => s + d.gmvRev, 0))} DT · {formatVNDCompact(totalGmv)} Ads · ROI {totalGmv > 0 ? (daily.reduce((s, [, d]) => s + d.gmvRev, 0) / totalGmv).toFixed(1) : "—"}
          </div>
        </div>
        <GmvMaxMiniChart daily={daily} />
      </div>
    </>
  );
}

function GmvMaxMiniChart({ daily }: { daily: [string, { bm: number; gmvSpend: number; gmvRev: number; rev: number }][] }) {
  const maxGmvSpend = Math.max(...daily.map(([, d]) => d.gmvSpend));
  const maxGmvRev = Math.max(...daily.map(([, d]) => d.gmvRev));
  const miniH = 130;

  // Revenue line in top portion
  const revPoints = daily.map(([, d], i) => {
    const x = ((i + 0.5) / daily.length) * 100;
    const y = maxGmvRev > 0 ? 10 + (1 - d.gmvRev / maxGmvRev) * 50 : 60;
    return `${x},${y}`;
  });

  return (
    <>
      <div style={{ position: "relative", height: miniH + 30 }}>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: miniH, borderBottom: "1px solid #E2E8F0", position: "relative", zIndex: 2, paddingTop: 16 }}>
          {daily.map(([date, d]) => {
            const h = maxGmvSpend > 0 ? (d.gmvSpend / maxGmvSpend) * miniH * 0.45 : 0;
            const roi = d.gmvSpend > 0 ? d.gmvRev / d.gmvSpend : 0;
            const barColor = roi >= 10 ? "#16A34A" : "#DC2626";
            return (
              <div key={date} style={{ flex: 1, minWidth: 18, display: "flex", flexDirection: "column", alignItems: "center" }} title={`${date}: Spend ${formatVNDCompact(d.gmvSpend)} · Rev ${formatVNDCompact(d.gmvRev)} · ROI ${roi.toFixed(1)}`}>
                <div style={{ fontSize: 8, fontWeight: 700, color: barColor, marginBottom: 2 }}>{d.gmvSpend > 0 ? roi.toFixed(1) + "x" : ""}</div>
                <div style={{ width: "55%", height: h, background: barColor, borderRadius: "3px 3px 0 0", minWidth: 12 }} />
              </div>
            );
          })}
        </div>
        {/* Revenue line */}
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: "absolute", top: 0, left: 0, width: "100%", height: miniH, zIndex: 3, pointerEvents: "none" }}>
          <polygon points={`0,60 ${revPoints.join(" ")} 100,60`} fill="rgba(22,163,74,0.06)" />
          <polyline points={revPoints.join(" ")} fill="none" stroke="#16A34A" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
          {/* circles removed */}
        </svg>
        <div style={{ display: "flex", gap: 3, marginTop: 6 }}>
          {daily.map(([date]) => (
            <div key={date} style={{ flex: 1, textAlign: "center", fontSize: 9, color: "#94A3B8" }}>{date.substring(8)}</div>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", gap: 16, alignItems: "center", paddingTop: 8, fontSize: 10, color: "#64748B" }}>
        <span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: "#16A34A", verticalAlign: "middle", marginRight: 5 }} />ROI &ge; 10</span>
        <span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: "#DC2626", verticalAlign: "middle", marginRight: 5 }} />ROI &lt; 10</span>
        <span><span style={{ display: "inline-block", width: 16, height: 2, borderRadius: 1, background: "#16A34A", verticalAlign: "middle", marginRight: 5 }} />DT GMV Max</span>
      </div>
    </>
  );
}

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
