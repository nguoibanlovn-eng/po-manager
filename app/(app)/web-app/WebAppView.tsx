"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { formatDate, formatVND, toNum } from "@/lib/format";
import type { SalesSyncRow } from "@/lib/db/webapp";

export default function WebAppView({
  channels,
  rows,
  channel,
  from,
  to,
}: {
  channels: string[];
  rows: SalesSyncRow[];
  channel: string;
  from: string;
  to: string;
}) {
  const router = useRouter();
  const [c, setC] = useState(channel);
  const [f, setF] = useState(from);
  const [t, setT] = useState(to);

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, r) => ({
        orders: acc.orders + toNum(r.order_net),
        revenue: acc.revenue + toNum(r.revenue_net),
        ordersSuccess: acc.ordersSuccess + toNum(r.order_success),
        revenueSuccess: acc.revenueSuccess + toNum(r.revenue_success),
      }),
      { orders: 0, revenue: 0, ordersSuccess: 0, revenueSuccess: 0 },
    );
  }, [rows]);

  const byChannel = useMemo(() => {
    const m = new Map<string, { orders: number; revenue: number; source: string }>();
    for (const r of rows) {
      const cur = m.get(r.channel) || { orders: 0, revenue: 0, source: r.source };
      cur.orders += toNum(r.order_net);
      cur.revenue += toNum(r.revenue_net);
      m.set(r.channel, cur);
    }
    return Array.from(m.entries()).map(([ch, v]) => ({ channel: ch, ...v })).sort((a, b) => b.revenue - a.revenue);
  }, [rows]);

  function apply() {
    const p = new URLSearchParams();
    if (c) p.set("channel", c);
    p.set("from", f);
    p.set("to", t);
    router.push(`/web-app?${p.toString()}`);
  }

  return (
    <section className="section">
      <div className="page-hdr">
        <div>
          <div className="page-title">🌐 Doanh thu Web / API</div>
          <div className="page-sub">Sales sync qua các channel (API, Website, Haravan, Sapo...)</div>
        </div>
        <div className="row" style={{ gap: 6 }}>
          <select value={c} onChange={(e) => setC(e.target.value)}>
            <option value="">-- Tất cả channels --</option>
            {channels.map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
          <input type="date" value={f} onChange={(e) => setF(e.target.value)} />
          <span className="muted">→</span>
          <input type="date" value={t} onChange={(e) => setT(e.target.value)} />
          <button className="btn btn-primary btn-sm" onClick={apply}>Áp dụng</button>
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat-card c-blue"><div className="sl">Đơn (net)</div><div className="sv">{totals.orders.toLocaleString("vi-VN")}</div></div>
        <div className="stat-card c-green"><div className="sl">Doanh thu (net)</div><div className="sv">{formatVND(totals.revenue)}</div></div>
        <div className="stat-card c-amber"><div className="sl">Đơn thành công</div><div className="sv">{totals.ordersSuccess.toLocaleString("vi-VN")}</div></div>
        <div className="stat-card c-teal"><div className="sl">Doanh thu thành công</div><div className="sv">{formatVND(totals.revenueSuccess)}</div></div>
      </div>

      <div className="card" style={{ marginBottom: 12, padding: 0 }}>
        <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--border)", fontWeight: 700 }}>
          📊 Theo channel
        </div>
        <div className="tbl-wrap">
          <table>
            <thead><tr>
              <th>Channel</th>
              <th>Source</th>
              <th className="text-right">Đơn</th>
              <th className="text-right">Doanh thu</th>
              <th className="text-right">AOV</th>
            </tr></thead>
            <tbody>
              {byChannel.map((b) => (
                <tr key={b.channel}>
                  <td style={{ fontWeight: 600 }}>{b.channel}</td>
                  <td className="muted" style={{ fontSize: 12 }}>{b.source}</td>
                  <td className="text-right">{b.orders.toLocaleString("vi-VN")}</td>
                  <td className="text-right font-bold">{formatVND(b.revenue)}</td>
                  <td className="text-right muted">{formatVND(b.orders > 0 ? b.revenue / b.orders : 0)}</td>
                </tr>
              ))}
              {byChannel.length === 0 && (
                <tr><td colSpan={5} className="muted" style={{ textAlign: "center", padding: 24 }}>
                  Không có data cho khoảng này.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--border)", fontWeight: 700 }}>
          📅 Chi tiết ngày ({rows.length} bản ghi)
        </div>
        <div className="tbl-wrap" style={{ maxHeight: 400, overflowY: "auto" }}>
          <table>
            <thead><tr>
              <th>Channel</th>
              <th>Source</th>
              <th>Từ</th>
              <th>Đến</th>
              <th className="text-right">Đơn</th>
              <th className="text-right">Huỷ</th>
              <th className="text-right">Doanh thu</th>
              <th>Sync</th>
            </tr></thead>
            <tbody>
              {rows.slice(0, 500).map((r) => (
                <tr key={r.id}>
                  <td>{r.channel}</td>
                  <td className="muted" style={{ fontSize: 12 }}>{r.source}</td>
                  <td className="muted" style={{ fontSize: 12 }}>{formatDate(r.period_from)}</td>
                  <td className="muted" style={{ fontSize: 12 }}>{formatDate(r.period_to)}</td>
                  <td className="text-right">{toNum(r.order_net)}</td>
                  <td className="text-right" style={{ color: "var(--red)" }}>{toNum(r.order_cancel)}</td>
                  <td className="text-right font-bold">{formatVND(r.revenue_net)}</td>
                  <td className="muted" style={{ fontSize: 11 }}>{formatDate(r.synced_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
