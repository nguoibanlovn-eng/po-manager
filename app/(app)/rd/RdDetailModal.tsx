"use client";

import { useState, useTransition } from "react";
import { formatDate } from "@/lib/format";
import { getPipeline, type RdItem } from "@/lib/db/rd-types";
import {
  completeStepAction, saveStepDataAction, updateChecklistAction,
} from "./actions";

// Định nghĩa fields hiển thị cho từng bước (research + production)
const STEP_FIELDS: Record<string, Array<{ key: string; label: string; type?: "text" | "textarea" | "url" | "number" }>> = {
  // Research pipeline
  nghien_cuu: [
    { key: "brief",         label: "Brief / Mô tả sản phẩm", type: "textarea" },
    { key: "competitor_urls", label: "Link đối thủ / SP cùng loại" },
    { key: "market_price_low",  label: "Giá thị trường thấp nhất", type: "number" },
    { key: "market_price_high", label: "Giá thị trường cao nhất", type: "number" },
  ],
  duyet_de_xuat: [
    { key: "approve_verdict", label: "Duyệt / Từ chối" },
    { key: "approve_note",    label: "Ghi chú leader", type: "textarea" },
  ],
  dat_mau: [
    { key: "sample_supplier",     label: "NCC đặt mẫu" },
    { key: "sample_contact",      label: "Liên hệ NCC" },
    { key: "sample_qty",          label: "Số lượng mẫu", type: "number" },
    { key: "sample_price_usd",    label: "Giá mẫu (USD)", type: "number" },
    { key: "sample_order_link",   label: "Link đơn mẫu", type: "url" },
    { key: "sample_eta",          label: "Dự kiến về" },
  ],
  kiem_tra: [
    { key: "check_result",    label: "Kết quả kiểm tra", type: "textarea" },
    { key: "check_photos",    label: "Link ảnh kiểm tra" },
  ],
  nhap: [
    { key: "import_decision", label: "Quyết định nhập", type: "textarea" },
    { key: "bulk_qty",        label: "Số lượng nhập", type: "number" },
    { key: "bulk_price",      label: "Giá nhập (đ)", type: "number" },
  ],
  ket_qua: [
    { key: "linked_bulk_po",  label: "Mã PO liên kết" },
    { key: "lesson_note",     label: "Ghi chú rút kinh nghiệm", type: "textarea" },
  ],
  // Production pipeline
  tao_ticket: [
    { key: "base_sku",        label: "SP gốc (SKU)" },
    { key: "base_product",    label: "Tên SP gốc" },
    { key: "improvement_type", label: "Loại cải tiến" },
  ],
  duyet_b1: [
    { key: "b1_verdict",      label: "Duyệt / Từ chối" },
    { key: "b1_note",         label: "Ghi chú", type: "textarea" },
  ],
  giao_tk: [
    { key: "assigned_to",     label: "Giao cho ai" },
    { key: "brief_tk",        label: "Brief TK", type: "textarea" },
  ],
  thiet_ke: [
    { key: "design_desc",     label: "Mô tả thiết kế", type: "textarea" },
    { key: "mfg_file_links",  label: "File thiết kế" },
  ],
  duyet_2a: [
    { key: "a2_verdict",      label: "Duyệt / Từ chối" },
    { key: "a2_note",         label: "Ghi chú", type: "textarea" },
  ],
  ncc_tracking: [
    { key: "mfg_supplier",    label: "NCC gia công" },
    { key: "mfg_contact",     label: "Liên hệ NCC" },
    { key: "mfg_moq",         label: "MOQ", type: "number" },
    { key: "mfg_lead_time",   label: "Lead time (ngày)" },
    { key: "mfg_price_unit",  label: "Giá gia công (đ)", type: "number" },
    { key: "mfg_setup_fee",   label: "Phí khuôn (đ)", type: "number" },
  ],
  cho_mau_ve: [
    { key: "sample_eta",      label: "Dự kiến mẫu về" },
    { key: "sample_tracking", label: "Mã tracking" },
  ],
  duyet_mau: [
    { key: "mau_verdict",     label: "Duyệt / Từ chối" },
    { key: "mau_note",        label: "Ghi chú", type: "textarea" },
  ],
  dat_hang: [
    { key: "bulk_qty",        label: "Số lượng đặt", type: "number" },
    { key: "bulk_price",      label: "Giá (đ)", type: "number" },
    { key: "target_launch_date", label: "Ngày launch dự kiến" },
    { key: "linked_bulk_po",  label: "Mã PO" },
  ],
};

