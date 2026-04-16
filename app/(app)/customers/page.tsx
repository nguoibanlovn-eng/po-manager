import Link from "next/link";
import { listCustomers } from "@/lib/db/customers";
import { formatDate, formatVND, toNum } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { q = "", page = "1" } = await searchParams;
  const pageNum = Math.max(1, Number(page) || 1);
  const limit = 100;
  const offset = (pageNum - 1) * limit;

  const { rows, total } = await listCustomers({ search: q || undefined, limit, offset });
  const totalPages = Math.ceil(total / limit);

  return (
    <section className="section">
      <div className="page-hdr">
        <div>
          <div className="page-title">👥 Khách hàng</div>
          <div className="page-sub">{total.toLocaleString("vi-VN")} khách · sắp theo doanh thu</div>
        </div>
      </div>

      <form style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <input
          type="text"
          name="q"
          defaultValue={q}
          placeholder="🔍 Tên, SĐT hoặc customer ID..."
          style={{ flex: 1 }}
        />
        <button type="submit" className="btn btn-primary btn-sm">Tìm</button>
      </form>

      <div className="card" style={{ padding: 0 }}>
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: 120 }}>ID</th>
                <th>Tên</th>
                <th style={{ width: 130 }}>SĐT</th>
                <th style={{ width: 140 }}>Email</th>
                <th style={{ width: 120 }}>Tỉnh/Thành</th>
                <th style={{ width: 80 }} className="text-right">Đơn</th>
                <th style={{ width: 140 }} className="text-right">Doanh thu</th>
                <th style={{ width: 110 }}>Đơn gần nhất</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.customer_id}>
                  <td style={{ fontFamily: "monospace", fontSize: 11 }}>{c.customer_id}</td>
                  <td>{c.name || "—"}</td>
                  <td className="muted" style={{ fontSize: 12 }}>{c.phone || "—"}</td>
                  <td className="muted" style={{ fontSize: 11 }}>{c.email || "—"}</td>
                  <td className="muted" style={{ fontSize: 12 }}>{c.city || "—"}</td>
                  <td className="text-right">{toNum(c.total_orders)}</td>
                  <td className="text-right font-bold">{formatVND(c.total_revenue)}</td>
                  <td className="muted" style={{ fontSize: 11 }}>{formatDate(c.last_order_date)}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={8} className="muted" style={{ textAlign: "center", padding: 24 }}>
                  Không có khách hàng.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div style={{ padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid var(--border)" }}>
            <span className="muted" style={{ fontSize: 12 }}>
              Trang {pageNum}/{totalPages.toLocaleString("vi-VN")}
            </span>
            <div className="row">
              {pageNum > 1 && (
                <Link href={`/customers?q=${q}&page=${pageNum - 1}`} className="btn btn-ghost btn-sm" style={{ textDecoration: "none" }}>
                  ← Trước
                </Link>
              )}
              {pageNum < totalPages && (
                <Link href={`/customers?q=${q}&page=${pageNum + 1}`} className="btn btn-ghost btn-sm" style={{ textDecoration: "none" }}>
                  Sau →
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
