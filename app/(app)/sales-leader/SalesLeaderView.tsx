"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { formatDate, formatVND, formatVNDCompact, toNum } from "@/lib/format";
import type { TiktokAdsRow, TiktokChannelRow, TiktokProductStat } from "@/lib/db/tiktok";

export default function SalesLeaderView({
  ads,
  channels,
  productStats,
  from,
  to,
}: {
  ads: TiktokAdsRow[];
  channels: TiktokChannelRow[];
  productStats: TiktokProductStat[];
  from: string;
  to: string;
}) {
  const router = useRouter();
  const [f, setF] = useState(from);
  const [t, setT] = useState(to);

  const totals = useMemo(() => {
    return ads.reduce(
      (acc, r) => ({
        spend: acc.spend + toNum(r.spend),
        impressions: acc.impressions + toNum(r.impressions),
        clicks: acc.clicks + toNum(r.clicks),
        conversions: acc.conversions + toNum(r.conversions),
        conversion_value: acc.conversion_value + toNum(r.conversion_value),
      }),
      { spend: 0, impressions: 0, clicks: 0, conversions: 0, conversion_value: 0 },
    );
  }, [ads]);

  const adsByDate = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of ads) {
      const d = String(a.date).substring(0, 10);
      m.set(d, (m.get(d) || 0) + toNum(a.spend));
    }
    return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [ads]);

  const adsByAdvertiser = useMemo(() => {
    const m = new Map<string, { name: string; spend: number; impressions: number; clicks: number; conversions: number; conversion_value: number }>();
    for (const a of ads) {
      const k = a.advertiser_id || "—";
      const cur = m.get(k) || { name: a.advertiser_name || k, spend: 0, impressions: 0, clicks: 0, conversions: 0, conversion_value: 0 };
      cur.spend += toNum(a.spend);
      cur.impressions += toNum(a.impressions);
      cur.clicks += toNum(a.clicks);
      cur.conversions += toNum(a.conversions);
      cur.conversion_value += toNum(a.conversion_value);
      if (a.advertiser_name) cur.name = a.advertiser_name;
      m.set(k, cur);
    }
    return Array.from(m.entries()).map(([id, r]) => ({ id, ...r })).sort((a, b) => b.spend - a.spend);
  }, [ads]);

  const channelLatest = useMemo(() => {
    const m = new Map<string, TiktokChannelRow>();
    for (const c of channels) {
      const existing = m.get(c.account_id);
      if (!existing || String(c.date) > String(existing.date)) m.set(c.account_id, c);
    }
    return Array.from(m.values());
  }, [channels]);

  function apply() {
    router.push(`/sales-leader?from=${f}&to=${t}`);
  }

  const roas = totals.spend > 0 ? totals.conversion_value / totals.spend : 0;

  return (
    <section className="section">
      <div className="page-hdr">
        <div>
          <div className="page-title">🎵 TikTok Ads &amp; Channels</div>
          <div className="page-sub">{ads.length} ngày ads · {channelLatest.length} channels</div>
        </div>
        <div className="row" style={{ gap: 6 }}>
          <input type="date" value={f} onChange={(e) => setF(e.target.value)} />
          <span className="muted">→</span>
          <input type="date" value={t} onChange={(e) => setT(e.target.value)} />
          <button className="btn btn-primary btn-sm" onClick={apply}>Áp dụng</button>
        </div>
      </div>

      <div className="stat-grid tku-stat-grid" style={{ gridTemplateColumns: "repeat(5, minmax(0, 1fr))" }}>
        <div className="stat-card c-blue"><div className="sl">Chi ads</div><div className="sv">{formatVND(totals.spend)}</div></div>
        <div className="stat-card c-green"><div className="sl">Doanh thu</div><div className="sv">{formatVND(totals.conversion_value)}</div><div className="ss">ROAS {roas.toFixed(2)}x</div></div>
        <div className="stat-card c-amber"><div className="sl">Clicks</div><div className="sv">{totals.clicks.toLocaleString("vi-VN")}</div><div className="ss">{totals.impressions.toLocaleString("vi-VN")} imp</div></div>
        <div className="stat-card c-teal"><div className="sl">Conversions</div><div className="sv">{totals.conversions.toLocaleString("vi-VN")}</div></div>
        <div className="stat-card c-purple"><div className="sl">CPC</div><div className="sv">{formatVND(totals.clicks > 0 ? totals.spend / totals.clicks : 0)}</div></div>
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>📊 Chi tiêu TikTok Ads theo ngày</div>
        <SimpleBar data={adsByDate} />
      </div>

      <div className="card" style={{ marginBottom: 12, padding: 0 }}>
        <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--border)", fontWeight: 700 }}>💰 Chi tiêu theo advertiser</div>
        <div className="tbl-wrap">
          <table>
            <thead><tr>
              <th>Advertiser</th>
              <th className="text-right">Chi</th>
              <th className="text-right">Impressions</th>
              <th className="text-right">Clicks</th>
              <th className="text-right">Conversions</th>
              <th className="text-right">Doanh thu</th>
              <th className="text-right">ROAS</th>
            </tr></thead>
            <tbody>
              {adsByAdvertiser.map((r) => (
                <tr key={r.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{r.name}</div>
                    <div className="muted" style={{ fontSize: 11, fontFamily: "monospace" }}>{r.id}</div>
                  </td>
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
              {adsByAdvertiser.length === 0 && (
                <tr><td colSpan={7} className="muted" style={{ textAlign: "center", padding: 24 }}>Không có data ads.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Product stats từ TikTok Shop orders */}
      <div className="card" style={{ marginBottom: 12, padding: 0 }}>
        <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--border)", fontWeight: 700, display: "flex", justifyContent: "space-between" }}>
          <span>🛍 Top sản phẩm bán trên TikTok Shop</span>
          <span className="muted" style={{ fontSize: 12 }}>{productStats.length} SP · aggregate từ orders</span>
        </div>
        <div className="tbl-wrap" style={{ maxHeight: 400, overflowY: "auto" }}>
          <table>
            <thead><tr>
              <th>Sản phẩm</th>
              <th>Shop</th>
              <th className="text-right">SL bán</th>
              <th className="text-right">Doanh thu</th>
              <th className="text-right">SL huỷ</th>
              <th className="text-right">% huỷ</th>
            </tr></thead>
            <tbody>
              {productStats.slice(0, 50).map((p) => (
                <tr key={p.name}>
                  <td style={{ maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={p.name}>
                    {p.name}
                  </td>
                  <td className="muted" style={{ fontSize: 12 }}>{p.shop}</td>
                  <td className="text-right font-bold">{p.sold.toLocaleString("vi-VN")}</td>
                  <td className="text-right">{formatVND(p.revenue)}</td>
                  <td className="text-right" style={{ color: p.cancel > 0 ? "var(--red)" : "var(--muted)" }}>
                    {p.cancel.toLocaleString("vi-VN")}
                  </td>
                  <td className="text-right" style={{ color: p.cancel_rate > 20 ? "var(--red)" : p.cancel_rate > 10 ? "var(--amber)" : "var(--muted)" }}>
                    {p.cancel_rate}%
                  </td>
                </tr>
              ))}
              {productStats.length === 0 && (
                <tr><td colSpan={6} className="muted" style={{ textAlign: "center", padding: 24 }}>
                  Chưa có đơn TikTok Shop. Sync orders ở Admin Settings trước.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--border)", fontWeight: 700 }}>📺 TikTok Channels (state mới nhất)</div>
        <div className="tbl-wrap">
          <table>
            <thead><tr>
              <th>Account</th>
              <th className="text-right">Followers</th>
              <th className="text-right">Video views</th>
              <th className="text-right">Likes</th>
              <th className="text-right">Comments</th>
              <th className="text-right">Shares</th>
              <th>Ngày</th>
            </tr></thead>
            <tbody>
              {channelLatest.map((c) => (
                <tr key={c.account_id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{c.username || "—"}</div>
                    <div className="muted" style={{ fontSize: 11, fontFamily: "monospace" }}>{c.account_id}</div>
                  </td>
                  <td className="text-right">{toNum(c.followers).toLocaleString("vi-VN")}</td>
                  <td className="text-right muted">{toNum(c.video_views).toLocaleString("vi-VN")}</td>
                  <td className="text-right muted">{toNum(c.likes).toLocaleString("vi-VN")}</td>
                  <td className="text-right muted">{toNum(c.comments).toLocaleString("vi-VN")}</td>
                  <td className="text-right muted">{toNum(c.shares).toLocaleString("vi-VN")}</td>
                  <td className="muted" style={{ fontSize: 12 }}>{formatDate(c.date)}</td>
                </tr>
              ))}
              {channelLatest.length === 0 && (
                <tr><td colSpan={7} className="muted" style={{ textAlign: "center", padding: 24 }}>Chưa có data channel.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function SimpleBar({ data }: { data: [string, number][] }) {
  if (data.length === 0) return <div className="muted" style={{ padding: 24, textAlign: "center" }}>Không có data.</div>;
  const max = Math.max(...data.map(([, v]) => v));
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 140, overflowX: "auto" }}>
      {data.map(([d, v]) => {
        const h = max > 0 ? (v / max) * 120 : 0;
        return (
          <div key={d} style={{ minWidth: 22, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }} title={`${d}: ${formatVND(v)}`}>
            <div style={{ fontSize: 9, color: "var(--muted)" }}>{formatVNDCompact(v)}</div>
            <div style={{ width: 16, height: h, background: "#000", borderRadius: "2px 2px 0 0" }} />
            <div style={{ fontSize: 9, color: "var(--subtle)" }}>{d.substring(5)}</div>
          </div>
        );
      })}
    </div>
  );
}
