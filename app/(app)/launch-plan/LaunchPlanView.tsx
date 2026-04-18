"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { formatVND, formatVNDCompact, toNum } from "@/lib/format";
import type { LaunchPlanRow } from "@/lib/db/plans";
import { deleteLaunchPlanAction, saveLaunchPlanAction } from "./actions";

type Tab = "ready" | "launching" | "done";
type InvItem = { sku: string; product_name: string; available_qty: number; category: string };

const CHANNELS = ["Facebook", "TikTok Shop", "Shopee", "Web/B2B", "Live stream"];
const PRODUCT_TYPES = [
  { k: "short", label: "Ngắn hạn <3 tháng", color: "#16A34A" },
  { k: "medium", label: "Trung hạn 3-6T", color: "#D97706" },
  { k: "long", label: "Dài hạn >6T", color: "#7C3AED" },
];
const CONTENT_TARGETS = [
  { type: "problem", label: "Vấn đề", desc: "Đặt vấn đề — khai thác pain point", color: "#DC2626", defaultVideos: 3 },
  { type: "demo", label: "Chứng minh", desc: "Demo SP — chứng minh hiệu quả", color: "#16A34A", defaultVideos: 2 },
  { type: "cta", label: "Chốt đơn", desc: "CTA — tạo urgency, thúc đẩy mua", color: "#3B82F6", defaultVideos: 2 },
];
const FORM_STEPS = [
  { n: 1, label: "Loại hàng" },
  { n: 2, label: "Khách hàng" },
  { n: 3, label: "Kênh bán" },
  { n: 4, label: "Định giá" },
  { n: 5, label: "Listing" },
  { n: 6, label: "Nội dung" },
  { n: 7, label: "Target DS" },
];

// ─── Metrics type stored in JSONB ────────────────────────
type Metrics = {
  deploy_id?: string;
  product_desc?: string;
  product_type?: string; product_type_note?: string;
  customer?: { group?: string; pain_point?: string; competitors?: string };
  channels_selected?: string[]; channel_note?: string;
  pricing?: { cost?: number; sell_price?: number };
  listings?: Record<string, { links?: string[]; done?: boolean }>;
  content?: { drive_link?: string; assignees?: string; targets?: Array<{ type: string; videos: number; published: number }> };
  sales_target?: { stock_qty?: number; months?: number; channel_split?: Record<string, number>; price_from?: number; price_to?: number; confirmed?: boolean };
};

function getMetrics(plan: LaunchPlanRow): Metrics {
  return (plan.metrics as Metrics) || {};
}

/* ═══════════════════════════════════════════════════════════
   MAIN VIEW
   ═══════════════════════════════════════════════════════════ */
