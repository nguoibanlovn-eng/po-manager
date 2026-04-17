"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { formatDate, formatVND, toNum } from "@/lib/format";
import type { ShopeeAdsRow, ShopeeDailyRow } from "@/lib/db/shopee";
import SyncButton from "../components/SyncButton";

export default function ShopeeAdsView({
  ads,
  daily,
  shops,
  month,
  shop,
}: {
  ads: ShopeeAdsRow[];
  daily: ShopeeDailyRow[];
  shops: string[];
  month: string;
  shop: string;
}) {
  const router = useRouter();
  const [m, setM] = useState(month);
  const [s, setS] = useState(shop);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadMsg(null);
    try {
      const form = new FormData();
      form.append("file", file);
      if (s) form.append("shop", s);
      const res = await fetch("/api/shopee/upload-csv", { method: "POST", body: form });
      const r = await res.json();
      if (r.ok) {
        setUploadMsg(`✓ Upload ${r.rows} campaigns cho ${r.shop} tháng ${r.month}`);
        router.refresh();
      } else {
        setUploadMsg(`✖ ${r.error}`);
      }
    } catch (err) {
      setUploadMsg(`✖ ${(err as Error).message}`);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const totals = useMemo(() => {
    return ads.reduce(
      (acc, r) => ({
        spend: acc.spend + toNum(r.spend),
        impressions: acc.impressions + toNum(r.impressions),
        clicks: acc.clicks + toNum(r.clicks),
        orders: acc.orders + toNum(r.orders),
        revenue: acc.revenue + toNum(r.revenue),
      }),
      { spend: 0, impressions: 0, clicks: 0, orders: 0, revenue: 0 },
    );
  }, [ads]);

  const dailyTotals = useMemo(() => {
    return daily.reduce(
      (acc, r) => ({
        revenue: acc.revenue + toNum(r.revenue),
        orders: acc.orders + toNum(r.orders),
      }),
      { revenue: 0, orders: 0 },
    );
  }, [daily]);

  const roas = totals.spend > 0 ? totals.revenue / totals.spend : 0;

  function apply() {
    const p = new URLSearchParams();
    p.set("month", m);
    if (s) p.set("shop", s);
    router.push(`/shopee-ads?${p.toString()}`);
  }

  return (
    <section className="section">
      <div className="page-hdr">
        <div>
          <div className="page-title">🛒 Shopee Ads &amp; Doanh thu</div>
          <div className="page-sub">Tháng {month} · {ads.length} campaigns</div>
        </div>
        <div className="row" style={{ gap: 6 }}>
          <input type="month" value={m} onChange={(e) => setM(e.target.value)} />
          <select value={s} onChange={(e) => setS(e.target.value)}>
            <option value="">-- Tất cả shops --</option>
            {shops.map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
          <button className="btn btn-primary btn-sm" onClick={apply}>Áp dụng</button>
          <SyncButton url="/api/nhanh/sync-sales" label="Sync Nhanh" onDone={() => router.refresh()} />
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            onChange={onUpload}
            style={{ display: "none" }}
          />
          <button
            className="btn btn-success btn-sm"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            title="Upload CSV từ Shopee Ads Manager"
          >
            {uploading ? "Uploading..." : "⬆ Upload CSV"}
          </button>
        </div>
      </div>

      {uploadMsg && (
        <div className={`card ${uploadMsg.startsWith("✓") ? "bar-green" : "bar-red"}`} style={{ marginBottom: 12 }}>
          {uploadMsg}
        </div>
      )}

      <div className="stat-grid">
        <div className="stat-card c-blue"><div className="sl">Chi Shopee Ads</div><div className="sv">{formatVND(totals.spend)}</div></div>
        <div className="stat-card c-green"><div className="sl">Doanh thu Ads</div><div className="sv">{formatVND(totals.revenue)}</div><div className="ss">ROAS {roas.toFixed(2)}x</div></div>
        <div className="stat-card c-amber"><div className="sl">Đơn từ Ads</div><div className="sv">{totals.orders.toLocaleString("vi-VN")}</div><div className="ss">{totals.clicks.toLocaleString("vi-VN")} clicks</div></div>
        <div className="stat-card c-teal"><div className="sl">Tổng doanh thu Shop</div><div className="sv">{formatVND(dailyTotals.revenue)}</div><div className="ss">{dailyTotals.orders.toLocaleString("vi-VN")} đơn</div></div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--border)", fontWeight: 700 }}>
          📋 Campaigns
        </div>
        <div className="tbl-wrap">
          <table>
            <thead><tr>
              <th>Ngày</th>
              <th>Campaign</th>
              <th>Loại</th>
              <th>Shop</th>
              <th className="text-right">Chi</th>
              <th className="text-right">Impressions</th>
              <th className="text-right">Clicks</th>
              <th className="text-right">Đơn</th>
              <th className="text-right">Doanh thu</th>
              <th className="text-right">ROAS</th>
            </tr></thead>
            <tbody>
              {ads.slice(0, 500).map((a) => (
                <tr key={a.id}>
                  <td className="muted" style={{ fontSize: 12 }}>{formatDate(a.date)}</td>
                  <td style={{ maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={a.campaign_name || ""}>
                    {a.campaign_name || "—"}
                  </td>
                  <td className="muted" style={{ fontSize: 11 }}>{a.ad_type || "—"}</td>
                  <td className="muted" style={{ fontSize: 12 }}>{a.shop || "—"}</td>
                  <td className="text-right font-bold">{formatVND(a.spend)}</td>
                  <td className="text-right muted">{toNum(a.impressions).toLocaleString("vi-VN")}</td>
                  <td className="text-right muted">{toNum(a.clicks).toLocaleString("vi-VN")}</td>
                  <td className="text-right">{toNum(a.orders)}</td>
                  <td className="text-right">{formatVND(a.revenue)}</td>
                  <td className="text-right font-bold" style={{ color: toNum(a.roas) >= 1 ? "var(--green)" : "var(--red)" }}>
                    {toNum(a.roas).toFixed(2)}x
                  </td>
                </tr>
              ))}
              {ads.length === 0 && (
                <tr><td colSpan={10} className="muted" style={{ textAlign: "center", padding: 24 }}>
                  Không có campaign nào cho tháng/shop đã chọn.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
        {ads.length > 500 && (
          <div className="muted" style={{ padding: "10px 14px", fontSize: 12, borderTop: "1px solid var(--border)" }}>
            Hiển thị 500/{ads.length} dòng. Lọc theo shop để xem chi tiết.
          </div>
        )}
      </div>
    </section>
  );
}
