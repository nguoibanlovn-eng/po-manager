"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import { formatDate, formatVND, toNum } from "@/lib/format";
import type { ReturnRow } from "@/lib/db/returns";
import {
  createReturnAction, markReturnSoldAction,
  updateReturnAction, deleteReturnAction,
} from "./actions";

/* ─── Constants ─────────────────────────────────────────── */
const CONDITIONS = [
  { value: "ok",            label: "Nguyên vẹn",  icon: "✓", color: "#15803D", bg: "#DCFCE7" },
  { value: "damaged",       label: "Hư hỏng",     icon: "⚠", color: "#B45309", bg: "#FEF3C7" },
  { value: "missing",       label: "Thiếu hàng",  icon: "▲", color: "#C2410C", bg: "#FFEDD5" },
  { value: "lost",          label: "Mất hàng",     icon: "✕", color: "#B91C1C", bg: "#FEE2E2" },
];

function conditionInfo(c: string | null) {
  return CONDITIONS.find((x) => x.value === c) || CONDITIONS[0];
}

type Tab = "list" | "sell" | "label" | "report";

/* ═══════════════════════════════════════════════════════════
   MAIN VIEW
   ═══════════════════════════════════════════════════════════ */
export default function ReturnsView({
  items,
}: {
  items: ReturnRow[];
  statusFilter?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [tab, setTab] = useState<Tab>("list");
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState("");
  const [condFilter, setCondFilter] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expandedToken, setExpandedToken] = useState<string | null>(null);

  // Filter
  const filtered = useMemo(() => {
    let list = items;
    if (search) {
      const s = search.toLowerCase();
      list = list.filter((r) =>
        (r.product_name || "").toLowerCase().includes(s) ||
        (r.sku || "").toLowerCase().includes(s) ||
        (r.token || "").toLowerCase().includes(s)
      );
    }
    if (condFilter) list = list.filter((r) => r.condition === condFilter);
    return list;
  }, [items, search, condFilter]);

  // Stats
  const stats = useMemo(() => {
    const s = { total: 0, pending: 0, sold: 0, totalCost: 0, totalRepair: 0, totalRevenue: 0, totalSellPrice: 0, totalLoss: 0 };
    for (const r of items) {
      s.total++;
      if (r.status === "pending" || r.status === "PENDING") s.pending++;
      if (r.status === "sold" || r.status === "SOLD") {
        s.sold++;
        s.totalRevenue += toNum(r.sell_price);
      }
      s.totalCost += toNum(r.cost);
      s.totalRepair += toNum(r.repair_cost);
      s.totalSellPrice += toNum(r.sell_price);
      s.totalLoss += toNum(r.loss);
    }
    return s;
  }, [items]);

  const pendingItems = useMemo(() => items.filter((r) => r.status !== "sold" && r.status !== "SOLD"), [items]);
  const soldItems = useMemo(() => items.filter((r) => r.status === "sold" || r.status === "SOLD"), [items]);

  // Select all
  function toggleSelectAll() {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map((r) => r.token)));
  }
  function toggleSelect(token: string) {
    const s = new Set(selected);
    if (s.has(token)) s.delete(token); else s.add(token);
    setSelected(s);
  }

  const tabCounts = { list: items.length, sell: pendingItems.length };

  return (
    <section className="section">
      {/* ═══ HEADER ═══ */}
      <div className="page-hdr">
        <div>
          <div className="page-title">Hoàn &amp; Thanh Lý</div>
          <div className="page-sub">Tạo sản phẩm thanh lý · định giá · in tem · bán</div>
        </div>
        <div className="row" style={{ gap: 6 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => router.refresh()}>Làm mới</button>
          <button className="btn btn-primary btn-sm" onClick={() => { setTab("list"); setShowCreate(true); }}>+ Tạo SP thanh lý</button>
        </div>
      </div>

      {/* ═══ TABS ═══ */}
      <div className="mini-tabs" style={{ marginBottom: 12 }}>
        <button className={"mini-tab" + (tab === "list" ? " active" : "")} onClick={() => setTab("list")}>
          Danh sách <span className="badge">{tabCounts.list}</span>
        </button>
        <button className={"mini-tab" + (tab === "sell" ? " active" : "")} onClick={() => setTab("sell")}>
          Bán hàng <span className="badge">{tabCounts.sell}</span>
        </button>
        <button className={"mini-tab" + (tab === "label" ? " active" : "")} onClick={() => setTab("label")}>
          Thiết kế tem
        </button>
        <button className={"mini-tab" + (tab === "report" ? " active" : "")} onClick={() => setTab("report")}>
          Báo cáo
        </button>
      </div>

      {/* ═══ KPI STRIP ═══ */}
      <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 14, fontSize: 13, flexWrap: "wrap" }}>
        <span><strong>{stats.total}</strong> <span className="muted">SP</span></span>
        <span style={{ color: "#B45309" }}>● <strong>{stats.pending}</strong> chờ bán</span>
        <span style={{ color: "#15803D" }}>● <strong>{stats.sold}</strong> đã bán · <span style={{ color: "#15803D" }}>thu hồi</span></span>
        <span style={{ color: "#B91C1C" }}>● <strong>{formatVND(Math.abs(stats.totalLoss))}</strong> lỗ ròng</span>
        <span style={{ color: "#7C3AED" }}>● <strong>{stats.totalCost > 0 ? Math.round((stats.totalSellPrice / stats.totalCost) * 100) : 0}%</strong> tỷ lệ thu hồi</span>
      </div>

      {/* ═══ TAB CONTENT ═══ */}
      {tab === "list" && (
        <ListTab
          items={filtered}
          allItems={items}
          search={search}
          onSearch={setSearch}
          condFilter={condFilter}
          onCondFilter={setCondFilter}
          selected={selected}
          toggleSelect={toggleSelect}
          toggleSelectAll={toggleSelectAll}
          expandedToken={expandedToken}
          setExpandedToken={setExpandedToken}
          showCreate={showCreate}
          setShowCreate={setShowCreate}
          pending={pending}
          startTransition={startTransition}
          refresh={() => router.refresh()}
        />
      )}
      {tab === "sell" && (
        <SellTab
          items={pendingItems}
          pending={pending}
          startTransition={startTransition}
          refresh={() => router.refresh()}
        />
      )}
      {tab === "label" && <LabelTab items={items} selected={selected} />}
      {tab === "report" && <ReportTab items={items} />}
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════
   TAB 1: DANH SÁCH
   ═══════════════════════════════════════════════════════════ */