export default function LaunchPlanView({ plans }: { plans: LaunchPlanRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [tab, setTab] = useState<Tab>("ready");
  const [search, setSearch] = useState("");
  const [invSearch, setInvSearch] = useState("");
  const [invResults, setInvResults] = useState<InvItem[]>([]);
  const [invLoading, setInvLoading] = useState(false);
  const [formOpen, setFormOpen] = useState<{ sku?: string; name?: string } | null>(null);
  const [editPlan, setEditPlan] = useState<LaunchPlanRow | null>(null);

  // Categorize plans
  const ready = useMemo(() => plans.filter((p) => p.stage === "DRAFT" || p.stage === "READY"), [plans]);
  const launching = useMemo(() => plans.filter((p) => p.stage === "LAUNCHED"), [plans]);
  const done = useMemo(() => plans.filter((p) => p.stage === "COMPLETED" || p.stage === "POSTPONED"), [plans]);

  // KPI counts
  const byType = useMemo(() => {
    const m = { short: 0, medium: 0, long: 0 };
    for (const p of plans) {
      const t = getMetrics(p).product_type;
      if (t === "short" || t === "medium" || t === "long") m[t]++;
    }
    return m;
  }, [plans]);

  // Channel progress
  const channelProgress = useMemo(() => {
    const total = launching.length || 1;
    return ["Facebook", "TikTok", "Shopee", "Web/B2B"].map((ch) => {
      const count = launching.filter((p) => {
        const m = getMetrics(p);
        const listings = m.listings || {};
        return listings[ch]?.done;
      }).length;
      return { name: ch, count, pct: Math.round((count / total) * 100) };
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

  // Delete
  function del(id: string, name: string) {
    if (!confirm(`Xoá launch plan "${name}"?`)) return;
    startTransition(async () => {
      const r = await deleteLaunchPlanAction(id);
      if (!r.ok) alert(r.error);
      else router.refresh();
    });
  }

  // Filter by search
  const filterList = (list: LaunchPlanRow[]) => {
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter((p) => (p.product_name || "").toLowerCase().includes(q) || (p.sku || "").toLowerCase().includes(q));
  };

  return (
    <section className="section">
      {/* ═══ HEADER ═══ */}
      <div className="page-hdr">
        <div>
          <div className="page-title">Launch sản phẩm</div>
          <div className="page-sub">{plans.length} SP · {launching.length} đang launch · {done.length} hoàn tất</div>
        </div>
      </div>

      {/* ═══ KPIs ═══ */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr) auto auto auto", gap: 10, marginBottom: 12, alignItems: "start" }}>
        <div className="stat-card" style={{ borderLeft: "4px solid #3B82F6" }}>
          <div className="sl">SẴN SÀNG</div>
          <div className="sv">{ready.length}</div>
          <div className="ss">có info + giá</div>
        </div>
        <div className="stat-card" style={{ borderLeft: "4px solid #D97706" }}>
          <div className="sl">ĐANG LAUNCH</div>
          <div className="sv">{launching.length}</div>
          <div className="ss">có kế hoạch</div>
        </div>
        <div className="stat-card" style={{ borderLeft: "4px solid #16A34A" }}>
          <div className="sl">ĐANG SỐNG</div>
          <div className="sv">0</div>
          <div className="ss">đã bán</div>
        </div>
        <div className="stat-card" style={{ borderLeft: "4px solid #6B7280" }}>
          <div className="sl">HOÀN TẤT</div>
          <div className="sv">{done.length}</div>
        </div>

        {/* Channel progress */}
        <div className="card" style={{ padding: "10px 14px", minWidth: 160 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#6B7280", marginBottom: 6 }}>TIẾN ĐỘ THEO KÊNH</div>
          {channelProgress.map((ch) => (
            <div key={ch.name} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3, fontSize: 10 }}>
              <span style={{ width: 55 }}>{ch.name}</span>
              <div style={{ flex: 1, height: 5, background: "#F3F4F6", borderRadius: 2, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${ch.pct}%`, background: "#3B82F6", borderRadius: 2 }} />
              </div>
              <span style={{ width: 25, textAlign: "right", fontWeight: 600 }}>{ch.pct}%</span>
            </div>
          ))}
        </div>

        {/* Product type */}
        <div className="card" style={{ padding: "10px 14px", minWidth: 120 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#6B7280", marginBottom: 6 }}>LOẠI HÀNG</div>
          {PRODUCT_TYPES.map((pt) => (
            <div key={pt.k} style={{ display: "flex", justifyContent: "space-between", fontSize: 10, marginBottom: 3 }}>
              <span style={{ color: pt.color, fontWeight: 600 }}>{pt.label.split(" ")[0]}</span>
              <span style={{ fontWeight: 700 }}>{byType[pt.k as keyof typeof byType]} SP</span>
            </div>
          ))}
        </div>
      </div>

      {/* ═══ TABS + SEARCH inline ═══ */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <div className="mini-tabs" style={{ marginBottom: 0 }}>
          {([["ready", `Sẵn sàng launch ${ready.length}`], ["launching", `Đang launch ${launching.length}`], ["done", "Hoàn tất"]] as const).map(([k, label]) => (
            <button key={k} className={"mini-tab" + (tab === k ? " active" : "")} onClick={() => setTab(k)} style={{ padding: "8px 16px" }}>{label}</button>
          ))}
        </div>

        {/* Search existing plans */}
        <input placeholder="Tìm SP, SKU..." value={search} onChange={(e) => setSearch(e.target.value)}
          style={{ padding: "6px 12px", border: "1px solid #E5E7EB", borderRadius: 6, fontSize: 12, width: 180 }} />

        {/* Inventory search — inline */}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: "#6B7280", whiteSpace: "nowrap" }}>TÌM SP TRONG KHO:</span>
          <input placeholder="Tên SP, SKU, barcode..." value={invSearch} onChange={(e) => setInvSearch(e.target.value)}
            style={{ padding: "6px 12px", border: "1px solid #E5E7EB", borderRadius: 6, fontSize: 12, width: 220 }} />
          <button className="btn btn-primary btn-xs" onClick={() => searchInventory(invSearch)}>Tìm</button>
        </div>
      </div>

      {/* ═══ INVENTORY SEARCH RESULTS (dropdown-like) ═══ */}
      {invResults.length > 0 && (
        <div className="card" style={{ padding: 0, marginBottom: 12, border: "2px solid #3B82F6" }}>
          <div style={{ padding: "8px 14px", background: "#EFF6FF", borderBottom: "1px solid #BFDBFE", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#1D4ED8" }}>Kết quả tìm trong kho ({invResults.length})</span>
            <button className="btn btn-ghost btn-xs" onClick={() => { setInvResults([]); setInvSearch(""); }}>Đóng</button>
          </div>
          {invResults.map((item) => (
            <div key={item.sku} style={{ padding: "8px 14px", borderBottom: "1px solid #F3F4F6", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <span style={{ fontWeight: 600, fontSize: 12 }}>{item.product_name}</span>
                <span style={{ fontSize: 10, color: "#6B7280", marginLeft: 8 }}>SKU: {item.sku} · Tồn: {item.available_qty.toLocaleString("vi-VN")}</span>
              </div>
              <button className="btn btn-primary btn-xs" onClick={() => { setFormOpen({ sku: item.sku, name: item.product_name }); setInvResults([]); setInvSearch(""); }}>
                Tạo Launch Plan
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ═══ TAB: SẴN SÀNG LAUNCH — full width ═══ */}
      {tab === "ready" && (
        <div className="card" style={{ padding: 0 }}>
          {filterList(ready).map((p) => {
            const pm = getMetrics(p);
            const hasDeployId = !!pm.deploy_id;
            const pt = PRODUCT_TYPES.find((t) => t.k === pm.product_type);
            return (
              <div key={p.id} style={{ padding: "10px 14px", borderBottom: "1px solid #F3F4F6", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 2 }}>
                    {hasDeployId && <span style={{ fontSize: 8, background: "#16A34A", color: "#fff", borderRadius: 3, padding: "1px 5px", fontWeight: 600 }}>TỪ TRIỂN KHAI</span>}
                    {pt && <span style={{ fontSize: 8, background: pt.color, color: "#fff", borderRadius: 3, padding: "1px 5px", fontWeight: 600 }}>{pt.label.split(" ")[0]}</span>}
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{p.product_name}</span>
                  </div>
                  <div style={{ fontSize: 10, color: "#6B7280" }}>
                    SKU: {p.sku || "—"}
                    {pm.pricing?.sell_price ? ` · Giá: ${formatVND(pm.pricing.sell_price)}` : ""}
                    {pm.pricing?.cost ? ` · Vốn: ${formatVND(pm.pricing.cost)}` : ""}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 4 }}>
                  <button className="btn btn-primary btn-xs" onClick={() => setEditPlan(p)}>Tạo Launch Plan</button>
                  <button className="btn btn-ghost btn-xs" style={{ color: "var(--red)" }} onClick={() => del(p.id, p.product_name || "")}>✕</button>
                </div>
              </div>
            );
          })}
          {filterList(ready).length === 0 && <div className="muted" style={{ padding: 24, textAlign: "center" }}>Không có SP sẵn sàng.</div>}
        </div>
      )}

      {/* ═══ TAB: ĐANG LAUNCH ═══ */}
      {tab === "launching" && (() => {
        const filtered = filterList(launching);
        const totalTarget = filtered.reduce((s, p) => s + (getMetrics(p).sales_target?.stock_qty || 0), 0);
        const needAttention = filtered.filter((p) => {
          const m = getMetrics(p);
          const ct = m.content?.targets || [];
          const totalVid = ct.reduce((s, t) => s + t.videos, 0);
          const pubVid = ct.reduce((s, t) => s + t.published, 0);
          return totalVid > 0 && pubVid / totalVid < 0.5;
        }).length;

        return (
          <div>
            {/* Mini KPIs */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 12 }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 10, color: "#6B7280" }}>Đang launch</div>
                <div style={{ fontSize: 22, fontWeight: 800 }}>{filtered.length} <span style={{ fontSize: 11, fontWeight: 400, color: "#6B7280" }}>SP</span></div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 10, color: "#6B7280" }}>Đã bán / Target</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: "#16A34A" }}>0 / {totalTarget.toLocaleString("vi-VN")}</div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 10, color: "#6B7280" }}>Hoàn thành</div>
                <div style={{ fontSize: 22, fontWeight: 800 }}>0%</div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 10, color: "#6B7280" }}>Cần chú ý</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: needAttention > 0 ? "#DC2626" : "#16A34A" }}>{needAttention} <span style={{ fontSize: 11, fontWeight: 400, color: "#6B7280" }}>SP</span></div>
              </div>
            </div>

            {/* Product cards */}
            {filtered.map((p) => {
              const m = getMetrics(p);
              const pt = PRODUCT_TYPES.find((t) => t.k === m.product_type);
              const chSel = m.channels_selected || [];
              const listings = m.listings || {};
              const ct = m.content?.targets || [];
              const totalVid = ct.reduce((s, t) => s + t.videos, 0);
              const pubVid = ct.reduce((s, t) => s + t.published, 0);
              const targetQty = m.sales_target?.stock_qty || 0;
              const confirmed = m.sales_target?.confirmed;
              const hasWarning = !confirmed || (totalVid > 0 && pubVid / totalVid < 0.5);

              // Step progress
              const steps = [
                { label: "Phân tích", done: !!m.customer?.group },
                { label: "Định giá", done: (m.pricing?.sell_price || 0) > 0 },
                { label: "Phân bổ", done: !!m.sales_target?.confirmed },
                { label: "Nội dung", done: totalVid > 0 && pubVid >= totalVid },
              ];

              const CHANNEL_COLORS: Record<string, string> = { Facebook: "#1877F2", "TikTok Shop": "#000", Shopee: "#EE4D2D", "Web/B2B": "#6366F1", "Live stream": "#16A34A" };
              const CHANNEL_SHORT: Record<string, string> = { Facebook: "FB", "TikTok Shop": "TT", Shopee: "SP", "Web/B2B": "Web", "Live stream": "Live" };

              return (
                <div key={p.id} className="card" style={{ marginBottom: 8, padding: "12px 16px" }}>
                  <div style={{ display: "flex", gap: 12 }}>
                    {/* Left: product info */}
                    <div style={{ width: 280, flexShrink: 0 }}>
                      <div style={{ display: "flex", gap: 4, marginBottom: 4, flexWrap: "wrap" }}>
                        {pt && <span style={{ fontSize: 9, background: pt.color, color: "#fff", borderRadius: 3, padding: "1px 6px", fontWeight: 600 }}>{pt.label.split(" ")[0]}</span>}
                        {hasWarning && <span style={{ fontSize: 9, background: "#DC2626", color: "#fff", borderRadius: 3, padding: "1px 6px", fontWeight: 600 }}>Cảnh báo</span>}
                      </div>
                      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 2 }}>{p.product_name}</div>
                      <div style={{ fontSize: 10, color: "#6B7280", marginBottom: 6 }}>{p.sku || "—"}</div>
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                        {chSel.map((ch) => {
                          const done = listings[ch]?.done;
                          return (
                            <span key={ch} style={{
                              fontSize: 9, padding: "2px 6px", borderRadius: 3, fontWeight: 600,
                              background: done ? CHANNEL_COLORS[ch] || "#3B82F6" : "#F3F4F6",
                              color: done ? "#fff" : "#6B7280",
                            }}>
                              {CHANNEL_SHORT[ch] || ch} {done ? "✓" : "—"}
                            </span>
                          );
                        })}
                      </div>
                    </div>

                    {/* Middle: step progress + sales progress */}
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", gap: 12, marginBottom: 8 }}>
                        {steps.map((s) => (
                          <span key={s.label} style={{ fontSize: 10, color: s.done ? "#16A34A" : "#9CA3AF", display: "flex", alignItems: "center", gap: 3 }}>
                            <span style={{ width: 10, height: 10, borderRadius: "50%", border: s.done ? "none" : "1.5px solid #D1D5DB", background: s.done ? "#16A34A" : "transparent", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 7, color: "#fff" }}>
                              {s.done ? "✓" : ""}
                            </span>
                            {s.label}
                          </span>
                        ))}
                      </div>
                      <div style={{ fontSize: 10, color: "#6B7280", marginBottom: 4 }}>Tiến độ DS · 0/{targetQty} SP</div>
                      <div style={{ height: 6, background: "#F3F4F6", borderRadius: 3, overflow: "hidden", position: "relative" }}>
                        <div style={{ height: "100%", width: "0%", background: "#16A34A", borderRadius: 3 }} />
                        <span style={{ position: "absolute", right: 4, top: -12, fontSize: 9, color: "#6B7280" }}>0%</span>
                      </div>
                    </div>

                    {/* Right: target + button */}
                    <div style={{ width: 100, textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontSize: 10, color: "#6B7280" }}>Target</div>
                      <div style={{ fontSize: 16, fontWeight: 800 }}>{targetQty.toLocaleString("vi-VN")} <span style={{ fontSize: 9, fontWeight: 400 }}>SP</span></div>
                      <button className="btn btn-ghost btn-xs" style={{ marginTop: 6 }} onClick={() => setEditPlan(p)}>Xem plan</button>
                    </div>
                  </div>
                </div>
              );
            })}
            {filtered.length === 0 && <div className="muted" style={{ padding: 24, textAlign: "center" }}>Chưa có SP đang launch.</div>}
          </div>
        );
      })()}

      {/* ═══ TAB: HOÀN TẤT ═══ */}
      {tab === "done" && (
        <div className="card" style={{ padding: 0 }}>
          {done.map((p) => (
            <div key={p.id} style={{ padding: "12px 16px", borderBottom: "1px solid #F3F4F6", display: "flex", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontWeight: 600 }}>{p.product_name}</div>
                <div style={{ fontSize: 10, color: "#6B7280" }}>SKU: {p.sku || "—"}</div>
              </div>
              <span className={`chip ${p.stage === "COMPLETED" ? "chip-green" : "chip-amber"}`}>{p.stage === "COMPLETED" ? "Hoàn tất" : "Hoãn"}</span>
            </div>
          ))}
          {done.length === 0 && <div className="muted" style={{ padding: 24, textAlign: "center" }}>Chưa có SP hoàn tất.</div>}
        </div>
      )}

      {/* ═══ FORM MODAL — 7 steps ═══ */}
      {(formOpen || editPlan) && (
        <LaunchFormModal
          initial={editPlan}
          defaultSku={formOpen?.sku}
          defaultName={formOpen?.name}
          onClose={() => { setFormOpen(null); setEditPlan(null); }}
          onSaved={() => { setFormOpen(null); setEditPlan(null); router.refresh(); }}
          pending={pending}
          startTransition={startTransition}
        />
      )}
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════
   LAUNCH FORM MODAL — 7 steps
   ═══════════════════════════════════════════════════════════ */
function LaunchFormModal({ initial, defaultSku, defaultName, onClose, onSaved, pending, startTransition }: {
  initial: LaunchPlanRow | null;
  defaultSku?: string; defaultName?: string;
  onClose: () => void; onSaved: () => void;
  pending: boolean;
  startTransition: ReturnType<typeof useTransition>[1];
}) {
  const m = initial ? getMetrics(initial) : {} as Metrics;
  const [step, setStep] = useState(1);
  const [sku, setSku] = useState(initial?.sku || defaultSku || "");
  const [name, setName] = useState(initial?.product_name || defaultName || "");
  const [stage, setStage] = useState(initial?.stage || "READY");

  // Step 1: Loại hàng
  const [productType, setProductType] = useState(m.product_type || "medium");
  const [productTypeNote, setProductTypeNote] = useState(m.product_type_note || "");

  // Step 2: Khách hàng
  const [custGroup, setCustGroup] = useState(m.customer?.group || "");
  const [custPain, setCustPain] = useState(m.customer?.pain_point || "");
  const [custComp, setCustComp] = useState(m.customer?.competitors || "");

  // Step 3: Kênh bán
  const [channels, setChannels] = useState<string[]>(m.channels_selected || ["Facebook", "TikTok Shop", "Shopee"]);
  const [channelNote, setChannelNote] = useState(m.channel_note || "");

  // Step 4: Định giá
  const [cost, setCost] = useState(m.pricing?.cost || 0);
  const [sellPrice, setSellPrice] = useState(m.pricing?.sell_price || 0);

  // Step 5: Listing
  const [listings, setListings] = useState<Record<string, { links: string; done: boolean }>>(
    Object.fromEntries(CHANNELS.map((ch) => [ch, { links: (m.listings?.[ch]?.links || []).join(", "), done: m.listings?.[ch]?.done || false }]))
  );

  // Step 6: Nội dung
  const [driveLink, setDriveLink] = useState(m.content?.drive_link || "");
  const [assignees, setAssignees] = useState(m.content?.assignees || "");
  const [contentTargets, setContentTargets] = useState(
    CONTENT_TARGETS.map((ct) => {
      const existing = m.content?.targets?.find((t) => t.type === ct.type);
      return { type: ct.type, videos: existing?.videos ?? ct.defaultVideos, published: existing?.published ?? 0 };
    })
  );

  // Step 7: Target
  const [stockQty, setStockQty] = useState(m.sales_target?.stock_qty || 0);
  const [months, setMonths] = useState(m.sales_target?.months || 4);
  const [channelSplit, setChannelSplit] = useState<Record<string, number>>(m.sales_target?.channel_split || { Shopee: 55, TikTok: 25, Facebook: 10, "Web/B2B": 10 });
  const [priceFrom, setPriceFrom] = useState(m.sales_target?.price_from || 0);
  const [priceTo, setPriceTo] = useState(m.sales_target?.price_to || 0);
  const [confirmed, setConfirmed] = useState(m.sales_target?.confirmed || false);

  const gross = sellPrice - cost;
  const grossPct = sellPrice > 0 ? ((gross / sellPrice) * 100).toFixed(1) : "0";

  function save(asStage?: string) {
    if (!name.trim()) return alert("Nhập tên SP");
    const metrics: Metrics = {
      product_type: productType,
      product_type_note: productTypeNote,
      customer: { group: custGroup, pain_point: custPain, competitors: custComp },
      channels_selected: channels,
      channel_note: channelNote,
      pricing: { cost, sell_price: sellPrice },
      listings: Object.fromEntries(Object.entries(listings).map(([ch, v]) => [ch, { links: v.links.split(",").map((l) => l.trim()).filter(Boolean), done: v.done }])),
      content: { drive_link: driveLink, assignees, targets: contentTargets },
      sales_target: { stock_qty: stockQty, months, channel_split: channelSplit, price_from: priceFrom, price_to: priceTo, confirmed },
    };

    startTransition(async () => {
      const r = await saveLaunchPlanAction(initial?.id || null, {
        sku: sku || null,
        product_name: name,
        stage: asStage || stage,
        channels: channels.join(","),
        metrics: metrics as Record<string, unknown>,
        note: productTypeNote || null,
      });
      if (!r.ok) alert(r.error);
      else onSaved();
    });
  }

  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", zIndex: 100, display: "flex", justifyContent: "center", alignItems: "flex-start", paddingTop: 40, overflowY: "auto" }}>
      <div style={{ background: "#fff", borderRadius: 12, width: "90%", maxWidth: 800, maxHeight: "85vh", overflowY: "auto", padding: "20px 24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>Tạo Launch Plan</div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "#6B7280" }}>✕</button>
        </div>

        {/* Step navigation */}
        <div style={{ display: "flex", gap: 0, marginBottom: 20, borderBottom: "1px solid #E5E7EB", paddingBottom: 8 }}>
          {FORM_STEPS.map((s) => (
            <button key={s.n} onClick={() => setStep(s.n)} style={{
              padding: "4px 12px", fontSize: 11, fontWeight: step === s.n ? 700 : 400,
              color: step === s.n ? "#3B82F6" : "#6B7280", background: "none", border: "none",
              borderBottom: step === s.n ? "2px solid #3B82F6" : "2px solid transparent",
              cursor: "pointer", marginBottom: -9,
            }}>
              {s.n} {s.label}
            </button>
          ))}
        </div>

        {/* Product info (always shown) */}
        <div style={{ display: "flex", gap: 12, marginBottom: 16, padding: "10px 14px", background: "#F9FAFB", borderRadius: 8 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 13 }}>{name || "Tên sản phẩm"}</div>
            <div style={{ fontSize: 10, color: "#6B7280" }}>SKU: {sku || "—"} {cost > 0 && `· Vốn: ${formatVND(cost)}`}</div>
          </div>
        </div>

        {/* ─── STEP 1: Loại hàng ─── */}
        {step === 1 && (
          <div>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>① Loại hàng</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              {PRODUCT_TYPES.map((pt) => (
                <button key={pt.k} onClick={() => setProductType(pt.k)}
                  style={{ padding: "8px 16px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer",
                    background: productType === pt.k ? pt.color : "#F3F4F6",
                    color: productType === pt.k ? "#fff" : "#374151",
                    border: "none",
                  }}>
                  {pt.label}
                </button>
              ))}
            </div>
            <div className="form-group"><label>GHI CHÚ</label>
              <textarea rows={2} value={productTypeNote} onChange={(e) => setProductTypeNote(e.target.value)} placeholder="Lý do phân loại, đặc điểm hàng hoá..." />
            </div>
          </div>
        )}

        {/* ─── STEP 2: Khách hàng ─── */}
        {step === 2 && (
          <div>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>② Khách hàng — thị trường</div>
            <div className="form-grid fg-3" style={{ marginBottom: 10 }}>
              <div className="form-group"><label>NHÓM KHÁCH HÀNG</label><textarea rows={2} value={custGroup} onChange={(e) => setCustGroup(e.target.value)} placeholder="Hộ gia đình, tuổi, đặc điểm..." /></div>
              <div className="form-group"><label>NHU CẦU / PAIN POINT</label><textarea rows={2} value={custPain} onChange={(e) => setCustPain(e.target.value)} placeholder="Lo ngại, vấn đề cần giải quyết..." /></div>
              <div className="form-group"><label>ĐỐI THỦ + GIÁ THAM CHIẾU</label><textarea rows={2} value={custComp} onChange={(e) => setCustComp(e.target.value)} placeholder="Xiaomi 1.2tr · Sharp 2.5tr..." /></div>
            </div>
          </div>
        )}

        {/* ─── STEP 3: Kênh bán ─── */}
        {step === 3 && (
          <div>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>③ Kênh bán</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
              {CHANNELS.map((ch) => {
                const active = channels.includes(ch);
                const colors: Record<string, string> = { Facebook: "#1877F2", "TikTok Shop": "#FE2C55", Shopee: "#EE4D2D", "Web/B2B": "#6366F1", "Live stream": "#16A34A" };
                return (
                  <button key={ch} onClick={() => setChannels(active ? channels.filter((c) => c !== ch) : [...channels, ch])}
                    style={{ padding: "6px 14px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer",
                      background: active ? colors[ch] || "#3B82F6" : "#F3F4F6",
                      color: active ? "#fff" : "#374151", border: "none",
                    }}>
                    {ch}
                  </button>
                );
              })}
            </div>
            <div className="form-group"><label>GHI CHÚ KÊNH</label>
              <textarea rows={2} value={channelNote} onChange={(e) => setChannelNote(e.target.value)} placeholder="Ưu tiên kênh nào, lý do..." />
            </div>
          </div>
        )}

        {/* ─── STEP 4: Định giá ─── */}
        {step === 4 && (
          <div>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>④ Định giá &amp; chương trình bán</div>
            <div className="form-grid fg-3" style={{ marginBottom: 12 }}>
              <div className="form-group"><label>GIÁ VỐN A</label><input type="number" value={cost || ""} onChange={(e) => setCost(Number(e.target.value))} /></div>
              <div className="form-group"><label>GIÁ BÁN</label><input type="number" value={sellPrice || ""} onChange={(e) => setSellPrice(Number(e.target.value))} /></div>
              <div style={{ padding: "8px 0" }}>
                <div style={{ fontSize: 10, color: "#6B7280" }}>Gross (B-A)</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: gross >= 0 ? "#16A34A" : "#DC2626" }}>
                  {gross >= 0 ? "+" : ""}{formatVND(gross)} ({grossPct}%)
                </div>
              </div>
            </div>
            {cost > 0 && sellPrice > 0 && (
              <div className="card" style={{ padding: "10px 14px", background: "#F9FAFB" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#6B7280", marginBottom: 6 }}>KỊCH BẢN LỢI NHUẬN</div>
                {[
                  { label: "Xả hàng", fees: "Sàn 20%", pct: 0.20 },
                  { label: "Bán thường", fees: "Sàn 20%, Thuế 1.5%, HT 7k, VH 10%", pct: 0.315 },
                  { label: "Có ads", fees: "Sàn 20%, Thuế 1.5%, HT 7k, VH 10%, Ads 10%", pct: 0.415 },
                  { label: "Ads + Aff", fees: "Sàn 20%, Thuế 1.5%, HT 7k, VH 10%, Ads 10%, Aff 10%", pct: 0.515 },
                ].map((s) => {
                  const feesAmt = sellPrice * s.pct + 7000;
                  const profit = sellPrice - cost - feesAmt;
                  const profitPct = sellPrice > 0 ? (profit / sellPrice * 100).toFixed(1) : "0";
                  return (
                    <div key={s.label} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 11, borderBottom: "1px solid #E5E7EB" }}>
                      <span>
                        <span style={{ fontWeight: 600 }}>① {s.label}</span>
                        <span style={{ color: "#9CA3AF", marginLeft: 8, fontSize: 9 }}>{s.fees}</span>
                      </span>
                      <span style={{ fontWeight: 700, color: profit >= 0 ? "#16A34A" : "#DC2626" }}>
                        {profit >= 0 ? "+" : ""}{formatVND(profit)} ({profitPct}%)
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ─── STEP 5: Listing ─── */}
        {step === 5 && (
          <div>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>⑤ Listing lên sàn &amp; web</div>
            {channels.map((ch) => (
              <div key={ch} style={{ marginBottom: 10, padding: "10px 14px", border: "1px solid #E5E7EB", borderRadius: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <span style={{ fontWeight: 700, fontSize: 12 }}>{ch}</span>
                  <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, cursor: "pointer" }}>
                    <input type="checkbox" checked={listings[ch]?.done || false}
                      onChange={(e) => setListings({ ...listings, [ch]: { ...listings[ch], done: e.target.checked } })} />
                    ĐÃ ĐĂNG
                  </label>
                </div>
                <input placeholder={`Link ${ch} chính...`} value={listings[ch]?.links || ""}
                  onChange={(e) => setListings({ ...listings, [ch]: { ...listings[ch], links: e.target.value } })}
                  style={{ width: "100%", fontSize: 11 }} />
              </div>
            ))}
          </div>
        )}

        {/* ─── STEP 6: Nội dung ─── */}
        {step === 6 && (
          <div>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>⑥ Sản xuất &amp; đăng tải nội dung</div>
            <div className="form-grid fg-2" style={{ marginBottom: 12 }}>
              <div className="form-group"><label>LINK THƯ MỤC DRIVE</label><input value={driveLink} onChange={(e) => setDriveLink(e.target.value)} placeholder="https://drive.google.com/..." /></div>
              <div className="form-group"><label>NGƯỜI PHỤ TRÁCH</label><input value={assignees} onChange={(e) => setAssignees(e.target.value)} placeholder="+ Thêm nhân viên..." /></div>
            </div>
            <div style={{ fontWeight: 700, fontSize: 11, color: "#6B7280", marginBottom: 8 }}>TARGET NỘI DUNG SẢN XUẤT</div>
            {CONTENT_TARGETS.map((ct, ci) => {
              const target = contentTargets[ci];
              return (
                <div key={ct.type} style={{ marginBottom: 10, padding: "10px 14px", border: "1px solid #E5E7EB", borderRadius: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                    <span style={{ fontSize: 10, background: ct.color, color: "#fff", borderRadius: 4, padding: "2px 8px", fontWeight: 700 }}>{ct.label}</span>
                    <span style={{ fontSize: 11, fontWeight: 600 }}>{ct.desc}</span>
                    <span style={{ fontSize: 10, color: "#6B7280", marginLeft: "auto" }}>{target.videos} video · {target.published} đã đăng</span>
                  </div>
                  <div style={{ display: "flex", gap: 8, fontSize: 11 }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 4 }}>Số video:
                      <input type="number" value={target.videos} min={0} style={{ width: 50 }}
                        onChange={(e) => { const arr = [...contentTargets]; arr[ci] = { ...target, videos: Number(e.target.value) }; setContentTargets(arr); }} />
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: 4 }}>Đã đăng:
                      <input type="number" value={target.published} min={0} style={{ width: 50 }}
                        onChange={(e) => { const arr = [...contentTargets]; arr[ci] = { ...target, published: Number(e.target.value) }; setContentTargets(arr); }} />
                    </label>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ─── STEP 7: Target doanh số ─── */}
        {step === 7 && (
          <div>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>⑦ Target doanh số</div>
            <div className="form-grid fg-3" style={{ marginBottom: 12 }}>
              <div className="form-group"><label>Tồn kho cần bán</label><input type="number" value={stockQty || ""} onChange={(e) => setStockQty(Number(e.target.value))} /> <span style={{ fontSize: 10, color: "#6B7280" }}>SP</span></div>
              <div className="form-group"><label>Thời gian</label><input type="number" value={months || ""} onChange={(e) => setMonths(Number(e.target.value))} /> <span style={{ fontSize: 10, color: "#6B7280" }}>tháng</span></div>
              <div style={{ padding: "8px 0" }}>
                <div style={{ fontSize: 10, color: "#6B7280" }}>Cần bán trung bình</div>
                <div style={{ fontSize: 16, fontWeight: 800 }}>{months > 0 ? Math.ceil(stockQty / months) : "—"} <span style={{ fontSize: 10, fontWeight: 400, color: "#6B7280" }}>SP/tháng</span></div>
              </div>
            </div>

            <div style={{ fontWeight: 700, fontSize: 11, color: "#6B7280", marginBottom: 8 }}>PHÂN BỔ THEO KÊNH</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 12 }}>
              {[{ k: "Shopee", pct: 55 }, { k: "TikTok", pct: 25 }, { k: "Facebook", pct: 10 }, { k: "Web/B2B", pct: 10 }].map((ch) => {
                const colors: Record<string, string> = { Shopee: "#EE4D2D", TikTok: "#FE2C55", Facebook: "#1877F2", "Web/B2B": "#6366F1" };
                const val = channelSplit[ch.k] ?? ch.pct;
                const spMonth = months > 0 && stockQty > 0 ? Math.ceil((stockQty * val / 100) / months) : 0;
                return (
                  <div key={ch.k} style={{ border: "1px solid #E5E7EB", borderRadius: 8, padding: "8px 10px", textAlign: "center" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: colors[ch.k] }}>{ch.k} <span style={{ fontWeight: 400 }}>~{val}%</span></div>
                    <input type="number" value={val} min={0} max={100} style={{ width: "100%", textAlign: "center", fontSize: 16, fontWeight: 800, border: "none", background: "transparent" }}
                      onChange={(e) => setChannelSplit({ ...channelSplit, [ch.k]: Number(e.target.value) })} />
                    <div style={{ fontSize: 9, color: "#6B7280" }}>{spMonth} SP/tháng</div>
                  </div>
                );
              })}
            </div>

            <div className="form-grid fg-2" style={{ marginBottom: 12 }}>
              <div className="form-group"><label>Khoảng giá: Từ</label><input type="number" value={priceFrom || ""} onChange={(e) => setPriceFrom(Number(e.target.value))} /></div>
              <div className="form-group"><label>đến</label><input type="number" value={priceTo || ""} onChange={(e) => setPriceTo(Number(e.target.value))} /></div>
            </div>

            <label style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 14px", background: "#F9FAFB", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 12 }}>
              <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} style={{ width: 18, height: 18 }} />
              XÁC NHẬN PLAN
            </label>
          </div>
        )}

        {/* ─── Footer buttons ─── */}
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 20, paddingTop: 16, borderTop: "1px solid #E5E7EB" }}>
          <div>
            {step > 1 && <button className="btn btn-ghost btn-sm" onClick={() => setStep(step - 1)}>← Trước</button>}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-ghost btn-sm" onClick={onClose}>Huỷ</button>
            <button className="btn btn-ghost btn-sm" onClick={() => save("READY")} disabled={pending}>Lưu nháp</button>
            {step < 7 ? (
              <button className="btn btn-primary btn-sm" onClick={() => setStep(step + 1)}>Tiếp →</button>
            ) : (
              <button className="btn btn-primary btn-sm" onClick={() => save("LAUNCHED")} disabled={pending}>✓ Bắt đầu launch</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
