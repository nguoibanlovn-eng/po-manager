"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { formatDate, formatVND, formatVNDCompact } from "@/lib/format";
import type { AdsRow, InsightsRow, PageRow } from "@/lib/db/ads";
import SyncButton from "../components/SyncButton";

type Summary = { spend: number; impressions: number; clicks: number; reach: number; purchase_value: number };

export default function FbPagesView({
  pages,
  ads,
  insights,
  summary,
  from,
  to,
}: {
  pages: PageRow[];
  ads: AdsRow[];
  insights: InsightsRow[];
  summary: Summary;
  from: string;
  to: string;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [fromD, setFromD] = useState(from);
  const [toD, setToD] = useState(to);

  function applyRange() {
    const p = new URLSearchParams(sp.toString());
    p.set("from", fromD);
    p.set("to", toD);
    router.push(`/fb-pages?${p.toString()}`);
  }

  // ads grouped by date for chart
  const adsByDate = useMemo(() => {
    const m = new Map<string, { spend: number; clicks: number; purchase_value: number }>();
    for (const a of ads) {
      const d = String(a.date).substring(0, 10);
      const cur = m.get(d) || { spend: 0, clicks: 0, purchase_value: 0 };
      cur.spend += Number(a.spend || 0);
      cur.clicks += Number(a.clicks || 0);
      cur.purchase_value += Number(a.purchase_value || 0);
      m.set(d, cur);
    }
    return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [ads]);

  // ads grouped by account for table
  const adsByAccount = useMemo(() => {
    const m = new Map<string, { account_name: string; spend: number; impressions: number; clicks: number; purchase_value: number; days: number }>();
    for (const a of ads) {
      const k = a.ad_account_id || "—";
      const cur = m.get(k) || { account_name: a.account_name || k, spend: 0, impressions: 0, clicks: 0, purchase_value: 0, days: 0 };
      cur.spend += Number(a.spend || 0);
      cur.impressions += Number(a.impressions || 0);
      cur.clicks += Number(a.clicks || 0);
      cur.purchase_value += Number(a.purchase_value || 0);
      cur.days++;
      if (a.account_name) cur.account_name = a.account_name;
      m.set(k, cur);
    }
    return Array.from(m.entries()).map(([id, r]) => ({ id, ...r })).sort((a, b) => b.spend - a.spend);
  }, [ads]);

  const insightsTotals = useMemo(() => {
    return insights.reduce(
      (acc, r) => ({
        new_fans: acc.new_fans + Number(r.new_fans || 0),
        lost_fans: acc.lost_fans + Number(r.lost_fans || 0),
        reach: acc.reach + Number(r.reach || 0),
        impressions: acc.impressions + Number(r.impressions || 0),
      }),
      { new_fans: 0, lost_fans: 0, reach: 0, impressions: 0 },
    );
  }, [insights]);

  const roas = summary.spend > 0 ? summary.purchase_value / summary.spend : 0;

  return (
    <section className="section">
      <div className="page-hdr">
        <div>
          <div className="page-title">📘 Facebook Pages &amp; Ads</div>
          <div className="page-sub">{pages.length} page · {ads.length} ngày dữ liệu · {insights.length} insight rows</div>
        </div>
        <div className="row" style={{ gap: 6 }}>
          <input type="date" value={fromD} onChange={(e) => setFromD(e.target.value)} />
          <span className="muted">→</span>
          <input type="date" value={toD} onChange={(e) => setToD(e.target.value)} />
          <button className="btn btn-primary btn-sm" onClick={applyRange}>Áp dụng</button>
          <SyncButton url="/api/fb/sync-ads" label="Sync Ads" onDone={() => router.refresh()} />
          <SyncButton url="/api/fb/sync-insights" label="Sync Insights" onDone={() => router.refresh()} />
        </div>
      </div>

      {/* Summary KPI */}
      <div className="stat-grid">
        <div className="stat-card c-blue">
          <div className="sl">Chi quảng cáo</div>
          <div className="sv">{formatVND(summary.spend)}</div>
          <div className="ss">{from} → {to}</div>
        </div>
        <div className="stat-card c-green">
          <div className="sl">Doanh thu từ ads</div>
          <div className="sv">{formatVND(summary.purchase_value)}</div>
          <div className="ss">ROAS {roas.toFixed(2)}x</div>
        </div>
        <div className="stat-card c-amber">
          <div className="sl">Clicks</div>
          <div className="sv">{summary.clicks.toLocaleString("vi-VN")}</div>
          <div className="ss">{summary.impressions.toLocaleString("vi-VN")} impressions</div>
        </div>
        <div className="stat-card c-purple">
          <div className="sl">Reach</div>
          <div className="sv">{summary.reach.toLocaleString("vi-VN")}</div>
          <div className="ss">{insightsTotals.new_fans - insightsTotals.lost_fans > 0 ? "+" : ""}{(insightsTotals.new_fans - insightsTotals.lost_fans).toLocaleString("vi-VN")} fans ròng</div>
        </div>
      </div>

      {/* Daily chart (simple bar) */}
      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: 12 }}>📊 Chi tiêu theo ngày</div>
        <DailyBars data={adsByDate} />
      </div>

      {/* Ads by account */}
      <div className="card" style={{ marginBottom: 12, padding: 0 }}>
        <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--border)", fontWeight: 700 }}>
          💰 Chi tiêu theo tài khoản ads
        </div>
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>Tài khoản</th>
                <th style={{ width: 100 }} className="text-right">Ngày</th>
                <th style={{ width: 130 }} className="text-right">Chi</th>
                <th style={{ width: 120 }} className="text-right">Impressions</th>
                <th style={{ width: 100 }} className="text-right">Clicks</th>
                <th style={{ width: 140 }} className="text-right">Doanh thu ads</th>
                <th style={{ width: 80 }} className="text-right">ROAS</th>
              </tr>
            </thead>
            <tbody>
              {adsByAccount.map((r) => (
                <tr key={r.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{r.account_name}</div>
                    <div className="muted" style={{ fontSize: 11, fontFamily: "monospace" }}>{r.id}</div>
                  </td>
                  <td className="text-right muted">{r.days}</td>
                  <td className="text-right font-bold">{formatVND(r.spend)}</td>
                  <td className="text-right muted">{r.impressions.toLocaleString("vi-VN")}</td>
                  <td className="text-right muted">{r.clicks.toLocaleString("vi-VN")}</td>
                  <td className="text-right">{formatVND(r.purchase_value)}</td>
                  <td className="text-right" style={{ color: r.spend > 0 && r.purchase_value / r.spend >= 1 ? "var(--green)" : "var(--red)", fontWeight: 700 }}>
                    {r.spend > 0 ? (r.purchase_value / r.spend).toFixed(2) + "x" : "—"}
                  </td>
                </tr>
              ))}
              {adsByAccount.length === 0 && (
                <tr><td colSpan={7} className="muted" style={{ textAlign: "center", padding: 24 }}>
                  Không có data ads trong khoảng này.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pages list */}
      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--border)", fontWeight: 700 }}>
          📄 FB Pages ({pages.length})
        </div>
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>Page</th>
                <th style={{ width: 140 }}>Nhân sự</th>
                <th style={{ width: 160 }}>FB Page ID</th>
                <th style={{ width: 160 }}>Nhanh ID</th>
                <th style={{ width: 200 }}>Ad Account</th>
                <th style={{ width: 130 }}>Sync gần nhất</th>
              </tr>
            </thead>
            <tbody>
              {pages.map((p) => (
                <tr key={p.page_id}>
                  <td><div style={{ fontWeight: 600 }}>{p.page_name || "—"}</div></td>
                  <td className="muted" style={{ fontSize: 12 }}>{p.assigned_name || p.assigned_email || "—"}</td>
                  <td className="muted" style={{ fontSize: 11, fontFamily: "monospace" }}>{p.fb_page_id || "—"}</td>
                  <td className="muted" style={{ fontSize: 11, fontFamily: "monospace" }}>{p.nhanh_id || "—"}</td>
                  <td className="muted" style={{ fontSize: 11, fontFamily: "monospace" }}>{p.ad_account_id || "—"}</td>
                  <td className="muted" style={{ fontSize: 12 }}>{formatDate(p.last_sync)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function DailyBars({ data }: { data: [string, { spend: number; clicks: number; purchase_value: number }][] }) {
  if (data.length === 0) {
    return <div className="muted" style={{ textAlign: "center", padding: 24 }}>Không có data.</div>;
  }
  const max = Math.max(...data.map(([, d]) => d.spend));
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 160, padding: "8px 0", overflowX: "auto" }}>
      {data.map(([date, d]) => {
        const h = max > 0 ? (d.spend / max) * 140 : 0;
        return (
          <div key={date} style={{ minWidth: 24, flex: "0 0 auto", display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}
               title={`${date}: ${formatVND(d.spend)} · ROAS ${d.spend > 0 ? (d.purchase_value / d.spend).toFixed(2) : "—"}`}>
            <div style={{ fontSize: 9, color: "var(--muted)", writingMode: "vertical-rl", transform: "rotate(180deg)", whiteSpace: "nowrap" }}>
              {formatVNDCompact(d.spend)}
            </div>
            <div style={{ width: 18, height: h, background: "var(--blue)", borderRadius: "3px 3px 0 0" }} />
            <div style={{ fontSize: 9, color: "var(--subtle)", writingMode: "vertical-rl", transform: "rotate(180deg)", whiteSpace: "nowrap" }}>
              {date.substring(5)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
