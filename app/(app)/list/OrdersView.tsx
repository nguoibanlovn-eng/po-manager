"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { daysFromNow, formatDate, formatVND, payClass } from "@/lib/format";
import type { OrderListItem } from "@/lib/types";
import type { SupplierRef } from "@/lib/db/suppliers";
import type { UserRef } from "@/lib/db/users";
import { deleteOrderAction } from "./actions";
import OrderDetailModal from "./OrderDetailModal";
import OrderForm from "../create/OrderForm";

const STAGE_LABEL: Record<string, string> = {
  PENDING_PURCHASE: "Chờ MH",
  DRAFT: "Nháp",
  ORDERED: "Đã đặt",
  ARRIVED: "Hàng về",
  QC_DONE: "QC xong",
  ON_SHELF: "Lên kệ",
  SELLING: "Đang bán",
  COMPLETED: "Hoàn tất",
};

export default function OrdersView({
  orders,
  userRole,
  user,
  suppliers,
  users,
}: {
  orders: OrderListItem[];
  userRole: string;
  user: { email: string; name: string; role: string } | null;
  suppliers: SupplierRef[];
  users: UserRef[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState<string>("PENDING_PURCHASE");
  const [pay, setPay] = useState<string>("");
  const [eta, setEta] = useState<string>("");
  const [detailOrderId, setDetailOrderId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const canEdit = userRole === "ADMIN" || userRole.startsWith("LEADER_") || userRole === "NV_MH";

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter((o) => {
      if (stage && o.stage !== stage) return false;
      if (pay && !String(o.pay_status || "").includes(pay)) return false;
      if (eta) {
        const d = daysFromNow(o.eta_date);
        if (eta === "overdue" && (d === null || d >= 0)) return false;
        if (eta === "soon" && (d === null || d < 0 || d > 3)) return false;
      }
      if (q) {
        const hay = [
          o.order_id, o.order_name, o.supplier_name, o.owner, o.item_names,
        ]
          .map((s) => String(s || "").toLowerCase())
          .join(" ");
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [orders, search, stage, pay, eta]);

  const total = filtered.reduce((s, o) => s + Number(o.order_total || 0), 0);

  // Dashboard stats
  const stats = useMemo(() => {
    const now = new Date();
    const mKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const thisMonth = orders.filter((o) => (o.created_at || "").startsWith(mKey));
    const spent = thisMonth.reduce((s, o) => s + Number(o.order_total || 0), 0);
    const budget = 800_000_000; // TODO: from config
    const pendingCount = orders.filter((o) => o.stage === "PENDING_PURCHASE").length;
    const pendingOverdue = orders.filter((o) => o.stage === "PENDING_PURCHASE" && o.deadline && o.deadline < mKey.substring(0, 10)).length;
    const inTransit = orders.filter((o) => o.stage === "ORDERED").length;
    const inTransitSoon = orders.filter((o) => o.stage === "ORDERED" && daysFromNow(o.eta_date) !== null && daysFromNow(o.eta_date)! <= 3).length;
    const debt = orders.filter((o) => o.pay_status === "Công nợ").reduce((s, o) => s + Number(o.order_total || 0), 0);
    const debtNcc = new Set(orders.filter((o) => o.pay_status === "Công nợ" && o.supplier_name).map((o) => o.supplier_name)).size;
    return { budget, spent, remaining: budget - spent, pendingCount, pendingOverdue, inTransit, inTransitSoon, debt, debtNcc };
  }, [orders]);

  // Tab counts
  const tabCounts = useMemo(() => ({
    PENDING_PURCHASE: orders.filter((o) => o.stage === "PENDING_PURCHASE").length,
    all: orders.length,
    ORDERED: orders.filter((o) => o.stage === "ORDERED").length,
    ARRIVED: orders.filter((o) => o.stage === "ARRIVED").length,
    ON_SHELF: orders.filter((o) => o.stage === "ON_SHELF").length,
    COMPLETED: orders.filter((o) => o.stage === "COMPLETED").length,
  }), [orders]);

  function onDelete(orderId: string, orderName: string) {
    if (!confirm(`Xoá đơn "${orderName || orderId}"?`)) return;
    startTransition(async () => {
      const r = await deleteOrderAction(orderId);
      if (!r.ok) alert(r.error || "Lỗi xoá đơn");
      else router.refresh();
    });
  }

  return (
    <section className="section">
      {/* Header */}
      <div className="page-hdr">
        <div>
          <div className="page-title">Đơn hàng</div>
          <div className="page-sub">{orders.length} đơn · tổng {formatVND(orders.reduce((s, o) => s + Number(o.order_total || 0), 0))}</div>
        </div>
        <div className="row" style={{ gap: 6 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => router.refresh()}>🔄</button>
          {canEdit && (
            <button className="btn btn-primary btn-sm" onClick={() => setShowCreateModal(true)}>+ Tạo đơn</button>
          )}
        </div>
      </div>

      {/* Dashboard strip */}
      <div className="stat-grid" style={{ gridTemplateColumns: "repeat(6, 1fr)", marginBottom: 12 }}>
        <div className="stat-card c-blue"><div className="sl">Ngân sách tháng</div><div className="sv" style={{ color: "var(--blue)" }}>{formatVND(stats.budget)}</div><div className="ss">Tháng {new Date().getMonth() + 1}/{new Date().getFullYear()}</div></div>
        <div className="stat-card c-green"><div className="sl">Đã nhập</div><div className="sv" style={{ color: "var(--green)" }}>{formatVND(stats.spent)}</div><div className="ss">{stats.budget > 0 ? Math.round(stats.spent / stats.budget * 100) : 0}% ngân sách</div></div>
        <div className="stat-card c-amber"><div className="sl">Quota còn lại</div><div className="sv" style={{ color: "var(--amber)" }}>{formatVND(Math.max(0, stats.remaining))}</div><div className="ss">{stats.budget > 0 ? Math.round(Math.max(0, stats.remaining) / stats.budget * 100) : 0}% còn</div></div>
        <div className="stat-card c-red"><div className="sl">Chờ xử lý</div><div className="sv" style={{ color: "var(--red)" }}>{stats.pendingCount}</div><div className="ss">{stats.pendingOverdue > 0 ? `${stats.pendingOverdue} quá hạn` : "Không quá hạn"}</div></div>
        <div className="stat-card c-teal"><div className="sl">Đang vận chuyển</div><div className="sv" style={{ color: "#0D9488" }}>{stats.inTransit}</div><div className="ss">{stats.inTransitSoon > 0 ? `${stats.inTransitSoon} sắp về` : "—"}</div></div>
        <div className="stat-card c-purple"><div className="sl">Công nợ NCC</div><div className="sv" style={{ color: "#7C3AED" }}>{formatVND(stats.debt)}</div><div className="ss">{stats.debtNcc} NCC</div></div>
      </div>

      {/* Tabs */}
      <div className="mini-tabs" style={{ marginBottom: 12 }}>
        {[
          { key: "PENDING_PURCHASE", label: "Chờ xử lý", count: tabCounts.PENDING_PURCHASE, urgent: true },
          { key: "", label: "Tất cả", count: tabCounts.all },
          { key: "ORDERED", label: "Đã đặt", count: tabCounts.ORDERED },
          { key: "ARRIVED", label: "Hàng về", count: tabCounts.ARRIVED },
          { key: "ON_SHELF", label: "Lên kệ", count: tabCounts.ON_SHELF },
          { key: "COMPLETED", label: "Hoàn tất", count: tabCounts.COMPLETED },
        ].map((tab) => (
          <button key={tab.key} className={`mini-tab${stage === tab.key ? " active" : ""}`} onClick={() => setStage(tab.key)}>
            {tab.label} <span className="cnt" style={tab.urgent && tab.count > 0 ? { background: "#DC2626", color: "#fff" } : undefined}>{tab.count}</span>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
        <select value={pay} onChange={(e) => setPay(e.target.value)} style={{ padding: "5px 8px", fontSize: 12 }}>
          <option value="">Thanh toán</option>
          <option value="Chưa thanh toán">Chưa TT</option>
          <option value="Đã cọc">Đã cọc</option>
          <option value="Đã thanh toán">Đã TT</option>
          <option value="Công nợ">Công nợ</option>
        </select>
        <select value={eta} onChange={(e) => setEta(e.target.value)} style={{ padding: "5px 8px", fontSize: 12 }}>
          <option value="">Hạn ETA</option>
          <option value="overdue">Quá hạn</option>
          <option value="soon">Sắp đến hạn</option>
        </select>
        <input type="text" placeholder="Tìm đơn, NCC, SP..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ padding: "5px 9px", fontSize: 12, border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", flex: 1, minWidth: 140 }} />
      </div>

      {/* Pending task cards */}
      {stage === "PENDING_PURCHASE" && filtered.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          {filtered.map((o) => {
            const dl = daysFromNow(o.deadline);
            const urgency = dl !== null && dl < 0 ? "overdue" : dl !== null && dl <= 3 ? "soon" : "ok";
            const assignee = users.find((u) => u.email === o.assigned_to);
            return (
              <div key={o.order_id} onClick={() => setDetailOrderId(o.order_id)} style={{ background: urgency === "overdue" ? "var(--red-lt)" : urgency === "soon" ? "var(--amber-lt)" : "#fff", border: `1px solid ${urgency === "overdue" ? "#FECACA" : urgency === "soon" ? "#FCD34D" : "var(--border)"}`, borderLeft: `4px solid ${urgency === "overdue" ? "var(--red)" : urgency === "soon" ? "var(--amber)" : "var(--blue)"}`, borderRadius: 12, padding: 14, marginBottom: 8, cursor: "pointer" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span style={{ fontWeight: 800, fontSize: 14 }}>{o.order_name || o.order_id}</span>
                  <span style={{ padding: "1px 6px", borderRadius: 4, fontSize: 9, fontWeight: 800, background: "#DBEAFE", color: "#1E40AF", textTransform: "uppercase" }}>Order KD</span>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", fontSize: 11, color: "var(--muted)" }}>
                  {o.supplier_name && <span>NCC: <strong style={{ color: "var(--text)" }}>{o.supplier_name}</strong></span>}
                  <span>Giá trị: <strong style={{ color: "var(--text)" }}>{formatVND(o.order_total)}</strong></span>
                  {assignee && <span>Phân cho: <strong style={{ color: "#4F46E5" }}>{assignee.name || assignee.email}</strong></span>}
                  <span style={{ fontWeight: 700, color: urgency === "overdue" ? "var(--red)" : urgency === "soon" ? "var(--amber)" : "var(--muted)" }}>
                    DL: {formatDate(o.deadline) || "—"}{dl !== null && (dl < 0 ? ` · Quá ${-dl}d!` : ` · Còn ${dl}d`)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="card">
        {/* Desktop table */}
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>Mã đơn</th>
                <th>Nguồn</th>
                <th style={{ minWidth: 160 }}>Tên đơn</th>
                <th>NCC</th>
                <th>Ngày đặt</th>
                <th>ETA</th>
                <th>Giai đoạn</th>
                <th className="text-right">Tổng tiền</th>
                <th>Thanh toán</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={10} className="muted" style={{ padding: 24, textAlign: "center" }}>
                  {orders.length === 0 ? "Chưa có đơn." : "Không có đơn khớp bộ lọc."}
                </td></tr>
              ) : (
                filtered.map((o) => (
                  <OrderRow
                    key={o.order_id}
                    o={o}
                    canEdit={canEdit}
                    onDelete={onDelete}
                    onOpen={() => setDetailOrderId(o.order_id)}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="orders-mobile-cards">
          {filtered.length === 0 ? (
            <div className="muted" style={{ padding: 24, textAlign: "center" }}>Không có đơn.</div>
          ) : (
            filtered.map((o) => (
              <OrderCard
                key={o.order_id}
                o={o}
                canEdit={canEdit}
                onDelete={onDelete}
                onOpen={() => setDetailOrderId(o.order_id)}
              />
            ))
          )}
        </div>

        <div style={{ padding: "10px 12px", fontSize: 13, fontWeight: 700, borderTop: "1px solid var(--border)", textAlign: "right" }}>
          Tổng: {formatVND(total)} · {filtered.length} đơn
        </div>
      </div>

      {pending && <div style={{ position: "fixed", bottom: 20, right: 20, background: "#fff", padding: "8px 16px", borderRadius: 8, boxShadow: "var(--shadow-md)", fontSize: 13 }}>Đang xử lý...</div>}

      {detailOrderId && (
        <OrderDetailModal
          orderId={detailOrderId}
          onClose={() => setDetailOrderId(null)}
          canEdit={canEdit}
        />
      )}

      {showCreateModal && (
        <div
          onClick={() => setShowCreateModal(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 9999, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "20px 10px", overflowY: "auto" }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 960, background: "#fff", borderRadius: 16, overflow: "hidden", boxShadow: "0 25px 50px rgba(0,0,0,.25)", maxHeight: "95vh", overflowY: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid var(--border)", background: "#FAFAFA", position: "sticky", top: 0, zIndex: 1 }}>
              <div style={{ fontWeight: 800, fontSize: 15 }}>Tạo đơn mới</div>
              <button onClick={() => setShowCreateModal(false)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "var(--muted)", padding: "4px 8px" }}>✕</button>
            </div>
            <div style={{ padding: 0 }}>
              <OrderForm user={user} order={null} items={[]} suppliers={suppliers} users={users} isModal onClose={() => setShowCreateModal(false)} />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function OrderRow({
  o, canEdit, onDelete, onOpen,
}: {
  o: OrderListItem;
  canEdit: boolean;
  onDelete: (id: string, name: string) => void;
  onOpen: () => void;
}) {
  const days = daysFromNow(o.eta_date);
  const etaClass = days !== null && days < 0 ? "chip-red" : days !== null && days <= 3 ? "chip-amber" : "muted";
  return (
    <tr style={{ cursor: "pointer" }} onClick={onOpen}>
      <td style={{ fontWeight: 700, fontSize: 12 }}>
        <span style={{ color: "var(--blue)" }}>{o.order_id}</span>
      </td>
      <td>
        {o.source === "biz_order" ? <span style={{ padding: "1px 5px", borderRadius: 4, fontSize: 9, fontWeight: 800, background: "#DBEAFE", color: "#1E40AF" }}>KD</span>
         : o.source === "nhanh" ? <span style={{ padding: "1px 5px", borderRadius: 4, fontSize: 9, fontWeight: 800, background: "#FEF3C7", color: "#92400E" }}>Nhanh</span>
         : <span style={{ padding: "1px 5px", borderRadius: 4, fontSize: 9, fontWeight: 800, background: "#E0E7FF", color: "#4338CA" }}>MH</span>}
      </td>
      <td>
        <div style={{ fontWeight: 600 }}>{o.order_name || "—"}</div>
        {o.has_damage && (
          <span className={`chip ${o.damage_pending ? "chip-red" : "chip-amber"}`} style={{ fontSize: 10, marginTop: 2 }}>
            {o.damage_pending ? "⚠ Có hàng hỏng" : "Đã xử lý hỏng"}
          </span>
        )}
      </td>
      <td>{o.supplier_name || "—"}</td>
      <td className="muted" style={{ fontSize: 12 }}>{formatDate(o.order_date || o.created_at)}</td>
      <td className={etaClass} style={{ fontSize: 12 }}>
        {formatDate(o.eta_date) || "—"}
        {days !== null && <div style={{ fontSize: 10 }}>{days < 0 ? `Quá ${-days}d` : `Còn ${days}d`}</div>}
      </td>
      <td>
        <span className={`stage-badge stage-${o.stage}`}>{STAGE_LABEL[String(o.stage || "DRAFT")] || o.stage}</span>
      </td>
      <td className="text-right font-bold">{formatVND(o.order_total)}</td>
      <td><span className={`pay-badge ${payClass(o.pay_status)}`}>{o.pay_status || "—"}</span></td>
      <td>
        {canEdit && (
          <button
            className="btn btn-ghost btn-xs"
            onClick={(e) => { e.stopPropagation(); onDelete(o.order_id, o.order_name || ""); }}
            title="Xoá đơn"
            style={{ color: "var(--red)" }}
          >🗑</button>
        )}
      </td>
    </tr>
  );
}

function OrderCard({
  o, canEdit, onDelete, onOpen,
}: {
  o: OrderListItem;
  canEdit: boolean;
  onDelete: (id: string, name: string) => void;
  onOpen: () => void;
}) {
  const days = daysFromNow(o.eta_date);
  return (
    <div className="card" style={{ marginBottom: 10, padding: 12, cursor: "pointer" }} onClick={onOpen}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ color: "var(--blue)", fontWeight: 700, fontSize: 13 }}>{o.order_id}</span>
          <div style={{ fontWeight: 600, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {o.order_name || "—"}
          </div>
          <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{o.supplier_name || "—"}</div>
        </div>
        <span className={`stage-badge stage-${o.stage}`} style={{ flexShrink: 0 }}>{STAGE_LABEL[String(o.stage || "DRAFT")]}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10, gap: 8 }}>
        <div style={{ fontWeight: 800 }}>{formatVND(o.order_total)}</div>
        <span className={`pay-badge ${payClass(o.pay_status)}`}>{o.pay_status || "—"}</span>
      </div>
      <div className="muted" style={{ fontSize: 11, marginTop: 6, display: "flex", gap: 10 }}>
        <span>Đặt: {formatDate(o.order_date || o.created_at)}</span>
        <span>ETA: {formatDate(o.eta_date) || "—"}{days !== null && (days < 0 ? ` (quá ${-days}d)` : ` (còn ${days}d)`)}</span>
      </div>
      {o.has_damage && (
        <div className={`bar-${o.damage_pending ? "red" : "amber"}`}>
          {o.damage_pending ? "⚠ Có hàng hỏng chưa xử lý" : "Đã xử lý hàng hỏng"}
        </div>
      )}
      {canEdit && (
        <div style={{ marginTop: 8, display: "flex", gap: 6 }} onClick={(e) => e.stopPropagation()}>
          <a href={`/create?order_id=${o.order_id}`} className="btn btn-ghost btn-sm" style={{ flex: 1, textAlign: "center", textDecoration: "none" }}>Sửa</a>
          <button className="btn btn-danger btn-sm" onClick={() => onDelete(o.order_id, o.order_name || "")}>🗑</button>
        </div>
      )}
    </div>
  );
}
