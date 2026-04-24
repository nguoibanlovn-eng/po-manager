"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toNum, formatVND, formatDate } from "@/lib/format";
import type { BizOrderWithItems, BizOrderItem } from "@/lib/db/biz-orders";
import type { UserRef } from "@/lib/db/users";
import { isLeader } from "@/lib/auth/roles";
import {
  saveBizOrderAction,
  submitBizOrderAction,
  approveBizOrderAction,
  deleteBizOrderAction,
} from "./actions";

// ─── helpers ────────────────────────────────────────────────

type ItemDraft = Partial<BizOrderItem> & { _key: string };
let _k = 0;
const nk = () => "bk-" + ++_k;

const STATUS_LABEL: Record<string, string> = {
  draft: "Nháp",
  pending: "Chờ duyệt",
  approved: "Đã duyệt",
  rejected: "Từ chối",
};
const STATUS_CHIP: Record<string, string> = {
  draft: "chip-gray",
  pending: "chip-amber",
  approved: "chip-green",
  rejected: "chip-red",
};
const TEAM_CHIP: Record<string, string> = {
  "Team FB": "chip-blue",
  "Team TikTok": "chip-green",
  "Team Shopee": "chip-amber",
  "Team Web/App": "chip-purple",
};

const TEAMS = ["Team FB", "Team TikTok", "Team Shopee", "Team Web/App"];

// ─── COMPONENT ──────────────────────────────────────────────

