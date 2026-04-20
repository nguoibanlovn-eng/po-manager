"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { formatDate, formatVND, toNum } from "@/lib/format";
import { parseLinks, type Channel, type DeployGroup, type DeployProduct } from "@/lib/db/deploy-types";
import {
  approvePriceAction,
  confirmChannelAction,
  unconfirmChannelAction,
  updateInfoAction,
} from "./actions";
import Collapsible from "../components/Collapsible";

/* ─── Constants ─────────────────────────────────────────── */
const CHANNELS: { key: Channel; label: string; color: string }[] = [
  { key: "fb", label: "Facebook", color: "#1877F2" },
  { key: "shopee", label: "Shopee", color: "#EE4D2D" },
  { key: "tiktok", label: "TikTok", color: "#000" },
  { key: "web", label: "Web/B2B", color: "#0EA5E9" },
];

const PAGE_SIZE = 20;

type StatusFilter = "all" | "todo" | "done";
type TimeFilter = "all" | "today" | "7d" | "month" | "custom";
type SortOrder = "newest" | "oldest";

/* ═══════════════════════════════════════════════════════════
   MAIN VIEW
   ═══════════════════════════════════════════════════════════ */
export default function DeployView({
  groups,
  filter,
  canApprove,
}: {
  groups: DeployGroup[];
  filter: string;
  canApprove: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>((filter as StatusFilter) || "todo");
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("all");
  const [sortOrder, setSortOrder] = useState<SortOrder>("newest");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  // ── All products flat (for stats) ──
  const allProducts = useMemo(() => groups.flatMap((g) => g.products), [groups]);

  // ── Filter by status ──
  const statusFiltered = useMemo(() => {
    if (statusFilter === "todo") {
      return groups.map((g) => ({ ...g, products: g.products.filter((p) => !p.info_done) })).filter((g) => g.products.length > 0);
    }
    if (statusFilter === "done") {
      return groups.map((g) => ({ ...g, products: g.products.filter((p) => p.info_done) })).filter((g) => g.products.length > 0);
    }
    return groups;
  }, [groups, statusFilter]);

  // ── Filter by time ──
  const timeFiltered = useMemo(() => {
    if (timeFilter === "all") return statusFiltered;
    const now = new Date();
    let cutoff: Date;
    if (timeFilter === "today") {
      cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (timeFilter === "7d") {
      cutoff = new Date(now.getTime() - 7 * 86400000);
    } else if (timeFilter === "month") {
      cutoff = new Date(now.getFullYear(), now.getMonth(), 1);
    } else {
      return statusFiltered;
    }
    return statusFiltered.map((g) => ({
      ...g,
      products: g.products.filter((p) => {
        const d = new Date(p.created_at || "");
        return d >= cutoff;
      }),
    })).filter((g) => g.products.length > 0);
  }, [statusFiltered, timeFilter]);

  // ── Search ──
  const searched = useMemo(() => {
    if (!search) return timeFiltered;
    const s = search.toLowerCase();
    return timeFiltered.map((g) => ({
      ...g,
      products: g.products.filter((p) =>
        (p.product_name || "").toLowerCase().includes(s) ||
        (p.sku || "").toLowerCase().includes(s) ||
        (g.order_name || "").toLowerCase().includes(s)
      ),
    })).filter((g) => g.products.length > 0);
  }, [timeFiltered, search]);

  // ── Sort ──
  const sorted = useMemo(() => {
    const arr = [...searched];
    if (sortOrder === "oldest") arr.reverse();
    return arr;
  }, [searched, sortOrder]);

  // ── Pagination ──
  const totalProducts = sorted.reduce((s, g) => s + g.products.length, 0);
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const paginated = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // ── Stats ──
  const stats = useMemo(() => {
    let needInfo = 0, infoDone = 0;
    for (const p of allProducts) {
      if (p.info_done) infoDone++;
      else needInfo++;
    }
    return {
      needInfo,
      infoDone,
      total: allProducts.length,
      pct: allProducts.length > 0 ? Math.round((infoDone / allProducts.length) * 100) : 0,
      showing: totalProducts,
    };
  }, [allProducts, totalProducts]);

  return (
    <section className="section">
      {/* ═══ HEADER ═══ */}
      <div className="page-hdr">
        <div>
          <div className="page-title">Thông tin sản phẩm</div>
          <div className="page-sub">
            {stats.total} sản phẩm · {stats.infoDone} chờ triển khai · {stats.total - stats.infoDone} hoàn tất
          </div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => router.refresh()}>Tải lại</button>
      </div>

      {/* ═══ KPI CARDS ═══ */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 14 }}>
        <div style={{ padding: "12px 16px", background: "#FEF2F2", borderRadius: 8, border: "1px solid #FECACA" }}>
          <div style={{ fontSize: 10, color: "#991B1B", fontWeight: 600 }}>VIỆC MỚI</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: "#DC2626", margin: "2px 0" }}>{stats.needInfo}</div>
          <div style={{ fontSize: 10, color: "#B91C1C" }}>SP cần xử lý</div>
        </div>
        <div style={{ padding: "12px 16px", background: "#F0FDF4", borderRadius: 8, border: "1px solid #BBF7D0" }}>
          <div style={{ fontSize: 10, color: "#166534", fontWeight: 600 }}>ĐÃ XONG</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: "#16A34A", margin: "2px 0" }}>{stats.infoDone}</div>
          <div style={{ fontSize: 10, color: "#15803D" }}>tổng cộng</div>
        </div>
        <div style={{ padding: "12px 16px", background: "#EFF6FF", borderRadius: 8, border: "1px solid #BFDBFE" }}>
          <div style={{ fontSize: 10, color: "#1E40AF", fontWeight: 600 }}>TỈ LỆ</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: "#2563EB", margin: "2px 0" }}>{stats.pct}%</div>
          <div style={{ fontSize: 10, color: "#1D4ED8" }}>{stats.infoDone} / {stats.total} SP</div>
        </div>
        <div style={{ padding: "12px 16px", background: "#FFFBEB", borderRadius: 8, border: "1px solid #FDE68A" }}>
          <div style={{ fontSize: 10, color: "#92400E", fontWeight: 600 }}>ĐANG LỌC</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: "#D97706", margin: "2px 0" }}>{stats.showing}</div>
          <div style={{ fontSize: 10, color: "#B45309" }}>SP hiện tại</div>
        </div>
      </div>

      {/* ═══ FILTERS ═══ */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
        {/* Status filter */}
        <div className="mini-tabs" style={{ marginBottom: 0 }}>
          {([["todo", `Việc mới (${stats.needInfo})`], ["done", `Đã xong (${stats.infoDone})`], ["all", `Tất cả (${stats.total})`]] as const).map(([k, v]) => (
            <button key={k} className={"mini-tab" + (statusFilter === k ? " active" : "")} onClick={() => { setStatusFilter(k); setPage(1); }}>
              {v}
            </button>
          ))}
        </div>

        {/* Time filter */}
        <div className="mini-tabs" style={{ marginBottom: 0 }}>
          {([["all", "Tất cả"], ["today", "Hôm nay"], ["7d", "7 ngày"], ["month", "Tháng này"]] as const).map(([k, v]) => (
            <button key={k} className={"mini-tab" + (timeFilter === k ? " active" : "")} onClick={() => { setTimeFilter(k); setPage(1); }}>
              {v}
            </button>
          ))}
        </div>

        {/* Sort */}
        <div className="mini-tabs" style={{ marginBottom: 0 }}>
          <button className={"mini-tab" + (sortOrder === "newest" ? " active" : "")} onClick={() => setSortOrder("newest")}>Mới nhất</button>
          <button className={"mini-tab" + (sortOrder === "oldest" ? " active" : "")} onClick={() => setSortOrder("oldest")}>Cũ nhất</button>
        </div>

        {/* Search */}
        <input
          value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder="Tìm SP, SKU, đơn..."
          style={{ fontSize: 12, width: 180, marginLeft: "auto" }}
        />
      </div>

      {/* ═══ PAGINATION ═══ */}
      {totalPages > 1 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, fontSize: 12 }}>
          <span className="muted">Trang {page} / {totalPages} · {totalProducts} sản phẩm</span>
          <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
            <button className="btn btn-ghost btn-xs" disabled={page <= 1} onClick={() => setPage(page - 1)}>‹</button>
            {Array.from({ length: totalPages }, (_, i) => (
              <button key={i} className="btn btn-ghost btn-xs" style={{ background: page === i + 1 ? "var(--blue)" : undefined, color: page === i + 1 ? "#fff" : undefined }} onClick={() => setPage(i + 1)}>
                {i + 1}
              </button>
            ))}
            <button className="btn btn-ghost btn-xs" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>›</button>
          </div>
        </div>
      )}

      {/* ═══ GROUPS ═══ */}
      <Collapsible title="Danh sách phiếu triển khai" defaultOpen badge={<span style={{ fontSize: 10, color: "#6B7280" }}>{totalProducts} SP</span>}>
        {paginated.length === 0 ? (
          <div className="card muted" style={{ padding: 24, textAlign: "center" }}>Không có phiếu nào.</div>
        ) : (
          paginated.map((g) => (
            <OrderGroup
              key={g.order_id}
              group={g}
              canApprove={canApprove}
              disabled={pending}
              startTransition={startTransition}
              refresh={() => router.refresh()}
            />
          ))
        )}
      </Collapsible>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════
   ORDER GROUP
   ═══════════════════════════════════════════════════════════ */
