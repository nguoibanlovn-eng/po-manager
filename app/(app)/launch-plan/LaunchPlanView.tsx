"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { formatVND, formatVNDCompact, toNum } from "@/lib/format";
import type { LaunchPlanRow } from "@/lib/db/plans";
import { deleteLaunchPlanAction, saveLaunchPlanAction } from "./actions";

type Tab = "ready" | "launching" | "done";
type InvItem = { sku: string; product_name: string; available_qty: number; category: string; cost_price?: number; sell_price?: number };

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
                <span style={{ fontSize: 10, color: "#6B7280", marginLeft: 8 }}>SKU: {item.sku} · Tồn: {item.available_qty.toLocaleString("vi-VN")}{item.cost_price ? ` · Vốn: ${formatVND(item.cost_price)}` : ""}</span>
              </div>
              <button className="btn btn-sm" style={{ background: BRAND, color: "#fff", fontSize: 11 }} onClick={() => { setFormOpen({ sku: item.sku, name: item.product_name, cost: item.cost_price || 0 }); setInvResults([]); setInvSearch(""); }}>
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
   LAUNCH FORM MODAL — 7 Steps
   ═══════════════════════════════════════════════════════════ */
const ALL_CHANNELS = ["Facebook", "TikTok Shop", "Shopee", "Web/B2B", "Live stream"];
const CH_CHIP_COLORS: Record<string, string> = { Facebook: "#1877F2", "TikTok Shop": "#FE2C55", Shopee: "#EE4D2D", "Web/B2B": "#6366F1", "Live stream": "#16A34A" };
const SCENARIOS_SAN = [
  { label: "Xả hàng", fees: "Sàn 20%", calc: (B: number) => B * 0.20 },
  { label: "Bán thường", fees: "Sàn 20%, Thuế 1.5%, HT 7k, VH 10%", calc: (B: number) => B * 0.20 + B * 0.015 + 7000 + B * 0.10 },
  { label: "Có ads", fees: "+Ads 10%", calc: (B: number) => B * 0.20 + B * 0.015 + 7000 + B * 0.10 + B * 0.10 },
  { label: "Ads + Aff", fees: "+Aff 10%", calc: (B: number) => B * 0.20 + B * 0.015 + 7000 + B * 0.10 + B * 0.10 + B * 0.10 },
];
const SCENARIOS_OFF = [
  { label: "Xả hàng", fees: "Thuế 1.5%", calc: (B: number) => B * 0.015 },
  { label: "Bán thường", fees: "Thuế 1.5%, VH 10%", calc: (B: number) => B * 0.015 + B * 0.10 },
  { label: "Có ads", fees: "+Ads 10%", calc: (B: number) => B * 0.015 + B * 0.10 + B * 0.10 },
  { label: "Ads + CTV", fees: "+CTV 10%", calc: (B: number) => B * 0.015 + B * 0.10 + B * 0.10 + B * 0.10 },
];
const VIDEO_TYPES = [
  { type: "problem", label: "Vấn đề", color: "#DC2626", default: 3 },
  { type: "demo", label: "Chứng minh", color: "#D97706", default: 2 },
  { type: "cta", label: "Chốt đơn", color: "#16A34A", default: 2 },
];

