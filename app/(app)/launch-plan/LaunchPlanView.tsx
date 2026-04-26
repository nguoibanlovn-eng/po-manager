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
  { k: "short", label: "Ngắn hạn", sub: "1-3 tháng", color: "#D97706", bgOff: "#FEF3C7", colorOff: "#92400E" },
  { k: "medium", label: "Trung hạn", sub: "3-6 tháng", color: "#D97706", bgOff: "#F3F4F6", colorOff: "#374151" },
  { k: "long", label: "Dài hạn", sub: ">6 tháng", color: "#2563EB", bgOff: "#DBEAFE", colorOff: "#1E40AF" },
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
   READY TAB — Chờ launching (click expand chi tiết)
   ═══════════════════════════════════════════════════════════ */
function ReadyTab({ plans, onEdit }: { plans: LaunchPlanRow[]; onEdit: (p: LaunchPlanRow) => void }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  return (
    <div className="card" style={{ padding: 0 }}>
      {plans.map((p) => {
        const m = M(p);
        const hz = HORIZONS.find((h) => h.k === (m.phase1?.horizon || m.product_type));
        const isOpen = expanded === p.id;
        const cost = m.phase3?.cost || m.pricing?.cost || 0;
        const sellPrice = m.phase3?.sell_price || m.pricing?.sell_price || 0;
        const stockQty = m.phase4?.stock_qty || m.sales_target?.stock_qty || 0;
        const deployId = m.deploy_id || "";
        const productDesc = (m as Record<string, unknown>).product_desc as string || "";
        const custGroup = m.phase1?.customer || m.customer?.group || "";
        const custPain = m.phase1?.pain_point || m.customer?.pain_point || "";
        const competitors = typeof (m as Record<string, unknown>).competitors === "string" ? (m as Record<string, unknown>).competitors as string : "";
        const channels = m.channels_selected || [];
        const listings = m.listings || {};
        // Tính gross
        const gross = sellPrice > 0 && cost > 0 ? sellPrice - cost : 0;
        const grossPct = sellPrice > 0 ? ((gross / sellPrice) * 100).toFixed(1) : "0";

        return (
          <div key={p.id} style={{ borderBottom: "1px solid #F3F4F6" }}>
            {/* Row chính — bấm để expand */}
            <div style={{ padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }} onClick={() => setExpanded(isOpen ? null : p.id)}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 2 }}>
                  {deployId && <span style={{ fontSize: 8, background: BRAND, color: "#fff", borderRadius: 3, padding: "1px 5px", fontWeight: 600 }}>TỪ ĐƠN HÀNG</span>}
                  {hz && <span style={{ fontSize: 8, background: hz.color, color: "#fff", borderRadius: 3, padding: "1px 5px", fontWeight: 600 }}>{hz.label}</span>}
                  <span style={{ fontWeight: 700, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.product_name}</span>
                </div>
                <div style={{ fontSize: 10, color: "#6B7280" }}>
                  SKU: {p.sku || "—"}
                  {cost > 0 ? ` · Vốn: ${formatVND(cost)}` : ""}
                  {sellPrice > 0 ? ` · Giá bán: ${formatVND(sellPrice)}` : ""}
                  {stockQty > 0 ? ` · SL: ${stockQty}` : ""}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                <span style={{ fontSize: 12, color: "#A1A1AA", transform: isOpen ? "rotate(180deg)" : "rotate(0)", transition: "transform .2s" }}>▼</span>
                <button className="btn btn-sm" style={{ background: BRAND, color: "#fff", fontSize: 11 }} onClick={(e) => { e.stopPropagation(); onEdit(p); }}>Tạo Launch Plan</button>
              </div>
            </div>
            {/* Chi tiết expand */}
            {isOpen && (
              <div style={{ padding: "0 14px 12px", background: "#FAFAFA", borderTop: "1px solid #F3F4F6" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", padding: "10px 0" }}>
                  {/* Giá nhập / Giá bán / Gross */}
                  <div style={{ background: "#fff", border: "1px solid #E4E4E7", borderRadius: 6, padding: "8px 10px", textAlign: "center" }}>
                    <div style={{ fontSize: 9, color: "#A1A1AA" }}>Giá vốn (A)</div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: BRAND2 }}>{cost > 0 ? formatVND(cost) : "—"}</div>
                  </div>
                  <div style={{ background: "#fff", border: "1px solid #E4E4E7", borderRadius: 6, padding: "8px 10px", textAlign: "center" }}>
                    <div style={{ fontSize: 9, color: "#A1A1AA" }}>Giá bán dự kiến</div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: "#18181B" }}>{sellPrice > 0 ? formatVND(sellPrice) : "—"}</div>
                  </div>
                  <div style={{ background: "#fff", border: "1px solid #E4E4E7", borderRadius: 6, padding: "8px 10px", textAlign: "center" }}>
                    <div style={{ fontSize: 9, color: "#A1A1AA" }}>Gross (B−A)</div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: gross > 0 ? "#16A34A" : "#DC2626" }}>{gross > 0 ? `+${formatVND(gross)}` : "—"}</div>
                    {gross > 0 && <div style={{ fontSize: 9, color: "#16A34A" }}>{grossPct}%</div>}
                  </div>
                </div>

                {/* Thông tin nguồn */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 16px", fontSize: 11, marginBottom: 6 }}>
                  {deployId && <div><span style={{ color: "#A1A1AA" }}>Nguồn:</span> <strong style={{ color: BRAND }}>{deployId}</strong></div>}
                  {stockQty > 0 && <div><span style={{ color: "#A1A1AA" }}>SL nhập:</span> <strong>{stockQty.toLocaleString("vi-VN")} SP</strong></div>}
                  {productDesc && <div style={{ gridColumn: "1 / -1" }}><span style={{ color: "#A1A1AA" }}>Mô tả SP:</span> <strong>{productDesc}</strong></div>}
                  {custGroup && <div><span style={{ color: "#A1A1AA" }}>Khách hàng:</span> <strong>{custGroup}</strong></div>}
                  {custPain && <div><span style={{ color: "#A1A1AA" }}>Nhu cầu:</span> <strong>{custPain}</strong></div>}
                  {competitors && <div style={{ gridColumn: "1 / -1" }}><span style={{ color: "#A1A1AA" }}>Đối thủ:</span> <strong>{competitors}</strong></div>}
                </div>

                {/* Kênh + Listing */}
                {channels.length > 0 && (
                  <div style={{ fontSize: 11, marginBottom: 6 }}>
                    <span style={{ color: "#A1A1AA" }}>Kênh: </span>
                    {channels.map((ch) => (
                      <span key={ch} style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, fontWeight: 600, background: CH_COLORS[ch.replace(" Shop", "")] || "#6B7280", color: "#fff", marginRight: 3 }}>{ch.replace("TikTok Shop", "TT").replace("Facebook", "FB").replace("Shopee", "SP").replace("Web/B2B", "Web")}</span>
                    ))}
                  </div>
                )}
                {Object.keys(listings).length > 0 && (
                  <div style={{ fontSize: 11, marginBottom: 6 }}>
                    <span style={{ color: "#A1A1AA" }}>Listing: </span>
                    {Object.entries(listings).map(([ch, info]) => {
                      const li = info as { done?: boolean };
                      return <span key={ch} style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, fontWeight: 600, background: li.done ? "#F0FDF4" : "#FEF2F2", color: li.done ? "#16A34A" : "#DC2626", marginRight: 3 }}>{ch.replace("TikTok Shop", "TT").replace("Facebook", "FB").replace("Web/B2B", "Web")} {li.done ? "✓" : "—"}</span>;
                    })}
                  </div>
                )}
                {p.note && <div style={{ fontSize: 10, color: "#92400E", background: "#FFFBEB", padding: "4px 8px", borderRadius: 4 }}>{p.note}</div>}
              </div>
            )}
          </div>
        );
      })}
      {plans.length === 0 && <div className="muted" style={{ padding: 24, textAlign: "center" }}>Không có SP sẵn sàng.</div>}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   MAIN VIEW
   ═══════════════════════════════════════════════════════════ */
