"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatVND, formatVNDCompact, toNum } from "@/lib/format";
import type { ShopeeAdsRow, ShopeeDailyRow } from "@/lib/db/shopee";
import SyncButton from "../components/SyncButton";
import TargetProgressBar from "../components/TargetProgressBar";

type NhanhRow = { date: string; source: string; revenue: number; orders: number };

function daysAgo(d: number): string { const dt = new Date(); dt.setDate(dt.getDate() + d); return dt.toISOString().substring(0, 10); }
function monthRange(offset: number) {
  const now = new Date(); const y = now.getFullYear(); const m = now.getMonth() + offset;
  const first = new Date(y, m, 1); const last = offset === 0 ? now : new Date(y, m + 1, 0);
  return { from: first.toISOString().substring(0, 10), to: last.toISOString().substring(0, 10) };
}

const QUICK_RANGES = [
  { key: "today", label: "Hôm nay", from: daysAgo(0), to: daysAgo(0) },
  { key: "yesterday", label: "Hôm qua", from: daysAgo(-1), to: daysAgo(-1) },
  { key: "7d", label: "7 ngày", from: daysAgo(-7), to: daysAgo(0) },
  { key: "14d", label: "14 ngày", from: daysAgo(-14), to: daysAgo(0) },
  { key: "30d", label: "30 ngày", from: daysAgo(-30), to: daysAgo(0) },
  { key: "month", label: "Tháng này", ...monthRange(0) },
  { key: "prev", label: "Tháng trước", ...monthRange(-1) },
];

