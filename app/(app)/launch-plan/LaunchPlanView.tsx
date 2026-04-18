"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { formatVND, formatVNDCompact, toNum } from "@/lib/format";
import type { LaunchPlanRow } from "@/lib/db/plans";
import { deleteLaunchPlanAction, saveLaunchPlanAction } from "./actions";

type Tab = "ready" | "launching" | "done";
type InvItem = { sku: string; product_name: string; available_qty: number; category: string };

const BRAND = "#1D9E75";
const BRAND2 = "#185FA5";

const HORIZONS = [
  { k: "short", label: "Ngắn hạn", sub: "<3 tháng", color: "#16A34A" },
  { k: "medium", label: "Trung hạn", sub: "3-6T", color: "#D97706" },
  { k: "long", label: "Dài hạn", sub: ">6T", color: "#7C3AED" },
];
const LAUNCH_CHANNELS = ["Shopee", "TikTok", "Facebook", "Web"];
const CH_COLORS: Record<string, string> = { Shopee: "#EE4D2D", TikTok: "#000", Facebook: "#1877F2", Web: "#6366F1" };

type Metrics = {
  deploy_id?: string; product_desc?: string;
  phase1?: { horizon?: string; customer?: string; pain_point?: string };
  phase2?: { drive_link?: string; assignees?: string };
  phase3?: { sell_price?: number; sell_price_2?: number; cost?: number };
  phase4?: { channels?: Record<string, number>; stock_qty?: number; months?: number; deadline?: string; price_from?: number; price_to?: number };
  actual?: Record<string, number>; // actual sold per channel
  tier?: string;
  channels_selected?: string[];
  pricing?: { cost?: number; sell_price?: number };
  listings?: Record<string, { links?: string[]; done?: boolean }>;
  sales_target?: { stock_qty?: number; months?: number; channel_split?: Record<string, number>; confirmed?: boolean; price_from?: number; price_to?: number };
  content?: { drive_link?: string; assignees?: string };
  customer?: { group?: string; pain_point?: string };
  product_type?: string;
};

function M(plan: LaunchPlanRow): Metrics { return (plan.metrics as Metrics) || {}; }

function getProgress(m: Metrics): { totalTarget: number; totalActual: number; pct: number; status: string; color: string } {
  const ch = m.phase4?.channels || m.sales_target?.channel_split || {};
  const actual = m.actual || {};
  const totalTarget = Object.values(ch).reduce((s, v) => s + (v || 0), 0);
  const totalActual = Object.values(actual).reduce((s, v) => s + (v || 0), 0);
  const pct = totalTarget > 0 ? Math.round((totalActual / totalTarget) * 100) : 0;
  let status: string, color: string;
  if (pct >= 100) { status = "Vượt target"; color = "#16A34A"; }
  else if (pct >= 60) { status = "Đúng tiến độ"; color = "#3B82F6"; }
  else if (pct >= 40) { status = "Chậm"; color = "#D97706"; }
  else { status = "Cảnh báo"; color = "#DC2626"; }
  return { totalTarget, totalActual, pct, status, color };
}

function getPhaseChecks(m: Metrics): boolean[] {
  return [
    !!(m.phase1?.customer || m.customer?.group),
    !!(m.phase2?.drive_link || m.content?.drive_link),
    !!((m.phase3?.sell_price || m.pricing?.sell_price) && (m.phase3?.sell_price || m.pricing?.sell_price || 0) > 0),
    !!(m.phase4?.channels || m.sales_target?.confirmed),
  ];
}

/* ═══════════════════════════════════════════════════════════
   MAIN VIEW
   ═══════════════════════════════════════════════════════════ */
