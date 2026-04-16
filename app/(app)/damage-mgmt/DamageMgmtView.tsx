"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { formatDate, formatVND, formatYmd, toNum } from "@/lib/format";
import type { DamageItem } from "@/lib/db/finance";
import { sendTicketAction, updateDamageAction } from "./actions";

type ResolutionTab = "replace" | "refund" | "liquidate";

export default function DamageMgmtView({
  items,
  tab,
  orderMeta,
}: {
  items: DamageItem[];
  tab: "pending" | "done";
  orderMeta: Record<string, { arrival_date: string | null; order_date: string | null }>;
}) {
  // Group theo order_id (không phải supplier nữa)
  const groups = useMemo(() => {
    const m = new Map<string, { order_id: string; supplier: string; items: DamageItem[]; total: number }>();
    for (const it of items) {
      const k = it.order_id;
      const cur = m.get(k) || { order_id: k, supplier: it.supplier_name || "—", items: [], total: 0 };
      cur.items.push(it);
      cur.total += toNum(it.damage_amount);
      m.set(k, cur);
    }
    return Array.from(m.values()).sort((a, b) => b.total - a.total);
  }, [items]);

  return (
    <section className="section">
      <div className="page-hdr">
        <div>
          <div className="page-title">🔧 Xử lý hàng hỏng</div>
          <div className="page-sub">Các SP lỗi do TECH ghi nhận — liên hệ NCC đổi/hoàn tiền</div>
        </div>
      </div>

      <div className="mini-tabs">
        <Link
          href="/damage-mgmt?tab=pending"
          className={"mini-tab" + (tab === "pending" ? " active" : "")}
          style={{ textDecoration: "none" }}
        >
          ⏳ Cần xử lý <span className="cnt">{tab === "pending" ? items.length : ""}</span>
        </Link>
        <Link
          href="/damage-mgmt?tab=done"
          className={"mini-tab" + (tab === "done" ? " active" : "")}
          style={{ textDecoration: "none" }}
        >
          ✅ Đã xử lý <span className="cnt">{tab === "done" ? items.length : ""}</span>
        </Link>
      </div>

      {groups.length === 0 ? (
        <div className="card muted" style={{ padding: 24, textAlign: "center" }}>
          {tab === "pending" ? "Không có hàng hỏng cần xử lý." : "Chưa có case nào đã xử lý."}
        </div>
      ) : (
        groups.map((g) => {
          const meta = orderMeta[g.order_id];
          return (
            <OrderGroup
              key={g.order_id}
              orderId={g.order_id}
              supplier={g.supplier}
              items={g.items}
              total={g.total}
              arrivalDate={meta?.arrival_date || meta?.order_date || null}
            />
          );
        })
      )}
    </section>
  );
}

function OrderGroup({
  orderId, supplier, items, total, arrivalDate,
}: {
  orderId: string;
  supplier: string;
  items: DamageItem[];
  total: number;
  arrivalDate: string | null;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="card" style={{ marginBottom: 12, padding: 0, overflow: "hidden" }}>
      <div
        onClick={() => setOpen((v) => !v)}
        style={{
          padding: "12px 14px",
          background: "#FAFAFA",
          borderBottom: open ? "1px solid var(--border)" : "none",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, color: "var(--muted)" }}>{open ? "▾" : "▸"}</span>
          <div>
            <div style={{ fontWeight: 700 }}>
              Lô hàng về {formatDate(arrivalDate) || "—"}{" "}
              <Link
                href={`/create?order_id=${orderId}`}
                style={{ color: "var(--blue)", fontWeight: 400, fontSize: 13 }}
                onClick={(e) => e.stopPropagation()}
              >
                {orderId}
              </Link>
            </div>
            <div className="muted" style={{ fontSize: 12 }}>{items.length} SP lỗi · NCC: {supplier}</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexShrink: 0 }}>
          <span style={{ fontSize: 13, color: "var(--red)", fontWeight: 700 }}>
            {formatVND(total)} thiệt hại
          </span>
          <span className="chip chip-gray">NCC: {supplier}</span>
        </div>
      </div>

      {open && (
        <div>
          {items.map((it) => (
            <ItemAccordion key={`${it.order_id}-${it.line_id}`} item={it} />
          ))}
        </div>
      )}
    </div>
  );
}

