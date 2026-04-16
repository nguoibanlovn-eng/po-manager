import Link from "next/link";
import { listInventory } from "@/lib/db/inventory";
import { formatDate, toNum } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; filter?: string; page?: string }>;
}) {
  const { q = "", filter = "all", page = "1" } = await searchParams;
  const pageNum = Math.max(1, Number(page) || 1);
  const limit = 200;
  const offset = (pageNum - 1) * limit;

  const { rows, total } = await listInventory({
    search: q || undefined,
    filter: (filter as "all" | "in_stock" | "low_stock" | "out_of_stock") || "all",
    limit,
    offset,
  });

  const totalPages = Math.ceil(total / limit);

  return (
    <section className="section">
      <div className="page-hdr">
        <div>
          <div className="page-title">📦 Quản lý tồn kho</div>
          <div className="page-sub">{total.toLocaleString("vi-VN")} SKU</div>
        </div>
      </div>

      <form style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <input
          type="text"
          name="q"
          defaultValue={q}
          placeholder="🔍 Tìm SKU hoặc tên SP..."
          style={{ flex: 1, minWidth: 200 }}
        />
        <select name="filter" defaultValue={filter}>
          <option value="all">Tất cả</option>
          <option value="in_stock">Còn hàng</option>
          <option value="low_stock">Sắp hết (≤5)</option>
          <option value="out_of_stock">Hết hàng</option>
        </select>
        <button type="submit" className="btn btn-primary btn-sm">Lọc</button>
      </form>

      <div className="card" style={{ padding: 0 }}>
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: 140 }}>SKU</th>
                <th>Sản phẩm</th>
                <th style={{ width: 100 }} className="text-right">Tồn</th>
                <th style={{ width: 100 }} className="text-right">Đi đường</th>
                <th style={{ width: 100 }} className="text-right">Giữ</th>
                <th style={{ width: 100 }} className="text-right">Bán 30d</th>
                <th style={{ width: 140 }}>Sync lúc</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const avail = toNum(r.available_qty);
                const chip =
                  avail <= 0 ? "chip-red" : avail <= 5 ? "chip-amber" : "chip-green";
                return (
                  <tr key={r.sku}>
                    <td style={{ fontFamily: "monospace", fontSize: 11 }}>{r.sku}</td>
                    <td>{r.product_name || "—"}</td>
                    <td className="text-right">
                      <span className={`chip ${chip}`}>{avail.toLocaleString("vi-VN")}</span>
                    </td>
                    <td className="text-right muted">{toNum(r.in_transit_qty)}</td>
                    <td className="text-right muted">{toNum(r.reserved_qty)}</td>
                    <td className="text-right">{toNum(r.sold_30d).toLocaleString("vi-VN")}</td>
                    <td className="muted" style={{ fontSize: 11 }}>{formatDate(r.last_sync)}</td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr><td colSpan={7} className="muted" style={{ textAlign: "center", padding: 24 }}>
                  Không có SKU phù hợp.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div style={{ padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid var(--border)" }}>
            <span className="muted" style={{ fontSize: 12 }}>Trang {pageNum}/{totalPages}</span>
            <div className="row">
              {pageNum > 1 && (
                <Link
                  href={`/inventory?q=${q}&filter=${filter}&page=${pageNum - 1}`}
                  className="btn btn-ghost btn-sm"
                  style={{ textDecoration: "none" }}
                >← Trước</Link>
              )}
              {pageNum < totalPages && (
                <Link
                  href={`/inventory?q=${q}&filter=${filter}&page=${pageNum + 1}`}
                  className="btn btn-ghost btn-sm"
                  style={{ textDecoration: "none" }}
                >Sau →</Link>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
