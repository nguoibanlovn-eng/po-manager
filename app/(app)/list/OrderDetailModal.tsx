"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { formatDate, formatVND, payClass, toNum } from "@/lib/format";
import type { Item, Order, OrderStage } from "@/lib/types";
import { createDeploymentAction } from "./actions";

const STAGE_TO_DEPT: Record<string, { dept: string; color: string }> = {
  DRAFT:     { dept: "Mua hàng",   color: "var(--subtle)" },
  ORDERED:   { dept: "Mua hàng",   color: "var(--blue)" },
  ARRIVED:   { dept: "Kỹ thuật",   color: "var(--amber)" },
  QC_DONE:   { dept: "Kỹ thuật",   color: "var(--teal)" },
  ON_SHELF:  { dept: "Kinh doanh", color: "var(--purple)" },
  SELLING:   { dept: "Kinh doanh", color: "var(--green)" },
  COMPLETED: { dept: "Xong",       color: "var(--subtle)" },
};

const STAGE_LABEL: Record<string, string> = {
  DRAFT: "Nháp", ORDERED: "Đã đặt", ARRIVED: "Hàng về",
  QC_DONE: "QC xong", ON_SHELF: "Lên kệ", SELLING: "Đang bán", COMPLETED: "Hoàn tất",
};

type DetailResponse = {
  ok: boolean;
  order?: Order;
  items?: Item[];
  has_deployments?: boolean;
  deployment_count?: number;
  error?: string;
};