function ItemAccordion({ item }: { item: DamageItem }) {
  const [open, setOpen] = useState(true);
  return (
    <div style={{ borderBottom: "1px solid var(--border)" }}>
      <div
        onClick={() => setOpen((v) => !v)}
        style={{
          padding: "10px 14px",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600 }}>
            <span style={{ color: "var(--muted)", fontSize: 11, marginRight: 6 }}>{open ? "▾" : "▸"}</span>
            {item.product_name} <span className="muted" style={{ fontSize: 11 }}>{item.sku || ""}</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
          <span className="chip chip-red" style={{ fontSize: 11 }}>
            {toNum(item.damage_qty)} lỗi · {formatVND(item.damage_amount)}
          </span>
          <span className={`chip ${item.damage_handled ? "chip-green" : "chip-amber"}`}>
            {item.damage_handled ? "✓ Xong" : "Đang xử lý"}
          </span>
        </div>
      </div>
      {open && <ResolutionForm item={item} />}
    </div>
  );
}

function ResolutionForm({ item }: { item: DamageItem }) {
  const [pending, startTransition] = useTransition();
  const [tab, setTab] = useState<ResolutionTab>(
    item.resolution_type === "refund" ? "refund" :
    item.resolution_type === "liquidate" ? "liquidate" : "replace",
  );
  const [d, setD] = useState({
    damage_note: item.damage_note || "",
    replacement_bill_id: item.replacement_bill_id || "",
    replacement_qty: String(item.replacement_qty || ""),
    refund_method: item.refund_method || "Chuyển khoản ngân hàng",
    resolved_amount: String(item.resolved_amount || item.damage_amount || ""),
    resolved_date: formatYmd(item.resolved_date),
    kt_note: item.kt_note || "",
    bank_name: item.bank_name || "",
    bank_account: item.bank_account || "",
    bank_account_name: item.bank_account_name || "",
    liquidation_sku: item.liquidation_sku || `${item.sku || ""}-TL`,
    liquidation_bill_id: item.liquidation_bill_id || "",
  });

  const damage = toNum(item.damage_amount);
  const recovered = toNum(d.resolved_amount);
  const netLoss = Math.max(0, damage - recovered);

  function save() {
    startTransition(async () => {
      const patch: Record<string, unknown> = {
        resolution_type: tab,
        damage_note: d.damage_note || null,
      };
      if (tab === "replace") {
        patch.replacement_bill_id = d.replacement_bill_id || null;
        patch.replacement_qty = toNum(d.replacement_qty);
      } else if (tab === "refund") {
        patch.refund_method = d.refund_method || null;
        patch.resolved_amount = toNum(d.resolved_amount);
        patch.resolved_date = d.resolved_date || null;
        patch.kt_note = d.kt_note || null;
        patch.bank_name = d.bank_name || null;
        patch.bank_account = d.bank_account || null;
        patch.bank_account_name = d.bank_account_name || null;
      } else if (tab === "liquidate") {
        patch.liquidation_sku = d.liquidation_sku || null;
        patch.liquidation_bill_id = d.liquidation_bill_id || null;
      }
      const r = await updateDamageAction(item.order_id, item.line_id, patch);
      if (!r.ok) alert(r.error);
    });
  }

  function markDone() {
    if (!confirm("Đánh dấu case này đã hoàn tất?")) return;
    startTransition(async () => {
      const r = await updateDamageAction(item.order_id, item.line_id, {
        resolution_status: "done",
        damage_handled: true,
        resolution_type: tab,
      });
      if (!r.ok) alert(r.error);
    });
  }

  function sendTicket() {
    if (!confirm("Gửi ticket sang kế toán?")) return;
    startTransition(async () => {
      const r = await sendTicketAction(item.order_id, item.line_id);
      if (!r.ok) alert("Lỗi");
      else alert("✓ Đã gửi ticket kế toán");
    });
  }

  return (
    <div style={{ padding: "12px 18px 14px", background: "#FAFAFA" }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Phương án xử lý</div>
      <div className="row" style={{ gap: 6, marginBottom: 12 }}>
        <TabBtn active={tab === "replace"} onClick={() => setTab("replace")} color="var(--blue)" label="↩ Đổi trả hàng" />
        <TabBtn active={tab === "refund"} onClick={() => setTab("refund")} color="var(--amber)" label="💵 Hoàn tiền" />
        <TabBtn active={tab === "liquidate"} onClick={() => setTab("liquidate")} color="var(--purple)" label="📦 Thanh lý" />
      </div>

      {/* Xác nhận từ NCC (common) */}
      <div style={{ marginBottom: 10 }}>
        <label style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase" }}>
          Xác nhận từ đối tác (NCC)
        </label>
        <input
          style={{ marginTop: 4 }}
          value={d.damage_note}
          onChange={(e) => setD({ ...d, damage_note: e.target.value })}
          placeholder="Tóm tắt nội dung trao đổi..."
        />
      </div>

      {tab === "replace" && (
        <div className="form-grid fg-2" style={{ marginBottom: 10 }}>
          <div className="form-group">
            <label>Mã đơn nhập bù (nhanh)</label>
            <input
              value={d.replacement_bill_id}
              onChange={(e) => setD({ ...d, replacement_bill_id: e.target.value })}
              placeholder="Bill ID nhanh.vn..."
            />
          </div>
          <div className="form-group">
            <label>SL nhập bù thực tế</label>
            <input
              type="text"
              inputMode="numeric"
              value={d.replacement_qty}
              onChange={(e) => setD({ ...d, replacement_qty: e.target.value.replace(/\D/g, "") })}
              placeholder="Số lượng..."
            />
          </div>
        </div>
      )}

      {tab === "refund" && (
        <>
          <div className="form-grid fg-2" style={{ marginBottom: 10 }}>
            <div className="form-group">
              <label>Hình thức hoàn</label>
              <select value={d.refund_method} onChange={(e) => setD({ ...d, refund_method: e.target.value })}>
                <option>Chuyển khoản ngân hàng</option>
                <option>Tiền mặt</option>
                <option>Ví điện tử</option>
                <option>Khác</option>
              </select>
            </div>
            <div className="form-group">
              <label>Số tiền thực nhận (đ)</label>
              <input
                type="text"
                inputMode="numeric"
                value={d.resolved_amount}
                onChange={(e) => setD({ ...d, resolved_amount: e.target.value.replace(/\D/g, "") })}
              />
            </div>
          </div>
          <div className="form-grid fg-2" style={{ marginBottom: 10 }}>
            <div className="form-group">
              <label>Ngày nhận / xác nhận</label>
              <input
                type="date"
                value={d.resolved_date}
                onChange={(e) => setD({ ...d, resolved_date: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>Ghi chú cho kế toán</label>
              <input
                value={d.kt_note}
                onChange={(e) => setD({ ...d, kt_note: e.target.value })}
                placeholder="Số TK, tên NH, nội dung CK..."
              />
            </div>
          </div>
          {d.refund_method === "Chuyển khoản ngân hàng" && (
            <div style={{ padding: 10, background: "var(--blue-lt)", border: "1px solid var(--blue-bd)", borderRadius: 8, marginBottom: 10 }}>
              <div style={{ fontWeight: 700, color: "var(--blue)", marginBottom: 8 }}>
                Thông tin chuyển khoản NCC
              </div>
              <div className="form-grid fg-3">
                <div className="form-group">
                  <label>Tên ngân hàng</label>
                  <input value={d.bank_name} onChange={(e) => setD({ ...d, bank_name: e.target.value })} placeholder="VD: Vietcombank" />
                </div>
                <div className="form-group">
                  <label>Số tài khoản</label>
                  <input value={d.bank_account} onChange={(e) => setD({ ...d, bank_account: e.target.value })} placeholder="0123456789" />
                </div>
                <div className="form-group">
                  <label>Tên chủ tài khoản</label>
                  <input value={d.bank_account_name} onChange={(e) => setD({ ...d, bank_account_name: e.target.value })} placeholder="NGUYEN VAN A" />
                </div>
              </div>
            </div>
          )}
          <div style={{ padding: 10, background: "#fff", border: "1px solid var(--border)", borderRadius: 8, marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700 }}>Xác nhận kế toán</div>
              <div className="muted" style={{ fontSize: 12 }}>
                {item.ticket_sent_at ? `Đã gửi ${formatDate(item.ticket_sent_at)}` : "Chưa gửi kế toán"}
              </div>
            </div>
            {!item.ticket_sent_at && (
              <button type="button" className="btn btn-primary btn-sm" onClick={sendTicket} disabled={pending}>
                📨 Gửi ticket kế toán
              </button>
            )}
          </div>
        </>
      )}

      {tab === "liquidate" && (
        <div className="form-grid fg-2" style={{ marginBottom: 10 }}>
          <div className="form-group">
            <label>SKU thanh lý</label>
            <input
              value={d.liquidation_sku}
              onChange={(e) => setD({ ...d, liquidation_sku: e.target.value })}
              placeholder="VD: 12345-TL"
            />
          </div>
          <div className="form-group">
            <label>Mã đơn nhập kho TL (nhanh)</label>
            <input
              value={d.liquidation_bill_id}
              onChange={(e) => setD({ ...d, liquidation_bill_id: e.target.value })}
              placeholder="Bill ID nhập kho thanh lý..."
            />
          </div>
        </div>
      )}

      {/* Summary */}
      <div style={{ padding: 10, background: "#fff", border: "1px solid var(--border)", borderRadius: 8, marginBottom: 10, fontSize: 13 }}>
        <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
          <span>Thiệt hại ban đầu</span>
          <span style={{ color: "var(--red)", fontWeight: 700 }}>-{formatVND(damage)}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
          <span>Thu hồi thực tế</span>
          <span style={{ color: recovered > 0 ? "var(--green)" : "var(--muted)", fontWeight: 700 }}>
            {recovered > 0 ? "+" + formatVND(recovered) : "Chưa có"}
          </span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderTop: "0.5px solid var(--border)", marginTop: 4, paddingTop: 8 }}>
          <b>Thiệt hại ròng</b>
          <b style={{ color: netLoss > 0 ? "var(--red)" : "var(--green)" }}>
            {netLoss > 0 ? "-" : ""}{formatVND(netLoss)}
          </b>
        </div>
      </div>

      <div className="row" style={{ justifyContent: "flex-end", gap: 6 }}>
        <button type="button" className="btn btn-primary btn-sm" onClick={save} disabled={pending}>
          💾 Lưu
        </button>
        {!item.damage_handled && (
          <button type="button" className="btn btn-success btn-sm" onClick={markDone} disabled={pending}>
            ✓ Đánh dấu hoàn tất
          </button>
        )}
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, color, label }: {
  active: boolean;
  onClick: () => void;
  color: string;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "6px 12px",
        fontSize: 12,
        fontWeight: 700,
        border: `1px solid ${active ? color : "var(--border)"}`,
        borderRadius: 6,
        background: active ? color : "#fff",
        color: active ? "#fff" : "var(--text)",
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}