export default function LaunchPlanView({ plans, autoAdd }: { plans: LaunchPlanRow[]; autoAdd?: { sku: string; name: string; cost: number } }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [tab, setTab] = useState<Tab>("launching");
  const [search, setSearch] = useState("");
  const [filterHorizon, setFilterHorizon] = useState("");
  const [filterProgress, setFilterProgress] = useState("");
  const [invSearch, setInvSearch] = useState("");
  const [invResults, setInvResults] = useState<InvItem[]>([]);
  const [invLoading, setInvLoading] = useState(false);
  const [formOpen, setFormOpen] = useState<{ sku?: string; name?: string; cost?: number } | null>(autoAdd || null);
  const [editPlan, setEditPlan] = useState<LaunchPlanRow | null>(null);
  const [detailPlan, setDetailPlan] = useState<LaunchPlanRow | null>(null);

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
          <div className="page-title">Launch SP</div>
          <div className="page-sub">{plans.length} SP · {launching.length} đang launch · {done.length} hoàn tất</div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <input placeholder="Tên SP, SKU..." value={invSearch} onChange={(e) => setInvSearch(e.target.value)} style={{ padding: "5px 10px", border: `1.5px solid ${BRAND2}`, borderRadius: 6, fontSize: 12, width: 180 }} />
          <button className="btn btn-sm" style={{ background: BRAND2, color: "#fff" }} onClick={() => searchInventory(invSearch)}>Tìm trong kho</button>
        </div>
      </div>

      {/* ═══ Dashboard strip ═══ */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", background: "#fff", border: "1px solid #E4E4E7", borderRadius: 10, overflow: "hidden", marginBottom: 12 }}>
        {[
          { label: "Đang launch", value: String(launchKpis.count), sub: `${launchKpis.needAttention > 0 ? launchKpis.needAttention + " cảnh báo" : "—"}`, color: "#D97706" },
          { label: "Chờ launching", value: String(ready.length), sub: `${ready.length} SP`, color: BRAND },
          { label: "Đã bán / Target", value: `${launchKpis.totalActual}/${launchKpis.totalTarget}`, sub: `${launchKpis.pct}%`, color: "#2563EB" },
          { label: "Hoàn tất", value: String(done.length), sub: `${done.length} SP`, color: "#16A34A" },
          { label: "Cần chú ý", value: String(launchKpis.needAttention), sub: launchKpis.needAttention > 0 ? "Dưới 40%" : "OK", color: "#DC2626" },
        ].map((c, i) => (
          <div key={i} style={{ padding: "12px 14px", borderRight: i < 4 ? "1px solid #E4E4E7" : undefined }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: c.color, textTransform: "uppercase", letterSpacing: ".4px", marginBottom: 4 }}>{c.label}</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: c.color }}>{c.value}</div>
            <div style={{ fontSize: 10, color: "#A1A1AA" }}>{c.sub}</div>
          </div>
        ))}
      </div>

      {/* ═══ TABS + FILTERS ═══ */}
      <div className="mini-tabs">
        {([
          ["launching", "Đang launch", launching.length],
          ["ready", "Chờ launching", ready.length],
          ["done", "Hoàn tất", done.length],
        ] as const).map(([k, label, count]) => (
          <button key={k} className={"mini-tab" + (tab === k ? " active" : "")} onClick={() => setTab(k)}>
            {label} <span className="cnt" style={k === "launching" && (count as number) > 0 ? { background: "#D97706", color: "#fff" } : undefined}>{count}</span>
          </button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 10, alignItems: "center" }}>
        <select value={filterHorizon} onChange={(e) => setFilterHorizon(e.target.value)} style={{ fontSize: 11, padding: "5px 8px" }}>
          <option value="">Loại hàng</option>
          {HORIZONS.map((h) => <option key={h.k} value={h.k}>{h.label}</option>)}
        </select>
        {tab === "launching" && (
          <select value={filterProgress} onChange={(e) => setFilterProgress(e.target.value)} style={{ fontSize: 11, padding: "5px 8px" }}>
            <option value="">Tiến độ</option>
            <option value="Vượt target">Vượt target</option>
            <option value="Đúng tiến độ">Đúng tiến độ</option>
            <option value="Chậm">Chậm</option>
            <option value="Cảnh báo">Cảnh báo</option>
          </select>
        )}
        <input placeholder="Tìm SP, SKU..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ padding: "5px 9px", fontSize: 12, border: "1px solid #E4E4E7", borderRadius: 6, flex: 1, minWidth: 120 }} />
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
        <ReadyTab plans={filterList(ready)} onEdit={setEditPlan} />
      )}

      {/* ═══ TAB: ĐANG LAUNCH — Compact ticket ═══ */}
      {tab === "launching" && (
        <div>
          {filterList(launching).map((p) => {
            const m = M(p);
            const hz = HORIZONS.find((h) => h.k === (m.phase1?.horizon || m.product_type));
            const pr = getProgress(m);
            const chTargets = m.phase4?.channels || m.sales_target?.channel_split || {};
            const chActuals = m.actual || {};
            const sellPrice = m.phase3?.sell_price || m.pricing?.sell_price || 0;
            const months = m.phase4?.months || m.sales_target?.months || 0;
            const isWarning = pr.pct < 40;
            const revenue = pr.totalActual * sellPrice;
            const remaining = Math.max(0, pr.totalTarget - pr.totalActual);
            const ld = p.launch_date ? new Date(p.launch_date) : null;
            const endDate = m.phase4?.deadline ? new Date(m.phase4.deadline) : null;
            const timeTag = ld && endDate
              ? `T${ld.getMonth() + 1}-T${endDate.getMonth() + 1}/${endDate.getFullYear()}`
              : ld ? `T${ld.getMonth() + 1}/${ld.getFullYear()}` : "";
            const phases = getPhaseChecks(m);
            const p1Count = [phases[0], phases[2], phases[3]].filter(Boolean).length;
            const p1Done = p1Count === 3;
            const listings = m.listings || {};
            const listingsDone = Object.values(listings).filter((l) => (l as { done?: boolean }).done).length;
            const listingsTotal = Object.keys(listings).length || Object.keys(chTargets).length || 1;
            const contentDone = !!(m.phase2?.drive_link || m.content?.drive_link);
            const p2Done = listingsDone + (contentDone ? 1 : 0);
            const p2Total = listingsTotal + 1;
            const assignee = m.phase2?.assignees || m.content?.assignees || "";
            // Channel list for mini bars
            const chList = Object.entries(chTargets).map(([ch, target]) => {
              const actual = chActuals[ch] || 0;
              const t = target as number;
              const pct = t > 0 ? Math.round((actual / t) * 100) : 0;
              const short = ch.replace("TikTok Shop", "TT").replace("Facebook", "FB").replace("Shopee", "SP").replace("Web/B2B", "Web");
              return { ch, short, actual, target: t, pct, color: CH_COLORS[ch] || CH_COLORS[ch.replace(" Shop", "")] || "#6B7280" };
            }).filter((c) => c.target > 0);

            return (
              <div key={p.id} style={{ border: "1px solid #E4E4E7", borderRadius: 10, overflow: "hidden", marginBottom: 8, background: "#fff", cursor: "pointer" }} onClick={() => setDetailPlan(p)}>
                {/* ─── Row 1: Header + tags + actions ─── */}
                <div style={{ padding: "10px 14px", display: "flex", alignItems: "center", gap: 10, borderBottom: "1px solid #F3F4F6" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 800, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.product_name}</div>
                    <div style={{ fontSize: 10, color: "#71717A" }}>{p.sku || "—"} · {p.launch_date || "—"}</div>
                  </div>
                  <div style={{ display: "flex", gap: 4, alignItems: "center", flexShrink: 0 }}>
                    {hz && <span style={{ padding: "1px 5px", borderRadius: 4, fontSize: 9, fontWeight: 700, background: hz.bgOff || "#FFFBEB", color: hz.colorOff || "#D97706" }}>{hz.label}</span>}
                    {timeTag && <span style={{ padding: "1px 5px", borderRadius: 4, fontSize: 9, fontWeight: 700, background: "#EFF6FF", color: "#2563EB" }}>{timeTag}</span>}
                    <span style={{ padding: "1px 6px", borderRadius: 4, fontSize: 9, fontWeight: 700, background: isWarning ? "#FEF2F2" : pr.pct >= 100 ? "#F0FDF4" : "#FFFBEB", color: isWarning ? "#DC2626" : pr.pct >= 100 ? "#16A34A" : "#D97706" }}>
                      {isWarning ? "Chậm" : pr.pct >= 100 ? "Vượt" : "OK"}
                    </span>
                    {isWarning && (
                      <button style={{ padding: "3px 10px", borderRadius: 5, fontSize: 10, fontWeight: 700, background: "#92400E", color: "#fff", border: "none", cursor: "pointer", whiteSpace: "nowrap" }} onClick={(e) => { e.stopPropagation(); setEditPlan(p); }}>Relaunch</button>
                    )}
                  </div>
                </div>

                {/* ─── Row 2: Status + KPI + Channel bars ─── */}
                <div style={{ padding: "8px 14px", display: "flex", gap: 8, alignItems: "center" }}>
                  {/* Phần I + II compact */}
                  <div style={{ display: "flex", gap: 4, flex: "0 0 auto" }}>
                    <div style={{ padding: "4px 8px", borderLeft: `3px solid ${p1Done ? "#16A34A" : "#D97706"}`, background: "#FAFAFA", borderRadius: "0 4px 4px 0" }}>
                      <div style={{ fontSize: 8, fontWeight: 700, color: "#16A34A" }}>I · KH</div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: p1Done ? "#16A34A" : "#D97706" }}>{p1Done ? "🔒" : ""}{p1Count}/3</div>
                    </div>
                    <div style={{ padding: "4px 8px", borderLeft: `3px solid ${p2Done >= p2Total ? "#16A34A" : "#7C3AED"}`, background: "#FAFAFA", borderRadius: "0 4px 4px 0" }}>
                      <div style={{ fontSize: 8, fontWeight: 700, color: "#7C3AED" }}>II · TK</div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: p2Done >= p2Total ? "#16A34A" : "#D97706" }}>{p2Done}/{p2Total}</div>
                    </div>
                  </div>

                  {/* KPI stats */}
                  {(() => {
                    const now = new Date();
                    const startD = ld || now;
                    const endD = endDate || new Date(startD.getTime() + (months || 3) * 30 * 86400000);
                    const totalDays = Math.max(1, Math.round((endD.getTime() - startD.getTime()) / 86400000));
                    const elapsedDays = Math.max(0, Math.round((now.getTime() - startD.getTime()) / 86400000));
                    const timePct = Math.min(100, Math.round((elapsedDays / totalDays) * 100));
                    const remainDays = Math.max(0, Math.round((endD.getTime() - now.getTime()) / 86400000));
                    const timeClr = pr.pct >= timePct ? "#16A34A" : pr.pct >= timePct * 0.6 ? "#D97706" : "#DC2626";
                    return (
                      <div style={{ display: "flex", gap: 2, flex: 1 }}>
                        <div style={{ textAlign: "center", padding: "3px 6px", background: "#F5F5F7", borderRadius: 4, flex: 1 }}>
                          <div style={{ fontSize: 7, color: "#A1A1AA", lineHeight: 1 }}>Bán · còn {remaining}</div>
                          <div style={{ fontSize: 12, fontWeight: 800, color: "#16A34A", lineHeight: 1.3 }}>{pr.totalActual}/{pr.totalTarget}</div>
                        </div>
                        <div style={{ textAlign: "center", padding: "3px 6px", background: "#F5F5F7", borderRadius: 4, flex: 1 }}>
                          <div style={{ fontSize: 7, color: "#A1A1AA", lineHeight: 1 }}>DT</div>
                          <div style={{ fontSize: 12, fontWeight: 800, color: "#185FA5", lineHeight: 1.3 }}>{formatVNDCompact(revenue)}</div>
                        </div>
                        <div style={{ textAlign: "center", padding: "3px 6px", background: "#F5F5F7", borderRadius: 4, flex: 1 }}>
                          <div style={{ fontSize: 7, color: "#A1A1AA", lineHeight: 1 }}>Tiến độ</div>
                          <div style={{ fontSize: 12, fontWeight: 800, color: pr.color, lineHeight: 1.3 }}>{pr.pct}%</div>
                        </div>
                        <div style={{ textAlign: "center", padding: "3px 4px", background: "#F5F5F7", borderRadius: 4, flex: 1 }}>
                          <div style={{ fontSize: 7, color: "#A1A1AA", lineHeight: 1 }}>TG · còn {remainDays}d</div>
                          <div style={{ fontSize: 10, fontWeight: 800, color: timeClr, lineHeight: 1.4 }}>{timePct}%</div>
                          <div style={{ height: 3, background: "#E5E7EB", borderRadius: 2, overflow: "hidden", marginTop: 1 }}>
                            <div style={{ height: "100%", width: `${timePct}%`, background: timeClr, borderRadius: 2 }} />
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Channel mini bars */}
                  <div style={{ width: 130, flexShrink: 0, display: "flex", flexDirection: "column", gap: 1 }}>
                    {chList.map((c) => {
                      const clr = c.pct >= 80 ? "#16A34A" : c.pct >= 40 ? "#D97706" : "#DC2626";
                      return (
                        <div key={c.ch} style={{ display: "flex", alignItems: "center", gap: 3 }}>
                          <span style={{ fontSize: 7, fontWeight: 700, width: 16, color: c.color, textAlign: "right" }}>{c.short}</span>
                          <div style={{ flex: 1, height: 3, background: "#F3F4F6", borderRadius: 2, overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${Math.min(c.pct, 100)}%`, background: clr, borderRadius: 2 }} />
                          </div>
                          <span style={{ fontSize: 7, fontWeight: 700, width: 18, textAlign: "right", color: clr }}>{c.pct}%</span>
                        </div>
                      );
                    })}
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
        <div>
          {filterList(done).map((p) => {
            const m = M(p);
            const hz = HORIZONS.find((h) => h.k === (m.phase1?.horizon || m.product_type));
            const pr = getProgress(m);
            const sellPrice = m.phase3?.sell_price || m.pricing?.sell_price || 0;
            const revenue = pr.totalActual * sellPrice;
            const chTargets = m.phase4?.channels || m.sales_target?.channel_split || {};
            const chActuals = m.actual || {};
            const isPostponed = p.stage === "POSTPONED";
            const chList = Object.entries(chTargets).map(([ch, target]) => {
              const actual = chActuals[ch] || 0;
              const t = target as number;
              const pct = t > 0 ? Math.round((actual / t) * 100) : 0;
              const short = ch.replace("TikTok Shop", "TT").replace("Facebook", "FB").replace("Shopee", "SP").replace("Web/B2B", "Web");
              const clr = pct >= 80 ? "#16A34A" : pct >= 40 ? "#D97706" : "#DC2626";
              return { ch, short, actual, target: t, pct, color: CH_COLORS[ch] || CH_COLORS[ch.replace(" Shop", "")] || "#6B7280", clr };
            }).filter((c) => c.target > 0);

            return (
              <div key={p.id} style={{ border: "1px solid #E4E4E7", borderRadius: 10, overflow: "hidden", marginBottom: 8, background: "#fff", cursor: "pointer" }} onClick={() => setDetailPlan(p)}>
                {/* Header */}
                <div style={{ padding: "10px 14px", display: "flex", alignItems: "center", gap: 10, borderBottom: "1px solid #F3F4F6" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 800, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.product_name}</div>
                    <div style={{ fontSize: 10, color: "#71717A" }}>{p.sku || "—"} · {p.launch_date || "—"}</div>
                  </div>
                  <div style={{ display: "flex", gap: 4, alignItems: "center", flexShrink: 0 }}>
                    {hz && <span style={{ padding: "1px 5px", borderRadius: 4, fontSize: 9, fontWeight: 700, background: hz.k === "short" ? "#FEF3C7" : hz.k === "long" ? "#DBEAFE" : "#FFFBEB", color: hz.k === "short" ? "#92400E" : hz.k === "long" ? "#1E40AF" : "#D97706" }}>{hz.label}</span>}
                    <span style={{ padding: "1px 6px", borderRadius: 4, fontSize: 9, fontWeight: 700, background: isPostponed ? "#FFFBEB" : "#F0FDF4", color: isPostponed ? "#D97706" : "#16A34A" }}>
                      {isPostponed ? "Hoãn" : "Hoàn tất"}
                    </span>
                  </div>
                </div>
                {/* Body */}
                <div style={{ padding: "8px 14px", display: "flex", gap: 8, alignItems: "center" }}>
                  {/* KPI */}
                  <div style={{ display: "flex", gap: 2, flex: 1 }}>
                    <div style={{ textAlign: "center", padding: "3px 6px", background: "#F5F5F7", borderRadius: 4, flex: 1 }}>
                      <div style={{ fontSize: 7, color: "#A1A1AA", lineHeight: 1 }}>Đã bán</div>
                      <div style={{ fontSize: 12, fontWeight: 800, color: pr.pct >= 80 ? "#16A34A" : pr.pct >= 40 ? "#D97706" : "#DC2626", lineHeight: 1.3 }}>{pr.totalActual}/{pr.totalTarget}</div>
                    </div>
                    <div style={{ textAlign: "center", padding: "3px 6px", background: "#F5F5F7", borderRadius: 4, flex: 1 }}>
                      <div style={{ fontSize: 7, color: "#A1A1AA", lineHeight: 1 }}>DT</div>
                      <div style={{ fontSize: 12, fontWeight: 800, color: "#185FA5", lineHeight: 1.3 }}>{formatVNDCompact(revenue)}</div>
                    </div>
                    <div style={{ textAlign: "center", padding: "3px 6px", background: "#F5F5F7", borderRadius: 4, flex: 1 }}>
                      <div style={{ fontSize: 7, color: "#A1A1AA", lineHeight: 1 }}>Kết quả</div>
                      <div style={{ fontSize: 12, fontWeight: 800, color: pr.pct >= 100 ? "#16A34A" : pr.pct >= 80 ? "#2563EB" : "#D97706", lineHeight: 1.3 }}>{pr.pct}%</div>
                    </div>
                    {isPostponed && p.note && (
                      <div style={{ textAlign: "center", padding: "3px 6px", background: "#FFFBEB", borderRadius: 4, flex: 2 }}>
                        <div style={{ fontSize: 7, color: "#A1A1AA", lineHeight: 1 }}>Lý do</div>
                        <div style={{ fontSize: 10, fontWeight: 600, color: "#92400E", lineHeight: 1.3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.note}</div>
                      </div>
                    )}
                  </div>
                  {/* Channel mini bars */}
                  {chList.length > 0 && (
                    <div style={{ width: 130, flexShrink: 0, display: "flex", flexDirection: "column", gap: 1 }}>
                      {chList.map((c) => (
                        <div key={c.ch} style={{ display: "flex", alignItems: "center", gap: 3 }}>
                          <span style={{ fontSize: 7, fontWeight: 700, width: 16, color: c.color, textAlign: "right" }}>{c.short}</span>
                          <div style={{ flex: 1, height: 3, background: "#F3F4F6", borderRadius: 2, overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${Math.min(c.pct, 100)}%`, background: c.clr, borderRadius: 2 }} />
                          </div>
                          <span style={{ fontSize: 7, fontWeight: 700, width: 18, textAlign: "right", color: c.clr }}>{c.pct}%</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {filterList(done).length === 0 && <div className="muted" style={{ padding: 24, textAlign: "center" }}>Chưa có SP hoàn tất.</div>}
        </div>
      )}

      {/* ═══ DETAIL MODAL — Ticket chi tiết ═══ */}
      {detailPlan && <LaunchDetailModal plan={detailPlan} onClose={() => setDetailPlan(null)} onEdit={() => { setEditPlan(detailPlan); setDetailPlan(null); }} />}

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
   LAUNCH DETAIL MODAL — Ticket chi tiết (mockup style)
   ═══════════════════════════════════════════════════════════ */
const CH_DOT: Record<string, string> = { Facebook: "#1877F2", "TikTok Shop": "#18181B", TikTok: "#18181B", Shopee: "#EE4D2D", "Web/B2B": "#6366F1", Web: "#6366F1" };

function LaunchDetailModal({ plan, onClose, onEdit }: { plan: LaunchPlanRow; onClose: () => void; onEdit: () => void }) {
  const m = M(plan);
  const hz = HORIZONS.find((h) => h.k === (m.phase1?.horizon || m.product_type));
  const pr = getProgress(m);
  const chTargets = m.phase4?.channels || m.sales_target?.channel_split || {};
  const chActuals = m.actual || {};
  const sellPrice = m.phase3?.sell_price || m.pricing?.sell_price || 0;
  const cost = m.phase3?.cost || m.pricing?.cost || 0;
  const months = m.phase4?.months || m.sales_target?.months || 0;
  const isWarning = pr.pct < 40;
  const revenue = pr.totalActual * sellPrice;
  const remaining = Math.max(0, pr.totalTarget - pr.totalActual);
  const ld = plan.launch_date ? new Date(plan.launch_date) : null;
  const endDate = m.phase4?.deadline ? new Date(m.phase4.deadline) : null;
  const timeTag = ld && endDate
    ? `T${ld.getMonth() + 1}-T${endDate.getMonth() + 1}/${endDate.getFullYear()}`
    : ld ? `T${ld.getMonth() + 1}/${ld.getFullYear()}` : "";

  const phases = getPhaseChecks(m);
  const p1Count = [phases[0], phases[2], phases[3]].filter(Boolean).length;
  const p1Done = p1Count === 3;
  const listings = m.listings || {};
  const listingsDone = Object.values(listings).filter((l) => (l as { done?: boolean }).done).length;
  const listingsTotal = Object.keys(listings).length || Object.keys(chTargets).length || 1;
  const contentDone = !!(m.phase2?.drive_link || m.content?.drive_link);
  const p2Done = listingsDone + (contentDone ? 1 : 0);
  const p2Total = listingsTotal + 1;
  const assignee = m.phase2?.assignees || m.content?.assignees || "";

  const chList = Object.entries(chTargets).map(([ch, target]) => {
    const actual = chActuals[ch] || 0;
    const t = target as number;
    const pct = t > 0 ? Math.round((actual / t) * 100) : 0;
    return { ch, actual, target: t, pct, color: CH_DOT[ch] || "#6B7280" };
  }).filter((c) => c.target > 0);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 100, display: "flex", justifyContent: "center", alignItems: "stretch", padding: "40px 16px 16px" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#F5F5F7", width: "100%", maxWidth: 680, borderRadius: 16, boxShadow: "0 25px 50px rgba(0,0,0,.25)", display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* Fixed header */}
        <div style={{ background: "#FAFAFA", borderBottom: "1px solid #E4E4E7", padding: "14px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16 }}>{plan.product_name}</div>
            <div style={{ fontSize: 10, color: "#71717A" }}>SKU: {plan.sku || "—"} · Launch {plan.launch_date || "—"}</div>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {hz && <span style={{ padding: "2px 6px", borderRadius: 4, fontSize: 9, fontWeight: 700, background: hz.k === "short" ? "#FEF3C7" : hz.k === "long" ? "#DBEAFE" : "#FFFBEB", color: hz.k === "short" ? "#92400E" : hz.k === "long" ? "#1E40AF" : "#D97706" }}>{hz.label}</span>}
            {timeTag && <span style={{ padding: "2px 6px", borderRadius: 4, fontSize: 9, fontWeight: 700, background: "#EFF6FF", color: "#2563EB" }}>{timeTag}</span>}
            <span style={{ padding: "2px 8px", borderRadius: 6, fontSize: 10, fontWeight: 700, background: isWarning ? "#FEF2F2" : "#FFFBEB", color: isWarning ? "#DC2626" : "#D97706" }}>
              {isWarning ? "Cảnh báo" : pr.pct >= 100 ? "Vượt target" : "Đang triển khai"}
            </span>
            <button onClick={onClose} style={{ background: "#F4F4F5", border: "none", fontSize: 16, cursor: "pointer", color: "#52525B", width: 32, height: 32, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>✕</button>
          </div>
        </div>

        {/* Scrollable content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>

          {/* ═══ TRẠNG THÁI ═══ */}
          <div style={{ fontSize: 11, fontWeight: 700, color: "#71717A", marginBottom: 8 }}>TRẠNG THÁI</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
            <div style={{ border: "1px solid #E4E4E7", borderRadius: 8, padding: "10px 12px", borderLeft: `3px solid ${p1Done ? "#16A34A" : "#D97706"}` }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#16A34A", textTransform: "uppercase", marginBottom: 4 }}>Phần I — Kế hoạch</div>
              <div style={{ fontSize: 12, fontWeight: 600 }}>Phân loại · Định giá · Phân bổ</div>
              <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 4 }}>
                {p1Done && <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 4, background: "#F3F4F6", color: "#6B7280", fontWeight: 700 }}>🔒 Đã khoá</span>}
                <span style={{ padding: "2px 8px", borderRadius: 6, fontSize: 10, fontWeight: 700, background: p1Done ? "#F0FDF4" : "#FFFBEB", color: p1Done ? "#16A34A" : "#D97706" }}>{p1Count}/3 sign-off</span>
              </div>
            </div>
            <div style={{ border: "1px solid #E4E4E7", borderRadius: 8, padding: "10px 12px", borderLeft: `3px solid ${p2Done >= p2Total ? "#16A34A" : "#D97706"}` }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#7C3AED", textTransform: "uppercase", marginBottom: 4 }}>Phần II — Triển khai</div>
              <div style={{ fontSize: 12, fontWeight: 600 }}>Nội dung · Listing</div>
              <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 4 }}>
                {assignee && <span style={{ fontSize: 10, color: "#71717A" }}>Giao: {assignee}</span>}
                <span style={{ padding: "2px 8px", borderRadius: 6, fontSize: 10, fontWeight: 700, background: p2Done >= p2Total ? "#F0FDF4" : "#FFFBEB", color: p2Done >= p2Total ? "#16A34A" : "#D97706" }}>{p2Done}/{p2Total} checklist</span>
              </div>
            </div>
          </div>

          <div style={{ height: 1, background: "#E4E4E7", marginBottom: 14 }} />

          {/* ═══ KẾT QUẢ BÁN ═══ */}
          <div style={{ fontSize: 11, fontWeight: 700, color: "#71717A", marginBottom: 6 }}>KẾT QUẢ BÁN (đồng bộ từ Nhanh)</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginBottom: 12 }}>
            <div style={{ textAlign: "center", padding: 8, background: "#fff", border: "1px solid #E4E4E7", borderRadius: 6 }}>
              <div style={{ fontSize: 9, color: "#71717A" }}>Đã bán</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#16A34A" }}>{pr.totalActual}</div>
              <div style={{ fontSize: 9, color: "#71717A" }}>/ {pr.totalTarget} SP</div>
            </div>
            <div style={{ textAlign: "center", padding: 8, background: "#fff", border: "1px solid #E4E4E7", borderRadius: 6 }}>
              <div style={{ fontSize: 9, color: "#71717A" }}>Doanh thu</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#185FA5" }}>{formatVNDCompact(revenue)}</div>
            </div>
            <div style={{ textAlign: "center", padding: 8, background: "#fff", border: "1px solid #E4E4E7", borderRadius: 6 }}>
              <div style={{ fontSize: 9, color: "#71717A" }}>Tiến độ</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: pr.color }}>{pr.pct}%</div>
              <div style={{ height: 4, background: "#E5E7EB", borderRadius: 2, overflow: "hidden", marginTop: 4 }}>
                <div style={{ height: "100%", width: `${Math.min(pr.pct, 100)}%`, background: pr.color, borderRadius: 2 }} />
              </div>
            </div>
            <div style={{ textAlign: "center", padding: 8, background: "#fff", border: "1px solid #E4E4E7", borderRadius: 6 }}>
              <div style={{ fontSize: 9, color: "#71717A" }}>Còn lại</div>
              <div style={{ fontSize: 18, fontWeight: 800 }}>{remaining}</div>
              <div style={{ fontSize: 9, color: "#71717A" }}>SP</div>
            </div>
          </div>

          {/* ═══ TIẾN ĐỘ THEO KÊNH ═══ */}
          <div style={{ fontSize: 11, fontWeight: 700, color: "#71717A", marginBottom: 6 }}>THEO KÊNH</div>
          <div style={{ background: "#fff", border: "1px solid #E4E4E7", borderRadius: 8, padding: "10px 12px", marginBottom: 14 }}>
            {chList.map((c) => (
              <div key={c.ch} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: c.color, flexShrink: 0 }} />
                <span style={{ fontSize: 11, fontWeight: 600, width: 80 }}>{c.ch.replace("TikTok Shop", "TikTok")}</span>
                <div style={{ flex: 1, height: 6, background: "#F3F4F6", borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${Math.min(c.pct, 100)}%`, background: c.color, borderRadius: 3 }} />
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, width: 60, textAlign: "right" }}>{c.actual}/{c.target}</span>
                <span style={{ fontSize: 11, fontWeight: 800, width: 36, textAlign: "right", color: c.pct >= 100 ? "#16A34A" : c.pct >= 40 ? "#2563EB" : "#DC2626" }}>{c.pct}%</span>
              </div>
            ))}
            {/* Tổng */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4, paddingTop: 6, borderTop: "1px solid #F3F4F6" }}>
              <span style={{ width: 10 }} />
              <span style={{ fontSize: 11, fontWeight: 800, width: 80 }}>Tổng</span>
              <div style={{ flex: 1, height: 8, background: "#F3F4F6", borderRadius: 4, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${Math.min(pr.pct, 100)}%`, background: pr.color, borderRadius: 4 }} />
              </div>
              <span style={{ fontSize: 11, fontWeight: 800, width: 60, textAlign: "right" }}>{pr.totalActual}/{pr.totalTarget}</span>
              <span style={{ fontSize: 11, fontWeight: 900, width: 36, textAlign: "right", color: pr.color }}>{pr.pct}%</span>
            </div>
          </div>

          {/* ═══ THÔNG TIN KẾ HOẠCH ═══ */}
          <div style={{ fontSize: 11, fontWeight: 700, color: "#71717A", marginBottom: 6 }}>THÔNG TIN KẾ HOẠCH</div>
          <div style={{ background: "#fff", border: "1px solid #E4E4E7", borderRadius: 8, padding: "10px 12px", marginBottom: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 16px", fontSize: 11 }}>
            <div><span style={{ color: "#A1A1AA" }}>Giá vốn:</span> <strong>{formatVND(cost)}</strong></div>
            <div><span style={{ color: "#A1A1AA" }}>Giá bán B1:</span> <strong>{formatVND(sellPrice)}</strong></div>
            {m.phase3?.sell_price_2 ? <div><span style={{ color: "#A1A1AA" }}>Giá bán B2:</span> <strong>{formatVND(m.phase3.sell_price_2)}</strong></div> : null}
            {months > 0 && <div><span style={{ color: "#A1A1AA" }}>Chu kỳ:</span> <strong>{months} tháng</strong></div>}
            <div><span style={{ color: "#A1A1AA" }}>Khách hàng:</span> <strong>{m.phase1?.customer || m.customer?.group || "—"}</strong></div>
            <div><span style={{ color: "#A1A1AA" }}>Pain point:</span> <strong>{m.phase1?.pain_point || m.customer?.pain_point || "—"}</strong></div>
            {typeof (m as Record<string, unknown>).competitors === "string" && <div style={{ gridColumn: "1 / -1" }}><span style={{ color: "#A1A1AA" }}>Đối thủ:</span> <strong>{(m as Record<string, unknown>).competitors as string}</strong></div>}
          </div>

          {/* ═══ LISTING ═══ */}
          {Object.keys(listings).length > 0 && (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#71717A", marginBottom: 6 }}>LISTING</div>
              <div style={{ background: "#fff", border: "1px solid #E4E4E7", borderRadius: 8, padding: "8px 12px", marginBottom: 14 }}>
                {Object.entries(listings).map(([ch, info]) => {
                  const li = info as { links?: string[]; done?: boolean };
                  return (
                    <div key={ch} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", borderBottom: "1px solid #F3F4F6", fontSize: 11 }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: CH_DOT[ch] || "#6B7280" }} />
                      <span style={{ fontWeight: 600, width: 90 }}>{ch}</span>
                      <span style={{ flex: 1, color: "#A1A1AA", fontSize: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{li.links?.length ? li.links[0] : "—"}</span>
                      <span style={{ padding: "1px 6px", borderRadius: 4, fontSize: 9, fontWeight: 700, background: li.done ? "#F0FDF4" : "#FEF2F2", color: li.done ? "#16A34A" : "#DC2626" }}>{li.done ? "✓ Done" : "Chưa"}</span>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* ═══ Relaunch CTA ═══ */}
          {isWarning && (
            <div style={{ background: "#FFFBEB", border: "1px solid #FCD34D", borderRadius: 8, padding: "12px 14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#92400E" }}>Tiến độ chậm — cần điều chỉnh?</div>
                <div style={{ fontSize: 10, color: "#92400E" }}>{pr.pct}% {months > 0 ? `sau ${months} tháng` : ""} (target 40%). Có thể relaunch để tăng hiệu quả.</div>
              </div>
              <button style={{ padding: "8px 16px", borderRadius: 7, fontSize: 12, fontWeight: 700, background: "#92400E", color: "#fff", border: "none", cursor: "pointer", whiteSpace: "nowrap" }} onClick={onEdit}>Relaunch →</button>
            </div>
          )}
        </div>

        {/* Fixed footer */}
        <div style={{ borderTop: "1px solid #E4E4E7", padding: "12px 20px", display: "flex", justifyContent: "flex-end", gap: 8, flexShrink: 0, background: "#fff" }}>
          <button className="btn btn-ghost" onClick={onClose}>Đóng</button>
          <button className="btn" style={{ background: BRAND, color: "#fff", border: "none", padding: "8px 16px", borderRadius: 7, fontWeight: 700, cursor: "pointer" }} onClick={onEdit}>✎ Sửa plan</button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   LAUNCH FORM MODAL — 7 Steps
   ═══════════════════════════════════════════════════════════ */
const ALL_CHANNELS = ["Facebook", "TikTok Shop", "Shopee", "Web/B2B"];
const CH_CHIP_COLORS: Record<string, string> = { Facebook: "#1877F2", "TikTok Shop": "#FE2C55", Shopee: "#EE4D2D", "Web/B2B": "#6366F1" };
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
  { type: "problem", label: "Vấn đề", desc: "Khai thác pain point", color: "#DC2626", short: 2, medium: 3, long: 4 },
  { type: "demo", label: "Chứng minh", desc: "Demo SP hiệu quả", color: "#D97706", short: 2, medium: 2, long: 3 },
  { type: "cta", label: "Chốt đơn", desc: "Tạo urgency, thúc mua", color: "#16A34A", short: 1, medium: 2, long: 3 },
  { type: "review", label: "Review/Unbox", desc: "Trải nghiệm thật", color: "#2563EB", short: 1, medium: 1, long: 2 },
  { type: "lifestyle", label: "Lifestyle", desc: "Bối cảnh sử dụng", color: "#7C3AED", short: 1, medium: 2, long: 3 },
];

function LaunchFormModal({ initial, defaultSku, defaultName, defaultCost, onClose, onSaved, pending, startTransition }: {
  initial: LaunchPlanRow | null;
  defaultSku?: string; defaultName?: string; defaultCost?: number;
  onClose: () => void; onSaved: () => void;
  pending: boolean; startTransition: ReturnType<typeof useTransition>[1];
}) {
  const m = initial ? M(initial) : {} as Metrics;
  const [sku] = useState(initial?.sku || defaultSku || "");
  const [name] = useState(initial?.product_name || defaultName || "");
  const [cost, setCost] = useState(m.phase3?.cost || m.pricing?.cost || defaultCost || 0);

  // B1 — Phân loại hàng
  const [horizon, setHorizon] = useState(m.phase1?.horizon || m.product_type || "medium");
  const [horizonNote, setHorizonNote] = useState((m as Record<string, unknown>).horizonNote as string || "");
  const [custGroup, setCustGroup] = useState(m.phase1?.customer || m.customer?.group || "");
  const [custPain, setCustPain] = useState(m.phase1?.pain_point || m.customer?.pain_point || "");
  const [custComp, setCustComp] = useState((m as Record<string, unknown>).competitors as string || "");
  const [startDate, setStartDate] = useState((m as Record<string, unknown>).start_date as string || "");
  const [endDateF, setEndDateF] = useState((m as Record<string, unknown>).end_date as string || "");
  // Bàn giao
  const [handoverTo, setHandoverTo] = useState((m as Record<string, unknown>).handover_to as string || "");
  const [handoverDeadline, setHandoverDeadline] = useState((m as Record<string, unknown>).handover_deadline as string || "");
  // B4 — Checklist tự do
  type CheckItem = { name: string; qty: number; assignee: string; deadline: string; done: boolean };
  const existingChecklist = Array.isArray((m as Record<string, unknown>).checklist) ? (m as Record<string, unknown>).checklist as CheckItem[] : null;
  const hzKeyInit = (horizon === "short" ? "short" : horizon === "long" ? "long" : "medium") as "short" | "medium" | "long";
  const defaultChecklist: CheckItem[] = VIDEO_TYPES.map((vt) => ({ name: vt.label + " — " + vt.desc, qty: vt[hzKeyInit], assignee: "", deadline: "", done: false }));
  const [checklist, setChecklist] = useState<CheckItem[]>(existingChecklist || defaultChecklist);
  const [newItemName, setNewItemName] = useState("");
  const [newItemQty, setNewItemQty] = useState("");
  // Step 3 — Kênh bán
  const [selChannels, setSelChannels] = useState<string[]>(m.channels_selected || (m.phase4?.channels ? Object.keys(m.phase4.channels).filter((k) => (m.phase4?.channels?.[k] || 0) > 0) : ALL_CHANNELS));
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
  const hzKey = (horizon === "short" ? "short" : horizon === "long" ? "long" : "medium") as "short" | "medium" | "long";
  const [videos, setVideos] = useState(VIDEO_TYPES.map((vt) => {
    const existing = (m.content as Record<string, unknown>)?.targets;
    const arr = Array.isArray(existing) ? existing : [];
    const found = arr.find((t: Record<string, unknown>) => t.type === vt.type);
    return { type: vt.type, count: (found as Record<string, number>)?.videos ?? vt[hzKey] };
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
      ...m, product_type: horizon, horizonNote, start_date: startDate, end_date: endDateF,
      handover_to: handoverTo, handover_deadline: handoverDeadline, checklist,
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

  const partLabel = (num: string, label: string, color: string) => (
    <div style={{ fontSize: 11, fontWeight: 800, color, textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ width: 18, height: 18, borderRadius: 4, background: color, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9 }}>{num}</span>
      {label}
    </div>
  );

  // Channel default split percentages
  const DEFAULT_SPLIT: Record<string, number> = { Facebook: 55, "TikTok Shop": 25, Shopee: 10, "Web/B2B": 10 };

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

        {/* ╔══════════════════════════════════╗ */}
        {/* ║  PHẦN I: KẾ HOẠCH (Leader chốt)  ║ */}
        {/* ╚══════════════════════════════════╝ */}
        {partLabel("I", "Kế hoạch — Leader chốt", BRAND)}

        {/* ═══ B1: Phân loại hàng ═══ */}
        <div style={sectionStyle}>
          {secTitle(1, "Phân loại hàng", BRAND)}
          {/* Thời gian triển khai — đặt trước để auto tính horizon */}
          <div style={{ fontSize: 10, fontWeight: 700, color: "#71717A", textTransform: "uppercase", letterSpacing: ".4px", marginBottom: 4 }}>THỜI GIAN TRIỂN KHAI DỰ KIẾN</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
            <div><input type="date" value={startDate} onChange={(e) => {
              setStartDate(e.target.value);
              if (e.target.value && endDateF) { const ms = new Date(endDateF).getTime() - new Date(e.target.value).getTime(); const mo = Math.round(ms / (30 * 86400000)); const hz = mo <= 3 ? "short" : mo <= 6 ? "medium" : "long"; setHorizon(hz); const k = hz as "short"|"medium"|"long"; setVideos(VIDEO_TYPES.map((vt) => ({ type: vt.type, count: vt[k] }))); }
            }} style={{ width: "100%", padding: "6px 10px", border: "1px solid #E4E4E7", borderRadius: 7, fontSize: 12 }} /><div style={{ fontSize: 9, color: "#A1A1AA", marginTop: 2 }}>Bắt đầu bán</div></div>
            <div><input type="date" value={endDateF} onChange={(e) => {
              setEndDateF(e.target.value);
              if (startDate && e.target.value) { const ms = new Date(e.target.value).getTime() - new Date(startDate).getTime(); const mo = Math.round(ms / (30 * 86400000)); const hz = mo <= 3 ? "short" : mo <= 6 ? "medium" : "long"; setHorizon(hz); const k = hz as "short"|"medium"|"long"; setVideos(VIDEO_TYPES.map((vt) => ({ type: vt.type, count: vt[k] }))); }
            }} style={{ width: "100%", padding: "6px 10px", border: "1px solid #E4E4E7", borderRadius: 7, fontSize: 12 }} /><div style={{ fontSize: 9, color: "#A1A1AA", marginTop: 2 }}>Kết thúc dự kiến</div></div>
          </div>
          {/* CHU KỲ BÁN — auto từ thời gian, read-only */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#71717A", textTransform: "uppercase", letterSpacing: ".4px", marginBottom: 4 }}>CHU KỲ BÁN</div>
            <div style={{ display: "flex", gap: 6 }}>
              {HORIZONS.map((h) => (
                <div key={h.k} style={{ padding: "6px 14px", borderRadius: 6, fontSize: 12, fontWeight: 600, background: horizon === h.k ? h.color : (h.bgOff || "#F3F4F6"), color: horizon === h.k ? "#fff" : (h.colorOff || "#374151"), flex: 1, textAlign: "center", opacity: horizon === h.k ? 1 : 0.5 }}>
                  {h.label}
                  <div style={{ fontSize: 9, marginTop: 2, opacity: 0.7 }}>{h.sub}</div>
                </div>
              ))}
            </div>
            {!startDate || !endDateF ? <div style={{ fontSize: 9, color: "#D97706", marginTop: 4 }}>Chọn thời gian để tự động xác định chu kỳ bán</div> : null}
          </div>
          {/* Timeline visual */}
          {startDate && endDateF && (() => {
            const s = new Date(startDate), e = new Date(endDateF);
            const diffMs = e.getTime() - s.getTime();
            const diffMonths = Math.max(1, Math.round(diffMs / (30 * 86400000)));
            const monthNames: string[] = [];
            const colors = ["#1877F2", "#2563EB", "#4F46E5", "#6D28D9", "#7C3AED", "#9333EA", "#A855F7", "#C084FC", "#D8B4FE", "#E9D5FF", "#F3E8FF", "#FAF5FF"];
            for (let i = 0; i < diffMonths; i++) { const d = new Date(s); d.setMonth(d.getMonth() + i); monthNames.push(`T${d.getMonth() + 1}`); }
            return (
              <div style={{ background: "#F5F5F7", borderRadius: 8, padding: "8px 10px", fontSize: 10, color: "#71717A", marginBottom: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span><strong>{s.toLocaleDateString("vi-VN")}</strong></span>
                  <span>{diffMonths} tháng</span>
                  <span><strong>{e.toLocaleDateString("vi-VN")}</strong></span>
                </div>
                <div style={{ display: "flex", height: 24, borderRadius: 6, overflow: "hidden", border: "1px solid #E4E4E7", fontSize: 9, fontWeight: 700 }}>
                  {monthNames.map((mn, i) => (
                    <div key={i} style={{ width: `${100 / monthNames.length}%`, background: colors[i % colors.length], display: "flex", alignItems: "center", justifyContent: "center", color: "#fff" }}>{mn}</div>
                  ))}
                </div>
                <div style={{ fontSize: 9, color: "#A1A1AA", marginTop: 4 }}>→ Tag ticket: <span style={{ padding: "1px 6px", borderRadius: 4, background: "#FFFBEB", color: "#D97706", fontSize: 9, fontWeight: 700 }}>{horizon === "short" ? "Ngắn hạn" : horizon === "long" ? "Dài hạn" : "Trung hạn"} · {monthNames[0]}-{monthNames[monthNames.length - 1]}/{e.getFullYear()}</span></div>
              </div>
            );
          })()}
        </div>

        {/* ═══ B2: Định giá & CTKM ═══ */}
        <div style={sectionStyle}>
          {secTitle(2, "Định giá & CTKM", "#D97706")}
          <div style={{ color: "#71717A", fontSize: 12, fontStyle: "italic", marginBottom: 8 }}>Giữ nguyên logic hiện tại — CTKM, giá vốn A, giá bán B1/B2, bảng kịch bản</div>

          {/* CTKM summary line */}
          {sellB1 > 0 && (
            <div style={{ background: "#F5F5F7", border: "1px solid #E4E4E7", borderRadius: 8, padding: "10px 12px", marginBottom: 10, fontSize: 11, color: "#71717A" }}>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                <div>CTKM: <strong style={{ color: "#18181B" }}>{promoType === "gift" ? "Tặng kèm quà" : promoType === "combo" ? "Combo set" : promoType === "flash" ? "Flash sale" : promoType === "discount" ? "Giảm trực tiếp" : "Không có"}</strong></div>
                <div>A: <strong style={{ color: BRAND2 }}>{formatVND(A)}</strong></div>
                <div>B1: <strong style={{ color: "#18181B" }}>{formatVND(sellB1)}</strong></div>
                {sellB2 > 0 && <div>B2: <strong style={{ color: "#18181B" }}>{formatVND(sellB2)}</strong></div>}
                <div>Gross: <strong style={{ color: gross >= 0 ? "#16A34A" : "#DC2626" }}>{gross >= 0 ? "+" : ""}{formatVNDCompact(gross)} ({grossPct}%)</strong></div>
              </div>
            </div>
          )}

          {/* Chương trình bán */}
          <div style={{ background: "#F5F5F7", border: "0.5px solid #E5E7EB", borderRadius: 8, padding: "10px 12px", marginBottom: 10 }}>
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
          <div style={{ background: "#F5F5F7", border: "0.5px solid #E5E7EB", borderRadius: 8, padding: "9px 12px", marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
              <div><div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.5, color: "#6B7280" }}>GIÁ VỐN A</div><div style={{ fontSize: 18, fontWeight: 800, color: BRAND2 }}>{formatVND(A)}</div></div>
              <span style={{ fontSize: 16, color: "#D1D5DB" }}>→</span>
              <div><div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.5, color: "#6B7280" }}>GIÁ BÁN TỪ (B1)</div><input type="text" inputMode="numeric" value={sellB1 ? sellB1.toLocaleString("vi-VN") : ""} onChange={(e) => setSellB1(Number(e.target.value.replace(/\D/g, "")))} placeholder="Giá thấp..." style={{ fontSize: 17, fontWeight: 800, width: 120, border: "none", background: "transparent", borderBottom: "1.5px solid #E5E7EB" }} /></div>
              <span style={{ fontSize: 14, color: "#D1D5DB" }}>—</span>
              <div><div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.5, color: "#6B7280" }}>ĐẾN (B2)</div><input type="text" inputMode="numeric" value={sellB2 ? sellB2.toLocaleString("vi-VN") : ""} onChange={(e) => setSellB2(Number(e.target.value.replace(/\D/g, "")))} placeholder="Giá cao..." style={{ fontSize: 17, fontWeight: 800, width: 120, border: "none", background: "transparent", borderBottom: "1.5px solid #E5E7EB" }} /></div>
              {sellB1 > 0 && (<><div style={{ width: 0.5, height: 28, background: "#E5E7EB", margin: "0 4px" }} /><div><div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.5, color: "#6B7280" }}>GROSS (B−A)</div><div style={{ fontSize: 18, fontWeight: 800, color: gross >= 0 ? "#16A34A" : "#DC2626" }}>{gross >= 0 ? "+" : ""}{formatVND(gross)} <span style={{ fontSize: 11, fontWeight: 600 }}>({grossPct}%)</span></div></div></>)}
            </div>
          </div>

          {sellB1 > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <ScenarioTable chips={[{ label: "Shopee", bg: "#FAECE7", color: "#993C1D" }, { label: "TikTok", bg: "#FBEAF0", color: "#993556" }]} subtitle="Sàn 20%+Thuế+HT 7k" scenarios={SCENARIOS_SAN} A={A} B1={sellB1} B2={sellB2} />
              <ScenarioTable chips={[{ label: "Facebook", bg: "#E6F1FB", color: "#185FA5" }, { label: "Web/B2B", bg: "#EEEDFE", color: "#3C3489" }]} subtitle="Thuế 1.5%, không phí sàn" scenarios={SCENARIOS_OFF} A={A} B1={sellB1} B2={sellB2} />
            </div>
          )}
        </div>

        {/* ═══ B3: Phân bổ doanh số ═══ */}
        <div style={sectionStyle}>
          {secTitle(3, "Phân bổ doanh số", "#2563EB")}

          {/* Summary line */}
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, fontSize: 11, color: "#71717A", flexWrap: "wrap" }}>
            <span>Tổng: <strong style={{ color: BRAND }}>{totalTarget > 0 ? `${totalTarget} SP` : "—"}</strong></span>
            <span style={{ color: "#D1D5DB" }}>|</span>
            <span>Tồn: <strong style={{ color: "#18181B" }}>{stockQty || "—"}</strong></span>
            <span style={{ color: "#D1D5DB" }}>|</span>
            <span style={{ color: "#1E40AF", fontSize: 10 }}>Mặc định: FB 55% · TT 25% · SP 10% · Web 10%</span>
          </div>

          {/* Kênh bán — 4 kênh cố định */}

          {/* Phân bổ theo kênh */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, marginBottom: 8 }}>
            {selChannels.map((ch) => {
              const short = ch.replace("TikTok Shop", "TT").replace("Facebook", "FB").replace("Shopee", "SP").replace("Web/B2B", "Web");
              const pct = totalTarget > 0 ? Math.round(((chTargets[ch] || 0) / totalTarget) * 100) : (DEFAULT_SPLIT[ch] || 0);
              return (
                <div key={ch} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 8px", border: "1px solid #E4E4E7", borderRadius: 6 }}>
                  <span style={{ width: 10, height: 10, borderRadius: "50%", background: CH_CHIP_COLORS[ch], flexShrink: 0 }} />
                  <span style={{ fontSize: 11, fontWeight: 600, flex: 1 }}>{short}</span>
                  <input type="number" value={chTargets[ch] || ""} min={0} style={{ width: 50, textAlign: "right", padding: "3px 6px", border: "1px solid #E4E4E7", borderRadius: 4, fontSize: 11, fontWeight: 700 }} onChange={(e) => setChTargets({ ...chTargets, [ch]: Number(e.target.value) })} />
                  <span style={{ fontSize: 9, color: "#71717A", width: 28 }}>{pct}%</span>
                </div>
              );
            })}
          </div>
          {/* Progress bar + total */}
          {totalTarget > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ flex: 1, height: 6, background: "#E5E7EB", borderRadius: 3, overflow: "hidden", display: "flex" }}>
                {selChannels.map((ch) => {
                  const pct = totalTarget > 0 ? ((chTargets[ch] || 0) / totalTarget) * 100 : 0;
                  return <div key={ch} style={{ width: `${pct}%`, background: CH_CHIP_COLORS[ch] || "#6B7280" }} />;
                })}
              </div>
              <span style={{ fontSize: 10, fontWeight: 700, color: stockQty > 0 && totalTarget === stockQty ? "#16A34A" : BRAND, whiteSpace: "nowrap" }}>{totalTarget}/{stockQty || totalTarget} {stockQty > 0 && totalTarget === stockQty ? "✓" : ""}</span>
            </div>
          )}
        </div>

        {/* ═══ Xác nhận kế hoạch + Bàn giao ═══ */}
        <div style={{ background: "#fff", border: "2px solid #D97706", borderRadius: 10, padding: 14, marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#92400E", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
            Xác nhận kế hoạch
            <span style={{ marginLeft: "auto", padding: "2px 8px", borderRadius: 6, fontSize: 10, fontWeight: 700, background: "#FFFBEB", color: "#D97706" }}>Chờ sign-off</span>
          </div>
          <div style={{ fontSize: 11, color: "#71717A", marginBottom: 8, lineHeight: 1.5 }}>Các leader xác nhận phân loại + định giá + phân bổ trước khi chuyển sang triển khai.</div>

          {/* Leader sign-off list */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 8 }}>
            {["Admin", "Leader KD", "Leader MH"].map((role) => (
              <div key={role} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", border: "1px solid #E4E4E7", borderRadius: 6 }}>
                <div style={{ width: 18, height: 18, borderRadius: 4, border: "2px solid #E4E4E7", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, flexShrink: 0 }} />
                <span style={{ fontSize: 12, fontWeight: 600, flex: 1 }}>{role}</span>
                <button type="button" className="btn btn-sm" style={{ background: BRAND, color: "#fff", fontSize: 10, padding: "3px 10px", border: "none", borderRadius: 5, cursor: "pointer" }}>Xác nhận</button>
              </div>
            ))}
          </div>

          {/* Comment input */}
          <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
            <input type="text" placeholder="Bình luận..." style={{ flex: 1, padding: "5px 10px", border: "1px solid #E4E4E7", borderRadius: 6, fontSize: 11 }} />
            <button type="button" className="btn btn-ghost" style={{ fontSize: 10, padding: "5px 10px" }}>Gửi</button>
          </div>

          {/* Bàn giao Phần II */}
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #FCD34D" }}>
            <div style={{ padding: "10px 12px", background: "#F5F3FF", border: "1px solid #DDD6FE", borderRadius: 8, marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#7C3AED" }}>Bàn giao Phần II cho:</span>
                <select value={handoverTo} onChange={(e) => setHandoverTo(e.target.value)} style={{ padding: "4px 8px", fontSize: 11, border: "1px solid #DDD6FE", borderRadius: 6, fontWeight: 600 }}>
                  <option value="">— Chọn người nhận —</option>
                  <option value="nv_kd_1">NV Kinh doanh 1</option>
                  <option value="nv_kd_2">NV Kinh doanh 2</option>
                  <option value="sales_leader">Sales Leader</option>
                </select>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 11, color: "#7C3AED", fontWeight: 600 }}>Deadline phân bổ việc:</span>
                <input type="date" value={handoverDeadline} onChange={(e) => setHandoverDeadline(e.target.value)} style={{ padding: "4px 8px", fontSize: 11, border: "1px solid #DDD6FE", borderRadius: 6 }} />
                <span style={{ fontSize: 9, color: "#71717A" }}>Người nhận phải phân bổ + Launch trước ngày này</span>
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button type="button" className="btn" style={{ background: BRAND, color: "#fff", padding: "10px 24px", fontSize: 13, border: "none", borderRadius: 7, fontWeight: 700, cursor: "pointer" }} onClick={() => save("LAUNCHED")}>Xác nhận & Bàn giao →</button>
            </div>
          </div>
        </div>

        {/* ╔══════════════════════════════════╗ */}
        {/* ║  PHẦN II: TRIỂN KHAI (Giao việc)  ║ */}
        {/* ╚══════════════════════════════════╝ */}
        {partLabel("II", "Triển khai — Giao việc", "#7C3AED")}

        {/* ═══ B4: Nội dung & Listing ═══ */}
        <div style={sectionStyle}>
          {secTitle(4, "Nội dung & Listing", "#7C3AED")}
          <div style={{ background: "#F5F5F7", borderRadius: 6, padding: "6px 10px", marginBottom: 10, fontSize: 10, color: "#71717A", lineHeight: 1.5 }}>
            Gán nhân sự + deadline cho từng mục. Khi Launch, noti gửi vào <strong>Việc của tôi</strong>.
          </div>

          <div className="form-grid fg-2" style={{ marginBottom: 10 }}>
            <div className="form-group"><div style={{ display: "inline-block", fontSize: 10, fontWeight: 700, color: "#71717A", textTransform: "uppercase", letterSpacing: ".4px", marginBottom: 4 }}>KHO TÀI LIỆU CHUNG</div><input value={driveLink} onChange={(e) => setDriveLink(e.target.value)} placeholder="https://drive.google.com/..." /></div>
            <div className="form-group"><div style={{ display: "inline-block", fontSize: 10, fontWeight: 700, color: "#71717A", textTransform: "uppercase", letterSpacing: ".4px", marginBottom: 4 }}>NGƯỜI PHỤ TRÁCH</div><input value={assignees} onChange={(e) => setAssignees(e.target.value)} placeholder="Tên nhân sự..." /></div>
          </div>

          {/* Checklist nội dung — tự do */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#71717A", textTransform: "uppercase" }}>Checklist nội dung</div>
            <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 4, background: "#EFF6FF", color: "#1E40AF", fontWeight: 600 }}>Gợi ý: {horizon === "short" ? "Ngắn hạn 7" : horizon === "long" ? "Dài hạn 15" : "Trung hạn 10"} video</span>
          </div>
          {checklist.map((item, idx) => (
            <div key={idx} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 8px", border: "1px solid #E5E7EB", borderRadius: 8, marginBottom: 4, flexWrap: "wrap", opacity: item.done ? 0.6 : 1 }}>
              <input type="checkbox" checked={item.done} onChange={(e) => { const arr = [...checklist]; arr[idx] = { ...arr[idx], done: e.target.checked }; setChecklist(arr); }} style={{ accentColor: "#16A34A" }} />
              <span style={{ fontSize: 12, fontWeight: item.done ? 400 : 600, flex: 1, minWidth: 120 }}>{item.name}</span>
              <span style={{ fontSize: 10, color: "#71717A" }}>{item.qty}</span>
              <select value={item.assignee} onChange={(e) => { const arr = [...checklist]; arr[idx] = { ...arr[idx], assignee: e.target.value }; setChecklist(arr); }} style={{ width: "auto", padding: "2px 6px", fontSize: 10, border: "1px solid #E4E4E7", borderRadius: 4, color: item.assignee ? "#4F46E5" : "#A1A1AA" }}>
                <option value="">— Giao —</option>
                <option>Hoa</option><option>Phát</option><option>Linh</option><option>Đức</option><option>Mai Thu</option>
              </select>
              <span style={{ fontSize: 9, color: "#A1A1AA" }}>DL:</span>
              <input type="date" value={item.deadline} onChange={(e) => { const arr = [...checklist]; arr[idx] = { ...arr[idx], deadline: e.target.value }; setChecklist(arr); }} style={{ padding: "2px 4px", fontSize: 9, border: "1px solid #E4E4E7", borderRadius: 4, width: "auto" }} />
              <button type="button" onClick={() => setChecklist(checklist.filter((_, i) => i !== idx))} style={{ background: "none", border: "none", color: "#DC2626", cursor: "pointer", fontSize: 13, padding: "0 4px" }}>×</button>
            </div>
          ))}
          <div style={{ display: "flex", gap: 6, marginTop: 6, marginBottom: 12 }}>
            <input type="text" placeholder="Tên mục mới (VD: Video unbox, Infographic...)" value={newItemName} onChange={(e) => setNewItemName(e.target.value)} style={{ flex: 1, padding: "5px 10px", border: "1px solid #E4E4E7", borderRadius: 6, fontSize: 12 }} />
            <input type="text" placeholder="SL" value={newItemQty} onChange={(e) => setNewItemQty(e.target.value)} style={{ width: 50, padding: "5px 8px", border: "1px solid #E4E4E7", borderRadius: 6, fontSize: 12, textAlign: "center" }} />
            <button type="button" className="btn btn-ghost" style={{ fontSize: 10, padding: "5px 10px" }} onClick={() => { if (!newItemName.trim()) return; setChecklist([...checklist, { name: newItemName, qty: Number(newItemQty) || 1, assignee: "", deadline: "", done: false }]); setNewItemName(""); setNewItemQty(""); }}>+ Thêm</button>
          </div>

          <div style={{ height: 1, background: "#E5E7EB", margin: "12px 0" }} />

          {/* Listing */}
          <div style={{ fontSize: 10, fontWeight: 700, color: "#71717A", textTransform: "uppercase", marginBottom: 6 }}>LISTING SẢN PHẨM</div>
          {selChannels.map((ch) => (
            <div key={ch} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 8px", border: "1px solid #E5E7EB", borderRadius: 8, marginBottom: 4, flexWrap: "wrap" }}>
              <input type="checkbox" checked={listings[ch]?.done || false} onChange={(e) => setListings({ ...listings, [ch]: { ...listings[ch], done: e.target.checked } })} style={{ accentColor: "#16A34A" }} />
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: CH_CHIP_COLORS[ch], flexShrink: 0 }} />
              <span style={{ fontSize: 12, fontWeight: 600, minWidth: 70 }}>{ch}</span>
              <input type="text" placeholder={`Link ${ch}...`} value={(listings[ch]?.links || "").split("\n")[0]} onChange={(e) => setListings({ ...listings, [ch]: { ...listings[ch], links: e.target.value } })} style={{ flex: 1, padding: "4px 8px", border: "1px solid #E5E7EB", borderRadius: 6, fontSize: 11, minWidth: 120 }} />
              <select style={{ width: "auto", padding: "2px 6px", fontSize: 10, border: "1px solid #E4E4E7", borderRadius: 4 }}>
                <option value="">— Giao —</option>
                <option>Hoa</option><option>Phát</option><option>Linh</option>
              </select>
              <span style={{ fontSize: 9, color: "#A1A1AA" }}>DL:</span>
              <input type="date" style={{ padding: "2px 4px", fontSize: 9, border: "1px solid #E4E4E7", borderRadius: 4, width: "auto" }} />
            </div>
          ))}
          {selChannels.length === 0 && <div style={{ color: "#9CA3AF", fontSize: 12, textAlign: "center", padding: 16 }}>Chọn kênh bán ở B3 trước</div>}
        </div>

        </div>{/* end scrollable content */}

        {/* Fixed footer */}
        <div style={{ background: "#fff", borderTop: "1px solid #E4E4E7", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 20px", flexShrink: 0 }}>
          <div style={{ fontSize: 11, color: "#6B7280" }}>{stepDone.filter(Boolean).length}/{stepDone.length} mục đã điền</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-ghost btn-sm" onClick={onClose}>Huỷ</button>
            <button className="btn btn-ghost btn-sm" onClick={() => save("READY")} disabled={pending}>Lưu nháp</button>
            <button className="btn btn-sm" style={{ background: BRAND, color: "#fff", padding: "8px 20px" }} onClick={() => save("LAUNCHED")} disabled={pending}>Bắt đầu Launch →</button>
          </div>
        </div>
      </div>
    </div>
  );
}