function ListTab({
  items, allItems, search, onSearch, condFilter, onCondFilter,
  selected, toggleSelect, toggleSelectAll,
  expandedToken, setExpandedToken,
  showCreate, setShowCreate,
  pending, startTransition, refresh,
}: {
  items: ReturnRow[]; allItems: ReturnRow[];
  search: string; onSearch: (s: string) => void;
  condFilter: string; onCondFilter: (s: string) => void;
  selected: Set<string>; toggleSelect: (t: string) => void; toggleSelectAll: () => void;
  expandedToken: string | null; setExpandedToken: (t: string | null) => void;
  showCreate: boolean; setShowCreate: (b: boolean) => void;
  pending: boolean; startTransition: (fn: () => Promise<void>) => void;
  refresh: () => void;
}) {
  return (
    <>
      {/* Search + Filter */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <input
          value={search} onChange={(e) => onSearch(e.target.value)}
          placeholder="Tên SP, SKU, token..."
          style={{ width: 220, fontSize: 13 }}
        />
        <select value={condFilter} onChange={(e) => onCondFilter(e.target.value)} style={{ fontSize: 13 }}>
          <option value="">Tình trạng</option>
          {CONDITIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </div>

      {showCreate && (
        <CreateForm
          onClose={() => setShowCreate(false)}
          onSaved={() => { setShowCreate(false); refresh(); }}
          disabled={pending}
          startTransition={startTransition}
        />
      )}

      {/* Table */}
      <div className="card" style={{ padding: 0 }}>
        <div className="tbl-wrap">
          <table>
            <thead><tr>
              <th style={{ width: 32 }}>
                <input type="checkbox" checked={selected.size === items.length && items.length > 0} onChange={toggleSelectAll} />
              </th>
              <th style={{ width: 90 }}>NGÀY TẠO</th>
              <th>TÊN SP · SKU</th>
              <th>TÌNH TRẠNG</th>
              <th className="text-right">GIÁ VỐN</th>
              <th className="text-right">SỬA</th>
              <th className="text-right">GIÁ TL</th>
              <th>TRẠNG THÁI</th>
              <th></th>
            </tr></thead>
            <tbody>
              {items.map((r) => (
                <ListRow
                  key={r.token}
                  row={r}
                  isSelected={selected.has(r.token)}
                  onToggle={() => toggleSelect(r.token)}
                  isExpanded={expandedToken === r.token}
                  onExpand={() => setExpandedToken(expandedToken === r.token ? null : r.token)}
                  pending={pending}
                  startTransition={startTransition}
                  refresh={refresh}
                />
              ))}
              {items.length === 0 && (
                <tr><td colSpan={9} className="muted" style={{ textAlign: "center", padding: 24 }}>Không có SP nào.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

/* ── Single row + expand detail ───────────────────────────── */
function ListRow({
  row, isSelected, onToggle, isExpanded, onExpand,
  pending, startTransition, refresh,
}: {
  row: ReturnRow; isSelected: boolean; onToggle: () => void;
  isExpanded: boolean; onExpand: () => void;
  pending: boolean; startTransition: (fn: () => Promise<void>) => void;
  refresh: () => void;
}) {
  const cond = conditionInfo(row.condition);
  const statusLabel = (row.status || "pending").toLowerCase();
  const isPending = statusLabel === "pending";
  const isSold = statusLabel === "sold";
  const isReady = statusLabel === "ready";

  return (
    <>
      <tr
        onClick={onExpand}
        style={{ cursor: "pointer", background: isExpanded ? "#F0F9FF" : undefined, borderLeft: isExpanded ? "3px solid var(--blue)" : "3px solid transparent" }}
      >
        <td onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={isSelected} onChange={onToggle} /></td>
        <td className="muted" style={{ fontSize: 12 }}>{formatDate(row.created_at || row.date)}</td>
        <td>
          <div style={{ fontWeight: 700, fontSize: 13 }}>{row.product_name || "(không tên)"}</div>
          <div className="muted" style={{ fontSize: 11 }}>
            {row.sku || "—"}
            {row.basket && <span className="chip" style={{ marginLeft: 6, fontSize: 9, padding: "1px 5px", background: "#EDE9FE", color: "#6D28D9" }}>{row.basket}</span>}
          </div>
        </td>
        <td>
          <span style={{ color: cond.color, fontWeight: 600, fontSize: 12 }}>● {cond.icon} {cond.label}</span>
          {row.description && <div className="muted" style={{ fontSize: 11 }}>{row.description}</div>}
        </td>
        <td className="text-right muted">{formatVND(row.cost)}</td>
        <td className="text-right muted">{formatVND(row.repair_cost)}</td>
        <td className="text-right" style={{ fontWeight: 700, color: "var(--green)" }}>{formatVND(row.sell_price)}</td>
        <td>
          <span style={{
            fontSize: 12, fontWeight: 700,
            color: isSold ? "#15803D" : isReady ? "#1D4ED8" : "#B45309",
          }}>
            {isSold ? "Đã bán" : isReady ? "Sẵn sàng" : "Chờ bán"}
          </span>
        </td>
        <td onClick={(e) => e.stopPropagation()}>
          <div style={{ display: "flex", gap: 4 }}>
            <button className="btn btn-ghost btn-xs" title="In tem" onClick={() => printSingleLabel(row)}>🖨</button>
            {!isSold && <button className="btn btn-success btn-xs" onClick={() => onExpand()}>$ Bán</button>}
          </div>
        </td>
      </tr>
      {isExpanded && (
        <tr>
          <td colSpan={9} style={{ padding: 0, background: "#FAFAFA" }}>
            <ExpandedDetail
              row={row}
              pending={pending}
              startTransition={startTransition}
              refresh={refresh}
            />
          </td>
        </tr>
      )}
    </>
  );
}

/* ── Expanded detail panel ────────────────────────────────── */
function ExpandedDetail({
  row, pending, startTransition, refresh,
}: {
  row: ReturnRow;
  pending: boolean;
  startTransition: (fn: () => Promise<void>) => void;
  refresh: () => void;
}) {
  const cond = conditionInfo(row.condition);
  const [editing, setEditing] = useState(false);
  const [showSold, setShowSold] = useState(false);
  const [editData, setEditData] = useState({
    product_name: row.product_name || "",
    sku: row.sku || "",
    condition: row.condition || "ok",
    description: row.description || "",
    basket: row.basket || "",
    cost: String(row.cost || 0),
    repair_cost: String(row.repair_cost || 0),
    sell_price: String(row.sell_price || 0),
    note: row.note || "",
    images: row.images || "",
  });
  const [soldData, setSoldData] = useState({
    sell_price: String(row.sell_price || ""),
    customer_name: "", phone: "", channel_sold: "", tracking: "",
  });

  const isSold = (row.status || "").toLowerCase() === "sold";
  const images = (row.images || "").split(/[\n,]+/).filter(Boolean);

  function saveEdit() {
    startTransition(async () => {
      await updateReturnAction(row.token, {
        product_name: editData.product_name,
        sku: editData.sku || null,
        condition: editData.condition,
        description: editData.description || null,
        basket: editData.basket || null,
        cost: toNum(editData.cost),
        repair_cost: toNum(editData.repair_cost),
        sell_price: toNum(editData.sell_price),
        note: editData.note || null,
        images: editData.images || null,
      });
      setEditing(false);
      refresh();
    });
  }

  function markSold() {
    if (!soldData.sell_price || toNum(soldData.sell_price) <= 0) return alert("Nhập giá bán");
    startTransition(async () => {
      await markReturnSoldAction(row.token, {
        sell_price: toNum(soldData.sell_price),
        customer_name: soldData.customer_name || undefined,
        phone: soldData.phone || undefined,
        channel_sold: soldData.channel_sold || undefined,
        tracking: soldData.tracking || undefined,
      });
      setShowSold(false);
      refresh();
    });
  }

  function deleteTicket() {
    if (!confirm(`Xoá ticket "${row.token}"?`)) return;
    startTransition(async () => {
      const r = await deleteReturnAction(row.token);
      if (!r.ok) alert(r.error);
      else refresh();
    });
  }

  return (
    <div style={{ display: "flex", gap: 16, padding: 16 }}>
      {/* LEFT: ảnh + info */}
      <div style={{ flex: 1 }}>
        {/* Ảnh */}
        <div style={{
          width: 200, height: 160, borderRadius: 8, border: "2px dashed var(--border)",
          display: "flex", alignItems: "center", justifyContent: "center",
          marginBottom: 12, overflow: "hidden", background: "#fff",
        }}>
          {images.length > 0 ? (
            <img src={images[0]} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }}
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
          ) : (
            <div className="muted" style={{ textAlign: "center", fontSize: 12 }}>
              <div style={{ fontSize: 24, marginBottom: 4, opacity: 0.3 }}>🖼</div>
              Chưa có ảnh
            </div>
          )}
        </div>

        {/* Condition tabs */}
        <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
          {CONDITIONS.map((c) => (
            <span key={c.value} className="chip" style={{
              background: row.condition === c.value ? c.bg : "#F4F4F5",
              color: row.condition === c.value ? c.color : "#A1A1AA",
              fontWeight: row.condition === c.value ? 700 : 400, fontSize: 11, cursor: "default",
            }}>
              {c.icon} {c.label}
            </span>
          ))}
        </div>

        {/* Description */}
        <div style={{ fontSize: 13, marginBottom: 6 }}>
          <span style={{ fontWeight: 600 }}>●</span> {row.description || "(không mô tả)"}
        </div>
        <div className="muted" style={{ fontSize: 12 }}>
          SKU: <strong>{row.sku || "—"}</strong>  ·  Ngày: <strong>{formatDate(row.created_at || row.date)}</strong>
          {row.basket && <span>  ·  Giỏ: <strong>{row.basket}</strong></span>}
        </div>
        {row.note && <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Ghi chú: {row.note}</div>}

        {/* Edit form */}
        {editing && (
          <div style={{ marginTop: 12, padding: 12, background: "#fff", borderRadius: 8, border: "1px solid var(--border)" }}>
            <div className="form-grid fg-2" style={{ marginBottom: 8 }}>
              <div className="form-group"><label>Tên SP</label><input value={editData.product_name} onChange={(e) => setEditData({ ...editData, product_name: e.target.value })} /></div>
              <div className="form-group"><label>SKU</label><input value={editData.sku} onChange={(e) => setEditData({ ...editData, sku: e.target.value })} /></div>
              <div className="form-group">
                <label>Tình trạng</label>
                <select value={editData.condition} onChange={(e) => setEditData({ ...editData, condition: e.target.value })}>
                  {CONDITIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <div className="form-group"><label>Giỏ lưu kho</label><input value={editData.basket} onChange={(e) => setEditData({ ...editData, basket: e.target.value })} /></div>
              <div className="form-group"><label>Giá vốn</label><input type="text" inputMode="numeric" value={editData.cost} onChange={(e) => setEditData({ ...editData, cost: e.target.value.replace(/\D/g, "") })} /></div>
              <div className="form-group"><label>Chi phí sửa</label><input type="text" inputMode="numeric" value={editData.repair_cost} onChange={(e) => setEditData({ ...editData, repair_cost: e.target.value.replace(/\D/g, "") })} /></div>
              <div className="form-group"><label>Giá thanh lý</label><input type="text" inputMode="numeric" value={editData.sell_price} onChange={(e) => setEditData({ ...editData, sell_price: e.target.value.replace(/\D/g, "") })} /></div>
            </div>
            <div className="form-group" style={{ marginBottom: 8 }}><label>Mô tả</label><textarea rows={2} value={editData.description} onChange={(e) => setEditData({ ...editData, description: e.target.value })} /></div>
            <div className="form-group" style={{ marginBottom: 8 }}><label>Link ảnh (mỗi dòng 1 link)</label><textarea rows={2} value={editData.images} onChange={(e) => setEditData({ ...editData, images: e.target.value })} placeholder="https://..." /></div>
            <div className="row" style={{ justifyContent: "flex-end", gap: 6 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setEditing(false)}>Huỷ</button>
              <button className="btn btn-primary btn-sm" onClick={saveEdit} disabled={pending}>Lưu</button>
            </div>
          </div>
        )}

        {/* Sell form */}
        {showSold && !isSold && (
          <div style={{ marginTop: 12, padding: 12, background: "#F0FDF4", borderRadius: 8, border: "1px solid #86EFAC" }}>
            <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 13 }}>Bán SP thanh lý</div>
            <div className="form-grid fg-2" style={{ marginBottom: 8 }}>
              <div className="form-group"><label>Giá bán thực *</label><input type="text" inputMode="numeric" value={soldData.sell_price} onChange={(e) => setSoldData({ ...soldData, sell_price: e.target.value.replace(/\D/g, "") })} /></div>
              <div className="form-group"><label>Tên khách</label><input value={soldData.customer_name} onChange={(e) => setSoldData({ ...soldData, customer_name: e.target.value })} /></div>
              <div className="form-group"><label>SĐT</label><input value={soldData.phone} onChange={(e) => setSoldData({ ...soldData, phone: e.target.value })} /></div>
              <div className="form-group"><label>Kênh bán</label><input value={soldData.channel_sold} onChange={(e) => setSoldData({ ...soldData, channel_sold: e.target.value })} placeholder="FB/Shopee/TikTok..." /></div>
            </div>
            <div className="row" style={{ justifyContent: "flex-end", gap: 6 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowSold(false)}>Huỷ</button>
              <button className="btn btn-success btn-sm" onClick={markSold} disabled={pending}>✓ Đánh dấu đã bán</button>
            </div>
          </div>
        )}
      </div>

      {/* RIGHT: sidebar */}
      <div style={{ width: 220, flexShrink: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: 13 }}>
          <span className="muted">Giá vốn</span>
          <span style={{ color: "#B91C1C" }}>{formatVND(row.cost)}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: 13 }}>
          <span className="muted">Giá TL</span>
          <span style={{ color: "#15803D", fontWeight: 700 }}>{formatVND(row.sell_price)}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10, fontSize: 13, borderTop: "1px solid var(--border)", paddingTop: 4 }}>
          <span className="muted">Lỗ ròng</span>
          <span style={{ color: "#B91C1C", fontWeight: 700 }}>{formatVND(row.loss)}</span>
        </div>

        <div style={{ fontSize: 11, textAlign: "center", marginBottom: 12 }}>
          <span className="chip" style={{ background: "#FEF3C7", color: "#92400E", fontSize: 10, padding: "2px 8px" }}>{row.token}</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {!isSold && !editing && (
            <button className="btn btn-ghost btn-sm" style={{ width: "100%" }} onClick={() => setEditing(true)}>Sửa thông tin</button>
          )}
          {!isSold && !showSold && (
            <button className="btn btn-ghost btn-sm" style={{ width: "100%" }} onClick={() => printSingleLabel(row)}>In lại tem</button>
          )}
          <button className="btn btn-ghost btn-sm" style={{ width: "100%", color: "var(--red)", borderColor: "var(--red)" }} onClick={deleteTicket} disabled={pending}>✕ Xoá ticket</button>
          {!isSold && (
            <button className="btn btn-success btn-sm" style={{ width: "100%" }} onClick={() => setShowSold(true)}>$ Bán ngay</button>
          )}
          {isSold && (
            <div className="muted" style={{ fontSize: 11, textAlign: "center" }}>
              Bán ngày {formatDate(row.sold_at)}<br />
              {row.customer_name && <>Khách: {row.customer_name}<br /></>}
              {row.channel_sold && <>Kênh: {row.channel_sold}</>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   TAB 2: BÁN HÀNG
   ═══════════════════════════════════════════════════════════ */
function SellTab({
  items, pending, startTransition, refresh,
}: {
  items: ReturnRow[];
  pending: boolean;
  startTransition: (fn: () => Promise<void>) => void;
  refresh: () => void;
}) {
  const [sellingToken, setSellingToken] = useState<string | null>(null);

  return (
    <>
      {items.length === 0 ? (
        <div className="card muted" style={{ padding: 24, textAlign: "center" }}>Không có SP nào chờ bán.</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 10 }}>
          {items.map((r) => (
            <SellCard key={r.token} row={r} isSelling={sellingToken === r.token} onSell={() => setSellingToken(sellingToken === r.token ? null : r.token)} pending={pending} startTransition={startTransition} refresh={refresh} />
          ))}
        </div>
      )}
    </>
  );
}

function SellCard({
  row, isSelling, onSell, pending, startTransition, refresh,
}: {
  row: ReturnRow; isSelling: boolean; onSell: () => void;
  pending: boolean; startTransition: (fn: () => Promise<void>) => void;
  refresh: () => void;
}) {
  const cond = conditionInfo(row.condition);
  const [sold, setSold] = useState({ sell_price: String(row.sell_price || ""), customer_name: "", phone: "", channel_sold: "" });
  const images = (row.images || "").split(/[\n,]+/).filter(Boolean);

  function markSold() {
    if (!sold.sell_price || toNum(sold.sell_price) <= 0) return alert("Nhập giá bán");
    startTransition(async () => {
      await markReturnSoldAction(row.token, {
        sell_price: toNum(sold.sell_price),
        customer_name: sold.customer_name || undefined,
        phone: sold.phone || undefined,
        channel_sold: sold.channel_sold || undefined,
      });
      refresh();
    });
  }

  return (
    <div className="card" style={{ padding: 14 }}>
      {/* Header */}
      <div style={{ display: "flex", gap: 10, marginBottom: 8 }}>
        <div style={{
          width: 64, height: 64, borderRadius: 6, border: "1px solid var(--border)",
          display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden",
          flexShrink: 0, background: "#FAFAFA",
        }}>
          {images.length > 0 ? (
            <img src={images[0]} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
          ) : (
            <span style={{ fontSize: 24, opacity: 0.2 }}>🖼</span>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 13 }}>{row.product_name}</div>
          <div className="muted" style={{ fontSize: 11 }}>{row.sku} · {row.token}</div>
          <span className="chip" style={{ background: cond.bg, color: cond.color, fontSize: 10, marginTop: 2 }}>{cond.icon} {cond.label}</span>
        </div>
      </div>

      {/* Prices */}
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 8 }}>
        <span className="muted">Vốn: {formatVND(row.cost)}</span>
        <span style={{ fontWeight: 700, color: "var(--green)" }}>TL: {formatVND(row.sell_price)}</span>
      </div>

      {!isSelling ? (
        <button className="btn btn-success btn-sm" style={{ width: "100%" }} onClick={onSell}>$ Bán</button>
      ) : (
        <div style={{ background: "#F0FDF4", padding: 10, borderRadius: 6, marginTop: 4 }}>
          <div className="form-grid fg-2" style={{ marginBottom: 6, gap: 6 }}>
            <div className="form-group"><label style={{ fontSize: 11 }}>Giá bán *</label><input type="text" inputMode="numeric" value={sold.sell_price} onChange={(e) => setSold({ ...sold, sell_price: e.target.value.replace(/\D/g, "") })} /></div>
            <div className="form-group"><label style={{ fontSize: 11 }}>Khách</label><input value={sold.customer_name} onChange={(e) => setSold({ ...sold, customer_name: e.target.value })} /></div>
            <div className="form-group"><label style={{ fontSize: 11 }}>SĐT</label><input value={sold.phone} onChange={(e) => setSold({ ...sold, phone: e.target.value })} /></div>
            <div className="form-group"><label style={{ fontSize: 11 }}>Kênh</label><input value={sold.channel_sold} onChange={(e) => setSold({ ...sold, channel_sold: e.target.value })} placeholder="FB/Shopee..." /></div>
          </div>
          <div className="row" style={{ gap: 4, justifyContent: "flex-end" }}>
            <button className="btn btn-ghost btn-xs" onClick={onSell}>Huỷ</button>
            <button className="btn btn-success btn-xs" onClick={markSold} disabled={pending}>✓ Bán</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   TAB 3: THIẾT KẾ TEM
   ═══════════════════════════════════════════════════════════ */
const LABEL_FIELDS = [
  { key: "qr", label: "QR code", default: true },
  { key: "token", label: "Token code", default: true },
  { key: "name", label: "Tên sản phẩm", default: true },
  { key: "sku", label: "SKU", default: true },
  { key: "condition", label: "Tình trạng", default: true },
  { key: "basket", label: "Giỏ lưu kho", default: true },
  { key: "date", label: "Ngày tạo", default: true },
  { key: "brand", label: "Thương hiệu", default: true },
  { key: "desc", label: "Mô tả tình trạng", default: true },
  { key: "category", label: "Loại hàng", default: false },
  { key: "sell_price", label: "Giá thanh lý", default: false },
  { key: "cost", label: "Giá vốn", default: false },
];

const LABEL_SIZES = [
  { w: 100, h: 50, label: "100×50mm" },
  { w: 75, h: 40, label: "75×40mm" },
  { w: 50, h: 30, label: "50×30mm" },
  { w: 100, h: 30, label: "100×30mm" },
];

function LabelTab({ items, selected }: { items: ReturnRow[]; selected: Set<string> }) {
  const [fields, setFields] = useState<Record<string, boolean>>(() => {
    const d: Record<string, boolean> = {};
    LABEL_FIELDS.forEach((f) => { d[f.key] = f.default; });
    return d;
  });
  const [sizeIdx, setSizeIdx] = useState(3); // 100x30 default
  const size = LABEL_SIZES[sizeIdx];
  const previewRef = useRef<HTMLDivElement>(null);

  // Sample item for preview
  const sampleItem = items.length > 0 ? items[0] : null;
  const selectedItems = items.filter((r) => selected.has(r.token));
  const printItems = selectedItems.length > 0 ? selectedItems : (sampleItem ? [sampleItem] : []);

  function toggleField(key: string) {
    setFields((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function resetDefaults() {
    const d: Record<string, boolean> = {};
    LABEL_FIELDS.forEach((f) => { d[f.key] = f.default; });
    setFields(d);
  }

  function printLabels() {
    const w = window.open("", "_blank");
    if (!w) return alert("Cần bật pop-up trình duyệt");
    const labels = printItems.map((r) => renderLabelHTML(r, fields, size)).join("");
    w.document.write(`
      <html><head><title>In tem thanh lý</title>
      <style>
        @page { size: ${size.w}mm ${size.h}mm; margin: 0; }
        body { margin: 0; font-family: Arial, sans-serif; }
        .label { page-break-after: always; width: ${size.w}mm; height: ${size.h}mm; padding: 2mm; box-sizing: border-box; display: flex; gap: 2mm; align-items: center; }
        .label:last-child { page-break-after: auto; }
        .qr { width: ${Math.min(size.h - 4, 20)}mm; height: ${Math.min(size.h - 4, 20)}mm; border: 1px solid #000; display: flex; align-items: center; justify-content: center; font-size: 6pt; flex-shrink: 0; }
        .info { flex: 1; font-size: 7pt; line-height: 1.4; overflow: hidden; }
        .token { font-weight: bold; font-size: 8pt; }
        .name { font-weight: bold; }
        .cond { display: inline-block; background: #fee; color: #c00; padding: 0 3px; border-radius: 2px; font-size: 6pt; font-weight: bold; }
        .desc { color: #666; font-size: 6pt; }
      </style></head><body>${labels}</body></html>
    `);
    w.document.close();
    w.print();
  }

  return (
    <div style={{ display: "flex", gap: 20 }}>
      {/* Left: field toggles */}
      <div className="card" style={{ width: 280, flexShrink: 0 }}>
        <div style={{ fontWeight: 700, marginBottom: 10, fontSize: 14 }}>Chọn thông tin hiển thị</div>
        {LABEL_FIELDS.map((f) => (
          <div key={f.key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
            <span style={{ fontSize: 13 }}>{f.label}</span>
            <input type="checkbox" checked={fields[f.key]} onChange={() => toggleField(f.key)} style={{ width: 16, height: 16 }} />
          </div>
        ))}
        <div style={{ marginTop: 14 }}>
          <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 14 }}>Khổ giấy</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {LABEL_SIZES.map((s, i) => (
              <button key={i} className="btn btn-ghost btn-xs" style={{ background: i === sizeIdx ? "var(--blue)" : undefined, color: i === sizeIdx ? "#fff" : undefined }} onClick={() => setSizeIdx(i)}>
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Right: preview */}
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Xem trước</div>
          <div className="row" style={{ gap: 6 }}>
            <button className="btn btn-ghost btn-sm" onClick={resetDefaults}>Mặc định</button>
            <button className="btn btn-primary btn-sm" onClick={printLabels}>In thử</button>
          </div>
        </div>

        <div ref={previewRef} className="card" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 200, background: "#F9FAFB" }}>
          {sampleItem ? (
            <LabelPreview item={sampleItem} fields={fields} size={size} />
          ) : (
            <div className="muted">Chưa có SP để xem trước</div>
          )}
        </div>

        <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>
          Máy in nhiệt: <strong>Xprinter XP-420B</strong> · <strong>MUNBYN 80mm roll</strong> · Cần bật pop-up trình duyệt
        </div>

        {/* Field explanation */}
        <div className="card" style={{ marginTop: 14 }}>
          <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 14 }}>Giải thích các field</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 20px", fontSize: 12 }}>
            <div><strong>Token</strong> — mã định danh duy nhất</div>
            <div><strong>QR code</strong> — scan để tra cứu trên PO</div>
            <div><strong>SKU</strong> — mã sản phẩm nội bộ</div>
            <div><strong>Tên SP</strong> — tên sản phẩm đầy đủ</div>
            <div><strong>Tình trạng</strong> — màu + nhãn (hư/thiếu/mất)</div>
            <div><strong>Giá vốn</strong> — để tham khảo nội bộ</div>
            <div><strong>Giá TL</strong> — giá bán thanh lý cho KH</div>
            <div><strong>Ngày tạo</strong> — ngày nhập vào hệ thống</div>
            <div><strong>Mô tả</strong> — tóm tắt tình trạng (1 dòng)</div>
            <div><strong>Loại hàng</strong> — danh mục sản phẩm</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Label preview component ──────────────────────────────── */
function LabelPreview({ item, fields, size }: { item: ReturnRow; fields: Record<string, boolean>; size: { w: number; h: number } }) {
  const cond = conditionInfo(item.condition);
  const scale = Math.min(300 / size.w, 150 / size.h);
  return (
    <div style={{
      width: size.w * scale, height: size.h * scale, border: "1px solid #000",
      display: "flex", gap: 4, padding: 4, fontFamily: "Arial, sans-serif", fontSize: 8 * scale,
      background: "#fff", borderRadius: 2,
    }}>
      {fields.qr && (
        <div style={{
          width: Math.min(size.h - 4, 20) * scale, height: Math.min(size.h - 4, 20) * scale,
          border: "1px solid #000", display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0, fontSize: 5 * scale,
        }}>
          QR
        </div>
      )}
      <div style={{ flex: 1, overflow: "hidden", lineHeight: 1.4 }}>
        {fields.token && <div style={{ fontWeight: 700, fontSize: 8 * scale }}>{item.token}</div>}
        {fields.name && <div style={{ fontWeight: 600, fontSize: 7 * scale }}>{(item.product_name || "").substring(0, 30)}</div>}
        {fields.sku && <div style={{ fontSize: 6 * scale, color: "#666" }}>{item.sku}</div>}
        {fields.condition && (
          <span style={{
            display: "inline-block", background: cond.bg, color: cond.color,
            padding: "0 2px", borderRadius: 1, fontSize: 5 * scale, fontWeight: 700,
          }}>{cond.label}</span>
        )}
        {fields.desc && <div style={{ fontSize: 5 * scale, color: "#666" }}>{(item.description || "").substring(0, 40)}</div>}
        {fields.date && <div style={{ fontSize: 5 * scale, color: "#999" }}>{formatDate(item.created_at || item.date)}</div>}
        {fields.sell_price && <div style={{ fontWeight: 700, fontSize: 7 * scale }}>{formatVND(item.sell_price)}</div>}
      </div>
    </div>
  );
}

/* ── Render label HTML for print ──────────────────────────── */
function renderLabelHTML(r: ReturnRow, fields: Record<string, boolean>, size: { w: number; h: number }): string {
  const cond = conditionInfo(r.condition);
  let info = "";
  if (fields.token) info += `<div class="token">${r.token}</div>`;
  if (fields.name) info += `<div class="name">${(r.product_name || "").substring(0, 40)}</div>`;
  if (fields.sku) info += `<div>${r.sku || ""}</div>`;
  if (fields.condition) info += `<span class="cond">${cond.label}</span> `;
  if (fields.basket) info += `${r.basket || ""} `;
  if (fields.date) info += `<div>${formatDate(r.created_at || r.date)}</div>`;
  if (fields.desc) info += `<div class="desc">${(r.description || "").substring(0, 50)}</div>`;
  if (fields.sell_price) info += `<div style="font-weight:bold">${formatVND(r.sell_price)}</div>`;
  if (fields.cost) info += `<div style="color:#999">Vốn: ${formatVND(r.cost)}</div>`;
  const qr = fields.qr ? `<div class="qr">${r.token}</div>` : "";
  return `<div class="label">${qr}<div class="info">${info}</div></div>`;
}

/* ── Print single label ───────────────────────────────────── */
function printSingleLabel(r: ReturnRow) {
  const defaultFields: Record<string, boolean> = {};
  LABEL_FIELDS.forEach((f) => { defaultFields[f.key] = f.default; });
  const size = LABEL_SIZES[3]; // 100x30
  const html = renderLabelHTML(r, defaultFields, size);
  const w = window.open("", "_blank");
  if (!w) return alert("Cần bật pop-up trình duyệt");
  w.document.write(`
    <html><head><title>Tem ${r.token}</title>
    <style>
      @page { size: ${size.w}mm ${size.h}mm; margin: 0; }
      body { margin: 0; font-family: Arial, sans-serif; }
      .label { width: ${size.w}mm; height: ${size.h}mm; padding: 2mm; box-sizing: border-box; display: flex; gap: 2mm; align-items: center; }
      .qr { width: ${Math.min(size.h - 4, 20)}mm; height: ${Math.min(size.h - 4, 20)}mm; border: 1px solid #000; display: flex; align-items: center; justify-content: center; font-size: 6pt; flex-shrink: 0; }
      .info { flex: 1; font-size: 7pt; line-height: 1.4; }
      .token { font-weight: bold; font-size: 8pt; }
      .name { font-weight: bold; }
      .cond { display: inline-block; background: #fee; color: #c00; padding: 0 3px; border-radius: 2px; font-size: 6pt; font-weight: bold; }
      .desc { color: #666; font-size: 6pt; }
    </style></head><body>${html}</body></html>
  `);
  w.document.close();
  w.print();
}

/* ═══════════════════════════════════════════════════════════
   TAB 4: BÁO CÁO
   ═══════════════════════════════════════════════════════════ */
function ReportTab({ items }: { items: ReturnRow[] }) {
  // Condition breakdown
  const condStats = useMemo(() => {
    const m: Record<string, { count: number; cost: number }> = {};
    CONDITIONS.forEach((c) => { m[c.value] = { count: 0, cost: 0 }; });
    for (const r of items) {
      const key = r.condition || "ok";
      if (!m[key]) m[key] = { count: 0, cost: 0 };
      m[key].count++;
      m[key].cost += toNum(r.cost);
    }
    return m;
  }, [items]);

  // Financial summary
  const fin = useMemo(() => {
    let totalCost = 0, totalRepair = 0, totalSellPrice = 0, totalLoss = 0, soldRevenue = 0, soldCount = 0;
    for (const r of items) {
      totalCost += toNum(r.cost);
      totalRepair += toNum(r.repair_cost);
      totalSellPrice += toNum(r.sell_price);
      totalLoss += toNum(r.loss);
      if ((r.status || "").toLowerCase() === "sold") {
        soldRevenue += toNum(r.sell_price);
        soldCount++;
      }
    }
    return { totalCost, totalRepair, totalSellPrice, totalLoss, soldRevenue, soldCount };
  }, [items]);

  // Monthly breakdown
  const monthly = useMemo(() => {
    const m: Record<string, { count: number; cost: number; revenue: number; loss: number }> = {};
    for (const r of items) {
      const month = (r.created_at || r.date || "").substring(0, 7) || "N/A";
      if (!m[month]) m[month] = { count: 0, cost: 0, revenue: 0, loss: 0 };
      m[month].count++;
      m[month].cost += toNum(r.cost);
      if ((r.status || "").toLowerCase() === "sold") m[month].revenue += toNum(r.sell_price);
      m[month].loss += toNum(r.loss);
    }
    return Object.entries(m).sort((a, b) => b[0].localeCompare(a[0]));
  }, [items]);

  return (
    <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
      {/* Left: condition breakdown */}
      <div className="card" style={{ flex: 1, minWidth: 300 }}>
        <div style={{ fontWeight: 700, fontSize: 12, textTransform: "uppercase", color: "var(--muted)", marginBottom: 10 }}>
          Phân loại tình trạng
        </div>
        {CONDITIONS.map((c) => {
          const s = condStats[c.value] || { count: 0, cost: 0 };
          return (
            <div key={c.value} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "8px 0", borderBottom: "1px solid var(--border)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 4, height: 24, borderRadius: 2, background: c.color }} />
                <span style={{ fontSize: 13 }}>{c.icon} {c.label} ({s.count})</span>
              </div>
              <span style={{ fontWeight: 600, color: s.cost > 0 ? c.color : "var(--muted)" }}>
                {s.cost > 0 ? `+${formatVND(s.cost)}` : `–${formatVND(0)}`}
              </span>
            </div>
          );
        })}
      </div>

      {/* Right: financial summary */}
      <div className="card" style={{ flex: 1, minWidth: 300 }}>
        <div style={{ fontWeight: 700, fontSize: 12, textTransform: "uppercase", color: "var(--muted)", marginBottom: 10 }}>
          Tổng hợp tài chính
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div className="stat-card c-blue" style={{ padding: 12 }}>
            <div style={{ fontSize: 20, fontWeight: 800 }}>{formatVND(fin.totalCost)}</div>
            <div className="muted" style={{ fontSize: 11 }}>Tổng giá vốn</div>
          </div>
          <div className="stat-card c-red" style={{ padding: 12 }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: "var(--red)" }}>{formatVND(fin.totalRepair)}</div>
            <div className="muted" style={{ fontSize: 11 }}>Chi phí sửa</div>
          </div>
          <div className="stat-card c-amber" style={{ padding: 12 }}>
            <div style={{ fontSize: 20, fontWeight: 800 }}>{formatVND(fin.totalSellPrice)}</div>
            <div className="muted" style={{ fontSize: 11 }}>Thu hồi thanh lý</div>
          </div>
          <div className="stat-card c-red" style={{ padding: 12 }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: "var(--red)" }}>{formatVND(Math.abs(fin.totalLoss))}</div>
            <div className="muted" style={{ fontSize: 11 }}>Lỗ ròng tổng</div>
          </div>
        </div>

        {/* Recovery rate */}
        <div style={{ marginTop: 14, padding: 10, background: "#F9FAFB", borderRadius: 6 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span className="muted" style={{ fontSize: 12 }}>Tỷ lệ thu hồi</span>
            <span style={{ fontWeight: 700, fontSize: 14, color: "var(--blue)" }}>
              {fin.totalCost > 0 ? Math.round((fin.totalSellPrice / fin.totalCost) * 100) : 0}%
            </span>
          </div>
          <div style={{ height: 6, background: "#E5E7EB", borderRadius: 3, overflow: "hidden" }}>
            <div style={{
              height: "100%", borderRadius: 3,
              width: `${Math.min(100, fin.totalCost > 0 ? (fin.totalSellPrice / fin.totalCost) * 100 : 0)}%`,
              background: "var(--blue)", transition: "width .3s",
            }} />
          </div>
        </div>
      </div>

      {/* Monthly table */}
      {monthly.length > 0 && (
        <div className="card" style={{ width: "100%" }}>
          <div style={{ fontWeight: 700, fontSize: 12, textTransform: "uppercase", color: "var(--muted)", marginBottom: 10 }}>
            Theo tháng
          </div>
          <div className="tbl-wrap">
            <table>
              <thead><tr>
                <th>Tháng</th>
                <th className="text-right">Số lượng</th>
                <th className="text-right">Giá vốn</th>
                <th className="text-right">Thu hồi</th>
                <th className="text-right">Lỗ ròng</th>
              </tr></thead>
              <tbody>
                {monthly.map(([month, d]) => (
                  <tr key={month}>
                    <td style={{ fontWeight: 600 }}>{month}</td>
                    <td className="text-right">{d.count}</td>
                    <td className="text-right muted">{formatVND(d.cost)}</td>
                    <td className="text-right" style={{ color: "var(--green)" }}>{formatVND(d.revenue)}</td>
                    <td className="text-right" style={{ color: "var(--red)" }}>{formatVND(Math.abs(d.loss))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   CREATE FORM
   ═══════════════════════════════════════════════════════════ */
function CreateForm({
  onClose, onSaved, disabled, startTransition,
}: {
  onClose: () => void; onSaved: () => void;
  disabled: boolean; startTransition: (fn: () => Promise<void>) => void;
}) {
  const [d, setD] = useState({
    product_name: "", sku: "", category: "", condition: "ok",
    description: "", cost: "", repair_cost: "0", sell_price: "",
    note: "", basket: "", images: "",
  });

  function save() {
    if (!d.product_name.trim()) return alert("Nhập tên SP");
    startTransition(async () => {
      const r = await createReturnAction({
        product_name: d.product_name,
        sku: d.sku || null,
        category: d.category || null,
        condition: d.condition,
        description: d.description || null,
        basket: d.basket || null,
        cost: toNum(d.cost),
        repair_cost: toNum(d.repair_cost),
        sell_price: toNum(d.sell_price),
        note: d.note || null,
        images: d.images || null,
        status: "pending",
      });
      if (!r.ok) alert(r.error);
      else onSaved();
    });
  }

  return (
    <div className="card" style={{ marginBottom: 12, border: "1px solid var(--blue)" }}>
      <div style={{ fontWeight: 700, marginBottom: 12 }}>+ Tạo SP thanh lý mới</div>
      <div className="form-grid fg-3" style={{ marginBottom: 10 }}>
        <div className="form-group"><label>Tên SP *</label><input value={d.product_name} onChange={(e) => setD({ ...d, product_name: e.target.value })} /></div>
        <div className="form-group"><label>SKU</label><input value={d.sku} onChange={(e) => setD({ ...d, sku: e.target.value })} /></div>
        <div className="form-group"><label>Danh mục</label><input value={d.category} onChange={(e) => setD({ ...d, category: e.target.value })} /></div>
      </div>
      <div className="form-grid fg-4" style={{ marginBottom: 10 }}>
        <div className="form-group">
          <label>Tình trạng</label>
          <select value={d.condition} onChange={(e) => setD({ ...d, condition: e.target.value })}>
            {CONDITIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
        <div className="form-group"><label>Giá vốn</label><input type="text" inputMode="numeric" value={d.cost} onChange={(e) => setD({ ...d, cost: e.target.value.replace(/\D/g, "") })} /></div>
        <div className="form-group"><label>Chi phí sửa</label><input type="text" inputMode="numeric" value={d.repair_cost} onChange={(e) => setD({ ...d, repair_cost: e.target.value.replace(/\D/g, "") })} /></div>
        <div className="form-group"><label>Giá thanh lý</label><input type="text" inputMode="numeric" value={d.sell_price} onChange={(e) => setD({ ...d, sell_price: e.target.value.replace(/\D/g, "") })} /></div>
      </div>
      <div className="form-grid fg-2" style={{ marginBottom: 10 }}>
        <div className="form-group"><label>Giỏ lưu kho</label><input value={d.basket} onChange={(e) => setD({ ...d, basket: e.target.value })} placeholder="VD: GIO-01" /></div>
        <div className="form-group"><label>Ghi chú</label><input value={d.note} onChange={(e) => setD({ ...d, note: e.target.value })} /></div>
      </div>
      <div className="form-group" style={{ marginBottom: 10 }}>
        <label>Mô tả tình trạng</label>
        <textarea rows={2} value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} />
      </div>
      <div className="form-group" style={{ marginBottom: 10 }}>
        <label>Link ảnh (mỗi dòng 1 link)</label>
        <textarea rows={2} value={d.images} onChange={(e) => setD({ ...d, images: e.target.value })} placeholder="https://..." />
      </div>
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>Huỷ</button>
        <button className="btn btn-primary btn-sm" onClick={save} disabled={disabled}>Lưu</button>
      </div>
    </div>
  );
}
