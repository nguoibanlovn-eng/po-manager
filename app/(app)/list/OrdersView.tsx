"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { daysFromNow, formatDate, formatVND, payClass } from "@/lib/format";
import type { OrderListItem, OrderStage } from "@/lib/types";
import { deleteOrderAction } from "./actions";

const STAGE_LABEL: Record<string, string> = {
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
}: {
  orders: OrderListItem[];
  userRole: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState<string>("");
  const [pay, setPay] = useState<string>("");
  const [eta, setEta] = useState<string>("");

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
      {/* DESKTOP header */}
      <div className="page-hdr list-desktop-header">
        <div>
          <div className="page-title">📋 Danh sách đơn hàng</div>
          <div className="page-sub">{filtered.length} đơn · tổng {formatVND(total)}</div>
        </div>
        <div className="row" style={{ gap: 6, flexWrap: "nowrap", alignItems: "center" }}>
          <input
            type="text"
            placeholder="🔍 Tìm đơn, NCC..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ padding: "5px 9px", fontSize: 12, border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", width: 160 }}
          />
          <select value={stage} onChange={(e) => setStage(e.target.value)} style={{ padding: "5px 8px", fontSize: 12 }}>
            <option value="">Giai đoạn</option>
            {Object.entries(STAGE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <select value={pay} onChange={(e) => setPay(e.target.value)} style={{ padding: "5px 8px", fontSize: 12 }}>
            <option value="">Thanh toán</option>
            <option value="Chưa thanh toán">Chưa TT</option>
            <option value="Đã cọc">Đã cọc</option>
            <option value="Đã thanh toán">Đã TT</option>
            <option value="Công nợ">Công nợ</option>
          </select>
          <select value={eta} onChange={(e) => setEta(e.target.value)} style={{ padding: "5px 8px", fontSize: 12 }}>
            <option value="">Hạn ETA</option>
            <option value="overdue">⛔ Quá hạn</option>
            <option value="soon">⚠ Sắp đến hạn</option>
          </select>
          <button className="btn btn-ghost btn-sm" onClick={() => router.refresh()}>🔄</button>
          {canEdit && (
            <Link href="/create" className="btn btn-primary btn-sm" style={{ textDecoration: "none" }}>
              + Tạo đơn
            </Link>
          )}
        </div>
      </div>

      {/* MOBILE header */}
      <div className="list-mobile-header">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#6366f1", padding: "12px 14px 10px", margin: "-10px -10px 12px" }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#fff" }}>📋 Đơn hàng</div>
          <button
            onClick={() => router.refresh()}
            style={{ background: "rgba(255,255,255,.2)", border: "none", borderRadius: 8, padding: "6px 10px", color: "#fff", fontSize: 18, cursor: "pointer" }}
          >⚙</button>
        </div>
        <div style={{ position: "relative", marginBottom: 10 }}>
          <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 16, color: "#94A3B8" }}>🔍</span>
          <input
            type="text"
            placeholder="Tìm đơn, NCC, sản phẩm..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: "100%", padding: "13px 14px 13px 42px", fontSize: 17, border: "0.5px solid var(--border)", borderRadius: 12, background: "var(--bg)", boxSizing: "border-box" }}
          />
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 4 }}>
          {[["", "Tất cả"], ["ORDERED", "Đã đặt"], ["ARRIVED", "Hàng về"], ["ON_SHELF", "Lên kệ"], ["SELLING", "Đang bán"], ["DRAFT", "Nháp"]].map(([k, v]) => (
            <button
              key={k}
              onClick={() => setStage(k)}
              style={{
                padding: "8px 14px",
                borderRadius: 20,
                fontSize: 14,
                fontWeight: 600,
                border: stage === k ? "none" : "0.5px solid var(--border)",
                background: stage === k ? "#6366f1" : "var(--bg)",
                color: stage === k ? "#fff" : "var(--text)",
                cursor: "pointer",
              }}
            >{v}</button>
          ))}
        </div>
      </div>

      <div className="card">
        {/* Desktop table */}
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>Mã đơn</th>
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
                <tr><td colSpan={9} className="muted" style={{ padding: 24, textAlign: "center" }}>
                  {orders.length === 0 ? "Chưa có đơn." : "Không có đơn khớp bộ lọc."}
                </td></tr>
              ) : (
                filtered.map((o) => <OrderRow key={o.order_id} o={o} canEdit={canEdit} onDelete={onDelete} />)
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="orders-mobile-cards">
          {filtered.length === 0 ? (
            <div className="muted" style={{ padding: 24, textAlign: "center" }}>Không có đơn.</div>
          ) : (
            filtered.map((o) => <OrderCard key={o.order_id} o={o} canEdit={canEdit} onDelete={onDelete} />)
          )}
        </div>

        <div style={{ padding: "10px 12px", fontSize: 13, fontWeight: 700, borderTop: "1px solid var(--border)", textAlign: "right" }}>
          Tổng: {formatVND(total)} · {filtered.length} đơn
        </div>
      </div>

      {pending && <div style={{ position: "fixed", bottom: 20, right: 20, background: "#fff", padding: "8px 16px", borderRadius: 8, boxShadow: "var(--shadow-md)", fontSize: 13 }}>Đang xử lý...</div>}
    </section>
  );
}

function OrderRow({
  o, canEdit, onDelete,
}: {
  o: OrderListItem;
  canEdit: boolean;
  onDelete: (id: string, name: string) => void;
}) {
  const days = daysFromNow(o.eta_date);
  const etaClass = days !== null && days < 0 ? "chip-red" : days !== null && days <= 3 ? "chip-amber" : "muted";
  return (
    <tr>
      <td style={{ fontWeight: 700, fontSize: 12 }}>
        <Link href={`/create?order_id=${o.order_id}`} style={{ color: "var(--blue)", textDecoration: "none" }}>
          {o.order_id}
        </Link>
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
            onClick={() => onDelete(o.order_id, o.order_name || "")}
            title="Xoá đơn"
            style={{ color: "var(--red)" }}
          >🗑</button>
        )}
      </td>
    </tr>
  );
}

function OrderCard({
  o, canEdit, onDelete,
}: {
  o: OrderListItem;
  canEdit: boolean;
  onDelete: (id: string, name: string) => void;
}) {
  const days = daysFromNow(o.eta_date);
  return (
    <div className="card" style={{ marginBottom: 10, padding: 12 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Link href={`/create?order_id=${o.order_id}`} style={{ color: "var(--blue)", fontWeight: 700, fontSize: 13, textDecoration: "none" }}>
            {o.order_id}
          </Link>
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
        <div style={{ marginTop: 8, display: "flex", gap: 6 }}>
          <Link href={`/create?order_id=${o.order_id}`} className="btn btn-ghost btn-sm" style={{ flex: 1, textAlign: "center", textDecoration: "none" }}>Sửa</Link>
          <button className="btn btn-danger btn-sm" onClick={() => onDelete(o.order_id, o.order_name || "")}>🗑</button>
        </div>
      )}
    </div>
  );
}
