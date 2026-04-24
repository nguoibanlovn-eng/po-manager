"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition, type FormEvent } from "react";
import { toNum, formatVND, formatYmd } from "@/lib/format";
import type { Item, Order, OrderStage } from "@/lib/types";
import type { SupplierRef } from "@/lib/db/suppliers";
import type { UserRef } from "@/lib/db/users";
import SupplierPicker from "@/components/SupplierPicker";
import {
  saveOrderAction, deleteOrderFromForm, advanceStageFromForm,
  requestUnlockAction, approveUnlockAction,
} from "./actions";
import ProductPicker, { type PickableProduct } from "./ProductPicker";

type ItemDraft = Partial<Item> & { _key: string; _expanded?: boolean };

const PAY_OPTIONS = ["Chưa thanh toán", "Đã cọc", "Đã thanh toán", "Công nợ"];
const GOODS_OPTIONS = [
  "Trung Quốc trữ sẵn",
  "Trung Quốc đặt hàng",
  "Nội địa",
  "Hàng mẫu",
  "Hàng sản xuất",
];
const ITEM_TYPE_OPTIONS = ["Hàng chính", "Hàng mẫu", "Hàng bonus"];

const STAGE_FLOW: { from: OrderStage; to: OrderStage; label: string; note: string }[] = [
  { from: "DRAFT",     to: "ORDERED",   label: "Đã đặt NCC",       note: "Đã đặt nhà cung cấp" },
  { from: "ORDERED",   to: "ARRIVED",   label: "Hàng đã về",       note: "Hàng về kho" },
  { from: "ARRIVED",   to: "QC_DONE",   label: "QC xong",          note: "Kỹ thuật hoàn tất QC" },
  { from: "QC_DONE",   to: "ON_SHELF",  label: "Lên kệ",           note: "Kỹ thuật xác nhận lên kệ" },
  { from: "ON_SHELF",  to: "SELLING",   label: "Bắt đầu bán",      note: "Bắt đầu bán" },
  { from: "SELLING",   to: "COMPLETED", label: "Hoàn tất",         note: "Đơn hoàn tất" },
];

let _keyCtr = 0;
const newKey = () => "row-" + (++_keyCtr);

