// Types + pipeline helpers cho R&D — không import "server-only" để client dùng được.

export type RdCheckItem = { text: string; checked: boolean; done?: boolean; note?: string; verdict?: "pass" | "fail" | null };
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
      verdict: (item.verdict as "pass" | "fail" | null) || null,
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

type PipelineStep = { key: string; label: string; who?: string };

export const RESEARCH_PIPELINE: PipelineStep[] = [
  { key: "de_xuat",       label: "Đề xuất",      who: "proposer" },
  { key: "xac_nhan",      label: "Xác nhận",      who: "reviewer" },  // NV nhận việc HOẶC Leader duyệt ĐX
  { key: "nghien_cuu",    label: "Nghiên cứu",    who: "worker" },
  { key: "duyet_nc",      label: "Duyệt NC",      who: "leader" },
  { key: "dat_mau",       label: "Đặt mẫu",       who: "worker" },
  { key: "hang_ve",       label: "Hàng về",        who: "worker" },    // QC mẫu + checklist pass/fail
  { key: "duyet_mau",     label: "Duyệt mẫu",     who: "leader" },
  { key: "nhap_hang",     label: "Nhập hàng",      who: "worker" },
];

export const PRODUCTION_PIPELINE: PipelineStep[] = [
  { key: "tao_yc",        label: "Tạo yêu cầu",     who: "proposer" },
  { key: "nghien_cuu",    label: "Nghiên cứu",       who: "worker" },
  { key: "duyet_nc",      label: "Duyệt NC",         who: "leader" },
  { key: "dat_mau",       label: "Đặt mẫu",         who: "worker" },    // Tạo PO mẫu
  { key: "cho_mau_ve",    label: "Chờ mẫu về",      who: "worker" },    // Chờ PO cập nhật
  { key: "nhan_mau",      label: "Nhận mẫu & QC",   who: "worker" },    // QC checklist, pass/fail/huỷ
  { key: "duyet_mau",     label: "Duyệt mẫu",       who: "leader" },    // Leader duyệt mẫu
  { key: "dat_hang",      label: "Đặt hàng",        who: "worker" },    // Tạo PO nhập
];

export function getPipeline(rdType: string | null | undefined) {
  const t = String(rdType || "").toLowerCase();
  return t === "production" || t === "upgrade" || t === "mfg"
    ? PRODUCTION_PIPELINE
    : RESEARCH_PIPELINE;
}

/** Default QC checklist for "Hàng về" step */
export const DEFAULT_QC_CHECKLIST: RdCheckItem[] = [
  { text: "Đóng gói nguyên vẹn", checked: false, verdict: null },
  { text: "Kích thước đúng mô tả", checked: false, verdict: null },
  { text: "Chất lượng vật liệu", checked: false, verdict: null },
  { text: "Chức năng hoạt động", checked: false, verdict: null },
  { text: "Màu sắc / ngoại quan", checked: false, verdict: null },
];

/** Create blank pipeline steps JSON — step 1 active, rest locked */
export function createBlankSteps(rdType: string): RdStep[] {
  const pipeline = getPipeline(rdType);
  return pipeline.map((p, i) => ({
    id: i,
    label: p.label,
    who: p.who || "",
    status: i === 0 ? "active" as const : "locked" as const,
    assignee: "",
    assignee_name: "",
    deadline: "",
    result: "",
    checklist: (p.key === "hang_ve" || p.key === "nhan_mau") ? [...DEFAULT_QC_CHECKLIST] : [],
    links: [],
    photos: [],
    logs: [],
  }));
}
