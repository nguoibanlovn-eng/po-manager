"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { formatVND, formatVNDCompact, toNum } from "@/lib/format";
import type { ShopeeAdsRow, ShopeeDailyRow } from "@/lib/db/shopee";
import SyncButton from "../components/SyncButton";
import TargetProgressBar from "../components/TargetProgressBar";

type NhanhRow = { date: string; source: string; revenue: number; orders: number };

export default function ShopeeAdsView({
  ads,
  daily,
  shops,
  month,
  shop,
  monthTarget = 0,
  monthActual = 0,
  monthKey = "",
  nhanhRevenue = [],
}: {
  ads: ShopeeAdsRow[];
  daily: ShopeeDailyRow[];
  shops: string[];
  month: string;
  shop: string;
  monthTarget?: number;
  monthActual?: number;
  monthKey?: string;
  nhanhRevenue?: NhanhRow[];
}) {
  const router = useRouter();
  const [m, setM] = useState(month);
  const [s, setS] = useState(shop);
  const [activeShop, setActiveShop] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true); setUploadMsg(null);
    try {
      const form = new FormData();
      form.append("file", file);
      if (s) form.append("shop", s);
      const res = await fetch("/api/shopee/upload-csv", { method: "POST", body: form });
      const r = await res.json();
      if (r.ok) { setUploadMsg(`✓ Upload ${r.rows} campaigns cho ${r.shop} tháng ${r.month}`); router.refresh(); }
      else setUploadMsg(`✖ ${r.error}`);
    } catch (err) { setUploadMsg(`✖ ${(err as Error).message}`); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  }

  // Filter ads by active shop tab
  const filteredAds = useMemo(() => {
    if (!activeShop) return ads;
    return ads.filter((a) => a.shop === activeShop);
  }, [ads, activeShop]);

  // ── Totals ──
  const totals = useMemo(() => filteredAds.reduce(
    (acc, r) => ({
      spend: acc.spend + toNum(r.spend), impressions: acc.impressions + toNum(r.impressions),
      clicks: acc.clicks + toNum(r.clicks), orders: acc.orders + toNum(r.orders),
      revenue: acc.revenue + toNum(r.revenue),
    }),
    { spend: 0, impressions: 0, clicks: 0, orders: 0, revenue: 0 },
  ), [filteredAds]);

  const nhanhTotals = useMemo(() => nhanhRevenue.reduce(
    (acc, r) => ({ revenue: acc.revenue + r.revenue, orders: acc.orders + r.orders }),
    { revenue: 0, orders: 0 },
  ), [nhanhRevenue]);

  const roas = totals.spend > 0 ? nhanhTotals.revenue / totals.spend : 0;

  // ── Daily chart data: nhanh revenue vs ads spend (using period_from for daily) ──
  const dailyChart = useMemo(() => {
    const nhMap = new Map<string, { revenue: number; orders: number }>();
    for (const r of nhanhRevenue) {
      const c = nhMap.get(r.date) || { revenue: 0, orders: 0 };
      c.revenue += r.revenue; c.orders += r.orders;
      nhMap.set(r.date, c);
    }
    // Ads spend by actual day (period_from, not date)
    const adMap = new Map<string, number>();
    for (const a of filteredAds) {
      const d = String(a.period_from || a.date).substring(0, 10);
      adMap.set(d, (adMap.get(d) || 0) + toNum(a.spend));
    }
    const allDates = new Set([...nhMap.keys(), ...adMap.keys()]);
    return Array.from(allDates).sort().map((d) => ({
      date: d,
      revenue: nhMap.get(d)?.revenue || 0,
      spend: adMap.get(d) || 0,
      orders: nhMap.get(d)?.orders || 0,
      roas: (adMap.get(d) || 0) > 0 ? (nhMap.get(d)?.revenue || 0) / (adMap.get(d) || 0) : 0,
    }));
  }, [nhanhRevenue, filteredAds]);

  // ── Top campaigns ──
  const topCampaigns = useMemo(() => {
    const m = new Map<string, { spend: number; revenue: number; orders: number; roas: number }>();
    for (const a of filteredAds) {
      const name = a.campaign_name || "—";
      const c = m.get(name) || { spend: 0, revenue: 0, orders: 0, roas: 0 };
      c.spend += toNum(a.spend); c.revenue += toNum(a.revenue); c.orders += toNum(a.orders);
      m.set(name, c);
    }
    return Array.from(m.entries())
      .map(([name, v]) => ({ name, ...v, roas: v.spend > 0 ? v.revenue / v.spend : 0 }))
      .sort((a, b) => b.roas - a.roas)
      .slice(0, 10);
  }, [filteredAds]);

  function apply() {
    const p = new URLSearchParams();
    p.set("month", m); if (s) p.set("shop", s);
    router.push(`/shopee-ads?${p.toString()}`);
  }

  return (
    <section className="section">
      {/* ═══ TARGET PROGRESS ═══ */}
      <TargetProgressBar channel="Shopee" monthTarget={monthTarget} monthActual={monthActual} monthKey={monthKey} />

      {/* ═══ HEADER ═══ */}
      <div className="page-hdr">
        <div>
          <div className="page-title">Shopee</div>
          <div className="page-sub">Tháng {month} · {filteredAds.length} campaigns</div>
        </div>
        <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
          <input type="month" value={m} onChange={(e) => setM(e.target.value)} style={{ fontSize: 12 }} />
          <button className="btn btn-primary btn-sm" onClick={apply}>Áp dụng</button>
          <SyncButton url="/api/nhanh/sync-sales" label="⟳ Sync Nhanh" onDone={() => router.refresh()} />
          <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={onUpload} style={{ display: "none" }} />
          <button className="btn btn-ghost btn-xs" onClick={() => fileRef.current?.click()} disabled={uploading}
            style={{ background: "#F0FDF4", border: "1px solid #86EFAC" }}>
            {uploading ? "Uploading..." : "⬆ Upload CSV"}
          </button>
        </div>
      </div>

      {uploadMsg && (
        <div className={`card ${uploadMsg.startsWith("✓") ? "bar-green" : "bar-red"}`} style={{ marginBottom: 12 }}>{uploadMsg}</div>
      )}

      {/* ═══ SHOP TABS ═══ */}
      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
        <button className="btn btn-ghost btn-xs" onClick={() => setActiveShop("")}
          style={{ background: !activeShop ? "var(--blue)" : undefined, color: !activeShop ? "#fff" : undefined }}>Tất cả</button>
        {shops.map((sh) => (
          <button key={sh} className="btn btn-ghost btn-xs" onClick={() => setActiveShop(sh)}
            style={{ background: activeShop === sh ? "var(--blue)" : undefined, color: activeShop === sh ? "#fff" : undefined }}>{sh}</button>
        ))}
      </div>

      {/* ═══ KPI CARDS ═══ */}
      <div className="stat-grid">
        <div className="stat-card c-green"><div className="sl">DOANH THU SHOPEE</div><div className="sv">{formatVND(nhanhTotals.revenue)}</div><div className="ss">nhanh.vn</div></div>
        <div className="stat-card c-red"><div className="sl">CHI PHÍ ADS</div><div className="sv">{formatVND(totals.spend)}</div></div>
        <div className="stat-card c-blue"><div className="sl">ROAS TRUNG BÌNH</div><div className="sv" style={{ color: roas >= 5 ? "var(--green)" : "var(--red)" }}>{roas.toFixed(1)}x</div><div className="ss">doanh thu/ads</div></div>
        <div className="stat-card c-amber"><div className="sl">LƯỢT CLICK</div><div className="sv">{totals.clicks.toLocaleString("vi-VN")}</div></div>
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
            const BAR_H = 160;
            const chartH = BAR_H - 20;
            const labelStep = Math.max(1, Math.floor(dailyChart.length / 15));
            // Today's date to mark incomplete days
            const today = new Date().toISOString().substring(0, 10);

            return (
              <div>
                {/* Chart area: bars + line overlay */}
                <div style={{ position: "relative", height: BAR_H }}>
                  {/* Bars with value labels */}
                  <div style={{ display: "flex", alignItems: "flex-end", height: BAR_H, position: "relative", zIndex: 1 }}>
                    {dailyChart.map((d) => {
                      const h = (d.revenue / maxRev) * chartH;
                      const isIncomplete = d.date >= today;
                      return (
                        <div key={d.date} style={{
                          flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end",
                          background: isIncomplete ? "rgba(254,202,202,0.15)" : "transparent",
                        }}>
                          {d.revenue > 0 && <div style={{ fontSize: 7, fontWeight: 600, color: "#16A34A", marginBottom: 1, whiteSpace: "nowrap" }}>{formatVNDCompact(d.revenue)}</div>}
                          <div style={{ width: "78%", height: Math.max(h, 2), background: isIncomplete ? "#FCA5A5" : "#4ADE80", borderRadius: "2px 2px 0 0", opacity: isIncomplete ? 0.6 : 1 }} />
                        </div>
                      );
                    })}
                  </div>

                  {/* Line overlay (ads spend) — absolute positioned SVG */}
                  <svg style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 2 }}
                    viewBox={`0 0 ${dailyChart.length * 100} ${BAR_H}`} preserveAspectRatio="none">
                    {(() => {
                      const pts = dailyChart.map((d, i) => ({
                        x: i * 100 + 50,
                        y: BAR_H - (maxSpend > 0 ? (d.spend / maxSpend) * chartH * 0.85 : 0) - 10,
                        val: d.spend,
                      }));
                      const validPts = pts.filter((p) => p.val > 0);
                      if (validPts.length < 2) return null;
                      return (
                        <g>
                          <path
                            d={validPts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ")}
                            fill="none" stroke="#EF4444" strokeWidth={2.5} vectorEffect="non-scaling-stroke"
                          />
                          {validPts.map((p, i) => (
                            <circle key={i} cx={p.x} cy={p.y} r={4} fill="#EF4444" vectorEffect="non-scaling-stroke" />
                          ))}
                        </g>
                      );
                    })()}
                  </svg>
                </div>

                {/* Ads spend labels (below chart, above date) */}
                <div style={{ display: "flex" }}>
                  {dailyChart.map((d, i) => (
                    <div key={`al-${d.date}`} style={{ flex: 1, textAlign: "center", fontSize: 6, color: "#EF4444", fontWeight: 600, whiteSpace: "nowrap" }}>
                      {d.spend > 0 && i % Math.max(1, Math.ceil(dailyChart.length / 10)) === 0 ? formatVNDCompact(d.spend) : ""}
                    </div>
                  ))}
                </div>

                {/* Date labels */}
                <div style={{ display: "flex", borderTop: "1px solid #E5E7EB" }}>
                  {dailyChart.map((d, i) => {
                    const isIncomplete = d.date >= today;
                    return (
                      <div key={`dl-${d.date}`} style={{ flex: 1, textAlign: "center", fontSize: 8, padding: "3px 0", color: isIncomplete ? "#EF4444" : "#999", fontWeight: isIncomplete ? 600 : 400 }}>
                        {i % labelStep === 0 ? d.date.substring(8) : ""}
                      </div>
                    );
                  })}
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

      {/* ═══ TOP CAMPAIGNS + CAMPAIGNS TABLE ═══ */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 10, marginBottom: 14 }}>
        {/* Campaigns table */}
        <div className="card" style={{ padding: 0 }}>
          <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", fontWeight: 700, fontSize: 12 }}>
            Tất cả chiến dịch · {filteredAds.length}
          </div>
          <div style={{ display: "flex", gap: 12, padding: "6px 14px", background: "#F9FAFB", borderBottom: "1px solid var(--border)", fontSize: 10, color: "#6B7280" }}>
            <span>Tổng: chi tiêu <strong style={{ color: "#DC2626" }}>{formatVNDCompact(totals.spend)}</strong></span>
            <span>Doanh số ads <strong>{formatVNDCompact(totals.revenue)}</strong></span>
            <span>ROAS ads <strong style={{ color: totals.spend > 0 && totals.revenue / totals.spend >= 5 ? "#16A34A" : "#DC2626" }}>{totals.spend > 0 ? (totals.revenue / totals.spend).toFixed(1) : "—"}x</strong></span>
            <span>{totals.clicks.toLocaleString("vi-VN")} clicks</span>
          </div>
          <div className="tbl-wrap" style={{ maxHeight: 400, overflowY: "auto" }}>
            <table>
              <thead><tr>
                <th>CHIẾN DỊCH</th><th>SHOP</th><th>LOẠI</th>
                <th className="text-right">CHI TIÊU</th><th className="text-right">CLICK</th>
                <th className="text-right">ĐƠN</th><th className="text-right">DOANH SỐ ADS</th>
                <th className="text-right">ROAS</th><th className="text-right">HIỆU QUẢ</th>
              </tr></thead>
              <tbody>
                {filteredAds.slice(0, 200).map((a) => {
                  const r = toNum(a.roas);
                  return (
                    <tr key={a.id}>
                      <td style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={a.campaign_name || ""}>{a.campaign_name || "—"}</td>
                      <td className="muted" style={{ fontSize: 10 }}>{a.shop || "—"}</td>
                      <td className="muted" style={{ fontSize: 10 }}>{a.ad_type || "—"}</td>
                      <td className="text-right" style={{ color: "var(--red)", fontWeight: 600 }}>{formatVNDCompact(toNum(a.spend))}</td>
                      <td className="text-right muted">{toNum(a.clicks).toLocaleString("vi-VN")}</td>
                      <td className="text-right">{toNum(a.orders)}</td>
                      <td className="text-right">{formatVNDCompact(toNum(a.revenue))}</td>
                      <td className="text-right font-bold" style={{ color: r >= 5 ? "var(--green)" : "var(--red)" }}>{r.toFixed(1)}x</td>
                      <td className="text-right">
                        <span style={{ fontSize: 9, padding: "1px 4px", borderRadius: 3, background: r >= 5 ? "#F0FDF4" : r > 0 ? "#FEF2F2" : "#F9FAFB", color: r >= 5 ? "#16A34A" : r > 0 ? "#DC2626" : "#9CA3AF" }}>
                          {r >= 5 ? "Tốt" : r > 0 ? "Thấp" : "—"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {filteredAds.length === 0 && (
                  <tr><td colSpan={9} className="muted" style={{ textAlign: "center", padding: 24 }}>Không có campaign nào.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Top campaigns sidebar */}
        <div className="card" style={{ padding: 0 }}>
          <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", fontWeight: 700, fontSize: 12 }}>
            Top chiến dịch
          </div>
          <div style={{ padding: "8px 12px" }}>
            {topCampaigns.map((c, i) => (
              <div key={c.name} style={{ display: "flex", alignItems: "flex-start", gap: 6, padding: "5px 0", borderBottom: i < topCampaigns.length - 1 ? "1px solid #F3F4F6" : "none" }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: "#9CA3AF", minWidth: 16 }}>{i + 1}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 10, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={c.name}>{c.name}</div>
                  <div style={{ fontSize: 9, color: "#6B7280" }}>
                    Chi <span style={{ color: "#DC2626" }}>{formatVNDCompact(c.spend)}</span> · {c.orders} đơn
                  </div>
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

      {/* Upload CSV */}
      <div className="card" style={{ marginBottom: 14, padding: "10px 14px" }}>
        <div style={{ fontSize: 11, color: "#6B7280" }}>
          <strong>Upload CSV ads:</strong> Tải CSV từ Shopee Ads Manager → bấm "⬆ Upload CSV" phía trên.
          File sẽ tự nhận shop và tháng.
        </div>
      </div>
    </section>
  );
}
