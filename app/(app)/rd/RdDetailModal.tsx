"use client";

import { useState, useTransition } from "react";
import {
  getSteps, getStepsKey, isProduction, getLinkUrl, getLinkTag,
  type RdItem, type RdStep, type RdCheckItem, type RdLink,
} from "@/lib/db/rd-types";
import type { UserRef } from "@/lib/db/users";
import { saveRdItemAction, createPoFromRdAction } from "./actions";

/* ─── Field definitions per step label ──────────────────── */
type FieldDef = {
  key: string;
  label: string;
  type?: "text" | "textarea" | "url" | "number" | "date" | "verdict";
};

const VERDICT_OPTIONS = ["Duyệt", "Từ chối", "Cần chỉnh sửa"];

const STEP_FORM_FIELDS: Record<string, FieldDef[]> = {
  "Đề xuất": [
    { key: "description",       label: "Mô tả sản phẩm", type: "textarea" },
    { key: "reason",            label: "Lý do đề xuất", type: "textarea" },
    { key: "ref_links",         label: "Link tham khảo (1688, Shopee...)", type: "url" },
  ],
  "Xác nhận": [
    { key: "confirm_note",      label: "Ghi chú", type: "textarea" },
  ],
  "Nghiên cứu": [
    { key: "usp",               label: "Phân tích USP", type: "textarea" },
    { key: "competitors",       label: "Đối thủ / SP cùng loại", type: "textarea" },
    { key: "market_price",      label: "Giá thị trường" },
    { key: "market_volume",     label: "Volume thị trường" },
    { key: "supplier_name",     label: "NCC dự kiến" },
    { key: "supplier_trust",    label: "Uy tín NCC" },
    { key: "moq",               label: "MOQ" },
    { key: "price_buy",         label: "Giá nhập dự kiến", type: "number" },
    { key: "price_sell",        label: "Giá bán dự kiến", type: "number" },
    { key: "evaluation",        label: "Đánh giá chung", type: "textarea" },
  ],
  "Duyệt NC": [
    { key: "approve_verdict",   label: "Kết quả duyệt", type: "verdict" },
    { key: "approve_note",      label: "Nhận xét Leader", type: "textarea" },
  ],
  "Đặt mẫu": [
    { key: "sample_supplier",   label: "NCC đặt mẫu" },
    { key: "sample_contact",    label: "Liên hệ NCC (WeChat, phone...)" },
    { key: "sample_platform",   label: "Nền tảng (1688, Alibaba...)" },
    { key: "sample_qty",        label: "Số lượng mẫu", type: "number" },
    { key: "sample_price_usd",  label: "Giá mẫu (USD)", type: "number" },
    { key: "sample_order_link", label: "Link đơn mẫu", type: "url" },
    { key: "sample_eta",        label: "Dự kiến mẫu về", type: "date" },
  ],
  "Hàng về": [
    { key: "qc_actual",         label: "Thông tin thực tế", type: "textarea" },
    { key: "qc_score",          label: "Điểm QC (/10)" },
    { key: "qc_evaluation",     label: "Đánh giá chung", type: "textarea" },
  ],
  "Duyệt mẫu": [
    { key: "approve_verdict",   label: "Kết quả duyệt mẫu", type: "verdict" },
    { key: "approve_note",      label: "Nhận xét Leader", type: "textarea" },
    { key: "bulk_qty",          label: "SL nhập nếu pass", type: "number" },
    { key: "bulk_price",        label: "Giá nhập (đ)", type: "number" },
  ],
  "Nhập hàng": [
    { key: "bulk_qty",          label: "Số lượng nhập", type: "number" },
    { key: "bulk_price",        label: "Giá nhập (đ)", type: "number" },
    { key: "linked_bulk_po",    label: "Mã PO liên kết" },
    { key: "lesson_note",       label: "Ghi chú", type: "textarea" },
  ],
  // Production
  "Tạo ticket": [
    { key: "base_sku",          label: "SP gốc (SKU)" },
    { key: "base_product",      label: "Tên SP gốc" },
    { key: "improvement_type",  label: "Loại cải tiến" },
  ],
  "Lên ý tưởng": [
    { key: "base_sku",          label: "SP gốc (SKU)" },
    { key: "improvement_type",  label: "Loại cải tiến" },
  ],
  "Duyệt B1": [
    { key: "approve_verdict",   label: "Kết quả duyệt B1", type: "verdict" },
    { key: "approve_note",      label: "Ghi chú", type: "textarea" },
  ],
  "Thiết kế": [
    { key: "design_desc",       label: "Mô tả thiết kế", type: "textarea" },
    { key: "mfg_file_links",    label: "Link file thiết kế", type: "url" },
  ],
  "Thiết kế mẫu": [
    { key: "design_desc",       label: "Mô tả thiết kế", type: "textarea" },
    { key: "mfg_file_links",    label: "Link file thiết kế", type: "url" },
  ],
  "Duyệt 2A": [
    { key: "approve_verdict",   label: "Kết quả duyệt 2A", type: "verdict" },
    { key: "approve_note",      label: "Ghi chú", type: "textarea" },
  ],
  "NCC+Tracking": [
    { key: "mfg_supplier",      label: "NCC gia công" },
    { key: "mfg_contact",       label: "Liên hệ NCC" },
    { key: "mfg_moq",           label: "MOQ", type: "number" },
    { key: "mfg_lead_time",     label: "Lead time (ngày)" },
    { key: "mfg_price_unit",    label: "Giá gia công (đ)", type: "number" },
    { key: "mfg_setup_fee",     label: "Phí khuôn (đ)", type: "number" },
    { key: "mfg_ref_links",     label: "Link NCC / hợp đồng", type: "url" },
  ],
  "Đặt cọc sản xuất": [
    { key: "mfg_supplier",      label: "NCC gia công" },
    { key: "mfg_price_unit",    label: "Giá gia công (đ)", type: "number" },
  ],
  "Chờ mẫu về": [
    { key: "sample_eta",        label: "Dự kiến mẫu về", type: "date" },
  ],
  "QC & Nhận hàng": [
    { key: "check_note",        label: "Ghi chú kiểm tra", type: "textarea" },
  ],
  "Đặt hàng": [
    { key: "bulk_qty",          label: "Số lượng đặt", type: "number" },
    { key: "bulk_price",        label: "Giá (đ)", type: "number" },
    { key: "target_launch_date", label: "Ngày launch dự kiến", type: "date" },
    { key: "linked_bulk_po",    label: "Mã PO" },
  ],
  "Ra mắt": [
    { key: "target_launch_date", label: "Ngày launch", type: "date" },
    { key: "lesson_note",       label: "Ghi chú", type: "textarea" },
  ],
};