export default function ShopeeAdsView({
  ads, daily, shops, from, to, shop,
  monthTarget = 0, monthActual = 0, monthKey = "", nhanhRevenue = [],
}: {
  ads: ShopeeAdsRow[]; daily: ShopeeDailyRow[]; shops: string[];
  from: string; to: string; shop: string;
  monthTarget?: number; monthActual?: number; monthKey?: string; nhanhRevenue?: NhanhRow[];
}) {
  const router = useRouter();
  const [f, setF] = useState(from);
  const [t, setT] = useState(to);
  const [activeShop, setActiveShop] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  const [shopeeShops, setShopeeShops] = useState<Array<{ shop_id: string; shop_name: string; token_ok: boolean; expire_in_hours: number }>>([]);

  function quickRange(qr: { from: string; to: string }) { router.push(`/shopee-ads?from=${qr.from}&to=${qr.to}`); }
  function apply() { router.push(`/shopee-ads?from=${f}&to=${t}`); }

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true); setUploadMsg(null);
    try {
      const form = new FormData(); form.append("file", file);
      const res = await fetch("/api/shopee/upload-csv", { method: "POST", body: form });
      const r = await res.json();
      if (r.ok) { setUploadMsg(`✓ Upload ${r.rows} campaigns`); router.refresh(); }
      else setUploadMsg(`✖ ${r.error}`);
    } catch (err) { setUploadMsg(`✖ ${(err as Error).message}`); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  }

  useEffect(() => { checkShopeeStatus(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  async function checkShopeeStatus() {
    try {
      const res = await fetch("/api/shopee/shops", { credentials: "include" });
      if (res.redirected) return;
      const r = await res.json();
      if (r.ok) setShopeeShops(r.shops || []);
    } catch { /* ignore */ }
  }

  async function connectShopee() {
    try {
      const res = await fetch("/api/shopee/connect", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const r = await res.json();
      if (r.ok && r.url) window.open(r.url, "_blank");
    } catch { /* ignore */ }
  }

  const filteredAds = useMemo(() => activeShop ? ads.filter((a) => a.shop === activeShop) : ads, [ads, activeShop]);

  // ── Totals ──
  const totals = useMemo(() => filteredAds.reduce(
    (acc, r) => ({ spend: acc.spend + toNum(r.spend), impressions: acc.impressions + toNum(r.impressions), clicks: acc.clicks + toNum(r.clicks), orders: acc.orders + toNum(r.orders), revenue: acc.revenue + toNum(r.revenue) }),
    { spend: 0, impressions: 0, clicks: 0, orders: 0, revenue: 0 },
  ), [filteredAds]);

  const nhanhTotals = useMemo(() => nhanhRevenue.reduce(
    (acc, r) => ({ revenue: acc.revenue + r.revenue, orders: acc.orders + r.orders }), { revenue: 0, orders: 0 },
  ), [nhanhRevenue]);

  const roas = totals.spend > 0 ? nhanhTotals.revenue / totals.spend : 0;

  // ── Daily chart: nhanh rev vs ads spend (using period_from) ──
  const dailyChart = useMemo(() => {
    const nhMap = new Map<string, { revenue: number; orders: number }>();
    for (const r of nhanhRevenue) { const c = nhMap.get(r.date) || { revenue: 0, orders: 0 }; c.revenue += r.revenue; c.orders += r.orders; nhMap.set(r.date, c); }
    const adMap = new Map<string, number>();
    for (const a of filteredAds) { const d = String(a.period_from || a.date).substring(0, 10); adMap.set(d, (adMap.get(d) || 0) + toNum(a.spend)); }
    const allDates = new Set([...nhMap.keys(), ...adMap.keys()]);
    return Array.from(allDates).sort().map((d) => ({ date: d, revenue: nhMap.get(d)?.revenue || 0, spend: adMap.get(d) || 0, orders: nhMap.get(d)?.orders || 0 }));
  }, [nhanhRevenue, filteredAds]);

  // ── Shop performance ──
  const shopPerf = useMemo(() => {
    const m = new Map<string, { revenue: number; orders: number; spend: number }>();
    for (const r of nhanhRevenue) {
      const c = m.get(r.source) || { revenue: 0, orders: 0, spend: 0 };
      c.revenue += r.revenue; c.orders += r.orders;
      m.set(r.source, c);
    }
    for (const a of filteredAds) {
      if (!a.shop) continue;
      const c = m.get(a.shop) || { revenue: 0, orders: 0, spend: 0 };
      c.spend += toNum(a.spend);
      m.set(a.shop, c);
    }
    return Array.from(m.entries()).map(([name, v]) => ({ name, ...v, roas: v.spend > 0 ? v.revenue / v.spend : 0, ratio: v.revenue > 0 ? (v.spend / v.revenue) * 100 : 0 })).sort((a, b) => b.revenue - a.revenue);
  }, [nhanhRevenue, filteredAds]);

  // ── Top campaigns ──
  const topCampaigns = useMemo(() => {
    const m = new Map<string, { spend: number; revenue: number; orders: number }>();
    for (const a of filteredAds) {
      const name = a.campaign_name || "—";
      const c = m.get(name) || { spend: 0, revenue: 0, orders: 0 };
      c.spend += toNum(a.spend); c.revenue += toNum(a.revenue); c.orders += toNum(a.orders);
      m.set(name, c);
    }
    return Array.from(m.entries())
      .map(([name, v]) => ({ name, ...v, roas: v.spend > 0 ? v.revenue / v.spend : 0 }))
      .sort((a, b) => b.roas - a.roas).slice(0, 10);
  }, [filteredAds]);

  return (
    <section className="section">
      {/* ═══ TARGET PROGRESS ═══ */}
      <TargetProgressBar channel="Shopee" monthTarget={monthTarget} monthActual={monthActual} monthKey={monthKey} color="#EE4D2D" />

      {/* ═══ HEADER ═══ */}
      <div className="page-hdr">
        <div>
          <div className="page-title"><span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 24, height: 24, borderRadius: "50%", background: "#EE4D2D", color: "#fff", fontSize: 13, fontWeight: 700, marginRight: 8, verticalAlign: "middle" }}>S</span>Shopee</div>
          <div className="page-sub">{from} → {to} · {filteredAds.length} campaigns</div>
        </div>
        <div className="row" style={{ gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <SyncButton url="/api/nhanh/sync-sales" label="⟳ Sync Nhanh" onDone={() => router.refresh()} style={{ background: "#FFF7ED", border: "1px solid #FDBA74" }} />
          <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={onUpload} style={{ display: "none" }} />
          <button className="btn btn-ghost btn-xs" onClick={() => fileRef.current?.click()} disabled={uploading}
            style={{ background: "#F0FDF4", border: "1px solid #86EFAC" }}>
            {uploading ? "Uploading..." : "⬆ Upload CSV"}
          </button>
        </div>
      </div>

      {uploadMsg && <div className={`card ${uploadMsg.startsWith("✓") ? "bar-green" : "bar-red"}`} style={{ marginBottom: 12 }}>{uploadMsg}</div>}

      {/* ═══ QUICK FILTERS ═══ */}
      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
        {QUICK_RANGES.map((r) => {
          const active = from === r.from && to === r.to;
          return <button key={r.key} className="btn btn-ghost btn-xs" onClick={() => quickRange(r)} style={{ background: active ? "var(--blue)" : undefined, color: active ? "#fff" : undefined }}>{r.label}</button>;
        })}
        <span style={{ width: 1, height: 20, background: "var(--border)" }} />
        <input type="date" value={f} onChange={(e) => setF(e.target.value)} style={{ fontSize: 12, width: 130 }} />
        <span className="muted">→</span>
        <input type="date" value={t} onChange={(e) => setT(e.target.value)} style={{ fontSize: 12, width: 130 }} />
        <button className="btn btn-ghost btn-xs" onClick={apply}>Áp dụng</button>
      </div>

      {/* ═══ API STATUS ═══ */}
      <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 14px", marginBottom: 12, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, fontWeight: 700 }}>Shopee Open API</span>
        <button className="btn btn-ghost btn-xs" onClick={connectShopee} style={{ fontSize: 10, background: "#EFF6FF", border: "1px solid #93C5FD" }}>＋ Kết nối</button>
        {shopeeShops.map((sh) => (
          <span key={sh.shop_id} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, fontWeight: 600, background: sh.token_ok ? "#F0FDF4" : "#FEF2F2", color: sh.token_ok ? "#16A34A" : "#DC2626" }}>
            {sh.shop_name}: {sh.token_ok ? `✓ OK (${sh.expire_in_hours}h)` : "✖ Chưa kết nối"}
          </span>
        ))}
        <span style={{ fontSize: 9, color: "#9CA3AF" }}>Ads: upload CSV · Đơn hàng: API</span>
      </div>

      {/* ═══ SHOP TABS ═══ */}
      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
        <button className="btn btn-ghost btn-xs" onClick={() => setActiveShop("")} style={{ background: !activeShop ? "var(--blue)" : undefined, color: !activeShop ? "#fff" : undefined }}>Tất cả</button>
        {shops.map((sh) => (
          <button key={sh} className="btn btn-ghost btn-xs" onClick={() => setActiveShop(sh)} style={{ background: activeShop === sh ? "var(--blue)" : undefined, color: activeShop === sh ? "#fff" : undefined }}>{sh}</button>
        ))}
      </div>

      {/* ═══ KPI CARDS ═══ */}
      <div className="stat-grid">
        <div className="stat-card" style={{ borderLeft: "3px solid #EE4D2D" }}><div className="sl">DT SHOPEE (NHANH)</div><div className="sv">{formatVND(nhanhTotals.revenue)}</div><div className="ss">nhanh.vn</div></div>
        <div className="stat-card" style={{ borderLeft: "3px solid #F57C51" }}><div className="sl">CHI PHÍ ADS</div><div className="sv">{formatVND(totals.spend)}</div><div className="ss">upload CSV</div></div>
        <div className="stat-card" style={{ borderLeft: "3px solid #D73A1A" }}><div className="sl">ROAS</div><div className="sv" style={{ color: roas >= 5 ? "var(--green)" : "var(--red)" }}>{roas.toFixed(1)}x</div><div className="ss">DT/ads</div></div>
        <div className="stat-card" style={{ borderLeft: "3px solid #FF6633" }}><div className="sl">LƯỢT CLICK</div><div className="sv">{totals.clicks.toLocaleString("vi-VN")}</div></div>
      </div>

      {/* ═══ COMBO CHART: Bar (DT) + Line (Ads) ═══ */}
      {dailyChart.length > 0 && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>
            Doanh thu &amp; Chi phí ads theo ngày
            <span style={{ fontWeight: 400, fontSize: 10, color: "#9CA3AF", marginLeft: 8 }}>
              <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: "#16A34A", marginRight: 3, verticalAlign: "middle" }} />DT Nhanh (cột)
              <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 50, background: "#EF4444", marginRight: 3, marginLeft: 10, verticalAlign: "middle" }} />Chi phí ads (đường)
            </span>
          </div>
          {(() => {
            const maxRev = Math.max(...dailyChart.map((d) => d.revenue), 1);
            const maxSpend = Math.max(...dailyChart.map((d) => d.spend), 1);
            const BAR_H = 160, chartH = BAR_H - 20;
            const labelStep = Math.max(1, Math.floor(dailyChart.length / 15));
            const today = new Date().toISOString().substring(0, 10);
            return (
              <div>
                <div style={{ position: "relative", height: BAR_H }}>
                  <div style={{ display: "flex", alignItems: "flex-end", height: BAR_H, position: "relative", zIndex: 1 }}>
                    {dailyChart.map((d) => {
                      const h = (d.revenue / maxRev) * chartH;
                      const inc = d.date >= today;
                      return (
                        <div key={d.date} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", background: inc ? "rgba(254,202,202,0.15)" : "transparent" }}>
                          {d.revenue > 0 && <div style={{ fontSize: 7, fontWeight: 600, color: "#16A34A", marginBottom: 1, whiteSpace: "nowrap" }}>{formatVNDCompact(d.revenue)}</div>}
                          <div style={{ width: "78%", height: Math.max(h, 2), background: inc ? "#FCA5A5" : "#EE4D2D", borderRadius: "2px 2px 0 0", opacity: inc ? 0.6 : 1 }} />
                        </div>
                      );
                    })}
                  </div>
                  {/* Line overlay */}
                  <svg style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 2 }}
                    viewBox={`0 0 ${dailyChart.length * 100} ${BAR_H}`} preserveAspectRatio="none">
                    {(() => {
                      const pts = dailyChart.map((d, i) => ({ x: i * 100 + 50, y: BAR_H - (maxSpend > 0 ? (d.spend / maxSpend) * chartH * 0.85 : 0) - 10, val: d.spend }));
                      const validPts = pts.filter((p) => p.val > 0);
                      if (validPts.length < 2) return null;
                      return (
                        <g>
                          <path d={validPts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ")} fill="none" stroke="#EF4444" strokeWidth={2.5} vectorEffect="non-scaling-stroke" />
                          {validPts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={4} fill="#EF4444" vectorEffect="non-scaling-stroke" />)}
                        </g>
                      );
                    })()}
                  </svg>
                </div>
                {/* Ads spend labels */}
                <div style={{ display: "flex" }}>
                  {dailyChart.map((d, i) => (
                    <div key={`al-${d.date}`} style={{ flex: 1, textAlign: "center", fontSize: 6, color: "#EF4444", fontWeight: 600 }}>
                      {d.spend > 0 && i % Math.max(1, Math.ceil(dailyChart.length / 10)) === 0 ? formatVNDCompact(d.spend) : ""}
                    </div>
                  ))}
                </div>
                {/* Date labels */}
                <div style={{ display: "flex", borderTop: "1px solid #E5E7EB" }}>
                  {dailyChart.map((d, i) => (
                    <div key={`dl-${d.date}`} style={{ flex: 1, textAlign: "center", fontSize: 8, padding: "3px 0", color: d.date >= today ? "#EF4444" : "#999", fontWeight: d.date >= today ? 600 : 400 }}>
                      {i % labelStep === 0 ? d.date.substring(8) : ""}
                    </div>
                  ))}
                </div>
                {/* Total */}
                <div style={{ display: "flex", gap: 16, padding: "8px 12px", background: "#F9FAFB", borderRadius: 6, marginTop: 6, fontSize: 11 }}>
                  <span style={{ color: "#6B7280" }}>Tổng:</span>
                  <span>DT <strong style={{ color: "#16A34A" }}>{formatVNDCompact(nhanhTotals.revenue)}</strong></span>
                  <span>Ads <strong style={{ color: "#DC2626" }}>{formatVNDCompact(totals.spend)}</strong></span>
                  <span>Tỉ lệ <strong style={{ color: "#DC2626" }}>{nhanhTotals.revenue > 0 ? ((totals.spend / nhanhTotals.revenue) * 100).toFixed(1) : 0}%</strong></span>
                  <span>ROAS <strong style={{ color: roas >= 5 ? "#16A34A" : "#DC2626" }}>{roas.toFixed(1)}</strong></span>
                  <span>Đơn <strong>{nhanhTotals.orders.toLocaleString("vi-VN")}</strong></span>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* ═══ HIỆU QUẢ THEO SHOP — stacked chart ═══ */}
      {shopPerf.length > 0 && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Hiệu quả theo Shop</div>
          <div style={{ display: "flex", gap: 12, fontSize: 10, color: "#6B7280", marginBottom: 10 }}>
            <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: "#EE4D2D", marginRight: 3, verticalAlign: "middle" }} />Doanh thu</span>
            <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: "#F87171", marginRight: 3, verticalAlign: "middle" }} />Chi phí Ads</span>
          </div>
          {(() => {
            const maxVal = Math.max(...shopPerf.map((s) => s.revenue + s.spend), 1);
            return (
              <div>
                <div style={{ display: "flex", alignItems: "flex-end", height: 130 }}>
                  {shopPerf.map((s) => {
                    const total = s.revenue + s.spend;
                    const h = (total / maxVal) * 110;
                    const revH = total > 0 ? (s.revenue / total) * h : h;
                    const spendH = total > 0 ? (s.spend / total) * h : 0;
                    return (
                      <div key={s.name} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end" }}>
                        <div style={{ fontSize: 9, fontWeight: 700, marginBottom: 2 }}>{formatVNDCompact(s.revenue)}</div>
                        <div style={{ width: "75%", borderRadius: "3px 3px 0 0", overflow: "hidden", display: "flex", flexDirection: "column" }}>
                          <div style={{ height: Math.max(revH, 1), background: "#EE4D2D" }} />
                          {spendH > 0 && (
                            <div style={{ height: Math.max(spendH, 2), background: "#F87171", display: "flex", alignItems: "center", justifyContent: "center" }}>
                              {s.ratio >= 1 && <span style={{ fontSize: 7, fontWeight: 700, color: "#fff" }}>{s.ratio.toFixed(0)}%</span>}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ display: "flex", borderTop: "1px solid var(--border)" }}>
                  {shopPerf.map((s) => (
                    <div key={`n-${s.name}`} style={{ flex: 1, textAlign: "center", padding: "5px 2px 0" }}>
                      <div style={{ fontSize: 11, fontWeight: 700 }}>{s.name}</div>
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", marginTop: 3 }}>
                  {shopPerf.map((s) => (
                    <div key={`d-${s.name}`} style={{ flex: 1, textAlign: "center", fontSize: 9, color: "#6B7280", lineHeight: 1.4 }}>
                      DT <span style={{ fontWeight: 600, color: "#374151" }}>{formatVNDCompact(s.revenue)}</span><br />
                      Ads <span style={{ fontWeight: 600, color: s.spend > 0 ? "#DC2626" : "#9CA3AF" }}>{s.spend > 0 ? formatVNDCompact(s.spend) : "—"}</span><br />
                      Đơn <span style={{ fontWeight: 600, color: "#374151" }}>{s.orders}</span>
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", marginTop: 4 }}>
                  {shopPerf.map((s) => {
                    const color = s.spend <= 0 ? "#9CA3AF" : s.roas >= 10 ? "#16A34A" : "#DC2626";
                    const bg = s.spend <= 0 ? "#F9FAFB" : s.roas >= 10 ? "#F0FDF4" : "#FEF2F2";
                    return (
                      <div key={`r-${s.name}`} style={{ flex: 1, textAlign: "center", fontSize: 11, fontWeight: 700, padding: "3px 0", borderRadius: 3, margin: "0 2px", color, background: bg }}>
                        {s.spend > 0 ? `ROAS ${s.roas.toFixed(1)}x` : "—"}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* ═══ CAMPAIGNS TABLE + TOP SIDEBAR ═══ */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 10, marginBottom: 14 }}>
        <div className="card" style={{ padding: 0 }}>
          <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", fontWeight: 700, fontSize: 12 }}>
            Chiến dịch · {filteredAds.length}
          </div>
          <div style={{ display: "flex", gap: 12, padding: "6px 14px", background: "#F9FAFB", borderBottom: "1px solid var(--border)", fontSize: 10, color: "#6B7280" }}>
            <span>Chi tiêu <strong style={{ color: "#DC2626" }}>{formatVNDCompact(totals.spend)}</strong></span>
            <span>DT ads <strong>{formatVNDCompact(totals.revenue)}</strong></span>
            <span>ROAS ads <strong style={{ color: totals.spend > 0 && totals.revenue / totals.spend >= 5 ? "#16A34A" : "#DC2626" }}>{totals.spend > 0 ? (totals.revenue / totals.spend).toFixed(1) : "—"}x</strong></span>
            <span>{totals.clicks.toLocaleString("vi-VN")} clicks</span>
          </div>
          <div className="tbl-wrap" style={{ maxHeight: 400, overflowY: "auto" }}>
            <table>
              <thead><tr><th>CHIẾN DỊCH</th><th>SHOP</th><th className="text-right">CHI TIÊU</th><th className="text-right">CLICK</th><th className="text-right">ĐƠN</th><th className="text-right">DT ADS</th><th className="text-right">ROAS</th></tr></thead>
              <tbody>
                {filteredAds.slice(0, 200).map((a) => {
                  const r = toNum(a.roas);
                  return (
                    <tr key={a.id}>
                      <td style={{ maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={a.campaign_name || ""}>{a.campaign_name || "—"}</td>
                      <td className="muted" style={{ fontSize: 10 }}>{a.shop || "—"}</td>
                      <td className="text-right" style={{ color: "var(--red)", fontWeight: 600 }}>{formatVNDCompact(toNum(a.spend))}</td>
                      <td className="text-right muted">{toNum(a.clicks).toLocaleString("vi-VN")}</td>
                      <td className="text-right">{toNum(a.orders)}</td>
                      <td className="text-right">{formatVNDCompact(toNum(a.revenue))}</td>
                      <td className="text-right font-bold" style={{ color: r >= 5 ? "var(--green)" : "var(--red)" }}>{r.toFixed(1)}x</td>
                    </tr>
                  );
                })}
                {filteredAds.length === 0 && <tr><td colSpan={7} className="muted" style={{ textAlign: "center", padding: 24 }}>Không có campaign nào.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        {/* Top campaigns */}
        <div className="card" style={{ padding: 0 }}>
          <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", fontWeight: 700, fontSize: 12 }}>Top chiến dịch</div>
          <div style={{ padding: "8px 12px" }}>
            {topCampaigns.map((c, i) => (
              <div key={c.name} style={{ display: "flex", alignItems: "flex-start", gap: 6, padding: "5px 0", borderBottom: i < topCampaigns.length - 1 ? "1px solid #F3F4F6" : "none" }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: "#9CA3AF", minWidth: 16 }}>{i + 1}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 10, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={c.name}>{c.name}</div>
                  <div style={{ fontSize: 9, color: "#6B7280" }}>Chi <span style={{ color: "#DC2626" }}>{formatVNDCompact(c.spend)}</span> · {c.orders} đơn</div>
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, color: c.roas >= 5 ? "#16A34A" : c.roas > 0 ? "#DC2626" : "#9CA3AF", whiteSpace: "nowrap" }}>
                  {c.roas > 0 ? c.roas.toFixed(1) + "x" : "—"}
                </span>
              </div>
            ))}
            {topCampaigns.length === 0 && <div className="muted" style={{ padding: 12, textAlign: "center", fontSize: 11 }}>Không có data.</div>}
          </div>
        </div>
      </div>
    </section>
  );
}
