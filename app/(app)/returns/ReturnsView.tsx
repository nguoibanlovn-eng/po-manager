"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { formatDate, formatVND, toNum } from "@/lib/format";
import type { ReturnRow } from "@/lib/db/returns";
import { createReturnAction, markReturnSoldAction, updateReturnAction } from "./actions";

const STATUS_OPTIONS = ["PENDING", "READY", "SOLD", "DISCARDED"];

export default function ReturnsView({
  items,
  statusFilter,
}: {
  items: ReturnRow[];
  statusFilter: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [showCreate, setShowCreate] = useState(false);

  const stats = useMemo(() => {
    return items.reduce(
      (acc, r) => ({
        total: acc.total + 1,
        pending: acc.pending + (r.status === "PENDING" ? 1 : 0),
        ready: acc.ready + (r.status === "READY" ? 1 : 0),
        sold: acc.sold + (r.status === "SOLD" ? 1 : 0),
        totalCost: acc.totalCost + toNum(r.cost),
        totalRevenue: acc.totalRevenue + (r.status === "SOLD" ? toNum(r.sell_price) : 0),
        totalLoss: acc.totalLoss + (r.status === "SOLD" ? toNum(r.loss) : 0),
      }),
      { total: 0, pending: 0, ready: 0, sold: 0, totalCost: 0, totalRevenue: 0, totalLoss: 0 },
    );
  }, [items]);

  return (
    <section className="section">
      <div className="page-hdr">
        <div>
          <div className="page-title">♻️ Hoàn &amp; Thanh lý</div>
          <div className="page-sub">{stats.total} mục · {stats.pending} chờ · {stats.sold} đã bán</div>
        </div>
        <div className="row" style={{ gap: 6 }}>
          <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>+ Tạo SP thanh lý</button>
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat-card c-blue"><div className="sl">Tổng SP</div><div className="sv">{stats.total}</div></div>
        <div className="stat-card c-amber"><div className="sl">Giá vốn</div><div className="sv">{formatVND(stats.totalCost)}</div></div>
        <div className="stat-card c-green"><div className="sl">Doanh thu (đã bán)</div><div className="sv">{formatVND(stats.totalRevenue)}</div></div>
        <div className="stat-card c-red"><div className="sl">Thiệt hại ròng</div><div className="sv">{formatVND(stats.totalLoss)}</div></div>
      </div>

      <div className="row" style={{ marginBottom: 12, gap: 6 }}>
        <a href="/returns" className="btn btn-ghost btn-sm" style={{ background: !statusFilter ? "var(--blue)" : undefined, color: !statusFilter ? "#fff" : undefined, textDecoration: "none" }}>Tất cả</a>
        {STATUS_OPTIONS.map((s) => (
          <a key={s} href={`/returns?status=${s}`} className="btn btn-ghost btn-sm" style={{ background: statusFilter === s ? "var(--blue)" : undefined, color: statusFilter === s ? "#fff" : undefined, textDecoration: "none" }}>
            {s}
          </a>
        ))}
      </div>

      {showCreate && (
        <CreateForm
          onClose={() => setShowCreate(false)}
          onSaved={() => { setShowCreate(false); router.refresh(); }}
          disabled={pending}
          startTransition={startTransition}
        />
      )}

      <div className="card" style={{ padding: 0 }}>
        <div className="tbl-wrap">
          <table>
            <thead><tr>
              <th>SP / SKU</th>
              <th>Tình trạng</th>
              <th className="text-right">Giá vốn</th>
              <th className="text-right">Giá sửa</th>
              <th className="text-right">Giá bán</th>
              <th className="text-right">Lỗ</th>
              <th>Status</th>
              <th>Khách</th>
              <th></th>
            </tr></thead>
            <tbody>
              {items.map((r) => (
                <ReturnRowUI key={r.token} row={r} disabled={pending} startTransition={startTransition} refresh={() => router.refresh()} />
              ))}
              {items.length === 0 && (
                <tr><td colSpan={9} className="muted" style={{ textAlign: "center", padding: 24 }}>Chưa có SP thanh lý.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function CreateForm({
  onClose,
  onSaved,
  disabled,
  startTransition,
}: {
  onClose: () => void;
  onSaved: () => void;
  disabled: boolean;
  startTransition: ReturnType<typeof useTransition>[1];
}) {
  const [d, setD] = useState({
    product_name: "",
    sku: "",
    category: "",
    condition: "Đã dùng",
    description: "",
    cost: "",
    repair_cost: "0",
    sell_price: "",
    note: "",
  });

  function save() {
    if (!d.product_name.trim()) return alert("Nhập tên SP");
    startTransition(async () => {
      const r = await createReturnAction({
        product_name: d.product_name,
        sku: d.sku || null,
        category: d.category || null,
        condition: d.condition,
        description: d.description || null,
        cost: toNum(d.cost),
        repair_cost: toNum(d.repair_cost),
        sell_price: toNum(d.sell_price),
        note: d.note || null,
        status: "PENDING",
      });
      if (!r.ok) alert(r.error);
      else onSaved();
    });
  }

  return (
    <div className="card" style={{ marginBottom: 12, border: "1px solid var(--blue)" }}>
      <div style={{ fontWeight: 700, marginBottom: 12 }}>+ Tạo SP thanh lý mới</div>
      <div className="form-grid fg-3" style={{ marginBottom: 10 }}>
        <div className="form-group">
          <label>Tên SP *</label>
          <input value={d.product_name} onChange={(e) => setD({ ...d, product_name: e.target.value })} />
        </div>
        <div className="form-group">
          <label>SKU</label>
          <input value={d.sku} onChange={(e) => setD({ ...d, sku: e.target.value })} />
        </div>
        <div className="form-group">
          <label>Danh mục</label>
          <input value={d.category} onChange={(e) => setD({ ...d, category: e.target.value })} />
        </div>
      </div>
      <div className="form-grid fg-4" style={{ marginBottom: 10 }}>
        <div className="form-group">
          <label>Tình trạng</label>
          <select value={d.condition} onChange={(e) => setD({ ...d, condition: e.target.value })}>
            <option>Mới 100%</option>
            <option>Mới 90%</option>
            <option>Đã dùng</option>
            <option>Lỗi nhẹ</option>
            <option>Lỗi nặng</option>
          </select>
        </div>
        <div className="form-group"><label>Giá vốn</label><input type="text" inputMode="numeric" value={d.cost} onChange={(e) => setD({ ...d, cost: e.target.value.replace(/\D/g, "") })} /></div>
        <div className="form-group"><label>Chi phí sửa</label><input type="text" inputMode="numeric" value={d.repair_cost} onChange={(e) => setD({ ...d, repair_cost: e.target.value.replace(/\D/g, "") })} /></div>
        <div className="form-group"><label>Giá bán dự kiến</label><input type="text" inputMode="numeric" value={d.sell_price} onChange={(e) => setD({ ...d, sell_price: e.target.value.replace(/\D/g, "") })} /></div>
      </div>
      <div className="form-group" style={{ marginBottom: 10 }}>
        <label>Mô tả</label>
        <textarea rows={2} value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} />
      </div>
      <div className="form-group" style={{ marginBottom: 10 }}>
        <label>Ghi chú</label>
        <input value={d.note} onChange={(e) => setD({ ...d, note: e.target.value })} />
      </div>
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>Huỷ</button>
        <button className="btn btn-primary btn-sm" onClick={save} disabled={disabled}>💾 Lưu</button>
      </div>
    </div>
  );
}

function ReturnRowUI({
  row,
  disabled,
  startTransition,
  refresh,
}: {
  row: ReturnRow;
  disabled: boolean;
  startTransition: ReturnType<typeof useTransition>[1];
  refresh: () => void;
}) {
  const [markingSold, setMarkingSold] = useState(false);
  const [sold, setSold] = useState({
    sell_price: String(row.sell_price || ""),
    customer_name: "",
    phone: "",
    channel_sold: "",
    tracking: "",
  });

  function markSold() {
    if (!sold.sell_price || toNum(sold.sell_price) <= 0) return alert("Nhập giá bán");
    startTransition(async () => {
      const r = await markReturnSoldAction(row.token, {
        sell_price: toNum(sold.sell_price),
        customer_name: sold.customer_name || undefined,
        phone: sold.phone || undefined,
        channel_sold: sold.channel_sold || undefined,
        tracking: sold.tracking || undefined,
      });
      if (!r.ok) alert("Lỗi: " + String(r));
      else { setMarkingSold(false); refresh(); }
    });
  }

  function updateStatus(status: string) {
    startTransition(async () => {
      await updateReturnAction(row.token, { status });
      refresh();
    });
  }

  return (
    <>
      <tr>
        <td>
          <div style={{ fontWeight: 600 }}>{row.product_name || "—"}</div>
          <div className="muted" style={{ fontSize: 11 }}>{row.sku || "—"}</div>
        </td>
        <td className="muted" style={{ fontSize: 12 }}>{row.condition || "—"}</td>
        <td className="text-right muted">{formatVND(row.cost)}</td>
        <td className="text-right muted">{formatVND(row.repair_cost)}</td>
        <td className="text-right font-bold">{formatVND(row.sell_price)}</td>
        <td className="text-right" style={{ color: "var(--red)" }}>{formatVND(row.loss)}</td>
        <td><span className={`chip chip-${row.status === "SOLD" ? "green" : row.status === "READY" ? "blue" : row.status === "DISCARDED" ? "red" : "gray"}`}>{row.status || "PENDING"}</span></td>
        <td className="muted" style={{ fontSize: 12 }}>
          {row.customer_name || "—"}
          {row.phone && <div style={{ fontSize: 11 }}>{row.phone}</div>}
        </td>
        <td>
          {row.status !== "SOLD" && (
            <div className="row" style={{ gap: 4 }}>
              {row.status === "PENDING" && <button className="btn btn-ghost btn-xs" onClick={() => updateStatus("READY")} disabled={disabled}>Sẵn sàng</button>}
              {row.status === "READY" && <button className="btn btn-success btn-xs" onClick={() => setMarkingSold(true)} disabled={disabled}>Bán</button>}
            </div>
          )}
          {row.status === "SOLD" && <div className="muted" style={{ fontSize: 11 }}>Bán ngày {formatDate(row.sold_at)}</div>}
        </td>
      </tr>
      {markingSold && (
        <tr>
          <td colSpan={9} style={{ background: "#FAFAFA" }}>
            <div className="form-grid fg-4" style={{ padding: 10 }}>
              <div className="form-group"><label>Giá bán thực</label><input type="text" inputMode="numeric" value={sold.sell_price} onChange={(e) => setSold({ ...sold, sell_price: e.target.value.replace(/\D/g, "") })} /></div>
              <div className="form-group"><label>Khách</label><input value={sold.customer_name} onChange={(e) => setSold({ ...sold, customer_name: e.target.value })} /></div>
              <div className="form-group"><label>SĐT</label><input value={sold.phone} onChange={(e) => setSold({ ...sold, phone: e.target.value })} /></div>
              <div className="form-group"><label>Kênh</label><input value={sold.channel_sold} onChange={(e) => setSold({ ...sold, channel_sold: e.target.value })} placeholder="FB/Shopee/..." /></div>
            </div>
            <div className="row" style={{ justifyContent: "flex-end", padding: "0 10px 10px" }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setMarkingSold(false)}>Huỷ</button>
              <button className="btn btn-success btn-sm" onClick={markSold} disabled={disabled}>✓ Đánh dấu đã bán</button>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
