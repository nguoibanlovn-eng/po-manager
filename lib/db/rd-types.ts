// Types + pipeline helpers cho R&D — không import "server-only" để client dùng được.

export type RdCheckItem = { text: string; checked: boolean; done?: boolean; note?: string };
export type RdLink = string | { tag?: string; url: string };

export type RdStep = {
  id: number;
  label: string;
  icon?: string;
  who?: string;
  desc?: string;
  phase?: string;
  phaseColor?: string;
  phaseBg?: string;
  phaseColorBg?: string;
  status: "locked" | "active" | "approved" | "skipped" | "rejected";
  assignee: string;
  assignee_name?: string;
  assigneeName?: string;
  deadline: string;
  result: string;
  checklist: RdCheckItem[];
  links: RdLink[];
  photos: string[];
  logs: Array<Record<string, unknown>>;
  kt_assignee?: string;
  kt_assignee_name?: string;
  [key: string]: unknown; // extra fields like sketch_link, tracking_status, etc.
};

export type RdItem = {
  id: string;
  name: string | null;
  source_url: string | null;
  stage: string | null;
  note: string | null;
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
  data: Record<string, unknown> | null;
  // Columns from migration (may not exist — code reads from data.* as fallback)
  rd_type: string | null;
  current_step: string | null;
  step_completed_at: Record<string, string> | null;
  step_data: Record<string, Record<string, unknown>> | null;
  checklists: Record<string, Array<{ label: string; checked: boolean; note?: string }>> | null;
};

/* ─── Helpers ─────────────────────────────────────────── */

function parseSteps(val: unknown): RdStep[] {
  if (!val) return [];
  let arr: unknown[];
  if (typeof val === "string") {
    try { arr = JSON.parse(val); } catch { return []; }
  } else if (Array.isArray(val)) {
    arr = val;
  } else {
    return [];
  }
  // Normalize each step
  return arr.map((raw) => {
    const s = raw as Record<string, unknown>;
    return {
      ...s,
      id: Number(s.id || 0),
      label: String(s.label || ""),
      status: (String(s.status || "locked") as RdStep["status"]),
      assignee: String(s.assignee || ""),
      assignee_name: String(s.assignee_name || s.assigneeName || ""),
      deadline: String(s.deadline || ""),
      result: String(s.result || ""),
      checklist: normalizeChecklist(s.checklist),
      links: Array.isArray(s.links) ? s.links : [],
      photos: Array.isArray(s.photos) ? s.photos : [],
      logs: Array.isArray(s.logs) ? s.logs : [],
    } as RdStep;
  });
}

/** Normalize checklist: handle both {checked} and {done} formats */
function normalizeChecklist(raw: unknown): RdCheckItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((c) => {
    const item = c as Record<string, unknown>;
    return {
      text: String(item.text || item.label || ""),
      checked: Boolean(item.checked ?? item.done ?? false),
      note: String(item.note || ""),
    };
  });
}

/** Get rd_type from column or data.rd_type */
export function getRdType(item: RdItem): string {
  const fromCol = item.rd_type;
  if (fromCol) return fromCol;
  const d = item.data as Record<string, unknown> | null;
  return String(d?.rd_type || "new").toLowerCase();
}

/** Is this a production/upgrade item? */
export function isProduction(item: RdItem): boolean {
  const t = getRdType(item);
  return t === "mfg" || t === "upgrade" || t === "production";
}

/** Get pipeline steps from the item's data JSON */
export function getSteps(item: RdItem): RdStep[] {
  const d = item.data as Record<string, unknown> | null;
  if (!d) return [];
  if (isProduction(item)) return parseSteps(d.mfg_steps_json);
  return parseSteps(d.new_steps_json);
}

/** Get the steps JSON key name */
export function getStepsKey(item: RdItem): string {
  return isProduction(item) ? "mfg_steps_json" : "new_steps_json";
}

/** Normalize link for display */
export function getLinkUrl(link: RdLink): string {
  if (typeof link === "string") return link;
  return link.url || "";
}
export function getLinkTag(link: RdLink): string {
  if (typeof link === "string") return "";
  return link.tag || "";
}

export const RESEARCH_PIPELINE = [
  { key: "nghien_cuu",    label: "Nghiên cứu" },
  { key: "duyet_de_xuat", label: "Duyệt đề xuất" },
  { key: "dat_mau",       label: "Đặt mẫu" },
  { key: "kiem_tra",      label: "Kiểm tra" },
  { key: "nhap",          label: "Nhập?" },
  { key: "ket_qua",       label: "Kết quả" },
];

export const PRODUCTION_PIPELINE = [
  { key: "tao_ticket",    label: "Tạo ticket" },
  { key: "nghien_cuu",    label: "Nghiên cứu" },
  { key: "duyet_b1",      label: "Duyệt B1" },
  { key: "giao_tk",       label: "Giao TK" },
  { key: "thiet_ke",      label: "Thiết kế" },
  { key: "duyet_2a",      label: "Duyệt 2A" },
  { key: "ncc_tracking",  label: "NCC+Tracking" },
  { key: "cho_mau_ve",    label: "Chờ mẫu về" },
  { key: "duyet_mau",     label: "Duyệt mẫu" },
  { key: "dat_hang",      label: "Đặt hàng" },
];

export function getPipeline(rdType: string | null | undefined) {
  const t = String(rdType || "").toLowerCase();
  return t === "production" || t === "upgrade" || t === "mfg"
    ? PRODUCTION_PIPELINE
    : RESEARCH_PIPELINE;
}