export default function OrderForm({
  user,
  order,
  items: initialItems,
  suppliers,
  users,
}: {
  user: { email: string; name: string; role: string } | null;
  order: Order | null;
  items: Item[];
  suppliers: SupplierRef[];
  users: UserRef[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const isEdit = !!order;

  // Form state
  const [orderName, setOrderName] = useState(order?.order_name || "");
  const [owner, setOwner] = useState(order?.owner || user?.email || "");
  const [supplier, setSupplier] = useState(order?.supplier_name || "");
  const [payStatus, setPayStatus] = useState(order?.pay_status || "Chưa thanh toán");
  const [goodsType, setGoodsType] = useState(order?.goods_type || "Hàng chính");
  const [orderDate, setOrderDate] = useState(formatYmd(order?.order_date));
  const [etaDate, setEtaDate] = useState(formatYmd(order?.eta_date));
  const [arrivalDate, setArrivalDate] = useState(formatYmd(order?.arrival_date));
  const [deposit, setDeposit] = useState(String(order?.deposit_amount || "0"));
  const [note, setNote] = useState(order?.note || "");

  const [items, setItems] = useState<ItemDraft[]>(() =>
    initialItems.map((it) => ({ ...it, _key: newKey(), _expanded: false })),
  );
  const [pickerFor, setPickerFor] = useState<string | null>(null);

  function toggleExpand(key: string) {
    setItems((xs) => xs.map((it) => (it._key === key ? { ...it, _expanded: !it._expanded } : it)));
  }
  function expandAll() {
    const allExp = items.every((it) => it._expanded);
    setItems((xs) => xs.map((it) => ({ ...it, _expanded: !allExp })));
  }
  function pickProduct(p: PickableProduct, key: string) {
    setItems((xs) =>
      xs.map((it) =>
        it._key === key
          ? {
              ...it,
              sku: p.sku || it.sku,
              product_name: p.product_name || it.product_name,
              unit_price: Number(p.cost_price) || it.unit_price || 0,
            }
          : it,
      ),
    );
  }

  // Nhanh bill import
  const [nhanhBillId, setNhanhBillId] = useState("");
  const [importing, setImporting] = useState(false);

  async function importNhanhBill() {
    const id = nhanhBillId.trim();
    if (!id) return alert("Nhập bill ID từ Nhanh.vn");
    setImporting(true);
    try {
      const res = await fetch(`/api/nhanh/bill?id=${encodeURIComponent(id)}`);
      const r = await res.json();
      if (!r.ok) { alert("Lỗi: " + r.error); return; }
      const bill = r.bill as {
        id: string; supplier: string; created_date: string; total: number;
        zero_price_count: number;
        products: Array<{ sku: string; product_name: string; qty: number; unit_price: number }>;
      };
      if (bill.zero_price_count > 0 && !confirm(`Có ${bill.zero_price_count} SP giá = 0 trong bill này. Tiếp tục?`)) return;

      if (!orderName) setOrderName(`Bill Nhanh ${bill.id}`);
      if (!supplier && bill.supplier) setSupplier(bill.supplier);
      if (!orderDate && bill.created_date) setOrderDate(bill.created_date);

      setItems(
        bill.products.map((p) => ({
          _key: newKey(),
          sku: p.sku,
          product_name: p.product_name,
          qty: p.qty,
          unit_price: p.unit_price,
          item_type: "Hàng chính",
          qc_status: "Chưa QC",
          return_status: "Chưa xử lý",
        })),
      );
      alert(`Đã import ${bill.products.length} SP từ bill ${bill.id} (${bill.supplier})`);
    } catch (e) {
      alert("Lỗi: " + (e as Error).message);
    } finally {
      setImporting(false);
    }
  }

  const orderTotal = useMemo(
    () => items.reduce((s, it) => s + toNum(it.qty) * toNum(it.unit_price), 0),
    [items],
  );
  const totalQty = useMemo(
    () => items.reduce((s, it) => s + toNum(it.qty), 0),
    [items],
  );

  function addItem() {
    setItems((xs) => [
      ...xs,
      {
        _key: newKey(),
        _expanded: true,
        item_type: "Hàng chính",
        qty: 0,
        unit_price: 0,
        qc_status: "Chưa QC",
        return_status: "Chưa xử lý",
      },
    ]);
  }
  function removeItem(key: string) {
    setItems((xs) => xs.filter((it) => it._key !== key));
  }
  function patchItem(key: string, patch: Partial<ItemDraft>) {
    setItems((xs) => xs.map((it) => (it._key === key ? { ...it, ...patch } : it)));
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!orderName.trim()) return alert("Nhập tên đơn.");
    if (items.length === 0) return alert("Thêm ít nhất 1 sản phẩm.");

    startTransition(async () => {
      const r = await saveOrderAction({
        order_id: order?.order_id,
        order_name: orderName,
        owner,
        supplier_name: supplier || null,
        pay_status: payStatus,
        goods_type: goodsType,
        order_date: orderDate || null,
        eta_date: etaDate || null,
        arrival_date: arrivalDate || null,
        deposit_amount: toNum(deposit),
        note,
        items: items.map(({ _key: _, ...rest }) => rest),
      });
      if (!r.ok) {
        alert("Lỗi lưu: " + r.error);
        return;
      }
      if (isEdit) {
        router.refresh();
        alert("Đã lưu đơn " + r.order_id);
      } else {
        router.push("/list");
      }
    });
  }

  function onDelete() {
    if (!order) return;
    if (!confirm(`Xoá đơn "${order.order_name || order.order_id}"?`)) return;
    startTransition(async () => {
      await deleteOrderFromForm(order.order_id);
    });
  }

  function onAdvance(to: OrderStage, stageNote: string) {
    if (!order) return;
    if (!confirm(`Chuyển sang giai đoạn "${STAGE_LABEL[to]}"?`)) return;
    startTransition(async () => {
      await advanceStageFromForm(order.order_id, to, stageNote);
      router.refresh();
    });
  }

  const currentStage = (order?.stage as OrderStage) || "DRAFT";
  const nextTransition = STAGE_FLOW.find((s) => s.from === currentStage);

  // Approval flow
  const isLocked = !!order?.is_locked;
  const hasPendingUnlock = isLocked && !!order?.unlock_requested_by && !order?.unlock_approved_by;
  const canApprove = user?.role === "ADMIN" || user?.role.startsWith("LEADER_") || false;

  function reqUnlock() {
    if (!order) return;
    const reason = prompt("Nhập lý do cần unlock đơn này:");
    if (!reason?.trim()) return;
    startTransition(async () => {
      const r = await requestUnlockAction(order.order_id, reason);
      if (!r.ok) alert(r.error);
      else router.refresh();
    });
  }
  function apprUnlock(approve: boolean) {
    if (!order) return;
    const note = approve ? "" : prompt("Ghi chú (không bắt buộc):") || "";
    startTransition(async () => {
      const r = await approveUnlockAction(order.order_id, approve, note);
      if (!r.ok) alert(r.error);
      else router.refresh();
    });
  }

  return (
    <form className="section" onSubmit={onSubmit}>
      <div className="page-hdr">
        <div>
          <div className="page-title">
            {isEdit ? `✏️ Sửa đơn ${order!.order_id}` : "✏️ Tạo đơn mới"}
          </div>
          {isEdit && (
            <div className="page-sub" style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              <span className={`stage-badge stage-${currentStage}`}>{STAGE_LABEL[currentStage]}</span>
              {isLocked && (
                <span className="chip chip-amber">
                  🔒 Đơn đang khoá{hasPendingUnlock ? " · có yêu cầu unlock" : ""}
                </span>
              )}
            </div>
          )}
        </div>
        <div className="row">
          {isEdit && isLocked && !hasPendingUnlock && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={reqUnlock} disabled={pending}>
              🔓 Yêu cầu unlock
            </button>
          )}
          {isEdit && hasPendingUnlock && canApprove && (
            <>
              <button type="button" className="btn btn-success btn-sm" onClick={() => apprUnlock(true)} disabled={pending}>
                ✓ Duyệt unlock
              </button>
              <button type="button" className="btn btn-danger btn-sm" onClick={() => apprUnlock(false)} disabled={pending}>
                ✗ Từ chối
              </button>
            </>
          )}
          {isEdit && nextTransition && (
            <button
              type="button"
              className="btn btn-success btn-sm"
              onClick={() => onAdvance(nextTransition.to, nextTransition.note)}
              disabled={pending}
            >
              → {nextTransition.label}
            </button>
          )}
          <Link href="/list" className="btn btn-ghost btn-sm" style={{ textDecoration: "none" }}>← Danh sách</Link>
          <button type="submit" className="btn btn-primary" disabled={pending}>
            {pending ? "Đang lưu..." : "💾 Lưu đơn"}
          </button>
        </div>
      </div>

      {/* NHANH BILL IMPORT */}
      <div className="nhanh-banner">
        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--blue)" }}>🔗 Import từ nhanh.vn</span>
        <input
          type="text"
          placeholder="Bill ID..."
          value={nhanhBillId}
          onChange={(e) => setNhanhBillId(e.target.value.replace(/\D/g, ""))}
          style={{ maxWidth: 180 }}
        />
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={importNhanhBill}
          disabled={importing}
        >
          {importing ? "Đang tải..." : "⬇ Đồng bộ"}
        </button>
        <span className="nhanh-status">
          {items.length > 0 ? `${items.length} SP trong đơn` : "Nhập bill ID để prefill form"}
        </span>
      </div>

      {/* THÔNG TIN ĐƠN */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ fontWeight: 700, marginBottom: 12 }}>📋 Thông tin đơn hàng</div>
        <div className="form-grid fg-4" style={{ marginBottom: 10 }}>
          <div className="form-group">
            <label>Mã đơn</label>
            <input className="ro" readOnly value={order?.order_id || "Tự sinh khi lưu"} />
          </div>
          <div className="form-group">
            <label>Người phụ trách</label>
            <select value={owner} onChange={(e) => setOwner(e.target.value)}>
              <option value="">-- Chọn nhân sự --</option>
              {users.map((u) => (
                <option key={u.email} value={u.email}>
                  {u.name || u.email} {u.role ? `(${u.role})` : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Thanh toán</label>
            <select value={payStatus} onChange={(e) => setPayStatus(e.target.value)}>
              {PAY_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Phân loại hàng</label>
            <select value={goodsType} onChange={(e) => setGoodsType(e.target.value)}>
              {GOODS_OPTIONS.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
        </div>

        <div className="form-grid fg-2" style={{ marginBottom: 10 }}>
          <div className="form-group">
            <label>Tên đơn</label>
            <input
              value={orderName}
              onChange={(e) => setOrderName(e.target.value)}
              placeholder="VD: Lô máy chiếu HY320 tháng 3/2026"
              required
            />
          </div>
          <div className="form-group">
            <label>Nhà cung cấp</label>
            <SupplierPicker suppliers={suppliers} value={supplier} onChange={setSupplier} />
          </div>
        </div>

        <div className="form-grid fg-4" style={{ marginBottom: 10 }}>
          <div className="form-group">
            <label>Ngày đặt</label>
            <input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
          </div>
          <div className="form-group">
            <label>ETA (dự kiến về)</label>
            <input type="date" value={etaDate} onChange={(e) => setEtaDate(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Ngày về thực tế</label>
            <input type="date" value={arrivalDate} onChange={(e) => setArrivalDate(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Tiền cọc (đ)</label>
            <input
              type="text"
              inputMode="numeric"
              value={deposit}
              onChange={(e) => setDeposit(e.target.value.replace(/[^\d]/g, ""))}
            />
          </div>
        </div>

        <div className="form-group">
          <label>Ghi chú</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Ghi chú..."
            rows={2}
          />
        </div>
      </div>

      {/* ITEMS */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ fontWeight: 700 }}>📦 Sản phẩm trong đơn</div>
          <div className="row">
            {items.length > 0 && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={expandAll}>
                Mở rộng tất cả
              </button>
            )}
            <button type="button" className="btn btn-primary btn-sm" onClick={addItem}>
              + Thêm SP
            </button>
          </div>
        </div>

        {items.length === 0 ? (
          <div style={{ textAlign: "center", padding: 24, color: "var(--muted)", fontSize: 13 }}>
            Chưa có sản phẩm. Bấm &quot;+ Thêm SP&quot; hoặc đồng bộ từ nhanh.vn.
          </div>
        ) : (
          <div>
            {items.map((it, i) => {
              const lineTotal = toNum(it.qty) * toNum(it.unit_price);
              const priceWarn = toNum(it.unit_price) > 0 && toNum(it.unit_price) < 1000 ? " ⚠" : "";
              const summary = it.product_name
                ? `${it.product_name} · ${toNum(it.qty).toLocaleString("vi-VN")} × ${toNum(it.unit_price).toLocaleString("vi-VN")}đ${priceWarn} = ${formatVND(lineTotal)}`
                : "(Chưa nhập)";
              return (
                <div
                  key={it._key}
                  className={"item-card" + (it._expanded ? " expanded" : "")}
                >
                  <div className="item-hdr" onClick={() => toggleExpand(it._key)}>
                    <div className="item-hdr-l">
                      <span className="item-num">{i + 1}</span>
                      <span className="item-summary">{summary}</span>
                    </div>
                    <div className="row">
                      <button
                        type="button"
                        className="btn btn-ghost btn-xs"
                        onClick={(e) => { e.stopPropagation(); removeItem(it._key); }}
                        style={{ color: "var(--red)" }}
                      >
                        × Xoá
                      </button>
                      <span style={{ fontSize: 10, color: "var(--subtle)" }}>
                        {it._expanded ? "▼" : "▶"}
                      </span>
                    </div>
                  </div>

                  <div className="item-body">
                    <div className="form-grid fg-4" style={{ marginBottom: 10 }}>
                      <div className="form-group">
                        <label>SKU</label>
                        <div style={{ display: "flex", gap: 4 }}>
                          <input
                            value={it.sku || ""}
                            onChange={(e) => patchItem(it._key, { sku: e.target.value })}
                            placeholder="Mã SP"
                            style={{ flex: 1, minWidth: 0 }}
                          />
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setPickerFor(it._key); }}
                            title="Chọn từ catalog"
                            style={{
                              flexShrink: 0,
                              padding: "0 8px",
                              fontSize: 12,
                              border: "0.5px solid var(--border)",
                              borderRadius: "var(--radius-sm)",
                              background: "var(--bg)",
                              color: "var(--muted)",
                              cursor: "pointer",
                              whiteSpace: "nowrap",
                            }}
                          >
                            📦 Chọn
                          </button>
                        </div>
                      </div>
                      <div className="form-group" style={{ gridColumn: "span 2" }}>
                        <label>Tên sản phẩm</label>
                        <input
                          value={it.product_name || ""}
                          onChange={(e) => patchItem(it._key, { product_name: e.target.value })}
                          placeholder="Tên SP"
                        />
                      </div>
                      <div className="form-group">
                        <label>Kiểu hàng</label>
                        <select
                          value={it.item_type || "Hàng chính"}
                          onChange={(e) => patchItem(it._key, { item_type: e.target.value })}
                        >
                          {ITEM_TYPE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                        </select>
                      </div>
                    </div>

                    <div className="form-grid fg-4" style={{ marginBottom: 8 }}>
                      <div className="form-group">
                        <label>Số lượng</label>
                        <input
                          type="number"
                          min={0}
                          value={String(it.qty ?? 0)}
                          onChange={(e) => patchItem(it._key, { qty: Number(e.target.value) || 0 })}
                        />
                      </div>
                      <div className="form-group">
                        <label>Giá nhập (đ)</label>
                        <input
                          type="number"
                          min={0}
                          value={String(it.unit_price ?? 0)}
                          onChange={(e) => patchItem(it._key, { unit_price: Number(e.target.value) || 0 })}
                        />
                      </div>
                      <div className="form-group">
                        <label>Thành tiền</label>
                        <input className="ro" readOnly value={lineTotal.toLocaleString("vi-VN")} />
                      </div>
                      <div className="form-group">
                        <label>Link mua</label>
                        <input
                          value={it.link || ""}
                          onChange={(e) => patchItem(it._key, { link: e.target.value })}
                          placeholder="https://..."
                        />
                      </div>
                    </div>

                    <div className="form-group">
                      <label>Ghi chú SP</label>
                      <input
                        value={it.note || ""}
                        onChange={(e) => patchItem(it._key, { note: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div style={{ marginTop: 12, textAlign: "right", fontSize: 14, fontWeight: 700 }}>
          Tổng SL: {totalQty} · Tổng tiền: <span style={{ color: "var(--blue)" }}>{formatVND(orderTotal)}</span>
        </div>
      </div>

      {pickerFor && (
        <ProductPicker
          onPick={(p) => pickProduct(p, pickerFor)}
          onClose={() => setPickerFor(null)}
        />
      )}

      {/* STICKY BAR */}
      <div className="sticky-bar">
        <div style={{ fontSize: 12, color: "var(--muted)" }}>
          {isEdit ? `Đang sửa: ${order!.order_id}` : "Đơn mới"}
        </div>
        <div className="row">
          {isEdit && (
            <button type="button" className="btn btn-danger btn-sm" onClick={onDelete} disabled={pending}>
              🗑 Xoá
            </button>
          )}
          <Link href="/list" className="btn btn-ghost btn-sm" style={{ textDecoration: "none" }}>Huỷ</Link>
          <button type="submit" className="btn btn-primary" disabled={pending}>
            {pending ? "Đang lưu..." : "💾 Lưu đơn"}
          </button>
        </div>
      </div>
    </form>
  );
}

const STAGE_LABEL: Record<string, string> = {
  DRAFT: "Nháp",
  ORDERED: "Đã đặt",
  ARRIVED: "Hàng về",
  QC_DONE: "QC xong",
  ON_SHELF: "Lên kệ",
  SELLING: "Đang bán",
  COMPLETED: "Hoàn tất",
};