function OrderGroup({
  group, canApprove, disabled, startTransition, refresh,
}: {
  group: DeployGroup; canApprove: boolean; disabled: boolean;
  startTransition: (fn: () => Promise<void>) => void; refresh: () => void;
}) {
  const todoCount = group.products.filter((p) => !p.info_done).length;
  const [expanded, setExpanded] = useState(todoCount > 0);

  return (
    <div className="card" style={{ marginBottom: 12, padding: 0, overflow: "hidden" }}>
      {/* Group header */}
      <div
        onClick={() => setExpanded((v) => !v)}
        style={{
          padding: "10px 14px", background: "#FAFAFA",
          borderBottom: expanded ? "1px solid var(--border)" : "none",
          cursor: "pointer", display: "flex", alignItems: "center", gap: 10,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>
            {group.order_name || group.order_id}
            {group.order_stage && (
              <span className="chip chip-green" style={{ marginLeft: 8, fontSize: 10 }}>{group.order_stage === "ARRIVED" ? "Hàng về" : group.order_stage}</span>
            )}
          </div>
          <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
            NCC: {group.supplier_name || "—"} · {group.products.length} SP · về {formatDate(group.arrival_date)}
          </div>
        </div>
        {todoCount > 0 && (
          <span style={{ color: "var(--red)", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}>
            {todoCount} chờ xử lý
          </span>
        )}
        <span style={{ color: "var(--muted)" }}>{expanded ? "▾" : "▸"}</span>
      </div>

      {/* Products */}
      {expanded && (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {group.products.map((p) => (
            <DeployRow
              key={p.deploy_id}
              p={p}
              canApprove={canApprove}
              disabled={disabled}
              startTransition={startTransition}
              refresh={refresh}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   DEPLOY ROW — single product
   ═══════════════════════════════════════════════════════════ */
function DeployRow({
  p, canApprove, disabled, startTransition, refresh,
}: {
  p: DeployProduct; canApprove: boolean; disabled: boolean;
  startTransition: (fn: () => Promise<void>) => void; refresh: () => void;
}) {
  const [showDetail, setShowDetail] = useState(false);
  const [desc, setDesc] = useState(p.product_desc || "");
  const [sellPrice, setSellPrice] = useState(String(p.sell_price || ""));
  const [refLinks, setRefLinks] = useState(p.ref_links || "");
  const [dirty, setDirty] = useState(false);

  const isDone = p.status === "done";
  const hasDesc = !!(p.product_desc && p.product_desc.trim());
  const hasPrice = toNum(p.sell_price) > 0;

  function saveInfo() {
    startTransition(async () => {
      const r = await updateInfoAction(p.deploy_id, {
        product_desc: desc,
        sell_price: toNum(sellPrice),
        ref_links: refLinks || undefined,
      });
      if (!r.ok) alert(r.error);
      else { setDirty(false); refresh(); }
    });
  }

  function approvePrice() {
    if (!confirm("Duyệt giá bán này?")) return;
    startTransition(async () => {
      const r = await approvePriceAction(p.deploy_id);
      if (!r.ok) alert(r.error);
      else refresh();
    });
  }

  function toggleChannel(ch: Channel, currentlyDone: boolean) {
    startTransition(async () => {
      if (currentlyDone) {
        await unconfirmChannelAction(p.deploy_id, ch);
      } else {
        const link = prompt(`Link bài đăng trên ${ch.toUpperCase()} (có thể bỏ trống):`);
        await confirmChannelAction(p.deploy_id, ch, link || undefined);
      }
      refresh();
    });
  }

  function cancelApproval() {
    // Just save with empty price_approved_by not possible from client
    // Instead, update info to force re-review
    if (!confirm("Huỷ xác nhận SP này?")) return;
    startTransition(async () => {
      await updateInfoAction(p.deploy_id, { product_desc: desc, sell_price: 0 });
      refresh();
    });
  }

  return (
    <div style={{ borderBottom: "1px solid var(--border)" }}>
      {/* ── Product header row ── */}
      <div style={{ padding: "10px 14px", display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 13 }}>{p.product_name || "—"}</div>
          <div className="muted" style={{ fontSize: 11, display: "flex", gap: 8, flexWrap: "wrap", marginTop: 2 }}>
            <span>SKU: {p.sku || "—"}</span>
            <span>· SL: {toNum(p.qty)}</span>
            <span>· Vốn: {formatVND(p.unit_price)}</span>
            {hasDesc && <span className="chip chip-green" style={{ fontSize: 9, padding: "1px 5px" }}>✓ QC xong</span>}
            {!hasPrice && <span className="chip chip-amber" style={{ fontSize: 9, padding: "1px 5px" }}>Chờ KH bán</span>}
            {hasPrice && <span className="chip chip-blue" style={{ fontSize: 9, padding: "1px 5px" }}>Giá: {formatVND(p.sell_price)}</span>}
          </div>
        </div>
        {p.info_done ? (
          <>
            <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: "#DCFCE7", color: "#16A34A", fontWeight: 600, whiteSpace: "nowrap" }}>
              ✓ Đã xong
            </span>
            <Link href="/launch-plan" style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: "#EFF6FF", color: "#2563EB", fontWeight: 600, textDecoration: "none", whiteSpace: "nowrap" }}>
              → Launch
            </Link>
          </>
        ) : (
          <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: "#FEF3C7", color: "#D97706", fontWeight: 600, whiteSpace: "nowrap" }}>
            Chờ điền
          </span>
        )}
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => setShowDetail(!showDetail)}
          style={{ fontSize: 12 }}
        >
          {p.info_done ? "Chi tiết" : "Điền info"} {showDetail ? "▴" : "▾"}
        </button>
      </div>

      {/* ── Expanded detail ── */}
      {showDetail && (
        <div style={{ padding: "0 14px 14px" }}>
          {/* Section 1: Mô tả & tính năng nổi bật */}
          <div style={{ marginBottom: 12, background: "#FAFAFA", borderRadius: 8, padding: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 14 }}>📋</span>
              <span style={{ color: hasDesc ? "var(--green)" : "var(--muted)" }}>
                {hasDesc ? "✓" : "○"}
              </span>
              <span style={{ fontWeight: 600, fontSize: 13 }}>Mô tả &amp; tính năng nổi bật</span>
            </div>
            <div className="muted" style={{ fontSize: 11, marginBottom: 6, fontStyle: "italic" }}>
              USP + CÔNG DỤNG + CHẤT LIỆU + BẢO HÀNH. DÙNG LÀM CAPTION BÁN HÀNG.
            </div>
            <textarea
              rows={4}
              value={desc}
              onChange={(e) => { setDesc(e.target.value); setDirty(true); }}
              disabled={disabled}
              placeholder="Nhập mô tả sản phẩm..."
              style={{ fontSize: 13 }}
            />
            {hasDesc && (
              <div style={{ fontSize: 11, color: "var(--green)", marginTop: 4 }}>Đã có thông tin</div>
            )}
          </div>

          {/* Section 2: Link thông tin SP quốc tế */}
          <div style={{ marginBottom: 12, background: "#FAFAFA", borderRadius: 8, padding: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 14 }}>🌐</span>
              <span style={{ color: refLinks ? "var(--green)" : "var(--muted)" }}>
                {refLinks ? "✓" : "○"}
              </span>
              <span style={{ fontWeight: 600, fontSize: 13 }}>Link thông tin sản phẩm quốc tế</span>
              <span className="muted" style={{ fontSize: 11 }}>Nhà SX, Amazon, GSMArena...</span>
            </div>
            <textarea
              rows={2}
              value={refLinks}
              onChange={(e) => { setRefLinks(e.target.value); setDirty(true); }}
              disabled={disabled}
              placeholder="Mỗi link 1 dòng..."
              style={{ fontSize: 12 }}
            />
            {!refLinks && <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>Chưa có link nào</div>}
          </div>

          {/* Save button */}
          <div style={{ marginBottom: 12 }}>
            <button className="btn btn-primary btn-sm" onClick={saveInfo} disabled={disabled || !dirty}>
              Lưu thông tin
            </button>
          </div>

          {/* Status bar: Đã xác nhận → đẩy qua Launch Plan */}
          {p.info_done && (
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "8px 12px", background: "#F0FDF4", borderRadius: 6, marginBottom: 12,
              border: "1px solid #86EFAC",
            }}>
              <div>
                <span style={{ color: "#15803D", fontWeight: 600, fontSize: 13 }}>
                  ✓ Đã xác nhận thông tin
                </span>
                <span style={{ color: "#6B7280", fontSize: 11, marginLeft: 8 }}>
                  → Đã tạo ticket Launch Plan
                </span>
              </div>
              <div className="row" style={{ gap: 6 }}>
                <Link href="/launch-plan" className="btn btn-primary btn-xs" style={{ textDecoration: "none" }}>
                  Xem Launch Plan →
                </Link>
                <button className="btn btn-ghost btn-xs" onClick={() => setShowDetail(true)}>Sửa</button>
                <button className="btn btn-ghost btn-xs" style={{ color: "var(--red)" }} onClick={cancelApproval} disabled={disabled}>
                  Huỷ xác nhận
                </button>
              </div>
            </div>
          )}

          {p.price_approved_by && (
            <div style={{ fontSize: 11, color: "var(--green)", marginBottom: 8 }}>
              ✓ Giá đã duyệt bởi {p.price_approved_by}
            </div>
          )}

          {/* Channel buttons */}
          <div style={{ borderTop: "1px solid var(--border)", paddingTop: 10 }}>
            <div className="muted" style={{ fontSize: 11, marginBottom: 6, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".5px" }}>
              Đăng kênh
            </div>
            <div className="row" style={{ gap: 6 }}>
              {CHANNELS.map((c) => {
                const done = !!p[`${c.key}_done` as keyof DeployProduct];
                const links = parseLinks(p[`${c.key}_links` as keyof DeployProduct] as string);
                return (
                  <div key={c.key} style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 110 }}>
                    <button
                      type="button"
                      onClick={() => toggleChannel(c.key, done)}
                      disabled={disabled}
                      style={{
                        padding: "6px 10px", fontSize: 12, fontWeight: 700,
                        border: `1px solid ${done ? c.color : "var(--border)"}`,
                        borderRadius: 6,
                        background: done ? c.color : "transparent",
                        color: done ? "#fff" : "var(--muted)",
                        cursor: "pointer",
                      }}
                    >
                      {done ? "✓ " : ""}{c.label}
                    </button>
                    {links.length > 0 && (
                      <div style={{ fontSize: 10, color: "var(--subtle)", textAlign: "center" }}>{links.length} link</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
