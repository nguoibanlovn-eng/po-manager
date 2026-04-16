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

const CHANNELS: { key: Channel; label: string; color: string }[] = [
  { key: "fb", label: "Facebook", color: "#1877F2" },
  { key: "shopee", label: "Shopee", color: "#EE4D2D" },
  { key: "tiktok", label: "TikTok", color: "#000" },
  { key: "web", label: "Web/B2B", color: "#0EA5E9" },
];

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

  const filtered = useMemo(() => {
    if (filter === "todo") {
      return groups
        .map((g) => ({
          ...g,
          products: g.products.filter((p) => p.status !== "done"),
        }))
        .filter((g) => g.products.length > 0);
    }
    if (filter === "done") {
      return groups
        .map((g) => ({
          ...g,
          products: g.products.filter((p) => p.status === "done"),
        }))
        .filter((g) => g.products.length > 0);
    }
    return groups;
  }, [groups, filter]);

  const stats = useMemo(() => {
    let pendingCount = 0, inProgress = 0, done = 0;
    for (const g of groups) {
      for (const p of g.products) {
        if (p.status === "done") done++;
        else if (p.status === "in_progress") inProgress++;
        else pendingCount++;
      }
    }
    return { pendingCount, inProgress, done, total: groups.reduce((s, g) => s + g.products.length, 0) };
  }, [groups]);

  return (
    <section className="section">
      <div className="page-hdr">
        <div>
          <div className="page-title">🚀 Triển khai bán</div>
          <div className="page-sub">
            {stats.total} SP · {stats.pendingCount} chờ · {stats.inProgress} đang làm · {stats.done} xong
          </div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => router.refresh()}>🔄</button>
      </div>

      <div style={{ display: "flex", gap: 0, border: "0.5px solid var(--border)", borderRadius: 6, overflow: "hidden", width: "fit-content", marginBottom: 12, fontSize: 12 }}>
        {[
          ["all", "Tất cả"],
          ["todo", "Chờ làm"],
          ["done", "Đã xong"],
        ].map(([k, v]) => (
          <Link
            key={k}
            href={`/deploy?filter=${k}`}
            style={{
              padding: "6px 14px",
              textDecoration: "none",
              background: filter === k ? "#e8940a" : "var(--card)",
              color: filter === k ? "#fff" : "var(--muted)",
              fontWeight: filter === k ? 600 : 400,
            }}
          >{v}</Link>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="card muted" style={{ padding: 24, textAlign: "center" }}>Không có phiếu nào.</div>
      ) : (
        filtered.map((g) => (
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
    </section>
  );
}

function OrderGroup({
  group,
  canApprove,
  disabled,
  startTransition,
  refresh,
}: {
  group: DeployGroup;
  canApprove: boolean;
  disabled: boolean;
  startTransition: ReturnType<typeof useTransition>[1];
  refresh: () => void;
}) {
  const [expanded, setExpanded] = useState(group.products.some((p) => p.status !== "done"));
  return (
    <div className="card" style={{ marginBottom: 12, padding: 0, overflow: "hidden" }}>
      <div
        onClick={() => setExpanded((v) => !v)}
        style={{
          padding: "12px 14px",
          background: "#FAFAFA",
          borderBottom: expanded ? "1px solid var(--border)" : "none",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700 }}>
            {group.order_id} · {group.order_name}
          </div>
          <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
            {group.supplier_name || "—"} · Về {formatDate(group.arrival_date)} · {group.products.length} SP
          </div>
        </div>
        {group.order_stage && <span className={`stage-badge stage-${group.order_stage}`}>{group.order_stage}</span>}
        <span style={{ color: "var(--muted)" }}>{expanded ? "▾" : "▸"}</span>
      </div>

      {expanded && (
        <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
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

function DeployRow({
  p,
  canApprove,
  disabled,
  startTransition,
  refresh,
}: {
  p: DeployProduct;
  canApprove: boolean;
  disabled: boolean;
  startTransition: ReturnType<typeof useTransition>[1];
  refresh: () => void;
}) {
  const [desc, setDesc] = useState(p.product_desc || "");
  const [sellPrice, setSellPrice] = useState(String(p.sell_price || ""));
  const [refLinks, setRefLinks] = useState(""); // stored separately; not in DeployProduct type for now

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

  function saveInfo() {
    startTransition(async () => {
      const r = await updateInfoAction(p.deploy_id, {
        product_desc: desc,
        sell_price: toNum(sellPrice),
        ref_links: refLinks || undefined,
      });
      if (!r.ok) alert(r.error);
      else refresh();
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

  return (
    <div className="item-card" style={{ padding: 12 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 300px", minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{p.product_name || "—"}</div>
          <div className="muted" style={{ fontSize: 12 }}>
            SKU: {p.sku || "—"} · SL: {toNum(p.qty)} · Giá nhập: {formatVND(p.unit_price)}
          </div>
          {p.price_approved_by && (
            <div style={{ fontSize: 11, color: "var(--green)", marginTop: 4 }}>
              ✓ Giá đã duyệt · {p.price_approved_by}
            </div>
          )}
        </div>
        <span className={`chip ${p.status === "done" ? "chip-green" : p.status === "in_progress" ? "chip-amber" : "chip-gray"}`}>
          {p.status === "done" ? "Xong" : p.status === "in_progress" ? "Đang làm" : "Chờ"}
        </span>
      </div>

      <div className="form-grid fg-3" style={{ marginTop: 10 }}>
        <div className="form-group">
          <label>Mô tả SP</label>
          <textarea rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} disabled={disabled} />
        </div>
        <div className="form-group">
          <label>Giá bán đề xuất</label>
          <input
            type="text"
            inputMode="numeric"
            value={sellPrice}
            onChange={(e) => setSellPrice(e.target.value.replace(/\D/g, ""))}
            disabled={disabled}
          />
        </div>
        <div className="form-group">
          <label>Link tham khảo (thị trường)</label>
          <input value={refLinks} onChange={(e) => setRefLinks(e.target.value)} placeholder="URL..." disabled={disabled} />
        </div>
      </div>

      <div className="row" style={{ marginTop: 10, gap: 8 }}>
        <button type="button" className="btn btn-primary btn-sm" onClick={saveInfo} disabled={disabled}>
          💾 Lưu thông tin
        </button>
        {canApprove && !p.price_approved_by && toNum(p.sell_price) > 0 && (
          <button type="button" className="btn btn-success btn-sm" onClick={approvePrice} disabled={disabled}>
            ✓ Duyệt giá
          </button>
        )}
      </div>

      <div style={{ marginTop: 12, borderTop: "0.5px solid var(--border)", paddingTop: 10 }}>
        <div className="muted" style={{ fontSize: 11, marginBottom: 6, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".5px" }}>
          Đăng kênh
        </div>
        <div className="row" style={{ gap: 6 }}>
          {CHANNELS.map((c) => {
            const done = !!p[`${c.key}_done` as const];
            const links = parseLinks(p[`${c.key}_links` as const]);
            return (
              <div key={c.key} style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 110 }}>
                <button
                  type="button"
                  onClick={() => toggleChannel(c.key, done)}
                  disabled={disabled}
                  style={{
                    padding: "6px 10px",
                    fontSize: 12,
                    fontWeight: 700,
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
                  <div style={{ fontSize: 10, color: "var(--subtle)", textAlign: "center" }}>
                    {links.length} link
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