export default function BizOrdersView({
  user,
  orders: initialOrders,
  users,
}: {
  user: { email: string; name: string; role: string };
  orders: BizOrderWithItems[];
  users: UserRef[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [view, setView] = useState<"list" | "create" | "detail">("list");
  const [detailId, setDetailId] = useState<string | null>(null);

  // Create form state
  const [orderType, setOrderType] = useState<"new" | "existing">("new");
  const [team, setTeam] = useState(TEAMS[0]);
  const [note, setNote] = useState("");
  const [items, setItems] = useState<ItemDraft[]>([]);
  const [editingId, setEditingId] = useState<string | undefined>(undefined);

  // Search for existing products
  const [prodSearch, setProdSearch] = useState("");
  const [prodResults, setProdResults] = useState<Array<{
    sku: string; product_name: string; cost_price: number; sell_price: number; stock: number;
  }>>([]);
  const [searching, setSearching] = useState(false);

  // Approval note (detail view)
  const [approvalNote, setApprovalNote] = useState("");

  // Filters
  const [filterStatus, setFilterStatus] = useState("");
  const [filterTeam, setFilterTeam] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterQ, setFilterQ] = useState("");

  const orders = useMemo(() => {
    let list = initialOrders;
    if (filterStatus) list = list.filter((o) => o.status === filterStatus);
    if (filterTeam) list = list.filter((o) => o.team === filterTeam);
    if (filterType) list = list.filter((o) => o.order_type === filterType);
    if (filterQ) {
      const q = filterQ.toLowerCase();
      list = list.filter(
        (o) =>
          o.id.toLowerCase().includes(q) ||
          o.items.some((it) => it.product_name?.toLowerCase().includes(q)) ||
          (o.created_by_name || "").toLowerCase().includes(q),
      );
    }
    return list;
  }, [initialOrders, filterStatus, filterTeam, filterType, filterQ]);

  const stats = useMemo(() => {
    const all = initialOrders;
    return {
      total: all.length,
      pending: all.filter((o) => o.status === "pending").length,
      approved: all.filter((o) => o.status === "approved").length,
      rejected: all.filter((o) => o.status === "rejected").length,
    };
  }, [initialOrders]);

  const detail = detailId ? initialOrders.find((o) => o.id === detailId) : null;

  // Item helpers
  function addItem() {
    setItems((xs) => [...xs, { _key: nk(), qty: 0, unit_price: 0, sell_price: 0 }]);
  }
  function removeItem(key: string) {
    setItems((xs) => xs.filter((it) => it._key !== key));
  }
  function patchItem(key: string, patch: Partial<ItemDraft>) {
    setItems((xs) => xs.map((it) => (it._key === key ? { ...it, ...patch } : it)));
  }

  // Product search
  async function searchProducts(q: string) {
    setProdSearch(q);
    if (q.length < 2) { setProdResults([]); return; }
    setSearching(true);
    try {
      const res = await fetch(`/api/products/search?q=${encodeURIComponent(q)}`);
      const r = await res.json();
      setProdResults(r.products || []);
    } catch {
      setProdResults([]);
    } finally {
      setSearching(false);
    }
  }

  function selectProduct(p: { sku: string; product_name: string; cost_price: number; sell_price: number; stock: number }) {
    if (items.some((it) => it.sku === p.sku)) return;
    setItems((xs) => [
      ...xs,
      {
        _key: nk(),
        sku: p.sku,
        product_name: p.product_name,
        unit_price: p.cost_price,
        sell_price: p.sell_price,
        current_stock: p.stock,
        qty: 0,
      },
    ]);
  }
  function isSelected(sku: string) {
    return items.some((it) => it.sku === sku);
  }

  const orderTotal = useMemo(
    () => items.reduce((s, it) => s + toNum(it.qty) * toNum(it.unit_price), 0),
    [items],
  );
  const totalQty = useMemo(
    () => items.reduce((s, it) => s + toNum(it.qty), 0),
    [items],
  );

  function resetForm() {
    setOrderType("new");
    setTeam(TEAMS[0]);
    setNote("");
    setItems([]);
    setEditingId(undefined);
    setProdSearch("");
    setProdResults([]);
  }

  function openCreate() { resetForm(); setView("create"); }
  function openDetail(id: string) { setDetailId(id); setApprovalNote(""); setView("detail"); }

  // Save draft
  function onSave() {
    if (items.length === 0) return alert("Thêm ít nhất 1 sản phẩm.");
    if (items.some((it) => !it.product_name?.trim())) return alert("Nhập tên cho tất cả SP.");
    start(async () => {
      const r = await saveBizOrderAction({
        id: editingId,
        order_type: orderType,
        team,
        note,
        items: items.map(({ _key: _, ...rest }) => rest),
      });
      if (!r.ok) return alert("Lỗi: " + r.error);
      alert("Đã lưu order " + r.id);
      router.refresh();
      setView("list");
    });
  }

  // Save + submit for approval
  function onSubmitForApproval() {
    if (items.length === 0) return alert("Thêm ít nhất 1 sản phẩm.");
    if (items.some((it) => !it.product_name?.trim())) return alert("Nhập tên cho tất cả SP.");

    const leaders = users.filter(
      (u) => u.role === "ADMIN" || (u.role && u.role.startsWith("LEADER_")),
    );
    if (leaders.length === 0) return alert("Không tìm thấy leader/admin để duyệt.");

    const choice = prompt(
      "Chọn người duyệt (nhập số):\n" +
        leaders.map((u, i) => `${i + 1}. ${u.name || u.email} (${u.role})`).join("\n"),
    );
    if (!choice) return;
    const idx = parseInt(choice) - 1;
    if (idx < 0 || idx >= leaders.length) return alert("Lựa chọn không hợp lệ.");
    const approver = leaders[idx].email;

    start(async () => {
      const r = await saveBizOrderAction({
        id: editingId,
        order_type: orderType,
        team,
        note,
        items: items.map(({ _key: _, ...rest }) => rest),
      });
      if (!r.ok) return alert("Lỗi lưu: " + r.error);

      const s = await submitBizOrderAction(r.id!, approver);
      if (!s.ok) return alert("Lỗi gửi duyệt: " + s.error);

      alert(`Đã gửi duyệt cho ${leaders[idx].name || approver}`);
      router.refresh();
      setView("list");
    });
  }

  // Approve/reject
  function onApprove() {
    if (!detail) return;
    if (!confirm("Duyệt order này? Sẽ tự động tạo đơn nhập trong Mua hàng.")) return;
    start(async () => {
      const r = await approveBizOrderAction(detail.id, true, approvalNote);
      if (!r.ok) return alert("Lỗi: " + r.error);
      alert(`Đã duyệt! Đơn nhập ${r.po_order_id} đã được tạo trong mục Mua hàng.`);
      router.refresh();
      setView("list");
    });
  }

  function onReject() {
    if (!detail) return;
    if (!approvalNote.trim()) return alert("Nhập lý do từ chối.");
    start(async () => {
      const r = await approveBizOrderAction(detail.id, false, approvalNote);
      if (!r.ok) return alert("Lỗi: " + r.error);
      alert("Đã từ chối order.");
      router.refresh();
      setView("list");
    });
  }

  function onDelete(id: string) {
    if (!confirm("Xoá order này?")) return;
    start(async () => {
      const r = await deleteBizOrderAction(id);
      if (!r.ok) return alert("Lỗi: " + r.error);
      router.refresh();
      if (view === "detail") setView("list");
    });
  }

  const canApprove = isLeader(user.role);

  // ─── LIST VIEW ────────────────────────────────────────────

  if (view === "list") {
    return (
      <div className="section">
        <div className="page-hdr">
          <div>
            <div className="page-title">Order nhập hàng</div>
            <div className="page-sub">Team kinh doanh yêu cầu nhập hàng</div>
          </div>
          <button className="btn btn-primary" onClick={openCreate}>+ Tạo Order</button>
        </div>

        <div className="stat-grid">
          <div className="stat-card c-blue">
            <div className="sl">Tổng Order</div>
            <div className="sv">{stats.total}</div>
            <div className="ss">Tháng {new Date().toLocaleDateString("vi-VN", { month: "2-digit", year: "numeric" })}</div>
          </div>
          <div className="stat-card c-amber">
            <div className="sl">Chờ duyệt</div>
            <div className="sv" style={{ color: "var(--amber)" }}>{stats.pending}</div>
            <div className="ss">{stats.pending > 0 ? "Cần xử lý" : "Không có"}</div>
          </div>
          <div className="stat-card c-green">
            <div className="sl">Đã duyệt</div>
            <div className="sv" style={{ color: "var(--green)" }}>{stats.approved}</div>
            <div className="ss">{stats.total > 0 ? Math.round(stats.approved / stats.total * 100) : 0}% duyệt</div>
          </div>
          <div className="stat-card c-red">
            <div className="sl">Từ chối</div>
            <div className="sv" style={{ color: "var(--red)" }}>{stats.rejected}</div>
            <div className="ss">{stats.total > 0 ? Math.round(stats.rejected / stats.total * 100) : 0}%</div>
          </div>
        </div>

        {/* Tabs */}
        <div className="mini-tabs">
          {[
            { key: "", label: "Tất cả", count: stats.total },
            { key: "pending", label: "Chờ duyệt", count: stats.pending },
            { key: "approved", label: "Đã duyệt", count: stats.approved },
            { key: "rejected", label: "Từ chối", count: stats.rejected },
          ].map((tab) => (
            <button
              key={tab.key}
              className={`mini-tab${filterStatus === tab.key ? " active" : ""}`}
              onClick={() => setFilterStatus(tab.key)}
            >
              {tab.label} <span className="cnt">{tab.count}</span>
            </button>
          ))}
        </div>

        {/* Filters */}
        <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          <select value={filterTeam} onChange={(e) => setFilterTeam(e.target.value)} style={{ minWidth: 130 }}>
            <option value="">Team: Tất cả</option>
            {TEAMS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={filterType} onChange={(e) => setFilterType(e.target.value)} style={{ minWidth: 120 }}>
            <option value="">Loại: Tất cả</option>
            <option value="new">Hàng mới</option>
            <option value="existing">Hàng cũ</option>
          </select>
          <input
            type="text" placeholder="Tìm kiếm order..."
            value={filterQ} onChange={(e) => setFilterQ(e.target.value)}
            style={{ flex: 1, minWidth: 160 }}
          />
        </div>

        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>Mã</th>
                <th>Team</th>
                <th>Loại</th>
                <th>Sản phẩm</th>
                <th>SL</th>
                <th style={{ textAlign: "right" }}>Tổng giá trị</th>
                <th>Người tạo</th>
                <th>Ngày tạo</th>
                <th>Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 && (
                <tr><td colSpan={9} style={{ textAlign: "center", padding: 32, color: "var(--muted)" }}>Chưa có order nào</td></tr>
              )}
              {orders.map((o) => (
                <tr key={o.id} onClick={() => openDetail(o.id)} style={{ cursor: "pointer" }}>
                  <td style={{ fontWeight: 700, color: "var(--blue)" }}>{o.id}</td>
                  <td>
                    <span className={`chip ${TEAM_CHIP[o.team || ""] || "chip-gray"}`} style={{ fontSize: 10 }}>
                      {(o.team || "").replace("Team ", "")}
                    </span>
                  </td>
                  <td>
                    <span className={`chip ${o.order_type === "new" ? "chip-purple" : "chip-teal"}`} style={{ fontSize: 10 }}>
                      {o.order_type === "new" ? "Hàng mới" : "Hàng cũ"}
                    </span>
                  </td>
                  <td style={{ fontWeight: 600, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {o.items.map((it) => it.product_name).filter(Boolean).join(", ") || "—"}
                  </td>
                  <td style={{ textAlign: "right" }}>{toNum(o.total_qty).toLocaleString("vi-VN")}</td>
                  <td style={{ textAlign: "right", fontWeight: 700 }}>{toNum(o.order_total).toLocaleString("vi-VN")}</td>
                  <td>{o.created_by_name}</td>
                  <td style={{ color: "var(--muted)" }}>{formatDate(o.created_at)}</td>
                  <td><span className={`chip ${STATUS_CHIP[o.status]}`} style={{ fontSize: 10 }}>{STATUS_LABEL[o.status]}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // ─── CREATE VIEW ──────────────────────────────────────────

  if (view === "create") {
    return (
      <div className="section">
        <div className="page-hdr">
          <div>
            <div className="page-title">{editingId ? "Sửa Order" : "Tạo Order nhập hàng"}</div>
            <div className="page-sub">{orderType === "new" ? "Nhập thông tin sản phẩm mới" : "Chọn từ kho hàng có sẵn"}</div>
          </div>
          <button className="btn btn-ghost" onClick={() => setView("list")}>← Quay lại</button>
        </div>

        {/* Type toggle */}
        <div style={{ display: "flex", gap: 0, border: "2px solid var(--border)", borderRadius: 10, overflow: "hidden", marginBottom: 16 }}>
          <button
            type="button"
            onClick={() => { setOrderType("new"); setItems([]); setProdSearch(""); setProdResults([]); }}
            style={{
              flex: 1, padding: "10px 16px", border: "none", fontSize: 13, fontWeight: 700,
              cursor: "pointer", fontFamily: "inherit", textAlign: "center",
              background: orderType === "new" ? "var(--purple-lt)" : "#fff",
              color: orderType === "new" ? "var(--purple)" : "var(--muted)",
            }}
          >
            Hàng mới
            <div style={{ fontSize: 10, fontWeight: 400, marginTop: 2, opacity: 0.7 }}>Nhập thông tin SP mới</div>
          </button>
          <button
            type="button"
            onClick={() => { setOrderType("existing"); setItems([]); }}
            style={{
              flex: 1, padding: "10px 16px", border: "none", fontSize: 13, fontWeight: 700,
              cursor: "pointer", fontFamily: "inherit", textAlign: "center",
              background: orderType === "existing" ? "var(--teal-lt)" : "#fff",
              color: orderType === "existing" ? "var(--teal)" : "var(--muted)",
            }}
          >
            Hàng cũ
            <div style={{ fontSize: 10, fontWeight: 400, marginTop: 2, opacity: 0.7 }}>Chọn từ kho hàng có sẵn</div>
          </button>
        </div>

        {/* Order info */}
        <div className="card" style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
            Thông tin Order
            <span className={`chip ${orderType === "new" ? "chip-purple" : "chip-teal"}`} style={{ fontSize: 9 }}>
              {orderType === "new" ? "Hàng mới" : "Hàng cũ"}
            </span>
          </div>
          <div className="form-grid fg-2" style={{ marginBottom: 12 }}>
            <div className="form-group">
              <label>Team</label>
              <select value={team} onChange={(e) => setTeam(e.target.value)}>
                {TEAMS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Người tạo</label>
              <input type="text" value={`${user.name || user.email} (${user.role})`} readOnly className="ro" />
            </div>
          </div>
          <div className="form-group">
            <label>Ghi chú chung</label>
            <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Lý do nhập, ghi chú cho người duyệt..." />
          </div>
        </div>

        {/* ═══ HÀNG MỚI ═══ */}
        {orderType === "new" && (
          <div className="card" style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span>Sản phẩm ({items.length})</span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={addItem}>+ Thêm SP</button>
            </div>

            {items.length === 0 && (
              <div style={{ textAlign: "center", padding: 24, color: "var(--muted)", fontSize: 13 }}>
                Chưa có sản phẩm. Bấm &quot;+ Thêm SP&quot; để thêm.
              </div>
            )}

            {items.map((it, idx) => {
              const margin = toNum(it.sell_price) > 0 && toNum(it.unit_price) > 0
                ? (((toNum(it.sell_price) - toNum(it.unit_price)) / toNum(it.sell_price)) * 100).toFixed(1)
                : null;
              return (
                <div key={it._key} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 14, marginBottom: 10, background: "#fff", position: "relative" }}>
                  <span style={{ position: "absolute", top: -8, left: 12, background: "var(--blue)", color: "#fff", fontSize: 10, fontWeight: 800, padding: "1px 8px", borderRadius: 99 }}>{idx + 1}</span>
                  <button type="button" onClick={() => removeItem(it._key)} style={{ position: "absolute", top: 8, right: 8, width: 22, height: 22, borderRadius: "50%", border: "none", background: "var(--red-lt)", color: "var(--red)", cursor: "pointer", fontSize: 12 }}>x</button>

                  <div className="form-group" style={{ marginBottom: 10 }}>
                    <label>Tên sản phẩm</label>
                    <input value={it.product_name || ""} onChange={(e) => patchItem(it._key, { product_name: e.target.value })} placeholder="VD: Cáp sạc GaN 67W PD 3.0" />
                  </div>
                  <div className="form-grid fg-3" style={{ marginBottom: 10 }}>
                    <div className="form-group">
                      <label>Số lượng</label>
                      <input type="number" min={0} value={String(it.qty ?? 0)} onChange={(e) => patchItem(it._key, { qty: Number(e.target.value) || 0 })} />
                    </div>
                    <div className="form-group">
                      <label>Giá nhập dự kiến</label>
                      <input type="number" min={0} value={String(it.unit_price ?? 0)} onChange={(e) => patchItem(it._key, { unit_price: Number(e.target.value) || 0 })} />
                    </div>
                    <div className="form-group">
                      <label>Giá bán dự kiến</label>
                      <input type="number" min={0} value={String(it.sell_price ?? 0)} onChange={(e) => patchItem(it._key, { sell_price: Number(e.target.value) || 0 })} />
                    </div>
                  </div>
                  <div className="form-group" style={{ marginBottom: 10 }}>
                    <label>Mô tả / Spec</label>
                    <textarea rows={2} value={it.description || ""} onChange={(e) => patchItem(it._key, { description: e.target.value })} placeholder="Mô tả chi tiết SP..." />
                  </div>
                  <div className="form-grid fg-2">
                    <div className="form-group">
                      <label>Link tham khảo</label>
                      <input value={it.ref_link || ""} onChange={(e) => patchItem(it._key, { ref_link: e.target.value })} placeholder="Link 1688, Alibaba..." />
                    </div>
                    <div className="form-group">
                      <label>Link đối thủ</label>
                      <input value={it.competitor_link || ""} onChange={(e) => patchItem(it._key, { competitor_link: e.target.value })} placeholder="Link Shopee, Lazada..." />
                    </div>
                  </div>
                  {margin && (
                    <div style={{ marginTop: 8, display: "flex", gap: 6, alignItems: "center" }}>
                      <span style={{ fontSize: 11, color: "var(--muted)" }}>Biên lợi dự kiến:</span>
                      <span style={{ fontSize: 13, fontWeight: 800, color: "var(--green)" }}>{margin}%</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ═══ HÀNG CŨ ═══ */}
        {orderType === "existing" && (
          <>
            <div className="card" style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 10 }}>Tìm & chọn sản phẩm từ kho</div>
              <div style={{ position: "relative", marginBottom: 12 }}>
                <input
                  type="text" placeholder="Tìm theo tên, SKU..."
                  value={prodSearch} onChange={(e) => searchProducts(e.target.value)}
                  style={{ width: "100%", paddingLeft: 36 }}
                />
                <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--subtle)", fontSize: 14 }}>&#128269;</span>
              </div>
              {searching && <div style={{ fontSize: 12, color: "var(--muted)", padding: 8 }}>Đang tìm...</div>}
              {prodResults.length > 0 && (
                <div style={{ border: "1px solid var(--border)", borderRadius: 10, maxHeight: 260, overflowY: "auto" }}>
                  {prodResults.map((p) => {
                    const sel = isSelected(p.sku);
                    return (
                      <div
                        key={p.sku} onClick={() => !sel && selectProduct(p)}
                        style={{
                          display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
                          borderBottom: "1px solid var(--border)", cursor: sel ? "default" : "pointer",
                          background: sel ? "var(--green-lt)" : undefined,
                          borderLeft: sel ? "3px solid var(--green)" : undefined,
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 700 }}>{p.product_name}</div>
                          <div style={{ fontSize: 11, color: "var(--muted)", display: "flex", gap: 10, marginTop: 2 }}>
                            <span>SKU: {p.sku}</span>
                            <span>Giá nhập: {toNum(p.cost_price).toLocaleString("vi-VN")}</span>
                            <span>Giá bán: {toNum(p.sell_price).toLocaleString("vi-VN")}</span>
                          </div>
                        </div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--teal)" }}>Tồn: {toNum(p.stock).toLocaleString("vi-VN")}</div>
                        {sel && <span style={{ color: "var(--green)", fontSize: 16 }}>&#10003;</span>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {items.length > 0 && (
              <div className="card" style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span>Sản phẩm đã chọn ({items.length})</span>
                  <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 400 }}>Nhập số lượng cần bổ sung</span>
                </div>
                {items.map((it) => (
                  <div key={it._key} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "#F9FAFB", border: "1px solid var(--border)", borderRadius: 8, marginBottom: 6 }}>
                    <div style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>
                      {it.product_name}
                      <div style={{ fontSize: 10, color: "var(--muted)", fontWeight: 400 }}>
                        SKU: {it.sku} · Tồn: {toNum(it.current_stock).toLocaleString("vi-VN")} · Giá: {toNum(it.unit_price).toLocaleString("vi-VN")}
                      </div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                      <span style={{ fontSize: 9, color: "var(--muted)", fontWeight: 700 }}>SỐ LƯỢNG</span>
                      <input
                        type="number" min={0} value={String(it.qty ?? 0)}
                        onChange={(e) => patchItem(it._key, { qty: Number(e.target.value) || 0 })}
                        style={{ width: 80, textAlign: "center" }}
                      />
                    </div>
                    <button type="button" onClick={() => removeItem(it._key)} style={{ width: 24, height: 24, borderRadius: "50%", border: "none", background: "var(--red-lt)", color: "var(--red)", cursor: "pointer", fontSize: 14 }}>x</button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Summary */}
        {items.length > 0 && (
          <div style={{ background: "linear-gradient(135deg, #EFF6FF 0%, #F0FDF4 100%)", border: "1px solid #86EFAC", borderRadius: 12, padding: "14px 16px", marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8, color: "var(--green)" }}>Tóm tắt Order</div>
            {items.map((it, idx) => (
              <div key={it._key} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 13 }}>
                <span style={{ color: "var(--muted)" }}>{idx + 1}. {it.product_name} — {toNum(it.qty).toLocaleString("vi-VN")} x {toNum(it.unit_price).toLocaleString("vi-VN")}</span>
                <span style={{ fontWeight: 700 }}>{(toNum(it.qty) * toNum(it.unit_price)).toLocaleString("vi-VN")}</span>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid #86EFAC", paddingTop: 8, marginTop: 4, fontWeight: 800, fontSize: 15, color: "var(--green)" }}>
              <span>Tổng giá trị ({totalQty.toLocaleString("vi-VN")} SP)</span>
              <span>{formatVND(orderTotal)}</span>
            </div>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16 }}>
          <button type="button" className="btn btn-ghost" onClick={onSave} disabled={pending}>
            {pending ? "Đang lưu..." : "Lưu nháp"}
          </button>
          <button type="button" className="btn btn-success" style={{ padding: "10px 24px", fontSize: 13 }} onClick={onSubmitForApproval} disabled={pending}>
            {pending ? "Đang xử lý..." : "Gửi duyệt →"}
          </button>
        </div>
      </div>
    );
  }

  // ─── DETAIL VIEW ──────────────────────────────────────────

  if (view === "detail" && detail) {
    return (
      <div className="section">
        <div className="page-hdr">
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div className="page-title">{detail.id}</div>
            <span className={`chip ${STATUS_CHIP[detail.status]}`}>{STATUS_LABEL[detail.status]}</span>
            <span className={`chip ${detail.order_type === "new" ? "chip-purple" : "chip-teal"}`} style={{ fontSize: 10 }}>
              {detail.order_type === "new" ? "Hàng mới" : "Hàng cũ"}
            </span>
            <span className={`chip ${TEAM_CHIP[detail.team || ""] || "chip-gray"}`} style={{ fontSize: 10 }}>{detail.team}</span>
          </div>
          <div className="row">
            {detail.status === "draft" && (
              <button className="btn btn-danger btn-sm" onClick={() => onDelete(detail.id)} disabled={pending}>Xoá</button>
            )}
            <button className="btn btn-ghost" onClick={() => setView("list")}>← Quay lại</button>
          </div>
        </div>

        {/* Meta */}
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="form-grid fg-4" style={{ fontSize: 12 }}>
            <div>
              <div style={{ color: "var(--muted)", fontSize: 10, fontWeight: 700, textTransform: "uppercase", marginBottom: 2 }}>Người tạo</div>
              <div style={{ fontWeight: 700 }}>{detail.created_by_name}</div>
            </div>
            <div>
              <div style={{ color: "var(--muted)", fontSize: 10, fontWeight: 700, textTransform: "uppercase", marginBottom: 2 }}>Ngày tạo</div>
              <div style={{ fontWeight: 700 }}>{formatDate(detail.created_at)}</div>
            </div>
            <div>
              <div style={{ color: "var(--muted)", fontSize: 10, fontWeight: 700, textTransform: "uppercase", marginBottom: 2 }}>Tổng SP</div>
              <div style={{ fontWeight: 700 }}>{detail.items.length} SP · {toNum(detail.total_qty).toLocaleString("vi-VN")} đơn vị</div>
            </div>
            <div>
              <div style={{ color: "var(--muted)", fontSize: 10, fontWeight: 700, textTransform: "uppercase", marginBottom: 2 }}>Tổng giá trị</div>
              <div style={{ fontWeight: 800, color: "var(--green)", fontSize: 14 }}>{formatVND(detail.order_total)}</div>
            </div>
          </div>
        </div>

        {/* Approver info */}
        {detail.approver && (
          <div className="card" style={{ marginBottom: 12 }}>
            <div className="form-grid fg-2" style={{ fontSize: 12 }}>
              <div>
                <div style={{ color: "var(--muted)", fontSize: 10, fontWeight: 700, textTransform: "uppercase", marginBottom: 2 }}>Người duyệt</div>
                <div style={{ fontWeight: 700 }}>{detail.approver_name}</div>
              </div>
              {detail.approved_at && (
                <div>
                  <div style={{ color: "var(--muted)", fontSize: 10, fontWeight: 700, textTransform: "uppercase", marginBottom: 2 }}>Ngày duyệt</div>
                  <div style={{ fontWeight: 700 }}>{formatDate(detail.approved_at)}</div>
                </div>
              )}
            </div>
            {detail.approval_note && (
              <div style={{ marginTop: 8, fontSize: 12, color: "var(--muted)" }}>Ghi chú duyệt: {detail.approval_note}</div>
            )}
            {detail.po_order_id && (
              <div style={{ marginTop: 8, fontSize: 12 }}>
                Đơn nhập đã tạo:{" "}
                <a href={`/create?order_id=${detail.po_order_id}`} style={{ color: "var(--blue)", fontWeight: 700, textDecoration: "none" }}>
                  {detail.po_order_id}
                </a>
              </div>
            )}
          </div>
        )}

        {/* Note */}
        {detail.note && (
          <div className="card" style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", marginBottom: 6 }}>Ghi chú</div>
            <div style={{ fontSize: 13, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{detail.note}</div>
          </div>
        )}

        {/* Products */}
        <div className="card" style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 10 }}>Sản phẩm trong Order</div>
          {detail.items.map((it, idx) => {
            const lineTotal = toNum(it.qty) * toNum(it.unit_price);
            const margin = toNum(it.sell_price) > 0 && toNum(it.unit_price) > 0
              ? (((toNum(it.sell_price) - toNum(it.unit_price)) / toNum(it.sell_price)) * 100).toFixed(1)
              : null;
            return (
              <div key={it.line_id} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 14, marginBottom: 10, borderLeft: "3px solid var(--blue)", position: "relative" }}>
                <span style={{ position: "absolute", top: -8, left: 12, background: "var(--blue)", color: "#fff", fontSize: 10, fontWeight: 800, padding: "1px 8px", borderRadius: 99 }}>{idx + 1}</span>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>{it.product_name}</div>
                <div className="form-grid fg-4" style={{ fontSize: 12, marginBottom: 8 }}>
                  <div>
                    <div style={{ color: "var(--muted)", fontSize: 10 }}>Số lượng</div>
                    <div style={{ fontWeight: 700 }}>{toNum(it.qty).toLocaleString("vi-VN")}</div>
                  </div>
                  <div>
                    <div style={{ color: "var(--muted)", fontSize: 10 }}>Giá nhập</div>
                    <div style={{ fontWeight: 700 }}>{toNum(it.unit_price).toLocaleString("vi-VN")}</div>
                  </div>
                  <div>
                    <div style={{ color: "var(--muted)", fontSize: 10 }}>Giá bán</div>
                    <div style={{ fontWeight: 700 }}>{toNum(it.sell_price).toLocaleString("vi-VN")}</div>
                  </div>
                  <div>
                    <div style={{ color: "var(--muted)", fontSize: 10 }}>Biên lợi</div>
                    <div style={{ fontWeight: 700, color: "var(--green)" }}>{margin ? margin + "%" : "—"}</div>
                  </div>
                </div>
                {it.description && <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 6 }}>{it.description}</div>}
                {(it.ref_link || it.competitor_link) && (
                  <div style={{ display: "flex", gap: 8, fontSize: 11 }}>
                    {it.ref_link && <a href={it.ref_link} target="_blank" rel="noopener noreferrer" style={{ color: "var(--blue)", textDecoration: "none" }}>Link tham khảo</a>}
                    {it.competitor_link && <a href={it.competitor_link} target="_blank" rel="noopener noreferrer" style={{ color: "var(--blue)", textDecoration: "none" }}>Link đối thủ</a>}
                  </div>
                )}
                {detail.order_type === "existing" && toNum(it.current_stock) > 0 && (
                  <div style={{ fontSize: 11, color: "var(--teal)", marginTop: 4 }}>Tồn kho hiện tại: {toNum(it.current_stock).toLocaleString("vi-VN")}</div>
                )}
                <div style={{ marginTop: 6, textAlign: "right", fontWeight: 800, fontSize: 13 }}>= {lineTotal.toLocaleString("vi-VN")}đ</div>
              </div>
            );
          })}
        </div>

        {/* Summary */}
        <div style={{ background: "linear-gradient(135deg, #EFF6FF 0%, #F0FDF4 100%)", border: "1px solid #86EFAC", borderRadius: 12, padding: "14px 16px", marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 800, fontSize: 15, color: "var(--green)" }}>
            <span>Tổng giá trị Order</span>
            <span style={{ fontSize: 17 }}>{formatVND(detail.order_total)}</span>
          </div>
        </div>

        {/* Approval actions for leader */}
        {detail.status === "pending" && canApprove && (
          <div className="card" style={{ border: "2px solid var(--amber)", background: "var(--amber-lt)", marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8, color: "#92400E" }}>Duyệt Order</div>
            <div className="form-group" style={{ marginBottom: 12 }}>
              <label>Ghi chú duyệt</label>
              <textarea rows={2} value={approvalNote} onChange={(e) => setApprovalNote(e.target.value)} placeholder="Ghi chú khi duyệt hoặc từ chối..." style={{ background: "#fff" }} />
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button className="btn btn-danger" style={{ padding: "10px 20px" }} onClick={onReject} disabled={pending}>✕ Từ chối</button>
              <button className="btn btn-success" style={{ padding: "10px 24px", fontSize: 13 }} onClick={onApprove} disabled={pending}>✓ Duyệt & Tạo đơn nhập</button>
            </div>
          </div>
        )}

        {/* Draft — submit */}
        {detail.status === "draft" && detail.created_by === user.email && (
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              className="btn btn-success"
              style={{ padding: "10px 24px", fontSize: 13 }}
              onClick={() => {
                const leaders = users.filter((u) => u.role === "ADMIN" || (u.role && u.role.startsWith("LEADER_")));
                if (leaders.length === 0) return alert("Không tìm thấy leader/admin.");
                const choice = prompt(
                  "Chọn người duyệt (nhập số):\n" +
                    leaders.map((u, i) => `${i + 1}. ${u.name || u.email} (${u.role})`).join("\n"),
                );
                if (!choice) return;
                const ci = parseInt(choice) - 1;
                if (ci < 0 || ci >= leaders.length) return alert("Không hợp lệ.");
                start(async () => {
                  const s = await submitBizOrderAction(detail.id, leaders[ci].email);
                  if (!s.ok) return alert("Lỗi: " + s.error);
                  alert(`Đã gửi duyệt cho ${leaders[ci].name || leaders[ci].email}`);
                  router.refresh();
                  setView("list");
                });
              }}
              disabled={pending}
            >
              {pending ? "Đang xử lý..." : "Gửi duyệt →"}
            </button>
          </div>
        )}
      </div>
    );
  }

  return <div className="section" style={{ textAlign: "center", padding: 32, color: "var(--muted)" }}>Không tìm thấy order.</div>;
}