export default function LaunchPlanView({ plans }: { plans: LaunchPlanRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [tab, setTab] = useState<Tab>("ready");
  const [search, setSearch] = useState("");
  const [filterHorizon, setFilterHorizon] = useState("");
  const [filterProgress, setFilterProgress] = useState("");
  const [invSearch, setInvSearch] = useState("");
  const [invResults, setInvResults] = useState<InvItem[]>([]);
  const [invLoading, setInvLoading] = useState(false);
  const [formOpen, setFormOpen] = useState<{ sku?: string; name?: string; cost?: number } | null>(null);
  const [editPlan, setEditPlan] = useState<LaunchPlanRow | null>(null);

  const ready = useMemo(() => plans.filter((p) => p.stage === "DRAFT" || p.stage === "READY"), [plans]);
  const launching = useMemo(() => plans.filter((p) => p.stage === "LAUNCHED"), [plans]);
  const done = useMemo(() => plans.filter((p) => p.stage === "COMPLETED" || p.stage === "POSTPONED"), [plans]);

  // KPIs for Đang launch
  const launchKpis = useMemo(() => {
    let totalTarget = 0, totalActual = 0, needAttention = 0;
    for (const p of launching) {
      const pr = getProgress(M(p));
      totalTarget += pr.totalTarget;
      totalActual += pr.totalActual;
      if (pr.pct < 40) needAttention++;
    }
    const pct = totalTarget > 0 ? Math.round((totalActual / totalTarget) * 100) : 0;
    return { count: launching.length, totalTarget, totalActual, pct, needAttention };
  }, [launching]);

  // Channel progress
  const channelProgress = useMemo(() => {
    return LAUNCH_CHANNELS.map((ch) => {
      let target = 0, actual = 0;
      for (const p of launching) {
        const m = M(p);
        target += (m.phase4?.channels?.[ch] || m.sales_target?.channel_split?.[ch] || 0);
        actual += (m.actual?.[ch] || 0);
      }
      return { name: ch, target, actual, pct: target > 0 ? Math.round((actual / target) * 100) : 0 };
    });
  }, [launching]);

  // Inventory search
  const searchInventory = useCallback(async (q: string) => {
    if (!q.trim()) { setInvResults([]); return; }
    setInvLoading(true);
    try {
      const res = await fetch(`/api/inventory/search?q=${encodeURIComponent(q)}&limit=20`);
      const json = await res.json();
      setInvResults(json.items || []);
    } catch { setInvResults([]); }
    finally { setInvLoading(false); }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => searchInventory(invSearch), 300);
    return () => clearTimeout(t);
  }, [invSearch, searchInventory]);

  function del(id: string, name: string) {
    if (!confirm(`Xoá launch plan "${name}"?`)) return;
    startTransition(async () => { const r = await deleteLaunchPlanAction(id); if (!r.ok) alert(r.error); else router.refresh(); });
  }

  // Filter lists
  function filterList(list: LaunchPlanRow[]) {
    let result = list;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((p) => (p.product_name || "").toLowerCase().includes(q) || (p.sku || "").toLowerCase().includes(q));
    }
    if (filterHorizon) {
      result = result.filter((p) => (M(p).phase1?.horizon || M(p).product_type) === filterHorizon);
    }
    if (filterProgress && tab === "launching") {
      result = result.filter((p) => getProgress(M(p)).status === filterProgress);
    }
    // Sort: cảnh báo lên đầu for launching tab
    if (tab === "launching") {
      result.sort((a, b) => getProgress(M(a)).pct - getProgress(M(b)).pct);
    }
    return result;
  }

  return (
    <section className="section">
      {/* ═══ HEADER ═══ */}
      <div className="page-hdr">
        <div>
          <div className="page-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 26, height: 26, borderRadius: "50%", background: BRAND, color: "#fff", fontSize: 13 }}>🚀</span>
            Launch sản phẩm
          </div>
          <div className="page-sub">{plans.length} SP · {launching.length} đang launch · {done.length} hoàn tất</div>
        </div>
      </div>

      {/* ═══ KPIs + Channel Progress (only for launching tab) ═══ */}
      {tab === "launching" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr) 1fr", gap: 10, marginBottom: 12, alignItems: "start" }}>
          <div className="stat-card" style={{ borderLeft: `4px solid ${BRAND}` }}>
            <div className="sl">SẴN SÀNG</div><div className="sv">{ready.length}</div>
          </div>
          <div className="stat-card" style={{ borderLeft: "4px solid #D97706" }}>
            <div className="sl">ĐANG LAUNCH</div><div className="sv">{launchKpis.count}</div>
          </div>
          <div className="stat-card" style={{ borderLeft: "4px solid #3B82F6" }}>
            <div className="sl">ĐÃ BÁN / TARGET</div>
            <div className="sv">{launchKpis.totalActual} / {launchKpis.totalTarget}</div>
            <div className="ss">{launchKpis.pct}% hoàn thành</div>
          </div>
          <div className="stat-card" style={{ borderLeft: "4px solid #DC2626" }}>
            <div className="sl">CẦN CHÚ Ý</div>
            <div className="sv" style={{ color: launchKpis.needAttention > 0 ? "#DC2626" : "#16A34A" }}>{launchKpis.needAttention} SP</div>
          </div>
          {/* Channel progress */}
          <div className="card" style={{ padding: "10px 14px" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#6B7280", marginBottom: 6 }}>TIẾN ĐỘ THEO KÊNH</div>
            {channelProgress.map((ch) => (
              <div key={ch.name} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, fontSize: 10 }}>
                <span style={{ width: 55, color: CH_COLORS[ch.name], fontWeight: 600 }}>{ch.name}</span>
                <div style={{ flex: 1, height: 6, background: "#F3F4F6", borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${Math.min(ch.pct, 100)}%`, background: CH_COLORS[ch.name], borderRadius: 3 }} />
                </div>
                <span style={{ width: 30, textAlign: "right", fontWeight: 600 }}>{ch.pct}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══ TABS + FILTERS inline ═══ */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <div className="mini-tabs" style={{ marginBottom: 0 }}>
          {([["ready", `Sẵn sàng launch ${ready.length}`], ["launching", `Đang launch ${launching.length}`], ["done", "Hoàn tất"]] as const).map(([k, label]) => (
            <button key={k} className={"mini-tab" + (tab === k ? " active" : "")} onClick={() => setTab(k)}>{label}</button>
          ))}
        </div>
        <select value={filterHorizon} onChange={(e) => setFilterHorizon(e.target.value)} style={{ fontSize: 11 }}>
          <option value="">Tất cả loại hàng</option>
          {HORIZONS.map((h) => <option key={h.k} value={h.k}>{h.label}</option>)}
        </select>
        {tab === "launching" && (
          <select value={filterProgress} onChange={(e) => setFilterProgress(e.target.value)} style={{ fontSize: 11 }}>
            <option value="">Tất cả tiến độ</option>
            <option value="Vượt target">Vượt target</option>
            <option value="Đúng tiến độ">Đúng tiến độ</option>
            <option value="Chậm">Chậm</option>
            <option value="Cảnh báo">Cảnh báo</option>
          </select>
        )}
        <input placeholder="Tìm SP, SKU..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: 160, fontSize: 12 }} />
        {/* Inventory search */}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: BRAND2, whiteSpace: "nowrap" }}>TÌM SP TRONG KHO:</span>
          <input placeholder="Tên SP, SKU..." value={invSearch} onChange={(e) => setInvSearch(e.target.value)}
            style={{ padding: "5px 10px", border: `1.5px solid ${BRAND2}`, borderRadius: 6, fontSize: 12, width: 200 }} />
          <button className="btn btn-sm" style={{ background: BRAND2, color: "#fff" }} onClick={() => searchInventory(invSearch)}>Tìm</button>
        </div>
      </div>

      {/* Inventory results dropdown */}
      {invResults.length > 0 && (
        <div className="card" style={{ padding: 0, marginBottom: 12, border: `2px solid ${BRAND2}` }}>
          <div style={{ padding: "8px 14px", background: "#EFF6FF", borderBottom: "1px solid #BFDBFE", display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: BRAND2 }}>Kết quả ({invResults.length})</span>
            <button className="btn btn-ghost btn-xs" onClick={() => { setInvResults([]); setInvSearch(""); }}>Đóng</button>
          </div>
          {invResults.map((item) => (
            <div key={item.sku} style={{ padding: "8px 14px", borderBottom: "1px solid #F3F4F6", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <span style={{ fontWeight: 600, fontSize: 12 }}>{item.product_name}</span>
                <span style={{ fontSize: 10, color: "#6B7280", marginLeft: 8 }}>SKU: {item.sku} · Tồn: {item.available_qty.toLocaleString("vi-VN")}</span>
              </div>
              <button className="btn btn-sm" style={{ background: BRAND, color: "#fff", fontSize: 11 }} onClick={() => { setFormOpen({ sku: item.sku, name: item.product_name }); setInvResults([]); setInvSearch(""); }}>
                🚀 Tạo Launch Plan
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ═══ TAB: SẴN SÀNG ═══ */}
      {tab === "ready" && (
        <div className="card" style={{ padding: 0 }}>
          {filterList(ready).map((p) => {
            const m = M(p);
            const hz = HORIZONS.find((h) => h.k === (m.phase1?.horizon || m.product_type));
            const listings = m.listings || {};
            return (
              <div key={p.id} style={{ padding: "10px 14px", borderBottom: "1px solid #F3F4F6", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 2 }}>
                    {m.deploy_id && <span style={{ fontSize: 8, background: BRAND, color: "#fff", borderRadius: 3, padding: "1px 5px", fontWeight: 600 }}>TỪ TRIỂN KHAI</span>}
                    {hz && <span style={{ fontSize: 8, background: hz.color, color: "#fff", borderRadius: 3, padding: "1px 5px", fontWeight: 600 }}>{hz.label}</span>}
                    <span style={{ fontWeight: 700, fontSize: 13 }}>{p.product_name}</span>
                  </div>
                  <div style={{ fontSize: 10, color: "#6B7280" }}>
                    SKU: {p.sku || "—"}
                    {(m.pricing?.sell_price || m.phase3?.sell_price) ? ` · Giá: ${formatVND(m.pricing?.sell_price || m.phase3?.sell_price || 0)}` : ""}
                  </div>
                  {/* Deploy channel status */}
                  <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                    {["Facebook", "TikTok", "Shopee", "Web"].map((ch) => {
                      const key = ch === "TikTok" ? "TikTok Shop" : ch === "Web" ? "Web/B2B" : ch;
                      const isDone = listings[key]?.done;
                      return (
                        <span key={ch} style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, fontWeight: 600, background: isDone ? CH_COLORS[ch] : "#F3F4F6", color: isDone ? "#fff" : "#9CA3AF" }}>
                          {ch.substring(0, 2)} {isDone ? "✓" : "—"}
                        </span>
                      );
                    })}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 4 }}>
                  <button className="btn btn-sm" style={{ background: BRAND, color: "#fff", fontSize: 11 }} onClick={() => setEditPlan(p)}>🚀 Tạo Launch Plan</button>
                  <button className="btn btn-ghost btn-xs" style={{ color: "#DC2626" }} onClick={() => del(p.id, p.product_name || "")}>✕</button>
                </div>
              </div>
            );
          })}
          {filterList(ready).length === 0 && <div className="muted" style={{ padding: 24, textAlign: "center" }}>Không có SP sẵn sàng.</div>}
        </div>
      )}

      {/* ═══ TAB: ĐANG LAUNCH ═══ */}
      {tab === "launching" && (
        <div>
          {filterList(launching).map((p) => {
            const m = M(p);
            const hz = HORIZONS.find((h) => h.k === (m.phase1?.horizon || m.product_type));
            const pr = getProgress(m);
            const phases = getPhaseChecks(m);
            const phaseLabels = ["Định vị", "Content", "Giá", "Target"];
            const chTargets = m.phase4?.channels || m.sales_target?.channel_split || {};
            const chActuals = m.actual || {};
            const isWarning = pr.pct < 40;
            const sellPrice = m.phase3?.sell_price || m.pricing?.sell_price || 0;
            const deadline = m.phase4?.deadline || "";
            const months = m.phase4?.months || m.sales_target?.months || 0;

            return (
              <div key={p.id} className="card" style={{ marginBottom: 8, padding: "14px 16px", borderLeft: isWarning ? "4px solid #DC2626" : `4px solid ${pr.color}` }}>
                <div style={{ display: "flex", gap: 12 }}>
                  {/* Left: product info */}
                  <div style={{ width: 260, flexShrink: 0 }}>
                    <div style={{ display: "flex", gap: 4, marginBottom: 4, flexWrap: "wrap" }}>
                      {hz && <span style={{ fontSize: 9, background: hz.color, color: "#fff", borderRadius: 3, padding: "1px 6px", fontWeight: 600 }}>{hz.label}</span>}
                      {isWarning && <span style={{ fontSize: 9, background: "#DC2626", color: "#fff", borderRadius: 3, padding: "1px 6px", fontWeight: 600 }}>Cảnh báo</span>}
                      <span style={{ fontSize: 9, background: pr.color, color: "#fff", borderRadius: 3, padding: "1px 6px", fontWeight: 600 }}>{pr.status}</span>
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 2 }}>{p.product_name}</div>
                    <div style={{ fontSize: 10, color: "#6B7280", marginBottom: 6 }}>{p.sku || "—"}</div>
                    {/* Phase checklist */}
                    <div style={{ display: "flex", gap: 8 }}>
                      {phaseLabels.map((label, i) => (
                        <span key={label} style={{ fontSize: 9, color: phases[i] ? "#16A34A" : "#D1D5DB", display: "flex", alignItems: "center", gap: 2 }}>
                          <span style={{ width: 12, height: 12, borderRadius: "50%", border: phases[i] ? "none" : "1.5px solid #D1D5DB", background: phases[i] ? "#16A34A" : "transparent", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 7, color: "#fff" }}>
                            {phases[i] ? "✓" : ""}
                          </span>
                          {label}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Middle: channel progress bars */}
                  <div style={{ flex: 1 }}>
                    {LAUNCH_CHANNELS.map((ch) => {
                      const target = chTargets[ch] || 0;
                      const actual = chActuals[ch] || 0;
                      const chPct = target > 0 ? Math.round((actual / target) * 100) : 0;
                      if (target === 0) return null;
                      return (
                        <div key={ch} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                          <span style={{ fontSize: 10, width: 55, color: CH_COLORS[ch], fontWeight: 600 }}>{ch}</span>
                          <div style={{ flex: 1, height: 8, background: "#F3F4F6", borderRadius: 4, overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${Math.min(chPct, 100)}%`, background: CH_COLORS[ch], borderRadius: 4 }} />
                          </div>
                          <span style={{ fontSize: 9, width: 55, textAlign: "right", color: "#6B7280" }}>{actual}/{target}</span>
                          <span style={{ fontSize: 9, width: 30, textAlign: "right", fontWeight: 700, color: chPct >= 100 ? "#16A34A" : chPct >= 40 ? "#3B82F6" : "#DC2626" }}>{chPct}%</span>
                        </div>
                      );
                    })}
                    {/* Overall progress */}
                    <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 10, width: 55, fontWeight: 700 }}>Tổng</span>
                      <div style={{ flex: 1, height: 10, background: "#F3F4F6", borderRadius: 4, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${Math.min(pr.pct, 100)}%`, background: pr.color, borderRadius: 4 }} />
                      </div>
                      <span style={{ fontSize: 10, width: 55, textAlign: "right", color: "#6B7280" }}>{pr.totalActual}/{pr.totalTarget}</span>
                      <span style={{ fontSize: 10, width: 30, textAlign: "right", fontWeight: 800, color: pr.color }}>{pr.pct}%</span>
                    </div>
                  </div>

                  {/* Right: target + meta */}
                  <div style={{ width: 120, textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontSize: 10, color: "#6B7280" }}>Target</div>
                    <div style={{ fontSize: 18, fontWeight: 800 }}>{pr.totalTarget} <span style={{ fontSize: 10, fontWeight: 400 }}>SP</span></div>
                    {sellPrice > 0 && <div style={{ fontSize: 10, color: "#6B7280", marginTop: 2 }}>Giá: {formatVNDCompact(sellPrice)}</div>}
                    {deadline && <div style={{ fontSize: 10, color: "#6B7280" }}>DL: {deadline}</div>}
                    {months > 0 && <div style={{ fontSize: 10, color: "#6B7280" }}>{months} tháng</div>}
                    <button className="btn btn-ghost btn-xs" style={{ marginTop: 6 }} onClick={() => setEditPlan(p)}>✎ Xem plan</button>
                  </div>
                </div>
              </div>
            );
          })}
          {filterList(launching).length === 0 && <div className="muted" style={{ padding: 24, textAlign: "center" }}>Chưa có SP đang launch.</div>}
        </div>
      )}

      {/* ═══ TAB: HOÀN TẤT ═══ */}
      {tab === "done" && (
        <div className="card" style={{ padding: 0 }}>
          {filterList(done).map((p) => (
            <div key={p.id} style={{ padding: "10px 14px", borderBottom: "1px solid #F3F4F6", display: "flex", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontWeight: 600 }}>{p.product_name}</div>
                <div style={{ fontSize: 10, color: "#6B7280" }}>SKU: {p.sku || "—"}</div>
              </div>
              <span className={`chip ${p.stage === "COMPLETED" ? "chip-green" : "chip-amber"}`}>{p.stage === "COMPLETED" ? "Hoàn tất" : "Hoãn"}</span>
            </div>
          ))}
          {filterList(done).length === 0 && <div className="muted" style={{ padding: 24, textAlign: "center" }}>Chưa có SP hoàn tất.</div>}
        </div>
      )}

      {/* ═══ FORM MODAL — 4 Phase ═══ */}
      {(formOpen || editPlan) && (
        <LaunchFormModal
          initial={editPlan}
          defaultSku={formOpen?.sku} defaultName={formOpen?.name} defaultCost={formOpen?.cost}
          onClose={() => { setFormOpen(null); setEditPlan(null); }}
          onSaved={() => { setFormOpen(null); setEditPlan(null); router.refresh(); }}
          pending={pending} startTransition={startTransition}
        />
      )}
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════
   LAUNCH FORM MODAL — 4 Phases
   ═══════════════════════════════════════════════════════════ */
function LaunchFormModal({ initial, defaultSku, defaultName, defaultCost, onClose, onSaved, pending, startTransition }: {
  initial: LaunchPlanRow | null;
  defaultSku?: string; defaultName?: string; defaultCost?: number;
  onClose: () => void; onSaved: () => void;
  pending: boolean; startTransition: ReturnType<typeof useTransition>[1];
}) {
  const m = initial ? M(initial) : {} as Metrics;
  const [phase, setPhase] = useState(1);
  const [sku] = useState(initial?.sku || defaultSku || "");
  const [name] = useState(initial?.product_name || defaultName || "");

  // Phase 1
  const [horizon, setHorizon] = useState(m.phase1?.horizon || m.product_type || "medium");
  const [customer, setCustomer] = useState(m.phase1?.customer || m.customer?.group || "");
  const [painPoint, setPainPoint] = useState(m.phase1?.pain_point || m.customer?.pain_point || "");

  // Phase 2
  const [driveLink, setDriveLink] = useState(m.phase2?.drive_link || m.content?.drive_link || "");
  const [assignees, setAssignees] = useState(m.phase2?.assignees || m.content?.assignees || "");

  // Phase 3
  const cost = m.phase3?.cost || m.pricing?.cost || defaultCost || 0;
  const [sellPrice, setSellPrice] = useState(m.phase3?.sell_price || m.pricing?.sell_price || 0);
  const [sellPrice2, setSellPrice2] = useState(m.phase3?.sell_price_2 || 0);
  const markup = cost > 0 ? Math.round(((sellPrice - cost) / cost) * 100) : 0;

  // Phase 4
  const [channels, setChannels] = useState<Record<string, number>>(m.phase4?.channels || m.sales_target?.channel_split || { Shopee: 0, TikTok: 0, Facebook: 0, Web: 0 });
  const [stockQty, setStockQty] = useState(m.phase4?.stock_qty || m.sales_target?.stock_qty || 0);
  const [months, setMonths] = useState(m.phase4?.months || m.sales_target?.months || 4);
  const [deadline, setDeadline] = useState(m.phase4?.deadline || "");
  const [priceFrom, setPriceFrom] = useState(m.phase4?.price_from || m.sales_target?.price_from || 0);
  const [priceTo, setPriceTo] = useState(m.phase4?.price_to || m.sales_target?.price_to || 0);

  const totalChTarget = Object.values(channels).reduce((s, v) => s + (v || 0), 0);

  function save(asStage?: string) {
    if (!name.trim()) return alert("Nhập tên SP");
    const metrics: Metrics = {
      ...m,
      phase1: { horizon, customer, pain_point: painPoint },
      phase2: { drive_link: driveLink, assignees },
      phase3: { sell_price: sellPrice, sell_price_2: sellPrice2, cost },
      phase4: { channels, stock_qty: stockQty, months, deadline, price_from: priceFrom, price_to: priceTo },
      product_type: horizon,
      pricing: { cost, sell_price: sellPrice },
      customer: { group: customer, pain_point: painPoint },
      content: { drive_link: driveLink, assignees },
      sales_target: { stock_qty: stockQty, months, channel_split: channels, confirmed: true, price_from: priceFrom, price_to: priceTo },
    };
    startTransition(async () => {
      const r = await saveLaunchPlanAction(initial?.id || null, {
        sku: sku || null, product_name: name, stage: asStage || initial?.stage || "READY",
        channels: Object.keys(channels).filter((k) => channels[k] > 0).join(","),
        metrics: metrics as Record<string, unknown>, note: null,
      });
      if (!r.ok) alert(r.error); else onSaved();
    });
  }

  const PHASES = [
    { n: 1, label: "Định vị SP" },
    { n: 2, label: "Content" },
    { n: 3, label: "Định giá" },
    { n: 4, label: "Target kênh" },
  ];

  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", zIndex: 100, display: "flex", justifyContent: "center", alignItems: "flex-start", paddingTop: 40, overflowY: "auto" }}>
      <div style={{ background: "#fff", borderRadius: 12, width: "90%", maxWidth: 700, maxHeight: "85vh", overflowY: "auto", padding: "20px 24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>🚀 Launch Plan</div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "#6B7280" }}>✕</button>
        </div>

        {/* Product info bar */}
        <div style={{ padding: "10px 14px", background: "#F0FDF4", borderRadius: 8, marginBottom: 16, border: `1px solid ${BRAND}40` }}>
          <div style={{ fontWeight: 700, fontSize: 13 }}>{name}</div>
          <div style={{ fontSize: 10, color: "#6B7280" }}>SKU: {sku} {cost > 0 && `· Vốn: ${formatVND(cost)}`}</div>
        </div>

        {/* Phase nav */}
        <div style={{ display: "flex", gap: 0, marginBottom: 20, borderBottom: "2px solid #E5E7EB" }}>
          {PHASES.map((s) => (
            <button key={s.n} onClick={() => setPhase(s.n)} style={{
              flex: 1, padding: "8px 0", fontSize: 12, fontWeight: phase === s.n ? 700 : 400,
              color: phase === s.n ? BRAND : "#6B7280", background: "none", border: "none",
              borderBottom: phase === s.n ? `3px solid ${BRAND}` : "3px solid transparent",
              cursor: "pointer", marginBottom: -2,
            }}>
              {s.n}. {s.label}
            </button>
          ))}
        </div>

        {/* Phase 1: Định vị */}
        {phase === 1 && (
          <div>
            <div style={{ fontWeight: 700, marginBottom: 10 }}>Phase 1 — Định vị sản phẩm</div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: "#6B7280", display: "block", marginBottom: 4 }}>Loại hàng</label>
              <div style={{ display: "flex", gap: 8 }}>
                {HORIZONS.map((h) => (
                  <button key={h.k} onClick={() => setHorizon(h.k)} style={{
                    padding: "8px 16px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer",
                    background: horizon === h.k ? h.color : "#F3F4F6", color: horizon === h.k ? "#fff" : "#374151", border: "none",
                  }}>{h.label} {h.sub}</button>
                ))}
              </div>
            </div>
            <div className="form-group" style={{ marginBottom: 10 }}><label>Khách hàng mục tiêu</label><textarea rows={2} value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="Hộ gia đình, tuổi, đặc điểm..." /></div>
            <div className="form-group"><label>Pain point</label><textarea rows={2} value={painPoint} onChange={(e) => setPainPoint(e.target.value)} placeholder="Lo ngại, vấn đề cần giải quyết..." /></div>
          </div>
        )}

        {/* Phase 2: Content */}
        {phase === 2 && (
          <div>
            <div style={{ fontWeight: 700, marginBottom: 10 }}>Phase 2 — Content &amp; hình ảnh</div>
            <div className="form-group" style={{ marginBottom: 10 }}><label>Link Google Drive folder ảnh/video</label><input value={driveLink} onChange={(e) => setDriveLink(e.target.value)} placeholder="https://drive.google.com/..." /></div>
            <div className="form-group"><label>Người phụ trách content</label><input value={assignees} onChange={(e) => setAssignees(e.target.value)} placeholder="Minh, Hương, Lan..." /></div>
          </div>
        )}

        {/* Phase 3: Định giá */}
        {phase === 3 && (
          <div>
            <div style={{ fontWeight: 700, marginBottom: 10 }}>Phase 3 — Định giá</div>
            <div className="form-grid fg-3" style={{ marginBottom: 12 }}>
              <div className="form-group"><label>Giá bán chính</label><input type="number" value={sellPrice || ""} onChange={(e) => setSellPrice(Number(e.target.value))} /></div>
              <div className="form-group"><label>Giá bán 2 (variant)</label><input type="number" value={sellPrice2 || ""} onChange={(e) => setSellPrice2(Number(e.target.value))} /></div>
              <div style={{ padding: "8px 0" }}>
                <div style={{ fontSize: 10, color: "#6B7280" }}>Markup từ vốn</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: markup >= 50 ? "#16A34A" : markup >= 20 ? "#D97706" : "#DC2626" }}>+{markup}%</div>
                <div style={{ fontSize: 10, color: "#6B7280" }}>Vốn: {formatVND(cost)}</div>
              </div>
            </div>
          </div>
        )}

        {/* Phase 4: Target */}
        {phase === 4 && (
          <div>
            <div style={{ fontWeight: 700, marginBottom: 10 }}>Phase 4 — Target theo kênh</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 12 }}>
              {LAUNCH_CHANNELS.map((ch) => (
                <div key={ch} style={{ border: "1px solid #E5E7EB", borderRadius: 8, padding: "8px 10px", textAlign: "center" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: CH_COLORS[ch] }}>{ch}</div>
                  <input type="number" value={channels[ch] || ""} min={0} style={{ width: "100%", textAlign: "center", fontSize: 16, fontWeight: 800, border: "none", background: "transparent" }}
                    onChange={(e) => setChannels({ ...channels, [ch]: Number(e.target.value) })} />
                  <div style={{ fontSize: 9, color: "#6B7280" }}>SP target</div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 12 }}>Tổng target: <strong>{totalChTarget} SP</strong></div>
            <div className="form-grid fg-3" style={{ marginBottom: 10 }}>
              <div className="form-group"><label>Tồn kho</label><input type="number" value={stockQty || ""} onChange={(e) => setStockQty(Number(e.target.value))} /></div>
              <div className="form-group"><label>Số tháng</label><input type="number" value={months || ""} onChange={(e) => setMonths(Number(e.target.value))} /></div>
              <div className="form-group"><label>Deadline</label><input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} /></div>
            </div>
            <div className="form-grid fg-2">
              <div className="form-group"><label>Giá thị trường từ</label><input type="number" value={priceFrom || ""} onChange={(e) => setPriceFrom(Number(e.target.value))} /></div>
              <div className="form-group"><label>đến</label><input type="number" value={priceTo || ""} onChange={(e) => setPriceTo(Number(e.target.value))} /></div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 20, paddingTop: 16, borderTop: "1px solid #E5E7EB" }}>
          <div>{phase > 1 && <button className="btn btn-ghost btn-sm" onClick={() => setPhase(phase - 1)}>← Trước</button>}</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-ghost btn-sm" onClick={onClose}>Huỷ</button>
            <button className="btn btn-ghost btn-sm" onClick={() => save("READY")} disabled={pending}>Lưu nháp</button>
            {phase < 4 ? (
              <button className="btn btn-sm" style={{ background: BRAND, color: "#fff" }} onClick={() => setPhase(phase + 1)}>Tiếp →</button>
            ) : (
              <button className="btn btn-sm" style={{ background: BRAND, color: "#fff" }} onClick={() => save("LAUNCHED")} disabled={pending}>✓ Bắt đầu launch</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