export default function RdDetailModal({
  item,
  onClose,
  onRefresh,
}: {
  item: RdItem;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const pipeline = getPipeline(item.rd_type);

  // current step: nếu chưa set, dùng bước đầu tiên chưa hoàn thành
  const completedMap = item.step_completed_at || {};
  const firstIncomplete = pipeline.find((s) => !completedMap[s.key]);
  const [activeStep, setActiveStep] = useState<string>(
    item.current_step || firstIncomplete?.key || pipeline[0].key,
  );

  const stepFields = STEP_FIELDS[activeStep] || [];
  const existingStepData = (item.step_data?.[activeStep] as Record<string, unknown>) || {};
  const [formData, setFormData] = useState<Record<string, string>>(() => {
    const d: Record<string, string> = {};
    for (const f of stepFields) d[f.key] = String(existingStepData[f.key] || "");
    return d;
  });
  const [dirty, setDirty] = useState(false);

  // Checklist
  const existingChecklist = (item.checklists?.[activeStep] as Array<{ label: string; checked: boolean; note?: string }>) || [];
  const [checklist, setChecklist] = useState(existingChecklist);
  const [newCheckLabel, setNewCheckLabel] = useState("");

  function switchStep(stepKey: string) {
    if (dirty && !confirm("Bạn có thay đổi chưa lưu. Vẫn chuyển bước?")) return;
    const data = (item.step_data?.[stepKey] as Record<string, unknown>) || {};
    const fields = STEP_FIELDS[stepKey] || [];
    const d: Record<string, string> = {};
    for (const f of fields) d[f.key] = String(data[f.key] || "");
    setFormData(d);
    setChecklist((item.checklists?.[stepKey] as typeof existingChecklist) || []);
    setActiveStep(stepKey);
    setDirty(false);
  }

  function save() {
    startTransition(async () => {
      await saveStepDataAction(item.id, activeStep, formData);
      await updateChecklistAction(item.id, activeStep, checklist);
      setDirty(false);
      onRefresh();
    });
  }

  function markComplete() {
    const curIdx = pipeline.findIndex((s) => s.key === activeStep);
    const nextStep = pipeline[curIdx + 1];
    startTransition(async () => {
      // Save current form first
      await saveStepDataAction(item.id, activeStep, formData);
      await updateChecklistAction(item.id, activeStep, checklist);
      await completeStepAction(item.id, activeStep, nextStep?.key);
      onRefresh();
      if (nextStep) setActiveStep(nextStep.key);
    });
  }

  function addCheckItem() {
    if (!newCheckLabel.trim()) return;
    setChecklist([...checklist, { label: newCheckLabel.trim(), checked: false }]);
    setNewCheckLabel("");
    setDirty(true);
  }
  function toggleCheck(i: number) {
    setChecklist(checklist.map((c, idx) => idx === i ? { ...c, checked: !c.checked } : c));
    setDirty(true);
  }
  function removeCheck(i: number) {
    setChecklist(checklist.filter((_, idx) => idx !== i));
    setDirty(true);
  }

  const checkedCount = checklist.filter((c) => c.checked).length;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 9999,
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff", borderRadius: 12,
          width: "94vw", maxWidth: 1100, maxHeight: "94vh",
          display: "flex", flexDirection: "column", overflow: "hidden",
        }}
      >
        {/* HEADER */}
        <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", display: "flex", gap: 10, alignItems: "center" }}>
          <span className="chip chip-blue">
            {item.rd_type === "upgrade" || item.rd_type === "production" ? "Sản xuất / Thiết kế" : "Nghiên cứu SP"}
          </span>
          <div style={{ fontWeight: 800, fontSize: 15, flex: 1 }}>
            Bước {pipeline.findIndex((s) => s.key === activeStep) + 1}/{pipeline.length} — {pipeline.find((s) => s.key === activeStep)?.label} · {item.name}
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={save} disabled={pending || !dirty}>
            {pending ? "..." : "💾 Lưu nháp"}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>

        {/* STEPPER */}
        <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--border)", background: "#FAFAFA", display: "flex", gap: 4, overflowX: "auto" }}>
          {pipeline.map((s, idx) => {
            const completedAt = completedMap[s.key];
            const isActive = s.key === activeStep;
            const isCompleted = !!completedAt;
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => switchStep(s.key)}
                style={{
                  flex: "0 0 auto",
                  padding: "6px 10px",
                  borderRadius: 6,
                  border: "1px solid " + (isActive ? "var(--blue)" : isCompleted ? "#86EFAC" : "var(--border)"),
                  background: isActive ? "var(--blue)" : isCompleted ? "#F0FDF4" : "#fff",
                  color: isActive ? "#fff" : isCompleted ? "#15803D" : "var(--muted)",
                  fontSize: 11, fontWeight: 700, cursor: "pointer",
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                  minWidth: 78,
                }}
              >
                <div style={{ display: "flex", gap: 4 }}>
                  <span>{isCompleted ? "✓" : idx + 1}</span>
                  <span>{s.label}</span>
                </div>
                {completedAt && (
                  <div style={{ fontSize: 9, fontWeight: 400 }}>{formatDate(completedAt)}</div>
                )}
              </button>
            );
          })}
        </div>

        {/* BODY: main form + right sidebar */}
        <div style={{ flex: 1, overflowY: "auto", display: "flex", gap: 16, padding: 16 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {stepFields.length > 0 ? (
              <div className="form-grid fg-2">
                {stepFields.map((f) => (
                  <div key={f.key} className="form-group" style={{ gridColumn: f.type === "textarea" ? "span 2" : undefined }}>
                    <label>{f.label}</label>
                    {f.type === "textarea" ? (
                      <textarea
                        rows={3}
                        value={formData[f.key] || ""}
                        onChange={(e) => { setFormData({ ...formData, [f.key]: e.target.value }); setDirty(true); }}
                      />
                    ) : (
                      <input
                        type={f.type === "number" ? "text" : "text"}
                        inputMode={f.type === "number" ? "numeric" : undefined}
                        value={formData[f.key] || ""}
                        onChange={(e) => { setFormData({ ...formData, [f.key]: e.target.value }); setDirty(true); }}
                      />
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="muted" style={{ padding: 20, textAlign: "center" }}>
                Bước này chưa có fields. Dùng checklist bên phải.
              </div>
            )}

            {/* Nút hoàn thành bước */}
            <div style={{ marginTop: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              {completedMap[activeStep] ? (
                <div className="chip chip-green">
                  ✓ Bước này đã hoàn thành ngày {formatDate(completedMap[activeStep])}
                </div>
              ) : <span />}
              <button
                type="button"
                className="btn btn-success btn-sm"
                onClick={markComplete}
                disabled={pending}
              >
                {completedMap[activeStep] ? "Cập nhật + Chuyển bước tiếp" : "✓ Hoàn thành bước + Chuyển tiếp"}
              </button>
            </div>
          </div>

          {/* RIGHT SIDEBAR: Checklist + Timeline */}
          <div style={{ width: 300, flexShrink: 0, display: "flex", flexDirection: "column", gap: 14 }}>
            {/* Checklist */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", marginBottom: 6 }}>
                Checklist bước này ({checkedCount}/{checklist.length})
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {checklist.map((c, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 6px", background: c.checked ? "#F0FDF4" : "#FAFAFA", borderRadius: 4, fontSize: 12 }}>
                    <input type="checkbox" checked={c.checked} onChange={() => toggleCheck(i)} style={{ width: 14, height: 14 }} />
                    <span style={{ flex: 1, textDecoration: c.checked ? "line-through" : "none", color: c.checked ? "var(--muted)" : "var(--text)" }}>
                      {c.label}
                    </span>
                    <button type="button" onClick={() => removeCheck(i)} style={{ background: "none", border: "none", color: "var(--red)", cursor: "pointer", padding: 2 }}>✕</button>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
                <input
                  value={newCheckLabel}
                  onChange={(e) => setNewCheckLabel(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCheckItem())}
                  placeholder="Thêm mục..."
                  style={{ flex: 1, fontSize: 12 }}
                />
                <button type="button" className="btn btn-primary btn-xs" onClick={addCheckItem}>+</button>
              </div>
            </div>

            {/* Timeline các bước */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", marginBottom: 6 }}>
                Timeline
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 12 }}>
                {pipeline.map((s) => {
                  const at = completedMap[s.key];
                  return (
                    <div
                      key={s.key}
                      onClick={() => switchStep(s.key)}
                      style={{
                        display: "flex", justifyContent: "space-between",
                        padding: "3px 6px", borderRadius: 4, cursor: "pointer",
                        background: s.key === activeStep ? "var(--blue-lt)" : "transparent",
                        fontWeight: s.key === activeStep ? 700 : 400,
                      }}
                    >
                      <span style={{ color: at ? "var(--green)" : "var(--muted)" }}>
                        {at ? "✓" : "○"} {s.label}
                      </span>
                      <span className="muted" style={{ fontSize: 11 }}>
                        {at ? formatDate(at) : "—"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
