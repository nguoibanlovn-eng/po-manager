"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { formatDate, formatVND, formatYmd, toNum } from "@/lib/format";
import type { DamageItem } from "@/lib/db/finance";
import { assignDamageAction, sendTicketAction, updateDamageAction } from "./actions";

type ResolutionTab = "replace" | "refund" | "liquidate";
type UserRef = { email: string; name: string; team: string };

export default function DamageMgmtView({
  items,
  tab,
  orderMeta,
  users = [],
}: {
  items: DamageItem[];
  tab: "pending" | "done";
  orderMeta: Record<string, { arrival_date: string | null; order_date: string | null }>;
  users?: UserRef[];
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

  const totalDamage = items.reduce((s, it) => s + toNum(it.damage_amount), 0);
  const totalRecovered = items.reduce((s, it) => s + toNum(it.resolved_amount), 0);
  const pendingCount = items.filter((it) => !it.damage_handled).length;
  const doneCount = items.filter((it) => it.damage_handled).length;

  return (
    <section className="section">
      <div className="page-hdr">
        <div>
          <div className="page-title">Xử lý hàng hỏng</div>
          <div className="page-sub">Các SP lỗi do TECH ghi nhận — liên hệ NCC đổi/hoàn tiền</div>
        </div>
      </div>

      {/* Stat strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden", marginBottom: 12 }}>
        {[
          { label: "Cần xử lý", value: String(pendingCount), sub: "SP lỗi chưa xong", color: "var(--red)" },
          { label: "Đã xử lý", value: String(doneCount), sub: "Đổi/hoàn tiền xong", color: "var(--green)" },
          { label: "Tổng thiệt hại", value: formatVND(totalDamage), sub: "Chưa thu hồi", color: "#D97706" },
          { label: "Đã thu hồi", value: formatVND(totalRecovered), sub: "Từ NCC đổi/hoàn", color: "var(--blue)" },
        ].map((c, i) => (
          <div key={i} style={{ padding: "12px 14px", borderRight: i < 3 ? "1px solid var(--border)" : undefined }}>
            <div style={{ fontSize: 9, fontWeight: 800, color: c.color, textTransform: "uppercase", letterSpacing: ".4px", marginBottom: 4 }}>{c.label}</div>
            <div style={{ fontSize: 18, fontWeight: 900, color: c.color }}>{c.value}</div>
            <div style={{ fontSize: 9, color: "var(--subtle)" }}>{c.sub}</div>
          </div>
        ))}
      </div>

      {/* Tabs — pill style */}
      <div style={{ display: "flex", gap: 4, marginBottom: 14 }}>
        {[
          { key: "pending", label: "Cần xử lý", count: pendingCount },
          { key: "done", label: "Đã xử lý", count: doneCount },
        ].map((t) => (
          <Link key={t.key} href={`/damage-mgmt?tab=${t.key}`} style={{
            padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, textDecoration: "none",
            border: tab === t.key ? "1px solid #18181B" : "1px solid var(--border)",
            background: tab === t.key ? "#18181B" : "#fff",
            color: tab === t.key ? "#fff" : "#64748B",
            display: "flex", alignItems: "center", gap: 5,
          }}>
            {t.label}
            <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 10, background: tab === t.key ? "rgba(255,255,255,.2)" : "#F1F5F9", color: tab === t.key ? "#fff" : "#64748B" }}>{t.count}</span>
          </Link>
        ))}
      </div>

      {groups.length === 0 ? (
        <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 12, padding: 32, textAlign: "center", color: "#94A3B8" }}>
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
              users={users}
              isDone={tab === "done"}
            />
          );
        })
      )}
    </section>
  );
}