/* ─── Verdict color ─────────────────────────────────────── */
function verdictStyle(v: string): { bg: string; color: string } | null {
  const lower = String(v).toLowerCase();
  if (lower.includes("duyệt") && !lower.includes("từ")) return { bg: "#DCFCE7", color: "#15803D" };
  if (lower.includes("từ chối")) return { bg: "#FEE2E2", color: "#B91C1C" };
  if (lower.includes("chỉnh")) return { bg: "#FEF3C7", color: "#92400E" };
  return null;
}

/* ─── Status styles ─────────────────────────────────────── */
const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  approved:  { bg: "#DCFCE7", color: "#15803D", label: "Hoàn thành" },
  active:    { bg: "#EFF6FF", color: "#1D4ED8", label: "Đang làm" },
  skipped:   { bg: "#F4F4F5", color: "#71717A", label: "Bỏ qua" },
  locked:    { bg: "#F4F4F5", color: "#A1A1AA", label: "Chưa mở" },
  rejected:  { bg: "#FEE2E2", color: "#B91C1C", label: "Từ chối" },
};

/* ─── Image URL check ───────────────────────────────────── */
function isImageUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return /\.(jpg|jpeg|png|gif|webp|avif|bmp|svg)(\?|$)/.test(lower)
    || lower.includes("imgur") || lower.includes("ibb.co") || lower.includes("cloudinary");
}

/* ─── Parse deadline ────────────────────────────────────── */
function isOverdue(deadline: string): boolean {
  if (!deadline) return false;
  const m = deadline.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const d = m ? new Date(+m[3], +m[2] - 1, +m[1]) : new Date(deadline);
  if (isNaN(d.getTime())) return false;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return d < today;
}
function deadlineToISO(d: string): string {
  if (!d) return "";
  const m = d.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return d;
}

