"use client";

import { useState } from "react";
import { formatDate } from "@/lib/format";

type SyncResult = {
  ok: boolean;
  inserted?: number;
  channels?: number;
  orders?: number;
  customers?: number;
  fetched?: number;
  accounts?: number;
  pages?: number;
  errors?: string[];
  error?: string;
};

type SyncJob = {
  key: string;
  label: string;
  sub: string;
  url: string;
  body?: () => Record<string, unknown>;
};

const JOBS: SyncJob[] = [
  {
    key: "products",
    label: "Sản phẩm",
    sub: "Sync toàn bộ sản phẩm + giá + danh mục từ Nhanh.vn v3 (~1-3 phút)",
    url: "/api/nhanh/sync-products",
  },
  {
    key: "inventory",
    label: "Tồn kho",
    sub: "Sync tồn kho hiện tại của toàn bộ SKU (~1-3 phút)",
    url: "/api/nhanh/sync-inventory",
  },
  {
    key: "sales",
    label: "Doanh số theo kênh",
    sub: "Aggregate đơn hàng 2026 theo sale channel (~30s-2 phút)",
    url: "/api/nhanh/sync-sales",
    body: () => ({ from: "2026-01-01" }),
  },
  {
    key: "customers",
    label: "Khách hàng (90 ngày)",
    sub: "Tổng hợp khách từ đơn Nhanh.vn 90 ngày gần nhất (~2-5 phút)",
    url: "/api/nhanh/sync-customers",
    body: () => ({ days: 90 }),
  },
  {
    key: "fb-ads",
    label: "Facebook Ads (7 ngày)",
    sub: "Pull chi tiêu ads từ Marketing API cho tất cả ad_account trong bảng pages",
    url: "/api/fb/sync-ads",
    body: () => {
      const to = new Date();
      const from = new Date(to.getTime() - 7 * 86400_000);
      const iso = (d: Date) => d.toISOString().substring(0, 10);
      return { from: iso(from), to: iso(to) };
    },
  },
  {
    key: "fb-insights",
    label: "Facebook Page Insights (30 ngày)",
    sub: "Pull new_fans/reach/impressions theo ngày cho tất cả fb_page_id",
    url: "/api/fb/sync-insights",
  },
  {
    key: "tt-ads",
    label: "TikTok Ads (7 ngày)",
    sub: "Yêu cầu TIKTOK_ACCESS_TOKEN + TIKTOK_ADVERTISER_IDS trong .env.local",
    url: "/api/tiktok/sync-ads",
    body: () => {
      const to = new Date();
      const from = new Date(to.getTime() - 7 * 86400_000);
      const iso = (d: Date) => d.toISOString().substring(0, 10);
      return { from: iso(from), to: iso(to) };
    },
  },
  {
    key: "tt-shop-orders",
    label: "TikTok Shop Orders (7 ngày, 3 shops)",
    sub: "Sync đơn hàng từ 3 shops TikTok. Auto-refresh token nếu sắp hết hạn.",
    url: "/api/tiktok/sync-shop-orders",
    body: () => {
      const to = new Date();
      const from = new Date(to.getTime() - 7 * 86400_000);
      const iso = (d: Date) => d.toISOString().substring(0, 10);
      return { from: iso(from), to: iso(to) };
    },
  },
];

export default function SyncPanel() {
  const [running, setRunning] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, { r: SyncResult; at: string }>>({});

  async function run(job: SyncJob) {
    if (running) return;
    setRunning(job.key);
    try {
      const res = await fetch(job.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(job.body ? job.body() : {}),
      });
      const r = (await res.json()) as SyncResult;
      setResults({ ...results, [job.key]: { r, at: new Date().toLocaleString("vi-VN") } });
    } catch (e) {
      setResults({
        ...results,
        [job.key]: { r: { ok: false, error: (e as Error).message }, at: new Date().toLocaleString("vi-VN") },
      });
    } finally {
      setRunning(null);
    }
  }

  return (
    <div className="card" style={{ padding: 0 }}>
      <div style={{ padding: "12px 14px", background: "#FAFAFA", borderBottom: "1px solid var(--border)", fontWeight: 700 }}>
        🔄 Đồng bộ Nhanh.vn
      </div>
      <div>
        {JOBS.map((job, i) => {
          const result = results[job.key];
          const isRunning = running === job.key;
          return (
            <div
              key={job.key}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "14px",
                borderBottom: i < JOBS.length - 1 ? "1px solid var(--border)" : "none",
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700 }}>{job.label}</div>
                <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{job.sub}</div>
                {result && (
                  <div style={{ fontSize: 11, marginTop: 6, color: result.r.ok ? "var(--green)" : "var(--red)" }}>
                    {result.r.ok
                      ? `✓ ${
                          result.r.inserted ??
                          result.r.customers ??
                          (result.r.fetched !== undefined
                            ? `${result.r.fetched} rows (${result.r.accounts ?? result.r.pages ?? 0} sources${result.r.errors?.length ? `, ${result.r.errors.length} errors` : ""})`
                            : result.r.channels !== undefined
                              ? `${result.r.channels} kênh / ${result.r.orders} đơn`
                              : "done")
                        } · ${result.at}`
                      : `✖ ${result.r.error} · ${result.at}`}
                  </div>
                )}
              </div>
              <button
                className="btn btn-primary btn-sm"
                onClick={() => run(job)}
                disabled={!!running}
              >
                {isRunning ? "Đang sync..." : "🔄 Sync"}
              </button>
            </div>
          );
        })}
      </div>
      <div style={{ padding: "12px 14px", background: "#FAFAFA", borderTop: "1px solid var(--border)", fontSize: 12, color: "var(--muted)" }}>
        💡 Mỗi sync có thể mất vài phút. Không đóng tab khi đang chạy.
      </div>
    </div>
  );
}
