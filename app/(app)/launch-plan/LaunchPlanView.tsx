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
  const giftCostTotal = gift ? gift.cost * giftQty : 0;
  const A = cost + giftCostTotal;
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
        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr 1fr", padding: "5px 10px", background: "var(--bg)", borderBottom: "1px solid #E5E7EB", fontSize: 9, fontWeight: 700, color: "#6B7280" }}>
          <span>Kịch bản</span>
          <span style={{ textAlign: "right" }}>Lãi @ B1</span>
          <span style={{ textAlign: "right", background: B2 > 0 ? "#EAF3DE" : undefined, color: B2 > 0 ? "#27500A" : "#D1D5DB", padding: "0 4px", borderRadius: 3 }}>Lãi @ B2</span>
        </div>
        {/* Rows */}
        {scenarios.map((s, i) => {
          const fee1 = s.calc(B1); const p1 = B1 - A - fee1; const pct1 = B1 > 0 ? (p1 / B1 * 100).toFixed(1) : "0";
          const fee2 = B2 > 0 ? s.calc(B2) : 0; const p2 = B2 > 0 ? B2 - A - fee2 : 0; const pct2 = B2 > 0 ? (p2 / B2 * 100).toFixed(1) : "";
          return (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "auto 1fr 1fr", padding: "6px 10px", borderBottom: "1px solid #F3F4F6", alignItems: "start" }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 12 }}>① {s.label}</div>
                <div style={{ display: "flex", gap: 3, flexWrap: "wrap", marginTop: 2 }}>
                  {SCENARIO_FEES[i].map((f) => (
                    <span key={f} style={{ fontSize: 8, padding: "1px 4px", borderRadius: 3, background: FEE_CHIPS[f]?.bg || "#F3F4F6", color: FEE_CHIPS[f]?.color || "#6B7280", fontWeight: 600 }}>{f}</span>
                  ))}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <span style={{ fontWeight: 700, fontSize: 12, color: profitColor(p1, B1) }}>{p1 >= 0 ? "+" : ""}{formatVND(p1)}</span>
                <div style={{ fontSize: 9, color: profitColor(p1, B1) }}>{pct1}%</div>
              </div>
              <div style={{ textAlign: "right" }}>
                {B2 > 0 ? (
                  <>
                    <span style={{ fontWeight: 700, fontSize: 12, color: profitColor(p2, B2) }}>{p2 >= 0 ? "+" : ""}{formatVND(p2)}</span>
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

  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", zIndex: 100, display: "flex", justifyContent: "center", alignItems: "flex-start", paddingTop: 30, overflowY: "auto" }}>
      <div style={{ background: "#fff", borderRadius: 12, width: "92%", maxWidth: 850, maxHeight: "88vh", overflowY: "auto", padding: "20px 24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>Tạo Launch Plan</div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "#6B7280" }}>✕</button>
        </div>

        {/* Step nav — numbers green when done */}
        <div style={{ display: "flex", gap: 0, marginBottom: 16, borderBottom: "2px solid #E5E7EB" }}>
          {STEPS.map((s) => (
            <button key={s.n} onClick={() => setStep(s.n)} style={{
              flex: 1, padding: "6px 0", fontSize: 11, fontWeight: step === s.n ? 700 : 400,
              color: step === s.n ? BRAND : stepDone[s.n - 1] ? "#16A34A" : "#9CA3AF",
              background: "none", border: "none", borderBottom: step === s.n ? `3px solid ${BRAND}` : "3px solid transparent",
              cursor: "pointer", marginBottom: -2,
            }}>
              <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 16, height: 16, borderRadius: "50%", background: stepDone[s.n - 1] ? "#16A34A" : step === s.n ? BRAND : "#E5E7EB", color: "#fff", fontSize: 9, fontWeight: 700, marginRight: 3 }}>{s.n}</span>
              {s.label}
            </button>
          ))}
        </div>

        {/* SP header */}
        <div style={{ padding: "8px 14px", background: "#F0FDF4", borderRadius: 8, marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13 }}>{name} {m.deploy_id && <span style={{ fontSize: 9, background: BRAND, color: "#fff", borderRadius: 3, padding: "1px 5px", fontWeight: 600, marginLeft: 4 }}>✓ Liên kết</span>}</div>
            <div style={{ fontSize: 10, color: "#6B7280" }}>SKU: {sku} {cost > 0 && `· Vốn: ${formatVND(cost)}`}</div>
          </div>
        </div>

        {/* ─── STEP 1: Loại hàng ─── */}
        {step === 1 && (<div>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            {HORIZONS.map((h) => (
              <button key={h.k} onClick={() => setHorizon(h.k)} style={{ padding: "8px 16px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer", background: horizon === h.k ? h.color : "#F3F4F6", color: horizon === h.k ? "#fff" : "#374151", border: "none" }}>{h.label} {h.sub}</button>
            ))}
          </div>
          <div className="form-group"><label>GHI CHÚ</label><textarea rows={3} value={horizonNote} onChange={(e) => setHorizonNote(e.target.value)} placeholder="Lý do phân loại, đặc điểm hàng hóa..." /></div>
        </div>)}

        {/* ─── STEP 2: Khách hàng ─── */}
        {step === 2 && (<div className="form-grid fg-3">
          <div className="form-group"><label>NHÓM KHÁCH HÀNG</label><textarea rows={3} value={custGroup} onChange={(e) => setCustGroup(e.target.value)} placeholder="Hộ gia đình, tuổi, đặc điểm..." /></div>
          <div className="form-group"><label>NHU CẦU / PAIN POINT</label><textarea rows={3} value={custPain} onChange={(e) => setCustPain(e.target.value)} placeholder="Lo ngại, vấn đề cần giải quyết..." /></div>
          <div className="form-group"><label>ĐỐI THỦ + GIÁ THAM CHIẾU</label><textarea rows={3} value={custComp} onChange={(e) => setCustComp(e.target.value)} placeholder="Xiaomi 1.2tr · Sharp 2.5tr..." /></div>
        </div>)}

        {/* ─── STEP 3: Kênh bán ─── */}
        {step === 3 && (<div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
            {ALL_CHANNELS.map((ch) => {
              const on = selChannels.includes(ch);
              return (<button key={ch} onClick={() => setSelChannels(on ? selChannels.filter((c) => c !== ch) : [...selChannels, ch])} style={{ padding: "6px 14px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer", background: on ? CH_CHIP_COLORS[ch] || "#3B82F6" : "#F3F4F6", color: on ? "#fff" : "#374151", border: "none" }}>{ch}</button>);
            })}
          </div>
          <div className="form-group"><label>GHI CHÚ KÊNH</label><textarea rows={2} value={channelNote} onChange={(e) => setChannelNote(e.target.value)} placeholder="Ưu tiên kênh nào, lý do..." /></div>
        </div>)}

        {/* ─── STEP 4: Định giá & chương trình bán ─── */}
        {/* ─── STEP 4: Định giá & chương trình bán ─── */}
        {step === 4 && (<div>
          {/* Block 1 — Chương trình bán */}
          <div style={{ background: "var(--bg)", border: "0.5px solid #E5E7EB", borderRadius: 8, padding: "10px 12px", marginBottom: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.5, color: "#6B7280", marginBottom: 6 }}>CHƯƠNG TRÌNH BÁN <span style={{ fontWeight: 400, fontSize: 9, color: "#9CA3AF" }}>— giá vốn quà cộng vào A</span></div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
              <select value={promoType} onChange={(e) => setPromoType(e.target.value)} style={{ width: 140, fontSize: 11 }}>
                <option value="none">Không có</option><option value="gift">Tặng kèm quà</option><option value="combo">Combo set</option><option value="flash">Flash sale</option><option value="discount">Giảm trực tiếp</option>
              </select>
              <span style={{ fontSize: 11, color: "#6B7280" }}>Quà tặng:</span>
              {gift ? (
                <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: "#EAF3DE", color: "#3B6D11", fontWeight: 600 }}>{gift.name} ({formatVND(gift.cost)})</span>
              ) : (
                <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: "#F3F4F6", color: "#9CA3AF" }}>Chưa chọn</span>
              )}
              <button type="button" className="btn btn-ghost btn-xs" style={{ fontSize: 10 }} onClick={() => setShowGiftSearch(!showGiftSearch)}>
                {gift ? "Đổi" : "Chọn"}
              </button>
            </div>
            {showGiftSearch && (
              <div style={{ marginBottom: 8, padding: "8px 10px", background: "#fff", border: "1.5px solid #185FA5", borderRadius: 8 }}>
                <input placeholder="Tìm SP quà tặng trong kho..." value={giftSearch}
                  onChange={(e) => {
                    setGiftSearch(e.target.value);
                    const q = e.target.value;
                    if (q.trim().length > 1) {
                      setGiftSearching(true);
                      fetch(`/api/inventory/search?q=${encodeURIComponent(q)}&limit=10`).then((r) => r.json()).then((j) => setGiftResults(j.items || [])).finally(() => setGiftSearching(false));
                    } else { setGiftResults([]); }
                  }}
                  style={{ width: "100%", fontSize: 11, border: "1px solid #E5E7EB", borderRadius: 4, padding: "4px 8px", marginBottom: 4 }} />
                {giftSearching && <div style={{ fontSize: 10, color: "#6B7280" }}>Đang tìm...</div>}
                {giftResults.map((item) => (
                  <div key={item.sku} style={{ padding: "4px 0", borderBottom: "1px solid #F3F4F6", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11 }}>
                    <span><strong>{item.product_name}</strong> <span style={{ color: "#6B7280" }}>Vốn: {item.cost_price ? formatVND(item.cost_price) : "—"}</span></span>
                    <button type="button" className="btn btn-ghost btn-xs" style={{ color: "#185FA5" }} onClick={() => {
                      setGift({ name: item.product_name, sku: item.sku, cost: item.cost_price || 0 });
                      setShowGiftSearch(false); setGiftSearch(""); setGiftResults([]);
                    }}>Chọn</button>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, flexWrap: "wrap" }}>
              <span style={{ color: "#6B7280" }}>Số lượng:</span>
              <input type="number" value={giftQty} min={1} onChange={(e) => setGiftQty(Math.max(1, Number(e.target.value)))} style={{ width: 54, textAlign: "center", fontSize: 11 }} />
              <span style={{ color: "#6B7280" }}>Vốn gốc</span><strong>{formatVND(cost)}</strong>
              {gift && <span style={{ color: "#6B7280" }}>+ Quà {formatVND(gift.cost)} × {giftQty} = {formatVND(giftCostTotal)}</span>}
              <span style={{ color: "#6B7280" }}>→</span>
              <strong style={{ color: "#185FA5", fontSize: 13 }}>A = {formatVND(A)}</strong>
            </div>
          </div>

          {/* Block 2 — Giá bán */}
          <div style={{ background: "var(--bg)", border: "0.5px solid #E5E7EB", borderRadius: 8, padding: "9px 12px", marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.5, color: "#6B7280" }}>GIÁ VỐN A</div>
                <input type="number" value={cost || ""} onChange={(e) => setCost(Number(e.target.value))} placeholder="Nhập vốn..."
                  style={{ fontSize: 18, fontWeight: 800, width: 120, border: "none", background: "transparent", borderBottom: "1.5px solid #E5E7EB" }} />
              </div>
              <span style={{ fontSize: 16, color: "#D1D5DB" }}>→</span>
              <div>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.5, color: "#6B7280" }}>GIÁ BÁN TỪ (B1)</div>
                <input type="number" value={sellB1 || ""} onChange={(e) => setSellB1(Number(e.target.value))} placeholder="Giá thấp..."
                  style={{ fontSize: 17, fontWeight: 800, width: 130, border: "none", background: "transparent", borderBottom: "1.5px solid #E5E7EB" }} />
              </div>
              <span style={{ fontSize: 14, color: "#D1D5DB" }}>—</span>
              <div>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.5, color: "#6B7280" }}>ĐẾN (B2)</div>
                <input type="number" value={sellB2 || ""} onChange={(e) => setSellB2(Number(e.target.value))} placeholder="Giá cao..."
                  style={{ fontSize: 17, fontWeight: 800, width: 130, border: "none", background: "transparent", borderBottom: "1.5px solid #E5E7EB" }} />
              </div>
              <div style={{ width: 0.5, height: 28, background: "#E5E7EB", margin: "0 6px" }} />
              <div>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.5, color: "#6B7280" }}>GROSS (B−A)</div>
                {sellB1 > 0 ? (
                  <div style={{ fontSize: 18, fontWeight: 800, color: gross >= 0 ? "#16A34A" : "#DC2626" }}>
                    {gross >= 0 ? "+" : ""}{formatVND(gross)} <span style={{ fontSize: 11, fontWeight: 600 }}>({grossPct}%)</span>
                  </div>
                ) : (
                  <div style={{ fontSize: 16, fontWeight: 600, color: "#D1D5DB" }}>Nhập B1...</div>
                )}
              </div>
            </div>
            {sellB1 > 0 && (
              <div style={{ fontSize: 11, color: "#6B7280", display: "flex", gap: 0, flexWrap: "wrap" }}>
                <span>Phí sàn <strong style={{ color: "#993C1D" }}>{formatVNDCompact(sellB1 * 0.20)} (20%)</strong></span><span style={{ margin: "0 4px" }}>·</span>
                <span>Thuế <strong style={{ color: "#3C3489" }}>{formatVNDCompact(sellB1 * 0.015)} (1.5%)</strong></span><span style={{ margin: "0 4px" }}>·</span>
                <span>HT sàn <strong style={{ color: "#0C447C" }}>7.000đ</strong></span><span style={{ margin: "0 4px" }}>·</span>
                <span>Vận hành <strong style={{ color: "#633806" }}>{formatVNDCompact(sellB1 * 0.10)} (10%)</strong></span><span style={{ margin: "0 4px" }}>·</span>
                <span>Ads <strong style={{ color: "#444441" }}>{formatVNDCompact(sellB1 * 0.10)} (10%)</strong></span><span style={{ margin: "0 4px" }}>·</span>
                <span>Aff/CTV <strong style={{ color: "#27500A" }}>{formatVNDCompact(sellB1 * 0.10)} (10%)</strong></span>
              </div>
            )}
          </div>

          {/* Block 3 — 2 bảng kịch bản */}
          {sellB1 > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <ScenarioTable chips={[{ label: "Shopee", bg: "#FAECE7", color: "#993C1D" }, { label: "TikTok", bg: "#FBEAF0", color: "#993556" }]}
                subtitle="Sàn 20%+Thuế+HT 7k" scenarios={SCENARIOS_SAN} A={A} B1={sellB1} B2={sellB2} />
              <ScenarioTable chips={[{ label: "Facebook", bg: "#E6F1FB", color: "#185FA5" }, { label: "Web/B2B", bg: "#EEEDFE", color: "#3C3489" }]}
                subtitle="Thuế 1.5%, không phí sàn" scenarios={SCENARIOS_OFF} A={A} B1={sellB1} B2={sellB2} />
            </div>
          )}
        </div>)}

        {/* ─── STEP 5: Listing ─── */}
        {step === 5 && (<div>
          {selChannels.map((ch) => (
            <div key={ch} style={{ marginBottom: 10, padding: "10px 14px", border: "1px solid #E5E7EB", borderRadius: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontWeight: 700, fontSize: 12, color: CH_CHIP_COLORS[ch] }}>{ch}</span>
                <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, cursor: "pointer" }}>
                  <input type="checkbox" checked={listings[ch]?.done || false} onChange={(e) => setListings({ ...listings, [ch]: { ...listings[ch], done: e.target.checked } })} />ĐÃ ĐĂNG
                </label>
              </div>
              <textarea rows={2} placeholder={`Link ${ch} (mỗi link 1 dòng)...`} value={listings[ch]?.links || ""} onChange={(e) => setListings({ ...listings, [ch]: { ...listings[ch], links: e.target.value } })} style={{ width: "100%", fontSize: 11 }} />
            </div>
          ))}
        </div>)}

        {/* ─── STEP 6: Nội dung ─── */}
        {step === 6 && (<div>
          <div className="form-grid fg-2" style={{ marginBottom: 12 }}>
            <div className="form-group"><label>LINK THƯ MỤC DRIVE (ẢNH/VIDEO GỐC)</label><input value={driveLink} onChange={(e) => setDriveLink(e.target.value)} placeholder="https://drive.google.com/..." /></div>
            <div className="form-group"><label>NGƯỜI PHỤ TRÁCH (NHIỀU NGƯỜI)</label><input value={assignees} onChange={(e) => setAssignees(e.target.value)} placeholder="+ Thêm nhân viên..." /></div>
          </div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", marginBottom: 8 }}>TARGET NỘI DUNG SẢN XUẤT</div>
          {VIDEO_TYPES.map((vt, vi) => (
            <div key={vt.type} style={{ marginBottom: 8, padding: "10px 14px", border: "1px solid #E5E7EB", borderRadius: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 10, background: vt.color, color: "#fff", borderRadius: 4, padding: "2px 8px", fontWeight: 700 }}>{vt.label}</span>
                <span style={{ flex: 1, fontSize: 11, fontWeight: 600 }}>{vt.type === "problem" ? "Đặt vấn đề — khai thác pain point" : vt.type === "demo" ? "Demo SP — chứng minh hiệu quả" : "CTA — tạo urgency, thúc đẩy mua"}</span>
                <label style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 4 }}>
                  Số video: <input type="number" value={videos[vi].count} min={0} style={{ width: 50 }} onChange={(e) => { const arr = [...videos]; arr[vi] = { ...arr[vi], count: Number(e.target.value) }; setVideos(arr); }} />
                </label>
              </div>
            </div>
          ))}
        </div>)}

        {/* ─── STEP 7: Target DS ─── */}
        {step === 7 && (<div>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${selChannels.length}, 1fr)`, gap: 8, marginBottom: 12 }}>
            {selChannels.map((ch) => (
              <div key={ch} style={{ border: "1px solid #E5E7EB", borderRadius: 8, padding: "8px 10px", textAlign: "center" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: CH_CHIP_COLORS[ch] || "#374151" }}>{ch}</div>
                <input type="number" value={chTargets[ch] || ""} min={0} style={{ width: "100%", textAlign: "center", fontSize: 18, fontWeight: 800, border: "none", background: "transparent" }}
                  onChange={(e) => setChTargets({ ...chTargets, [ch]: Number(e.target.value) })} />
                <div style={{ fontSize: 9, color: "#6B7280" }}>SP target</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 12 }}>Tổng target: <strong>{totalTarget} SP</strong></div>
          <div className="form-grid fg-3" style={{ marginBottom: 10 }}>
            <div className="form-group"><label>Tồn kho cần bán</label><input type="number" value={stockQty || ""} onChange={(e) => setStockQty(Number(e.target.value))} /></div>
            <div className="form-group"><label>Số tháng tồn</label><input type="number" value={months || ""} onChange={(e) => setMonths(Number(e.target.value))} /></div>
            <div className="form-group"><label>Deadline</label><input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} /></div>
          </div>
          <div className="form-grid fg-2">
            <div className="form-group"><label>Giá thị trường từ</label><input type="number" value={priceFrom || ""} onChange={(e) => setPriceFrom(Number(e.target.value))} /></div>
            <div className="form-group"><label>đến</label><input type="number" value={priceTo || ""} onChange={(e) => setPriceTo(Number(e.target.value))} /></div>
          </div>
        </div>)}

        {/* Footer */}
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 20, paddingTop: 16, borderTop: "1px solid #E5E7EB" }}>
          <div>{step > 1 && <button className="btn btn-ghost btn-sm" onClick={() => setStep(step - 1)}>← Trước</button>}</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-ghost btn-sm" onClick={onClose}>Huỷ</button>
            <button className="btn btn-ghost btn-sm" onClick={() => save("READY")} disabled={pending}>Lưu nháp</button>
            {step < 7 ? (
              <button className="btn btn-sm" style={{ background: BRAND, color: "#fff" }} onClick={() => setStep(step + 1)}>Tiếp →</button>
            ) : (
              <button className="btn btn-sm" style={{ background: BRAND, color: "#fff" }} onClick={() => save("LAUNCHED")} disabled={pending}>✓ Bắt đầu launch</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