/* ═══════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════ */
export default function RdDetailModal({
  item, users = [], onClose, onRefresh,
}: {
  item: RdItem; users?: UserRef[]; onClose: () => void; onRefresh: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const steps = getSteps(item);
  const stepsKey = getStepsKey(item);
  const data = (item.data as Record<string, unknown>) || {};

  // Nếu item không có steps JSON → hiện thông báo
  if (steps.length === 0) {
    return (
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 12, padding: 32, maxWidth: 500, textAlign: "center" }}>
          <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 8 }}>{item.name}</div>
          <div className="muted" style={{ marginBottom: 16 }}>
            Sản phẩm này chưa có pipeline workflow. Hãy chỉnh sửa và chọn loại R&D (Nghiên cứu / Sản xuất) để khởi tạo.
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>Đóng</button>
        </div>
      </div>
    );
  }

  return <ModalInner item={item} steps={steps} stepsKey={stepsKey} data={data} users={users} onClose={onClose} onRefresh={onRefresh} pending={pending} startTransition={startTransition} />;
}

function ModalInner({
  item, steps: initSteps, stepsKey, data, users, onClose, onRefresh, pending, startTransition,
}: {
  item: RdItem; steps: RdStep[]; stepsKey: string; data: Record<string, unknown>;
  users: UserRef[]; onClose: () => void; onRefresh: () => void;
  pending: boolean; startTransition: (fn: () => Promise<void>) => void;
}) {
  const firstActive = initSteps.findIndex((s) => s.status === "active");
  const [activeIdx, setActiveIdx] = useState(firstActive >= 0 ? firstActive : 0);
  const step = initSteps[activeIdx];

  // Item name (editable)
  const [itemName, setItemName] = useState(item.name || "");
  const [creatingPo, setCreatingPo] = useState(false);

  // Step-level state
  const [assignee, setAssignee] = useState(step.assignee || "");
  const [assigneeName, setAssigneeName] = useState(step.assignee_name || "");
  const [deadline, setDeadline] = useState(step.deadline || "");
  const [checklist, setChecklist] = useState<RdCheckItem[]>(step.checklist || []);
  const [links, setLinks] = useState<RdLink[]>(step.links || []);
  const [photos, setPhotos] = useState<string[]>(step.photos || []);
  const [result, setResult] = useState(step.result || "");
  const [newCheckLabel, setNewCheckLabel] = useState("");
  const [newLink, setNewLink] = useState("");
  const [newPhoto, setNewPhoto] = useState("");

  // Form fields (data.* flat)
  const formFields = STEP_FORM_FIELDS[step.label] || [];
  const [formData, setFormData] = useState<Record<string, string>>(() => {
    const d: Record<string, string> = {};
    for (const f of formFields) d[f.key] = String(data[f.key] ?? "");
    return d;
  });
  const [dirty, setDirty] = useState(false);

  /* ── Switch step ──────────────────────────────────────── */
  function switchStep(idx: number) {
    if (dirty && !confirm("Bạn có thay đổi chưa lưu. Vẫn chuyển bước?")) return;
    const s = initSteps[idx];
    setActiveIdx(idx);
    setAssignee(s.assignee || "");
    setAssigneeName(s.assignee_name || "");
    setDeadline(s.deadline || "");
    setChecklist(s.checklist || []);
    setLinks(s.links || []);
    setPhotos(s.photos || []);
    setResult(s.result || "");
    const fields = STEP_FORM_FIELDS[s.label] || [];
    const d: Record<string, string> = {};
    for (const f of fields) d[f.key] = String(data[f.key] ?? "");
    setFormData(d);
    setDirty(false);
  }

  /* ── Build updated steps for save ────────────────────── */
  function buildUpdatedSteps(statusOverride?: string) {
    return initSteps.map((s, i) => {
      if (i !== activeIdx) return s;
      return {
        ...s,
        assignee,
        assignee_name: assigneeName,
        assigneeName: assigneeName, // keep both formats
        deadline,
        checklist,
        links,
        photos,
        result,
        ...(statusOverride ? { status: statusOverride } : {}),
      };
    });
  }

  function save() {
    startTransition(async () => {
      const newData = { ...data, ...formData, [stepsKey]: JSON.stringify(buildUpdatedSteps()) };
      await saveRdItemAction(item.id, { name: itemName, data: newData });
      setDirty(false);
      onRefresh();
    });
  }

  function markComplete() {
    startTransition(async () => {
      const updated = initSteps.map((s, i) => {
        if (i === activeIdx) return { ...s, status: "approved" as const, assignee, assignee_name: assigneeName, assigneeName, deadline, checklist, links, photos, result };
        if (i === activeIdx + 1 && (s.status === "locked" || s.status === "skipped")) return { ...s, status: "active" as const };
        return s;
      });
      const newData = { ...data, ...formData, [stepsKey]: JSON.stringify(updated) };
      await saveRdItemAction(item.id, { name: itemName, data: newData });
      setDirty(false);
      onRefresh();
      if (activeIdx + 1 < initSteps.length) {
        const next = updated[activeIdx + 1];
        setActiveIdx(activeIdx + 1);
        setAssignee(next.assignee || "");
        setAssigneeName(next.assignee_name || "");
        setDeadline(next.deadline || "");
        setChecklist(next.checklist || []);
        setLinks(next.links || []);
        setPhotos(next.photos || []);
        setResult(next.result || "");
        const fields = STEP_FORM_FIELDS[next.label] || [];
        const d: Record<string, string> = {};
        for (const f of fields) d[f.key] = String(data[f.key] ?? "");
        setFormData(d);
      }
    });
  }

  /* ── Checklist helpers ──────────────────────────────────── */
  function addCheckItem() { if (!newCheckLabel.trim()) return; setChecklist([...checklist, { text: newCheckLabel.trim(), checked: false, verdict: null }]); setNewCheckLabel(""); setDirty(true); }
  function toggleCheck(i: number) { setChecklist(checklist.map((c, idx) => idx === i ? { ...c, checked: !c.checked } : c)); setDirty(true); }
  function setVerdict(i: number, v: "pass" | "fail" | null) { setChecklist(checklist.map((c, idx) => idx === i ? { ...c, verdict: v, checked: v === "pass" } : c)); setDirty(true); }
  function removeCheck(i: number) { setChecklist(checklist.filter((_, idx) => idx !== i)); setDirty(true); }
  function updateCheckNote(i: number, note: string) { setChecklist(checklist.map((c, idx) => idx === i ? { ...c, note } : c)); setDirty(true); }
  const isQcStep = step.label === "Hàng về" || step.label === "Kiểm tra" || step.label === "QC & Nhận hàng";
  const passCount = checklist.filter(c => c.verdict === "pass").length;
  const failCount = checklist.filter(c => c.verdict === "fail").length;

  /* ── Links helpers ──────────────────────────────────────── */
  function addLink() { if (!newLink.trim()) return; setLinks([...links, { tag: "", url: newLink.trim() }]); setNewLink(""); setDirty(true); }
  function removeLink(i: number) { setLinks(links.filter((_, idx) => idx !== i)); setDirty(true); }

  /* ── Photos helpers ─────────────────────────────────────── */
  function addPhoto() { if (!newPhoto.trim()) return; setPhotos([...photos, newPhoto.trim()]); setNewPhoto(""); setDirty(true); }
  function removePhoto(i: number) { setPhotos(photos.filter((_, idx) => idx !== i)); setDirty(true); }

  function setField(key: string, val: string) { setFormData((prev) => ({ ...prev, [key]: val })); setDirty(true); }

  const checkedCount = checklist.filter((c) => c.checked).length;
  const stepStatus = STATUS_STYLE[step.status] || STATUS_STYLE.locked;
  const deadlineOverdue = step.status !== "approved" && isOverdue(deadline);

  /* ── render form field ──────────────────────────────────── */
  function renderField(f: FieldDef) {
    const val = formData[f.key] || "";
    switch (f.type) {
      case "url":
        return (
          <div className="form-group" key={f.key} style={{ gridColumn: "span 2" }}>
            <label>{f.label}</label>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input type="text" value={val} onChange={(e) => setField(f.key, e.target.value)} placeholder="https://..." style={{ flex: 1 }} />
              {val && <a href={val} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: "var(--blue)", fontWeight: 600, whiteSpace: "nowrap", padding: "4px 8px", border: "1px solid var(--blue)", borderRadius: 4, textDecoration: "none" }}>Mở ↗</a>}
            </div>
          </div>
        );
      case "verdict": {
        const vs = val ? verdictStyle(val) : null;
        return (
          <div className="form-group" key={f.key}>
            <label>{f.label}</label>
            <select value={val} onChange={(e) => setField(f.key, e.target.value)} style={vs ? { background: vs.bg, color: vs.color, fontWeight: 700 } : undefined}>
              <option value="">— Chọn —</option>
              {VERDICT_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
        );
      }
      case "date": {
        const ov = val && isOverdue(val) && step.status !== "approved";
        return (
          <div className="form-group" key={f.key}>
            <label>{f.label}{ov && <span style={{ color: "var(--red)", fontWeight: 700, marginLeft: 6, fontSize: 10 }}>QUÁ HẠN</span>}</label>
            <input type="date" value={deadlineToISO(val)} onChange={(e) => setField(f.key, e.target.value)} style={ov ? { borderColor: "var(--red)", color: "var(--red)" } : undefined} />
          </div>
        );
      }
      case "textarea":
        return (
          <div className="form-group" key={f.key} style={{ gridColumn: "span 2" }}>
            <label>{f.label}</label>
            <textarea rows={3} value={val} onChange={(e) => setField(f.key, e.target.value)} />
          </div>
        );
      case "number":
        return (
          <div className="form-group" key={f.key}>
            <label>{f.label}</label>
            <input type="text" inputMode="numeric" value={val} onChange={(e) => setField(f.key, e.target.value)} />
          </div>
        );
      default:
        return (
          <div className="form-group" key={f.key}>
            <label>{f.label}</label>
            <input type="text" value={val} onChange={(e) => setField(f.key, e.target.value)} />
          </div>
        );
    }
  }

  const isApprovalStep = step.label === "Xác nhận" || step.label === "Duyệt NC" || step.label === "Duyệt mẫu"
    || step.label === "Duyệt B1" || step.label === "Duyệt 2A";

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, width: 920, maxWidth: "96vw", height: "85vh", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,.2)", overflow: "hidden" }}>

        {/* ═══ HEADER ═══ */}
        <div style={{ padding: "14px 20px", borderBottom: "1px solid #E2E8F0", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 15, display: "flex", alignItems: "center", gap: 8 }}>
              <input type="text" value={itemName} onChange={(e) => { setItemName(e.target.value); setDirty(true); }} placeholder="Tên sản phẩm..."
                style={{ border: "none", borderBottom: "2px dashed #E2E8F0", fontWeight: 800, fontSize: 15, outline: "none", padding: "2px 4px", width: 320, background: "transparent" }} />
            </div>
            <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 2 }}>
              {item.created_by || ""} · {item.created_at ? String(item.created_at).substring(0, 10) : ""}
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 6, fontSize: 10, fontWeight: 600,
              background: isApprovalStep ? "#FFF7ED" : "#EFF6FF",
              color: isApprovalStep ? "#D97706" : "#3B82F6",
            }}>
              Bước {activeIdx + 1}: {step.label}
            </span>
            <button type="button" onClick={save} disabled={pending || !dirty} style={{ padding: "4px 10px", borderRadius: 6, fontSize: 10, fontWeight: 600, border: "1px solid #E2E8F0", background: dirty ? "#7C3AED" : "#F1F5F9", color: dirty ? "#fff" : "#94A3B8", cursor: "pointer" }}>
              {pending ? "..." : "Lưu"}
            </button>
            <button type="button" onClick={onClose} style={{ padding: "4px 8px", borderRadius: 6, fontSize: 12, border: "1px solid #E2E8F0", background: "#F1F5F9", color: "#64748B", cursor: "pointer" }}>✕</button>
          </div>
        </div>

        {/* ═══ BODY: Stepper left + Form right ═══ */}
        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

          {/* ── LEFT STEPPER ── */}
          <div style={{ width: 190, background: "#F8FAFC", borderRight: "1px solid #E2E8F0", padding: "14px 10px", overflowY: "auto", flexShrink: 0 }}>
            {initSteps.map((s, idx) => {
              const isActive = idx === activeIdx;
              const isDone = s.status === "approved";
              const isLocked = s.status === "locked";
              const dotClass = isDone ? { bg: "#22C55E", color: "#fff" }
                : isActive ? (isApprovalStep ? { bg: "#FEF3C7", color: "#D97706" } : { bg: "#3B82F6", color: "#fff" })
                : { bg: "#E2E8F0", color: "#94A3B8" };
              const statusText = isActive
                ? (isApprovalStep ? "Chờ duyệt" : "Đang làm")
                : isDone ? "✓ Xong" : "—";
              return (
                <div key={idx}>
                  <div onClick={() => switchStep(idx)} style={{
                    display: "flex", alignItems: "flex-start", gap: 8, padding: "7px 6px", borderRadius: 6, cursor: "pointer",
                    background: isActive ? "#EFF6FF" : "transparent", opacity: isLocked ? 0.5 : 1,
                  }}>
                    <div style={{
                      width: 22, height: 22, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 9, fontWeight: 800, flexShrink: 0, background: dotClass.bg, color: dotClass.color,
                    }}>
                      {isDone ? "✓" : idx + 1}
                    </div>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600 }}>{s.label}</div>
                      <div style={{ fontSize: 9, color: "#94A3B8" }}>{statusText}</div>
                      {s.assignee_name && <div style={{ fontSize: 9, color: "#94A3B8" }}>→ {s.assignee_name.split("(")[0].trim()}</div>}
                    </div>
                  </div>
                  {idx < initSteps.length - 1 && <div style={{ width: 1, height: 8, background: "#D1D5DB", marginLeft: 20 }} />}
                </div>
              );
            })}
          </div>

          {/* ── RIGHT FORM AREA ── */}
          <div style={{ flex: 1, padding: 18, overflowY: "auto" }}>

            {/* Assignee + Deadline row */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#64748B", textTransform: "uppercase", letterSpacing: ".3px", marginBottom: 5 }}>Người phụ trách</div>
                <select value={assignee} onChange={(e) => {
                  const email = e.target.value;
                  const u = users.find((u) => u.email === email);
                  setAssignee(email); setAssigneeName(u ? (u.name || email) : ""); setDirty(true);
                }} style={{ width: "100%", padding: "7px 11px", border: "1px solid #E2E8F0", borderRadius: 7, fontSize: 12, outline: "none" }}>
                  <option value="">— Chọn —</option>
                  {users.map((u) => <option key={u.email} value={u.email}>{u.name || u.email}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#64748B", textTransform: "uppercase", letterSpacing: ".3px", marginBottom: 5 }}>
                  Deadline{deadlineOverdue && <span style={{ color: "#DC2626", fontWeight: 700, marginLeft: 4, fontSize: 10 }}>QUÁ HẠN</span>}
                </div>
                <input type="date" value={deadlineToISO(deadline)} onChange={(e) => { setDeadline(e.target.value); setDirty(true); }}
                  style={{ width: "100%", padding: "7px 11px", border: `1px solid ${deadlineOverdue ? "#DC2626" : "#E2E8F0"}`, borderRadius: 7, fontSize: 12, outline: "none", color: deadlineOverdue ? "#DC2626" : undefined }} />
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#64748B", textTransform: "uppercase", letterSpacing: ".3px", marginBottom: 5 }}>Ghi chú bước</div>
                <input type="text" value={result} onChange={(e) => { setResult(e.target.value); setDirty(true); }} placeholder="Kết quả / ghi chú..."
                  style={{ width: "100%", padding: "7px 11px", border: "1px solid #E2E8F0", borderRadius: 7, fontSize: 12, outline: "none" }} />
              </div>
            </div>

            {/* Form fields */}
            {formFields.length > 0 && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
                {formFields.map((f) => renderField(f))}
              </div>
            )}

            {/* ── QC Checklist (for Hàng về step) ── */}
            {(checklist.length > 0 || isQcStep) && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#64748B", textTransform: "uppercase", letterSpacing: ".3px", marginBottom: 5 }}>
                  {isQcStep ? `QC Checklist (${passCount}/${checklist.length} Pass${failCount > 0 ? ` · ${failCount} Fail` : ""})` : `Checklist (${checkedCount}/${checklist.length})`}
                </div>
                {checklist.length > 0 && (
                  <div style={{ height: 3, borderRadius: 2, background: "#E5E7EB", marginBottom: 8, overflow: "hidden" }}>
                    <div style={{ height: "100%", borderRadius: 2, width: `${((isQcStep ? passCount : checkedCount) / checklist.length) * 100}%`, background: failCount > 0 ? "#DC2626" : (isQcStep ? passCount : checkedCount) === checklist.length ? "#16A34A" : "#3B82F6", transition: "width .2s" }} />
                  </div>
                )}
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {checklist.map((c, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 7, padding: "5px 0", borderBottom: "1px solid #F1F5F9" }}>
                      <span style={{ flex: 1, fontSize: 11, color: c.verdict === "fail" ? "#DC2626" : c.verdict === "pass" ? "#94A3B8" : "#18181B" }}>{c.text}</span>
                      {isQcStep ? (
                        <div style={{ display: "flex", gap: 3 }}>
                          <button type="button" onClick={() => setVerdict(i, c.verdict === "pass" ? null : "pass")} style={{
                            padding: "2px 8px", borderRadius: 4, fontSize: 9, fontWeight: 600, cursor: "pointer",
                            border: `1.5px solid ${c.verdict === "pass" ? "#16A34A" : "#E2E8F0"}`,
                            background: c.verdict === "pass" ? "#F0FDF4" : "#fff",
                            color: c.verdict === "pass" ? "#16A34A" : "#94A3B8",
                          }}>Pass</button>
                          <button type="button" onClick={() => setVerdict(i, c.verdict === "fail" ? null : "fail")} style={{
                            padding: "2px 8px", borderRadius: 4, fontSize: 9, fontWeight: 600, cursor: "pointer",
                            border: `1.5px solid ${c.verdict === "fail" ? "#DC2626" : "#E2E8F0"}`,
                            background: c.verdict === "fail" ? "#FEF2F2" : "#fff",
                            color: c.verdict === "fail" ? "#DC2626" : "#94A3B8",
                          }}>Fail</button>
                        </div>
                      ) : (
                        <input type="checkbox" checked={c.checked} onChange={() => toggleCheck(i)} style={{ width: 14, height: 14 }} />
                      )}
                      <button type="button" onClick={() => removeCheck(i)} style={{ background: "none", border: "none", color: "#DC2626", cursor: "pointer", fontSize: 14, padding: 2 }}>✕</button>
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
                  <input value={newCheckLabel} onChange={(e) => setNewCheckLabel(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCheckItem())} placeholder="Thêm mục kiểm tra..."
                    style={{ flex: 1, padding: "5px 11px", border: "1px solid #E2E8F0", borderRadius: 7, fontSize: 12, outline: "none" }} />
                  <button type="button" onClick={addCheckItem} style={{ padding: "5px 10px", borderRadius: 7, fontSize: 11, fontWeight: 600, border: "none", background: "#7C3AED", color: "#fff", cursor: "pointer" }}>+</button>
                </div>
              </div>
            )}

            {/* ── Links ── */}
            {(links.length > 0 || true) && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#64748B", textTransform: "uppercase", letterSpacing: ".3px", marginBottom: 5 }}>Tài liệu ({links.length})</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 6 }}>
                  {links.map((link, i) => {
                    const url = getLinkUrl(link);
                    const tag = getLinkTag(link);
                    return (
                      <div key={i} style={{ padding: "3px 7px", background: "#F1F5F9", borderRadius: 5, fontSize: 9, display: "flex", alignItems: "center", gap: 3 }}>
                        <a href={url.startsWith("http") ? url : `https://${url}`} target="_blank" rel="noopener noreferrer" style={{ color: "#3B82F6", textDecoration: "none" }}>
                          {tag || (url.length > 35 ? url.substring(0, 32) + "..." : url)}
                        </a>
                        <button type="button" onClick={() => removeLink(i)} style={{ background: "none", border: "none", color: "#DC2626", cursor: "pointer", fontSize: 10, padding: 0 }}>✕</button>
                      </div>
                    );
                  })}
                  <div style={{ display: "flex", gap: 3 }}>
                    <input value={newLink} onChange={(e) => setNewLink(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addLink())} placeholder="Dán link..."
                      style={{ padding: "3px 7px", border: "1px dashed #D1D5DB", borderRadius: 5, fontSize: 9, width: 140, outline: "none" }} />
                    {newLink && <button type="button" onClick={addLink} style={{ padding: "3px 7px", borderRadius: 5, fontSize: 9, fontWeight: 600, border: "none", background: "#7C3AED", color: "#fff", cursor: "pointer" }}>+</button>}
                  </div>
                </div>
              </div>
            )}

            {/* ── Photos ── */}
            {(photos.length > 0 || true) && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#64748B", textTransform: "uppercase", letterSpacing: ".3px", marginBottom: 5 }}>Hình ảnh ({photos.length})</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 6 }}>
                  {photos.map((url, i) => (
                    <div key={i} style={{ position: "relative" }}>
                      {isImageUrl(url) ? (
                        <a href={url} target="_blank" rel="noopener noreferrer">
                          <img src={url} alt="" style={{ width: 60, height: 60, objectFit: "cover", borderRadius: 6, border: "1px solid #E2E8F0" }} onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                        </a>
                      ) : (
                        <a href={url} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 60, height: 60, borderRadius: 6, border: "1px solid #E2E8F0", background: "#F8FAFC", fontSize: 8, color: "#3B82F6", textDecoration: "none", padding: 3, textAlign: "center", wordBreak: "break-all" }}>
                          {url.length > 25 ? url.substring(0, 22) + "..." : url}
                        </a>
                      )}
                      <button type="button" onClick={() => removePhoto(i)} style={{ position: "absolute", top: -4, right: -4, width: 14, height: 14, borderRadius: "50%", background: "#DC2626", color: "#fff", border: "none", fontSize: 9, cursor: "pointer", lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
                    </div>
                  ))}
                  <div style={{ display: "flex", gap: 3, alignItems: "flex-end" }}>
                    <input value={newPhoto} onChange={(e) => setNewPhoto(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addPhoto())} placeholder="Dán link ảnh..."
                      style={{ padding: "3px 7px", border: "1px dashed #D1D5DB", borderRadius: 5, fontSize: 9, width: 120, outline: "none" }} />
                    {newPhoto && <button type="button" onClick={addPhoto} style={{ padding: "3px 7px", borderRadius: 5, fontSize: 9, fontWeight: 600, border: "none", background: "#7C3AED", color: "#fff", cursor: "pointer" }}>+</button>}
                  </div>
                </div>
              </div>
            )}

            {/* ── Create PO banner ── */}
            {(step.label === "Nhập hàng" || step.label === "Nhập?" || step.label === "Đặt hàng") && (
              <div style={{ padding: 12, border: "2px dashed #BBF7D0", borderRadius: 10, textAlign: "center", cursor: "pointer", marginBottom: 14 }}
                onClick={() => {
                  setCreatingPo(true);
                  startTransition(async () => {
                    const newData = { ...data, ...formData, [stepsKey]: JSON.stringify(buildUpdatedSteps()) };
                    await saveRdItemAction(item.id, { name: itemName, data: newData });
                    const r = await createPoFromRdAction(item.id);
                    setCreatingPo(false);
                    if (r.ok) { onRefresh(); window.location.href = `/create?order_id=${r.orderId}`; }
                    else alert(r.error || "Lỗi tạo đơn");
                  });
                }}>
                <div style={{ fontSize: 20, marginBottom: 4 }}>📦</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#16A34A" }}>{creatingPo ? "Đang tạo..." : "Tạo đơn PO nhập hàng"}</div>
                <div style={{ fontSize: 9, color: "#94A3B8" }}>
                  {String(formData.bulk_qty || data.bulk_qty || "—")} cái × {Number(formData.bulk_price || data.bulk_price || data.price_buy || 0).toLocaleString("vi-VN")}đ
                </div>
              </div>
            )}

            {/* ── Action buttons ── */}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", paddingTop: 10, borderTop: "1px solid #E2E8F0" }}>
              {step.status === "approved" ? (
                <>
                  <span style={{ fontSize: 11, color: "#16A34A", fontWeight: 600, padding: "7px 0" }}>✓ Bước hoàn thành</span>
                  <div style={{ flex: 1 }} />
                  <button type="button" onClick={save} disabled={pending || !dirty} style={{ padding: "7px 14px", borderRadius: 7, fontSize: 11, fontWeight: 600, border: "none", background: "#F1F5F9", color: "#64748B", cursor: "pointer" }}>Cập nhật</button>
                  {activeIdx < initSteps.length - 1 && (
                    <button type="button" onClick={() => switchStep(activeIdx + 1)} style={{ padding: "7px 14px", borderRadius: 7, fontSize: 11, fontWeight: 600, border: "none", background: "#3B82F6", color: "#fff", cursor: "pointer" }}>Bước tiếp →</button>
                  )}
                </>
              ) : (
                <>
                  <button type="button" onClick={save} disabled={pending || !dirty} style={{ padding: "7px 14px", borderRadius: 7, fontSize: 11, fontWeight: 600, border: "none", background: "#F1F5F9", color: "#64748B", cursor: "pointer" }}>Lưu nháp</button>
                  <button type="button" onClick={markComplete} disabled={pending} style={{ padding: "7px 14px", borderRadius: 7, fontSize: 11, fontWeight: 600, border: "none", background: isApprovalStep ? "#16A34A" : "#7C3AED", color: "#fff", cursor: "pointer" }}>
                    {isApprovalStep ? "✓ Duyệt & Chuyển bước →" : "Hoàn thành & Chuyển bước →"}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