function OrderGroup({
  orderId, supplier, items, total, arrivalDate, users, isDone,
}: {
  orderId: string;
  supplier: string;
  items: DamageItem[];
  total: number;
  arrivalDate: string | null;
  users: UserRef[];
  isDone?: boolean;
}) {
  const [open, setOpen] = useState(!isDone);
  const doneCount = items.filter((it) => it.damage_handled).length;
  const allDone = doneCount === items.length;
  const borderColor = allDone ? "#BBF7D0" : "#FECACA";
  const headerBg = allDone ? "#F0FDF4" : "#FEF2F2";

  return (
    <div style={{ background: "#fff", border: `1px solid ${borderColor}`, borderRadius: 12, overflow: "hidden", marginBottom: 12 }}>
      {/* Header */}
      <div onClick={() => setOpen((v) => !v)} style={{ padding: "12px 16px", background: headerBg, borderBottom: open ? `1px solid ${borderColor}` : "none", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: allDone ? "#16A34A" : "#18181B" }}>
            Lô hàng về {formatDate(arrivalDate) || "—"}{allDone ? " ✓" : ""}
          </div>
          <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 2 }}>
            <Link href={`/create?order_id=${orderId}`} style={{ color: "#3B82F6", textDecoration: "none", fontWeight: 600 }} onClick={(e) => e.stopPropagation()}>{orderId}</Link> · {items.length} SP lỗi · NCC: {supplier}
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexShrink: 0 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: allDone ? "#16A34A" : "#DC2626" }}>{doneCount}/{items.length} xong</span>
          <span style={{ fontSize: 13, fontWeight: 800, color: "#DC2626" }}>{formatVND(total)}</span>
          <span className="chip chip-gray" style={{ fontSize: 10 }}>NCC: {supplier}</span>
        </div>
      </div>

      {/* Items */}
      {open && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 80px", padding: "8px 16px", fontSize: 9, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", background: "#F8FAFC", borderBottom: "1px solid #E2E8F0" }}>
            <div>Sản phẩm</div><div>Số lượng</div><div>Thiệt hại</div><div>Trạng thái</div><div></div>
          </div>
          {items.map((it) => (
            <ItemAccordion key={`${it.order_id}-${it.line_id}`} item={it} users={users} />
          ))}
        </>
      )}
    </div>
  );
}

function ItemAccordion({ item, users }: { item: DamageItem; users: UserRef[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderBottom: "1px solid #F1F5F9" }}>
      <div onClick={() => setOpen((v) => !v)} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 80px", padding: "10px 16px", cursor: "pointer", alignItems: "center", fontSize: 12 }}>
        <div>
          <div style={{ fontWeight: 600 }}>{item.product_name}</div>
          <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 1 }}>{item.sku || ""}</div>
        </div>
        <div style={{ fontWeight: 700, color: "#DC2626" }}>{toNum(item.damage_qty)} cái</div>
        <div style={{ fontWeight: 700 }}>{formatVND(item.damage_amount)}</div>
        <div>
          <span className={`chip ${item.damage_handled ? "chip-green" : "chip-red"}`} style={{ fontSize: 10 }}>
            {item.damage_handled ? "Xong" : "Chưa xử lý"}
          </span>
        </div>
        <div style={{ textAlign: "right" }}>
          <button type="button" style={{ padding: "4px 10px", borderRadius: 6, fontSize: 10, fontWeight: 600, border: "1px solid #E2E8F0", background: "#fff", color: "#64748B", cursor: "pointer" }}>
            {open ? "Thu gọn" : item.damage_handled ? "Xem" : "Xử lý"}
          </button>
        </div>
      </div>
      {open && (
        <div>
          <AssignBar item={item} users={users} />
          <ResolutionForm item={item} />
        </div>
      )}
    </div>
  );
}

function AssignBar({ item, users }: { item: DamageItem; users: UserRef[] }) {
  const [assignee, setAssignee] = useState("");
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function assign() {
    if (!assignee) return;
    const user = users.find((u) => u.email === assignee);
    if (!user) return;
    startTransition(async () => {
      const r = await assignDamageAction(item.order_id, item.line_id, item.product_name || "", user.email, user.name);
      if (r.ok) setMsg(`Đã giao cho ${user.name}`);
      else setMsg(r.error || "Lỗi");
    });
  }

  return (
    <div style={{ padding: "8px 18px", background: "#EFF6FF", borderBottom: "1px solid #BFDBFE", display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
      <span style={{ fontWeight: 600, color: "#2563EB", whiteSpace: "nowrap" }}>Giao việc:</span>
      <select value={assignee} onChange={(e) => setAssignee(e.target.value)} style={{ flex: 1, fontSize: 12, padding: "4px 8px", borderRadius: 4, border: "1px solid #93C5FD" }}>
        <option value="">— Chọn nhân viên —</option>
        {users.map((u) => (
          <option key={u.email} value={u.email}>{u.name}{u.team ? ` (${u.team})` : ""}</option>
        ))}
      </select>
      <button type="button" className="btn btn-primary btn-xs" onClick={assign} disabled={pending || !assignee} style={{ whiteSpace: "nowrap" }}>
        Giao
      </button>
      {msg && <span style={{ fontSize: 11, color: msg.startsWith("Đã") ? "#16A34A" : "#DC2626" }}>{msg}</span>}
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