function LaunchFormModal({ initial, defaultSku, defaultName, defaultCost, onClose, onSaved, pending, startTransition }: {
  initial: LaunchPlanRow | null;
  defaultSku?: string; defaultName?: string; defaultCost?: number;
  onClose: () => void; onSaved: () => void;
  pending: boolean; startTransition: ReturnType<typeof useTransition>[1];
}) {
  const m = initial ? M(initial) : {} as Metrics;
  const [step, setStep] = useState(1);
  const [sku] = useState(initial?.sku || defaultSku || "");
  const [name] = useState(initial?.product_name || defaultName || "");
  const [cost, setCost] = useState(m.phase3?.cost || m.pricing?.cost || defaultCost || 0);

  // Step 1 — Loại hàng
  const [horizon, setHorizon] = useState(m.phase1?.horizon || m.product_type || "medium");
  const [horizonNote, setHorizonNote] = useState((m as Record<string, unknown>).horizonNote as string || "");
  // Step 2 — Khách hàng
  const [custGroup, setCustGroup] = useState(m.phase1?.customer || m.customer?.group || "");
  const [custPain, setCustPain] = useState(m.phase1?.pain_point || m.customer?.pain_point || "");
  const [custComp, setCustComp] = useState((m as Record<string, unknown>).competitors as string || "");
  // Step 3 — Kênh bán
  const [selChannels, setSelChannels] = useState<string[]>(m.channels_selected || (m.phase4?.channels ? Object.keys(m.phase4.channels).filter((k) => (m.phase4?.channels?.[k] || 0) > 0) : ["Facebook", "TikTok Shop", "Shopee"]));
  const [channelNote, setChannelNote] = useState((m as Record<string, unknown>).channelNote as string || "");
  // Step 4 — Định giá
  const [sellB1, setSellB1] = useState(m.phase3?.sell_price || m.pricing?.sell_price || 0);
  const [sellB2, setSellB2] = useState(m.phase3?.sell_price_2 || 0);
  const [promoType, setPromoType] = useState("none");
  const [gift, setGift] = useState<{ name: string; sku: string; cost: number } | null>(null);
  const [giftQty, setGiftQty] = useState(1);
  const [showGiftSearch, setShowGiftSearch] = useState(false);
  const [giftSearch, setGiftSearch] = useState("");
  const [giftResults, setGiftResults] = useState<InvItem[]>([]);
  const [giftSearching, setGiftSearching] = useState(false);
  // Combo items: nhiều SP gộp thành 1 combo
  const [comboItems, setComboItems] = useState<Array<{ name: string; sku: string; cost: number; qty: number }>>([]);
  const [comboQty, setComboQty] = useState(1); // SL SP chính trong combo
  const [showComboSearch, setShowComboSearch] = useState(false);
  const [comboSearch, setComboSearch] = useState("");
  const [comboResults, setComboResults] = useState<InvItem[]>([]);
  const [comboSearching, setComboSearching] = useState(false);
  const giftCostTotal = gift ? gift.cost * giftQty : 0;
  const comboCostTotal = comboItems.reduce((s, c) => s + c.cost * c.qty, 0);
  const A = promoType === "combo" ? cost * comboQty + comboCostTotal : cost + giftCostTotal;
  const gross = sellB1 > 0 ? sellB1 - A : 0;
  const grossPct = sellB1 > 0 ? (gross / sellB1 * 100).toFixed(1) : "0";
  // Step 5 — Listing
  const [listings, setListings] = useState<Record<string, { links: string; done: boolean }>>(
    Object.fromEntries(ALL_CHANNELS.map((ch) => [ch, { links: (m.listings?.[ch]?.links || []).join("\n"), done: m.listings?.[ch]?.done || false }]))
  );
  // Step 6 — Nội dung
  const [driveLink, setDriveLink] = useState(m.phase2?.drive_link || m.content?.drive_link || "");
  const [assignees, setAssignees] = useState(m.phase2?.assignees || m.content?.assignees || "");
  const [videos, setVideos] = useState(VIDEO_TYPES.map((vt) => {
    const existing = (m.content as Record<string, unknown>)?.targets;
    const arr = Array.isArray(existing) ? existing : [];
    const found = arr.find((t: Record<string, unknown>) => t.type === vt.type);
    return { type: vt.type, count: (found as Record<string, number>)?.videos ?? vt.default };
  }));
  // Step 7 — Target
  const [chTargets, setChTargets] = useState<Record<string, number>>(m.phase4?.channels || m.sales_target?.channel_split || {});
  const [stockQty, setStockQty] = useState(m.phase4?.stock_qty || m.sales_target?.stock_qty || 0);
  const [months, setMonths] = useState(m.phase4?.months || m.sales_target?.months || 4);
  const [deadline, setDeadline] = useState(m.phase4?.deadline || "");
  const [priceFrom, setPriceFrom] = useState(m.phase4?.price_from || m.sales_target?.price_from || 0);
  const [priceTo, setPriceTo] = useState(m.phase4?.price_to || m.sales_target?.price_to || 0);

  const totalTarget = Object.values(chTargets).reduce((s, v) => s + (v || 0), 0);

  // Step completion check
  const stepDone = [
    !!horizon,
    !!custGroup,
    selChannels.length > 0,
    sellB1 > 0,
    Object.values(listings).some((l) => l.done),
    !!driveLink || !!assignees,
    totalTarget > 0,
  ];

  const STEPS = [
    { n: 1, label: "Loại hàng" }, { n: 2, label: "Khách hàng" }, { n: 3, label: "Kênh bán" },
    { n: 4, label: "Định giá" }, { n: 5, label: "Listing" }, { n: 6, label: "Nội dung" }, { n: 7, label: "Target DS" },
  ];

  function save(asStage?: string) {
    if (!name.trim()) return alert("Nhập tên SP");
    const metrics: Metrics = {
      ...m, product_type: horizon, horizonNote,
      phase1: { horizon, customer: custGroup, pain_point: custPain }, competitors: custComp,
      channels_selected: selChannels, channelNote,
      phase3: { sell_price: sellB1, sell_price_2: sellB2, cost },
      pricing: { cost, sell_price: sellB1 },
      listings: Object.fromEntries(Object.entries(listings).map(([ch, v]) => [ch, { links: v.links.split("\n").map((l) => l.trim()).filter(Boolean), done: v.done }])),
      phase2: { drive_link: driveLink, assignees }, content: { drive_link: driveLink, assignees },
      phase4: { channels: chTargets, stock_qty: stockQty, months, deadline, price_from: priceFrom, price_to: priceTo },
      sales_target: { stock_qty: stockQty, months, channel_split: chTargets, confirmed: true, price_from: priceFrom, price_to: priceTo },
      customer: { group: custGroup, pain_point: custPain },
    } as Metrics;
    startTransition(async () => {
      const r = await saveLaunchPlanAction(initial?.id || null, {
        sku: sku || null, product_name: name, stage: asStage || initial?.stage || "READY",
        channels: selChannels.join(","), metrics: metrics as Record<string, unknown>, note: horizonNote || null,
      });
      if (!r.ok) alert(r.error); else onSaved();
    });
  }

  const FEE_CHIPS: Record<string, { bg: string; color: string }> = {
    "Sàn 20%": { bg: "#FAECE7", color: "#993C1D" }, "Thuế 1.5%": { bg: "#EEEDFE", color: "#3C3489" },
    "HT 7k": { bg: "#E6F1FB", color: "#0C447C" }, "VH 10%": { bg: "#FAEEDA", color: "#633806" },
    "Ads 10%": { bg: "#F1EFE8", color: "#444441" }, "Aff 10%": { bg: "#EAF3DE", color: "#27500A" },
    "CTV 10%": { bg: "#EAF3DE", color: "#27500A" },
  };

  function profitColor(v: number, B: number): string {
    const pct = B > 0 ? (v / B) * 100 : 0;
    if (v < 0) return "#DC2626";
    if (pct < 5) return "#D97706";
    return "#16A34A";
  }

  function ScenarioTable({ chips, subtitle, scenarios, A, B1, B2 }: {
    chips: Array<{ label: string; bg: string; color: string }>; subtitle: string;
    scenarios: typeof SCENARIOS_SAN; A: number; B1: number; B2: number;
  }) {
    const SCENARIO_FEES: string[][] = [
      scenarios === SCENARIOS_SAN ? ["Sàn 20%", "Thuế 1.5%", "HT 7k"] : ["Thuế 1.5%"],
      scenarios === SCENARIOS_SAN ? ["Sàn 20%", "Thuế 1.5%", "HT 7k", "VH 10%"] : ["Thuế 1.5%", "VH 10%"],
      scenarios === SCENARIOS_SAN ? ["Sàn 20%", "Thuế 1.5%", "HT 7k", "VH 10%", "Ads 10%"] : ["Thuế 1.5%", "VH 10%", "Ads 10%"],
      scenarios === SCENARIOS_SAN ? ["Sàn 20%", "Thuế 1.5%", "HT 7k", "VH 10%", "Ads 10%", "Aff 10%"] : ["Thuế 1.5%", "VH 10%", "Ads 10%", "CTV 10%"],
    ];

    return (
      <div style={{ border: "0.5px solid #E5E7EB", borderRadius: 8, overflow: "hidden" }}>
        {/* Header */}
        <div style={{ padding: "8px 10px", display: "flex", alignItems: "center", gap: 6, borderBottom: "1px solid #E5E7EB" }}>
          {chips.map((c) => (
            <span key={c.label} style={{ fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 4, background: c.bg, color: c.color }}>{c.label}</span>
          ))}
          <span style={{ fontSize: 9, color: "#9CA3AF" }}>{subtitle}</span>
        </div>
        {/* Header row */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 110px 110px", padding: "5px 10px", background: "var(--bg)", borderBottom: "1px solid #E5E7EB", fontSize: 9, fontWeight: 700, color: "#6B7280" }}>
          <span>Kịch bản</span>
          <span style={{ textAlign: "right" }}>Lãi @ B1</span>
          <span style={{ textAlign: "right", background: B2 > 0 ? "#EAF3DE" : undefined, color: B2 > 0 ? "#27500A" : "#D1D5DB", padding: "0 4px", borderRadius: 3 }}>Lãi @ B2</span>
        </div>
        {/* Rows */}
        {scenarios.map((s, i) => {
          const fee1 = s.calc(B1); const p1 = B1 - A - fee1; const pct1 = B1 > 0 ? (p1 / B1 * 100).toFixed(1) : "0";
          const fee2 = B2 > 0 ? s.calc(B2) : 0; const p2 = B2 > 0 ? B2 - A - fee2 : 0; const pct2 = B2 > 0 ? (p2 / B2 * 100).toFixed(1) : "";
          return (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 110px 110px", padding: "6px 10px", borderBottom: "1px solid #F3F4F6", alignItems: "start" }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 12 }}>① {s.label}</div>
                <div style={{ display: "flex", gap: 3, flexWrap: "wrap", marginTop: 2 }}>
                  {SCENARIO_FEES[i].map((f) => (
                    <span key={f} style={{ fontSize: 8, padding: "1px 4px", borderRadius: 3, background: FEE_CHIPS[f]?.bg || "#F3F4F6", color: FEE_CHIPS[f]?.color || "#6B7280", fontWeight: 600 }}>{f}</span>
                  ))}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <span style={{ fontWeight: 700, fontSize: 11, color: profitColor(p1, B1) }}>{p1 >= 0 ? "+" : ""}{formatVNDCompact(p1)}</span>
                <div style={{ fontSize: 9, color: profitColor(p1, B1) }}>{pct1}%</div>
              </div>
              <div style={{ textAlign: "right" }}>
                {B2 > 0 ? (
                  <>
                    <span style={{ fontWeight: 700, fontSize: 11, color: profitColor(p2, B2) }}>{p2 >= 0 ? "+" : ""}{formatVNDCompact(p2)}</span>
                    <div style={{ fontSize: 9, color: profitColor(p2, B2) }}>{pct2}%</div>
                  </>
                ) : <span style={{ color: "#D1D5DB", fontSize: 11 }}>—</span>}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  const sectionStyle = { background: "#fff", border: "1px solid #E4E4E7", borderRadius: 10, padding: 14, marginBottom: 12 };
  const secTitle = (num: number, label: string, color: string) => (
    <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ width: 22, height: 22, borderRadius: "50%", background: color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: "#fff", flexShrink: 0 }}>{num}</span>
      {label}
    </div>
  );

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 100, display: "flex", justifyContent: "center", alignItems: "stretch", padding: "40px 16px 16px" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#F5F5F7", width: "100%", maxWidth: 760, borderRadius: 16, boxShadow: "0 25px 50px rgba(0,0,0,.25)", display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* Fixed header */}
        <div style={{ background: "#fff", borderBottom: "1px solid #E4E4E7", padding: "14px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 16 }}>{initial ? "Sửa Launch Plan" : "Tạo Launch Plan"}</div>
          <button onClick={onClose} style={{ background: "#F4F4F5", border: "none", fontSize: 16, cursor: "pointer", color: "#52525B", width: 34, height: 34, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>✕</button>
        </div>

        {/* Scrollable content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px 16px" }}>

        {/* SP header */}
        <div style={{ padding: "10px 14px", background: "#F0FDF4", borderRadius: 10, marginBottom: 14, display: "flex", alignItems: "center", gap: 12, border: "1px solid #BBF7D0" }}>
          <div style={{ width: 40, height: 40, borderRadius: 8, background: "#DCFCE7", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>📦</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{name} {m.deploy_id && <span style={{ fontSize: 9, background: BRAND, color: "#fff", borderRadius: 3, padding: "1px 5px", fontWeight: 600, marginLeft: 4 }}>✓ Liên kết</span>}</div>
            <div style={{ fontSize: 10, color: "#6B7280" }}>SKU: {sku} {cost > 0 && `· Vốn: ${formatVND(cost)}`} {stockQty > 0 && `· Tồn: ${stockQty}`}</div>
          </div>
        </div>

        {/* ═══ Section 1: Phân loại & Khách hàng ═══ */}
        <div style={sectionStyle}>
          {secTitle(1, "Phân loại & Khách hàng", BRAND)}
          <div className="form-group" style={{ marginBottom: 10 }}>
            <label>CHU KỲ BÁN</label>
            <div style={{ display: "flex", gap: 6 }}>
              {HORIZONS.map((h) => (
                <button key={h.k} onClick={() => setHorizon(h.k)} style={{ padding: "6px 14px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer", background: horizon === h.k ? h.color : "#F3F4F6", color: horizon === h.k ? "#fff" : "#374151", border: "none", flex: 1 }}>{h.label} {h.sub}</button>
              ))}
            </div>
          </div>
          <div className="form-grid fg-2" style={{ marginBottom: 10 }}>
            <div className="form-group"><label>NHÓM KHÁCH HÀNG</label><textarea rows={2} value={custGroup} onChange={(e) => setCustGroup(e.target.value)} placeholder="Hộ gia đình, tuổi, đặc điểm..." /></div>
            <div className="form-group"><label>NHU CẦU / PAIN POINT</label><textarea rows={2} value={custPain} onChange={(e) => setCustPain(e.target.value)} placeholder="Vấn đề cần giải quyết..." /></div>
          </div>
          <div className="form-group"><label>ĐỐI THỦ + GIÁ THAM CHIẾU</label><input value={custComp} onChange={(e) => setCustComp(e.target.value)} placeholder="Xiaomi 1.2tr · Sharp 2.5tr..." /></div>
          <div className="form-group"><label>GHI CHÚ</label><textarea rows={2} value={horizonNote} onChange={(e) => setHorizonNote(e.target.value)} placeholder="Lý do phân loại, đặc điểm hàng hóa..." /></div>
        </div>

        {/* ═══ Section 2: Kênh bán ═══ */}
        <div style={sectionStyle}>
          {secTitle(2, "Kênh bán", "#1877F2")}
          <div className="form-group" style={{ marginBottom: 8 }}>
            <label>CHỌN KÊNH</label>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {ALL_CHANNELS.map((ch) => {
                const on = selChannels.includes(ch);
                return (<button key={ch} onClick={() => setSelChannels(on ? selChannels.filter((c) => c !== ch) : [...selChannels, ch])} style={{ padding: "6px 14px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer", background: on ? CH_CHIP_COLORS[ch] || "#3B82F6" : "#F3F4F6", color: on ? "#fff" : "#374151", border: "none" }}>{ch}</button>);
              })}
            </div>
          </div>
          <div className="form-group"><label>GHI CHÚ KÊNH</label><input value={channelNote} onChange={(e) => setChannelNote(e.target.value)} placeholder="Ưu tiên kênh nào, lý do..." /></div>
        </div>

        {/* ═══ Section 3: Định giá & CTKM ═══ */}
        <div style={sectionStyle}>
          {secTitle(3, "Định giá & CTKM", "#D97706")}

          {/* Chương trình bán */}
          <div style={{ background: "var(--bg)", border: "0.5px solid #E5E7EB", borderRadius: 8, padding: "10px 12px", marginBottom: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.5, color: "#6B7280", marginBottom: 6 }}>CHƯƠNG TRÌNH BÁN <span style={{ fontWeight: 400, fontSize: 9, color: "#9CA3AF" }}>— giá vốn quà cộng vào A</span></div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
              <select value={promoType} onChange={(e) => { setPromoType(e.target.value); if (e.target.value !== "gift") { setGift(null); setShowGiftSearch(false); } if (e.target.value !== "combo") { setComboItems([]); setShowComboSearch(false); setComboQty(1); } }} style={{ width: 140, fontSize: 11 }}>
                <option value="none">Không có</option><option value="gift">Tặng kèm quà</option><option value="combo">Combo set</option><option value="flash">Flash sale</option><option value="discount">Giảm trực tiếp</option>
              </select>
              {promoType === "gift" && (<>
                <span style={{ fontSize: 11, color: "#6B7280" }}>Quà tặng:</span>
                {gift ? <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: "#EAF3DE", color: "#3B6D11", fontWeight: 600 }}>{gift.name} ({formatVND(gift.cost)})</span> : <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: "#F3F4F6", color: "#9CA3AF" }}>Chưa chọn</span>}
                <button type="button" className="btn btn-ghost btn-xs" style={{ fontSize: 10 }} onClick={() => setShowGiftSearch(!showGiftSearch)}>{gift ? "Đổi" : "Chọn"}</button>
                {gift && (<><span style={{ fontSize: 11, color: "#6B7280" }}>SL:</span><input type="number" value={giftQty} min={1} onChange={(e) => setGiftQty(Math.max(1, Number(e.target.value)))} style={{ width: 50, textAlign: "center", fontSize: 11 }} /></>)}
              </>)}
              {promoType === "combo" && (<>
                <span style={{ fontSize: 11, color: "#6B7280" }}>SL SP chính:</span>
                <input type="number" value={comboQty} min={1} onChange={(e) => setComboQty(Math.max(1, Number(e.target.value)))} style={{ width: 50, textAlign: "center", fontSize: 11 }} />
                <button type="button" className="btn btn-ghost btn-xs" style={{ fontSize: 10, color: BRAND2 }} onClick={() => setShowComboSearch(!showComboSearch)}>+ Thêm SP combo</button>
              </>)}
            </div>
            {/* Gift search */}
            {promoType === "gift" && showGiftSearch && (
              <div style={{ marginBottom: 8, padding: "8px 10px", background: "#fff", border: `1.5px solid ${BRAND2}`, borderRadius: 8 }}>
                <input placeholder="Tìm SP quà tặng trong kho..." value={giftSearch} onChange={(e) => { setGiftSearch(e.target.value); const q = e.target.value; if (q.trim().length > 1) { setGiftSearching(true); fetch(`/api/inventory/search?q=${encodeURIComponent(q)}&limit=10`).then((r) => r.json()).then((j) => setGiftResults(j.items || [])).finally(() => setGiftSearching(false)); } else { setGiftResults([]); } }} style={{ width: "100%", fontSize: 11, border: "1px solid #E5E7EB", borderRadius: 4, padding: "4px 8px", marginBottom: 4 }} />
                {giftSearching && <div style={{ fontSize: 10, color: "#6B7280" }}>Đang tìm...</div>}
                {giftResults.map((item) => (
                  <div key={item.sku} style={{ padding: "4px 0", borderBottom: "1px solid #F3F4F6", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11 }}>
                    <span><strong>{item.product_name}</strong> <span style={{ color: "#6B7280" }}>Vốn: {item.cost_price ? formatVND(item.cost_price) : "—"}</span></span>
                    <button type="button" className="btn btn-ghost btn-xs" style={{ color: BRAND2 }} onClick={() => { setGift({ name: item.product_name, sku: item.sku, cost: item.cost_price || 0 }); setShowGiftSearch(false); setGiftSearch(""); setGiftResults([]); }}>Chọn</button>
                  </div>
                ))}
              </div>
            )}
            {/* Combo search */}
            {promoType === "combo" && showComboSearch && (
              <div style={{ marginBottom: 8, padding: "8px 10px", background: "#fff", border: `1.5px solid ${BRAND2}`, borderRadius: 8 }}>
                <input placeholder="Tìm SP thêm vào combo..." value={comboSearch} onChange={(e) => { setComboSearch(e.target.value); const q = e.target.value; if (q.trim().length > 1) { setComboSearching(true); fetch(`/api/inventory/search?q=${encodeURIComponent(q)}&limit=10`).then((r) => r.json()).then((j) => setComboResults(j.items || [])).finally(() => setComboSearching(false)); } else { setComboResults([]); } }} style={{ width: "100%", fontSize: 11, border: "1px solid #E5E7EB", borderRadius: 4, padding: "4px 8px", marginBottom: 4 }} />
                {comboSearching && <div style={{ fontSize: 10, color: "#6B7280" }}>Đang tìm...</div>}
                {comboResults.map((item) => (
                  <div key={item.sku} style={{ padding: "4px 0", borderBottom: "1px solid #F3F4F6", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11 }}>
                    <span><strong>{item.product_name}</strong> <span style={{ color: "#6B7280" }}>Vốn: {item.cost_price ? formatVND(item.cost_price) : "—"}</span></span>
                    <button type="button" className="btn btn-ghost btn-xs" style={{ color: BRAND2 }} onClick={() => { setComboItems((prev) => [...prev, { name: item.product_name, sku: item.sku, cost: item.cost_price || 0, qty: 1 }]); setShowComboSearch(false); setComboSearch(""); setComboResults([]); }}>Thêm</button>
                  </div>
                ))}
              </div>
            )}
            {/* Combo items list */}
            {promoType === "combo" && comboItems.length > 0 && (
              <div style={{ marginBottom: 6, padding: "6px 10px", background: "#F0FDF4", borderRadius: 6, fontSize: 11 }}>
                {comboItems.map((ci, idx) => (
                  <div key={ci.sku + idx} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 0", borderBottom: idx < comboItems.length - 1 ? "1px solid #E5E7EB" : "none" }}>
                    <span style={{ flex: 1, fontWeight: 600 }}>{ci.name}</span>
                    <span style={{ color: "#6B7280", fontSize: 10 }}>Vốn: {formatVND(ci.cost)}</span><span style={{ color: "#6B7280" }}>×</span>
                    <input type="number" value={ci.qty} min={1} onChange={(e) => setComboItems((prev) => prev.map((p, i) => i === idx ? { ...p, qty: Math.max(1, Number(e.target.value)) } : p))} style={{ width: 42, textAlign: "center", fontSize: 11 }} />
                    <span style={{ fontWeight: 700, color: BRAND2, minWidth: 70, textAlign: "right" }}>{formatVND(ci.cost * ci.qty)}</span>
                    <button type="button" onClick={() => setComboItems((prev) => prev.filter((_, i) => i !== idx))} style={{ background: "none", border: "none", color: "#DC2626", cursor: "pointer", fontSize: 13, padding: 0 }}>×</button>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, flexWrap: "wrap" }}>
              <span style={{ color: "#6B7280" }}>Vốn gốc</span><strong>{formatVND(cost)}{promoType === "combo" && comboQty > 1 ? ` × ${comboQty}` : ""}</strong>
              {gift && promoType === "gift" && <span style={{ color: "#6B7280" }}>+ Quà {formatVND(gift.cost)} × {giftQty} = {formatVND(giftCostTotal)}</span>}
              {promoType === "combo" && comboItems.length > 0 && <span style={{ color: "#6B7280" }}>+ Combo {formatVND(comboCostTotal)}</span>}
              <span style={{ color: "#6B7280" }}>→</span>
              <strong style={{ color: BRAND2, fontSize: 13 }}>A = {formatVND(A)}</strong>
            </div>
          </div>

          {/* Giá bán */}
          <div style={{ background: "var(--bg)", border: "0.5px solid #E5E7EB", borderRadius: 8, padding: "9px 12px", marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
              <div><div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.5, color: "#6B7280" }}>GIÁ VỐN A</div><div style={{ fontSize: 18, fontWeight: 800, color: BRAND2 }}>{formatVND(A)}</div></div>
              <span style={{ fontSize: 16, color: "#D1D5DB" }}>→</span>
              <div><div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.5, color: "#6B7280" }}>GIÁ BÁN TỪ (B1)</div><input type="text" inputMode="numeric" value={sellB1 ? sellB1.toLocaleString("vi-VN") : ""} onChange={(e) => setSellB1(Number(e.target.value.replace(/\D/g, "")))} placeholder="Giá thấp..." style={{ fontSize: 17, fontWeight: 800, width: 120, border: "none", background: "transparent", borderBottom: "1.5px solid #E5E7EB" }} /></div>
              <span style={{ fontSize: 14, color: "#D1D5DB" }}>—</span>
              <div><div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.5, color: "#6B7280" }}>ĐẾN (B2)</div><input type="text" inputMode="numeric" value={sellB2 ? sellB2.toLocaleString("vi-VN") : ""} onChange={(e) => setSellB2(Number(e.target.value.replace(/\D/g, "")))} placeholder="Giá cao..." style={{ fontSize: 17, fontWeight: 800, width: 120, border: "none", background: "transparent", borderBottom: "1.5px solid #E5E7EB" }} /></div>
              {sellB1 > 0 && (<><div style={{ width: 0.5, height: 28, background: "#E5E7EB", margin: "0 4px" }} /><div><div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.5, color: "#6B7280" }}>GROSS (B−A)</div><div style={{ fontSize: 18, fontWeight: 800, color: gross >= 0 ? "#16A34A" : "#DC2626" }}>{gross >= 0 ? "+" : ""}{formatVND(gross)} <span style={{ fontSize: 11, fontWeight: 600 }}>({grossPct}%)</span></div></div></>)}
            </div>
          </div>

          {/* 2 bảng kịch bản */}
          {sellB1 > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <ScenarioTable chips={[{ label: "Shopee", bg: "#FAECE7", color: "#993C1D" }, { label: "TikTok", bg: "#FBEAF0", color: "#993556" }]} subtitle="Sàn 20%+Thuế+HT 7k" scenarios={SCENARIOS_SAN} A={A} B1={sellB1} B2={sellB2} />
              <ScenarioTable chips={[{ label: "Facebook", bg: "#E6F1FB", color: "#185FA5" }, { label: "Web/B2B", bg: "#EEEDFE", color: "#3C3489" }]} subtitle="Thuế 1.5%, không phí sàn" scenarios={SCENARIOS_OFF} A={A} B1={sellB1} B2={sellB2} />
            </div>
          )}
        </div>

        {/* ═══ Section 4: Listing ═══ */}
        <div style={sectionStyle}>
          {secTitle(4, "Listing", "#EE4D2D")}
          {selChannels.map((ch) => (
            <div key={ch} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", border: "1px solid #E5E7EB", borderRadius: 8, marginBottom: 6 }}>
              <input type="checkbox" checked={listings[ch]?.done || false} onChange={(e) => setListings({ ...listings, [ch]: { ...listings[ch], done: e.target.checked } })} style={{ accentColor: "#16A34A" }} />
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: CH_CHIP_COLORS[ch], flexShrink: 0 }} />
              <span style={{ fontSize: 12, fontWeight: 600, minWidth: 80 }}>{ch}</span>
              <input type="text" placeholder={`Link ${ch}...`} value={(listings[ch]?.links || "").split("\n")[0]} onChange={(e) => setListings({ ...listings, [ch]: { ...listings[ch], links: e.target.value } })} style={{ flex: 1, padding: "4px 8px", border: "1px solid #E5E7EB", borderRadius: 6, fontSize: 11 }} />
            </div>
          ))}
          {selChannels.length === 0 && <div style={{ color: "#9CA3AF", fontSize: 12, textAlign: "center", padding: 16 }}>Chọn kênh bán ở section 2 trước</div>}
        </div>

        {/* ═══ Section 5: Nội dung & Mục tiêu ═══ */}
        <div style={sectionStyle}>
          {secTitle(5, "Nội dung & Mục tiêu", "#7C3AED")}

          <div className="form-grid fg-2" style={{ marginBottom: 10 }}>
            <div className="form-group"><label>LINK DRIVE TÀI LIỆU</label><input value={driveLink} onChange={(e) => setDriveLink(e.target.value)} placeholder="https://drive.google.com/..." /></div>
            <div className="form-group"><label>NGƯỜI PHỤ TRÁCH</label><input value={assignees} onChange={(e) => setAssignees(e.target.value)} placeholder="Tên nhân sự..." /></div>
          </div>

          {/* Video targets */}
          <div style={{ fontSize: 10, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", marginBottom: 6 }}>Video cần sản xuất</div>
          {VIDEO_TYPES.map((vt, vi) => (
            <div key={vt.type} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", border: "1px solid #E5E7EB", borderRadius: 8, marginBottom: 4 }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: vt.color, flexShrink: 0 }} />
              <span style={{ fontSize: 12, fontWeight: 600, flex: 1 }}>{vt.label} <span style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 400 }}>— {vt.type === "problem" ? "Đặt vấn đề" : vt.type === "demo" ? "Chứng minh" : "Chốt đơn"}</span></span>
              <input type="number" value={videos[vi].count} min={0} style={{ width: 50, textAlign: "center", fontSize: 12, padding: "3px 6px", border: "1px solid #E5E7EB", borderRadius: 6 }} onChange={(e) => { const arr = [...videos]; arr[vi] = { ...arr[vi], count: Number(e.target.value) }; setVideos(arr); }} />
            </div>
          ))}

          <div style={{ height: 1, background: "#E5E7EB", margin: "12px 0" }} />

          {/* Channel targets */}
          <div style={{ fontSize: 10, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", marginBottom: 6 }}>Mục tiêu bán theo kênh (đơn vị SP)</div>
          {selChannels.map((ch) => (
            <div key={ch} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", border: "1px solid #E5E7EB", borderRadius: 8, marginBottom: 4 }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: CH_CHIP_COLORS[ch], flexShrink: 0 }} />
              <span style={{ fontSize: 12, fontWeight: 600, flex: 1 }}>{ch}</span>
              <input type="number" value={chTargets[ch] || ""} min={0} style={{ width: 70, textAlign: "right", fontSize: 12, padding: "3px 6px", border: "1px solid #E5E7EB", borderRadius: 6 }} onChange={(e) => setChTargets({ ...chTargets, [ch]: Number(e.target.value) })} />
            </div>
          ))}
          {totalTarget > 0 && <div style={{ textAlign: "right", fontSize: 12, fontWeight: 800, color: BRAND, marginTop: 4 }}>Tổng: {totalTarget} SP</div>}

          <div style={{ height: 1, background: "#E5E7EB", margin: "12px 0" }} />

          <div className="form-grid fg-3">
            <div className="form-group"><label>Tồn kho cần bán</label><input type="number" value={stockQty || ""} onChange={(e) => setStockQty(Number(e.target.value))} /></div>
            <div className="form-group"><label>Số tháng</label><input type="number" value={months || ""} onChange={(e) => setMonths(Number(e.target.value))} /></div>
            <div className="form-group"><label>Deadline</label><input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} /></div>
          </div>
          <div className="form-grid fg-2">
            <div className="form-group"><label>Giá thị trường từ</label><input type="text" inputMode="numeric" value={priceFrom ? priceFrom.toLocaleString("vi-VN") : ""} onChange={(e) => setPriceFrom(Number(e.target.value.replace(/\D/g, "")))} /></div>
            <div className="form-group"><label>đến</label><input type="text" inputMode="numeric" value={priceTo ? priceTo.toLocaleString("vi-VN") : ""} onChange={(e) => setPriceTo(Number(e.target.value.replace(/\D/g, "")))} /></div>
          </div>
        </div>

        </div>{/* end scrollable content */}

        {/* Fixed footer */}
        <div style={{ background: "#fff", borderTop: "1px solid #E4E4E7", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 20px", flexShrink: 0 }}>
          <div style={{ fontSize: 11, color: "#6B7280" }}>{stepDone.filter(Boolean).length}/{stepDone.length} mục đã điền</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-ghost btn-sm" onClick={onClose}>Huỷ</button>
            <button className="btn btn-ghost btn-sm" onClick={() => save("READY")} disabled={pending}>Lưu nháp</button>
            <button className="btn btn-sm" style={{ background: BRAND, color: "#fff", padding: "8px 20px" }} onClick={() => save("LAUNCHED")} disabled={pending}>Bắt đầu launch →</button>
          </div>
        </div>
      </div>
    </div>
  );
}
