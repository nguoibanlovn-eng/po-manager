"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatVND, toNum } from "@/lib/format";
import type { CustomerRow, CustomerStats } from "@/lib/db/customers";

function fmtDate(d: string | null) {
  if (!d) return "—";
  return d.substring(0, 10);
}

function customerGroup(orders: number): { label: string; bg: string; color: string } {
  if (orders >= 5) return { label: "VIP", bg: "#FEF3C7", color: "#D97706" };
  if (orders >= 2) return { label: "Loyal", bg: "#DCFCE7", color: "#16A34A" };
  return { label: "Mới", bg: "#EFF6FF", color: "#2563EB" };
}

export default function CustomersView({
  rows, total, q, sort, city, minOrders, page, totalPages, stats,
}: {
  rows: CustomerRow[]; total: number; q: string; sort: string; city: string;
  minOrders: number; page: number; totalPages: number; stats: CustomerStats;
}) {
  const router = useRouter();
  const [showEmail, setShowEmail] = useState(false);
  const [emailSubject, setEmailSubject] = useState("");
  const [emailContent, setEmailContent] = useState("");
  const [testEmail, setTestEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState("");

  function buildUrl(params: Record<string, string>) {
    const p = new URLSearchParams({ q, sort, city, minOrders: String(minOrders), page: "1" });
    for (const [k, v] of Object.entries(params)) p.set(k, v);
    if (!p.get("q")) p.delete("q");
    if (p.get("sort") === "revenue_desc") p.delete("sort");
    if (!p.get("city")) p.delete("city");
    if (p.get("minOrders") === "0") p.delete("minOrders");
    if (p.get("page") === "1") p.delete("page");
    const qs = p.toString();
    return `/customers${qs ? `?${qs}` : ""}`;
  }

  async function sendEmail(test: boolean) {
    setSending(true); setSendResult("");
    try {
      const res = await fetch("/api/marketing/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: emailSubject,
          htmlContent: emailContent,
          segment: { minOrders: minOrders || undefined, city: city || undefined },
          testEmail: test ? testEmail : undefined,
        }),
      });
      const json = await res.json();
      if (json.ok) {
        setSendResult(test ? `✓ Đã gửi test tới ${testEmail}` : `✓ Đã gửi ${json.sent} email (${json.errors} lỗi)`);
      } else {
        setSendResult(`Lỗi: ${json.error}`);
      }
    } catch (e) {
      setSendResult(`Lỗi: ${(e as Error).message}`);
    } finally { setSending(false); }
  }

  return (
    <section className="section">
      {/* Header */}
      <div className="page-hdr">
        <div>
          <div className="page-title">Khách hàng</div>
          <div className="page-sub">{stats.totalCustomers.toLocaleString("vi-VN")} khách hàng · Từ Nhanh.vn</div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} onClick={() => setShowEmail(!showEmail)}>
            {showEmail ? "✕ Đóng" : "✉ Email Marketing"}
          </button>
          <button className="btn btn-primary btn-sm" style={{ fontSize: 11 }} onClick={() => router.refresh()}>⟳ Đồng bộ</button>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 14 }}>
        <div style={{ padding: "14px 16px", background: "#F5F3FF", borderRadius: 8, border: "1px solid #DDD6FE" }}>
          <div style={{ fontSize: 10, color: "#6D28D9", fontWeight: 600 }}>TỔNG KHÁCH HÀNG</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#7C3AED", margin: "4px 0" }}>{stats.totalCustomers.toLocaleString("vi-VN")}</div>
        </div>
        <div style={{ padding: "14px 16px", background: "#F0FDF4", borderRadius: 8, border: "1px solid #BBF7D0" }}>
          <div style={{ fontSize: 10, color: "#166534", fontWeight: 600 }}>TỔNG DOANH THU</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#16A34A", margin: "4px 0" }}>{formatVND(stats.totalRevenue)}</div>
        </div>
        <div style={{ padding: "14px 16px", background: "#EFF6FF", borderRadius: 8, border: "1px solid #BFDBFE" }}>
          <div style={{ fontSize: 10, color: "#1E40AF", fontWeight: 600 }}>TRUNG BÌNH / KH</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#2563EB", margin: "4px 0" }}>{formatVND(stats.avgRevenue)}</div>
        </div>
        <div style={{ padding: "14px 16px", background: "#FFFBEB", borderRadius: 8, border: "1px solid #FDE68A" }}>
          <div style={{ fontSize: 10, color: "#92400E", fontWeight: 600 }}>MUA LẦN 2+</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#D97706", margin: "4px 0" }}>
            {stats.repeatBuyers.toLocaleString("vi-VN")} <span style={{ fontSize: 14, fontWeight: 600 }}>({stats.repeatPct}%)</span>
          </div>
        </div>
      </div>

      {/* Email Marketing Panel */}
      {showEmail && (
        <div className="card" style={{ marginBottom: 14, padding: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>✉ Gửi Email Marketing</div>
          <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 10 }}>
            Segment hiện tại: {city || "Tất cả tỉnh"} · {minOrders ? `Mua ${minOrders}+ lần` : "Tất cả"} · {total.toLocaleString("vi-VN")} khách
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <input value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)}
              placeholder="Tiêu đề email..." style={{ fontSize: 13, padding: "8px 12px" }} />
            <textarea value={emailContent} onChange={(e) => setEmailContent(e.target.value)}
              placeholder="Nội dung HTML... Dùng {{name}} để chèn tên khách hàng"
              rows={5} style={{ fontSize: 12, padding: "8px 12px" }} />
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <input value={testEmail} onChange={(e) => setTestEmail(e.target.value)}
                placeholder="Email test..." style={{ width: 200, fontSize: 12 }} />
              <button className="btn btn-ghost btn-sm" onClick={() => sendEmail(true)}
                disabled={sending || !emailSubject || !emailContent || !testEmail} style={{ fontSize: 11 }}>
                Gửi test
              </button>
              <button className="btn btn-primary btn-sm" onClick={() => {
                if (confirm(`Gửi email tới ${total.toLocaleString("vi-VN")} khách hàng?`)) sendEmail(false);
              }} disabled={sending || !emailSubject || !emailContent} style={{ fontSize: 11 }}>
                {sending ? "Đang gửi..." : `Gửi tới ${total.toLocaleString("vi-VN")} khách`}
              </button>
              {sendResult && (
                <span style={{ fontSize: 11, color: sendResult.startsWith("✓") ? "#16A34A" : "#DC2626", fontWeight: 600 }}>
                  {sendResult}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Table Card */}
      <div className="card" style={{ padding: 0 }}>
        {/* Filters — 1 hàng ngang */}
        <div style={{ padding: "8px 16px", borderBottom: "1px solid #E5E7EB", display: "flex", gap: 6, alignItems: "center", fontSize: 11 }}>
          <form action="/customers" style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input type="text" name="q" defaultValue={q} placeholder="Tìm tên, SĐT, email..."
              style={{ width: 160, fontSize: 11, padding: "4px 8px", border: "1px solid #D1D5DB", borderRadius: 6 }} />
            <button type="submit" className="btn btn-primary btn-xs" style={{ fontSize: 10 }}>Tìm</button>
          </form>
          <select value={sort} onChange={(e) => router.push(buildUrl({ sort: e.target.value }))}
            style={{ fontSize: 11, padding: "4px 6px", border: "1px solid #D1D5DB", borderRadius: 6, maxWidth: 140 }}>
            <option value="revenue_desc">DT cao nhất</option>
            <option value="orders_desc">Đơn nhiều nhất</option>
            <option value="recent">Mua gần nhất</option>
            <option value="name_asc">Tên A→Z</option>
          </select>
          <select value={String(minOrders)} onChange={(e) => router.push(buildUrl({ minOrders: e.target.value }))}
            style={{ fontSize: 11, padding: "4px 6px", border: "1px solid #D1D5DB", borderRadius: 6, maxWidth: 130 }}>
            <option value="0">Tất cả</option>
            <option value="2">Mua 2+</option>
            <option value="5">VIP (5+)</option>
            <option value="10">10+ lần</option>
          </select>
          <span style={{ marginLeft: "auto", fontSize: 10, color: "#6B7280" }}>
            {total.toLocaleString("vi-VN")} / {stats.totalCustomers.toLocaleString("vi-VN")} khách
          </span>
        </div>

        {/* Table */}
        <div className="tbl-wrap" style={{ maxHeight: 500, overflowY: "auto" }}>
          <table>
            <thead><tr>
              <th>Tên khách hàng</th>
              <th style={{ width: 100 }}>SĐT</th>
              <th style={{ width: 80 }}>Tỉnh/Thành</th>
              <th className="text-right" style={{ width: 45 }}>Đơn</th>
              <th className="text-right" style={{ width: 120 }}>Doanh thu</th>
              <th style={{ width: 85 }}>Đơn gần nhất</th>
              <th style={{ width: 50 }}>Nhóm</th>
            </tr></thead>
            <tbody>
              {rows.map((c) => {
                const orders = toNum(c.total_orders);
                const grp = customerGroup(orders);
                return (
                  <tr key={c.customer_id}>
                    <td style={{ fontWeight: 600, fontSize: 12 }}>{c.name || "—"}</td>
                    <td style={{ fontFamily: "'SF Mono',Menlo,monospace", fontSize: 10, color: "#6B7280" }}>{c.phone || "—"}</td>
                    <td style={{ fontSize: 11, color: "#9CA3AF" }}>{c.city || "—"}</td>
                    <td className="text-right" style={{ fontWeight: 700 }}>{orders > 0 ? orders : "—"}</td>
                    <td className="text-right" style={{ fontWeight: 700, color: "#16A34A" }}>{toNum(c.total_revenue) > 0 ? formatVND(c.total_revenue) : "—"}</td>
                    <td style={{ fontSize: 11, color: "#9CA3AF" }}>{fmtDate(c.last_order_date)}</td>
                    <td>
                      {orders > 0 && (
                        <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 3, background: grp.bg, color: grp.color }}>
                          {grp.label}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr><td colSpan={7} className="muted" style={{ textAlign: "center", padding: 24 }}>Không có khách hàng.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div style={{ padding: "10px 16px", borderTop: "1px solid #E5E7EB", background: "#F9FAFB", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11, color: "#6B7280" }}>
          <span style={{ fontWeight: 600 }}>Trang {page}/{totalPages.toLocaleString("vi-VN")} · {total.toLocaleString("vi-VN")} khách</span>
          {totalPages > 1 && (
            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
              {page > 1 && <Link href={buildUrl({ page: String(page - 1) })} className="btn btn-ghost btn-xs" style={{ textDecoration: "none" }}>←</Link>}
              {page < totalPages && <Link href={buildUrl({ page: String(page + 1) })} className="btn btn-ghost btn-xs" style={{ textDecoration: "none" }}>→</Link>}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