export default function OrderDetailModal({
  orderId,
  onClose,
  canEdit,
}: {
  orderId: string;
  onClose: () => void;
  canEdit: boolean;
}) {
  const [data, setData] = useState<DetailResponse | null>(null);
  const [tab, setTab] = useState<"hang-ve" | "cong-no">("hang-ve");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    fetch(`/api/orders/${encodeURIComponent(orderId)}`)
      .then((r) => r.json())
      .then(setData);
  }, [orderId]);

  function createDeployment() {
    if (!confirm("Tạo phiếu triển khai cho tất cả SP trong đơn?")) return;
    startTransition(async () => {
      const r = await createDeploymentAction(orderId);
      if (!r.ok) return alert("Lỗi: " + r.error);
      if (r.existed) alert("Đơn này đã có phiếu triển khai rồi.");
      else alert(`✓ Đã tạo ${r.created} phiếu triển khai. Vào tab Triển khai bán để xem.`);
      // Refetch
      const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}`);
      setData(await res.json());
    });
  }

  if (!data) {
    return (
      <Backdrop onClose={onClose}>
        <div className="card" style={{ padding: 40, textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
          Đang tải...
        </div>
      </Backdrop>
    );
  }
  if (!data.ok || !data.order) {
    return (
      <Backdrop onClose={onClose}>
        <div className="card" style={{ padding: 24 }} onClick={(e) => e.stopPropagation()}>
          <div style={{ color: "var(--red)" }}>{data.error || "Không tải được đơn"}</div>
          <button className="btn btn-ghost btn-sm" onClick={onClose} style={{ marginTop: 12 }}>Đóng</button>
        </div>
      </Backdrop>
    );
  }

  const o = data.order;
  const items = data.items || [];
  const stage = String(o.stage || "DRAFT");
  const dept = STAGE_TO_DEPT[stage] || STAGE_TO_DEPT.DRAFT;
  const deposit = toNum(o.deposit_amount);
  const total = toNum(o.order_total);
  const remaining = total - deposit;
  const canCreateDeployment = stage === "ARRIVED" || stage === "QC_DONE" || stage === "ON_SHELF" || stage === "SELLING";

  return (
    <Backdrop onClose={onClose}>
      <div
        id="order-detail-modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff",
          borderRadius: 12,
          width: "90vw",
          maxWidth: 900,
          maxHeight: "92vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "var(--shadow-md)",
          overflow: "hidden",
        }}
      >
        {/* HEADER */}
        <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)" }}>
          <div id="od-header-row" style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 18, fontWeight: 800 }}>{o.order_name || o.order_id}</div>
              <div className="muted" style={{ fontSize: 12, marginTop: 3 }}>
                {o.order_id}
                {o.supplier_name && ` · NCC: ${o.supplier_name}`}
                {o.created_at && ` · Tạo: ${formatDate(o.created_at)}`}
              </div>
            </div>
            <div className="row" style={{ gap: 6, flexShrink: 0 }}>
              {canCreateDeployment && canEdit && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{ fontSize: 11 }}
                  onClick={createDeployment}
                  disabled={pending}
                  title="Tạo phiếu triển khai bán cho team Kinh doanh"
                >
                  🚀 Tạo phiếu TK
                </button>
              )}
              {canEdit && (
                <Link
                  href={`/create?order_id=${o.order_id}`}
                  className={`btn ${stage === "PENDING_PURCHASE" ? "btn-success" : "btn-primary"} btn-sm`}
                  style={{ textDecoration: "none" }}
                >
                  {stage === "PENDING_PURCHASE" ? "📋 Tạo đơn" : "✏ Sửa"}
                </Link>
              )}
              <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
            </div>
          </div>

          {/* Stage + Owner */}
          <div style={{ display: "flex", gap: 10, marginTop: 10, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, color: "var(--muted)" }}>Đang xử lý bởi:</span>
            <span
              className="chip"
              style={{
                background: dept.color + "20",
                color: dept.color,
                borderColor: dept.color + "40",
              }}
            >
              {dept.dept}
            </span>
            <span className={`stage-badge stage-${stage}`}>{STAGE_LABEL[stage] || stage}</span>
            {o.owner && (
              <>
                <span style={{ fontSize: 12, color: "var(--muted)" }}>· Phụ trách:</span>
                <span style={{ fontSize: 12 }}>{o.owner}</span>
              </>
            )}
            {data.has_deployments && (
              <span className="chip chip-green">🚀 {data.deployment_count} phiếu TK</span>
            )}
          </div>
        </div>

        {/* TABS */}
        <div className="mini-tabs" style={{ margin: "12px 18px 0", width: "fit-content" }}>
          <button
            className={"mini-tab" + (tab === "hang-ve" ? " active" : "")}
            onClick={() => setTab("hang-ve")}
          >
            Hàng về
          </button>
          <button
            className={"mini-tab" + (tab === "cong-no" ? " active" : "")}
            onClick={() => setTab("cong-no")}
          >
            Công nợ
          </button>
        </div>

        {/* BODY */}
        <div style={{ flex: 1, overflowY: "auto", padding: "14px 18px 18px" }}>
          {/* Stats — luôn hiện */}
          <div id="od-stats" className="stat-grid" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))", marginBottom: 14 }}>
            <div className="stat-card c-blue">
              <div className="sl">Tổng tiền</div>
              <div className="sv">{formatVND(total)}</div>
            </div>
            <div className="stat-card c-green">
              <div className="sl">Đã cọc / TT</div>
              <div className="sv" style={{ color: "var(--green)" }}>
                {deposit > 0 ? formatVND(deposit) : "—"}
              </div>
            </div>
            <div className="stat-card c-red">
              <div className="sl">Còn lại</div>
              <div className="sv" style={{ color: remaining > 0 ? "var(--red)" : "var(--green)" }}>
                {formatVND(remaining)}
              </div>
            </div>
            <div className="stat-card c-amber">
              <div className="sl">ETA hàng về</div>
              <div className="sv" style={{ fontSize: 16 }}>{formatDate(o.eta_date) || "—"}</div>
            </div>
          </div>

          {tab === "hang-ve" && (
            <>
              <div id="od-info" className="form-grid fg-4" style={{ marginBottom: 14, padding: "10px 12px", background: "#FAFAFA", borderRadius: 8 }}>
                <div>
                  <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", fontWeight: 700 }}>Ngày đặt</div>
                  <div style={{ fontSize: 13 }}>{formatDate(o.order_date) || "—"}</div>
                </div>
                <div>
                  <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", fontWeight: 700 }}>Ngày hàng về</div>
                  <div style={{ fontSize: 13 }}>{formatDate(o.arrival_date) || "—"}</div>
                </div>
                <div>
                  <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", fontWeight: 700 }}>Loại hàng</div>
                  <div style={{ fontSize: 13 }}>{o.goods_type || "—"}</div>
                </div>
                <div>
                  <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", fontWeight: 700 }}>Số SP</div>
                  <div style={{ fontSize: 13 }}>{items.length}</div>
                </div>
              </div>

              <div className="tbl-wrap">
                <table>
                  <thead><tr>
                    <th style={{ width: 140 }}>SKU</th>
                    <th>Tên SP</th>
                    <th style={{ width: 70 }} className="text-right">SL</th>
                    <th style={{ width: 110 }} className="text-right">Đơn giá</th>
                    <th style={{ width: 120 }} className="text-right">Thành tiền</th>
                    <th style={{ width: 120 }}>QC</th>
                  </tr></thead>
                  <tbody>
                    {items.map((it) => {
                      const lineTotal = toNum(it.qty) * toNum(it.unit_price);
                      const qcStatus = String(it.qc_status || "Chưa QC");
                      const qcColor = qcStatus === "Đã QC xong"
                        ? "chip-green"
                        : qcStatus === "Lỗi NCC" ? "chip-red"
                        : qcStatus === "Đang QC" ? "chip-amber" : "chip-gray";
                      return (
                        <tr key={it.line_id}>
                          <td style={{ fontFamily: "monospace", fontSize: 11 }}>{it.sku || "—"}</td>
                          <td>{it.product_name || "—"}</td>
                          <td className="text-right">{toNum(it.qty)}</td>
                          <td className="text-right muted">{formatVND(it.unit_price)}</td>
                          <td className="text-right font-bold">{formatVND(lineTotal)}</td>
                          <td><span className={`chip ${qcColor}`}>{qcStatus}</span></td>
                        </tr>
                      );
                    })}
                    {items.length === 0 && (
                      <tr><td colSpan={6} className="muted" style={{ textAlign: "center", padding: 18 }}>
                        Đơn chưa có sản phẩm.
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {tab === "cong-no" && (
            <>
              <div id="od-info" className="form-grid fg-2" style={{ marginBottom: 14, padding: "10px 12px", background: "#FAFAFA", borderRadius: 8 }}>
                <div>
                  <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", fontWeight: 700 }}>Trạng thái thanh toán</div>
                  <div style={{ fontSize: 13, marginTop: 4 }}>
                    <span className={`pay-badge ${payClass(o.pay_status)}`}>{o.pay_status || "—"}</span>
                  </div>
                </div>
                <div>
                  <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", fontWeight: 700 }}>Ngày thanh toán</div>
                  <div style={{ fontSize: 13 }}>{formatDate(o.payment_date) || "—"}</div>
                </div>
              </div>
              <div className="form-group">
                <label>Ghi chú kế toán</label>
                <div style={{ padding: 10, background: "#FAFAFA", borderRadius: 6, fontSize: 13, minHeight: 40 }}>
                  {o.finance_note || <span className="muted">(Chưa có)</span>}
                </div>
              </div>
              <div style={{ marginTop: 12 }}>
                <Link href="/finance?tab=debt" className="btn btn-ghost btn-sm" style={{ textDecoration: "none" }}>
                  → Xem trong Kế toán
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </Backdrop>
  );
}

function Backdrop({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      id="order-detail-modal"
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,.5)",
        zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20,
      }}
    >
      {children}
    </div>
  );
}
