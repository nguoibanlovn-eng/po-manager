"use client";

import { useState } from "react";

export default function SyncButton({
  url,
  label,
  onDone,
  style,
  body,
}: {
  url: string;
  label: string;
  onDone?: () => void;
  style?: React.CSSProperties;
  body?: Record<string, unknown>;
}) {
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function run() {
    setSyncing(true);
    setResult(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body || {}),
      });
      if (res.redirected || res.url.includes("/login")) {
        setResult("❌ Chưa đăng nhập");
        return;
      }
      const json = await res.json();
      if (json.ok) {
        // Build summary from response
        const parts: string[] = [];
        if (json.imported?.length != null) parts.push(`${json.imported.length} ngày`);
        if (json.fetched != null) parts.push(`${json.fetched} dòng`);
        if (json.channels != null) parts.push(`${json.channels} kênh`);
        if (json.orders != null) parts.push(`${json.orders} đơn`);
        if (json.skipped) parts.push(`bỏ qua ${json.skipped}`);

        // Drive import details
        if (json.imported?.length > 0) {
          const dates = json.imported.map((r: { date: string; rows: number }) => `${r.date.substring(5)}(${r.rows})`);
          parts.push(dates.join(" "));
        }

        // Logs from sync
        if (json.logs?.length) {
          const lastLogs = json.logs.filter((l: string) => !l.startsWith("[")).slice(-5);
          if (lastLogs.length) parts.push(lastLogs.join(" · "));
        }

        if (json.errors?.length) parts.push(`⚠${json.errors.length} lỗi`);

        setResult("✓ " + (parts.join(" · ") || "Xong"));
        onDone?.();
      } else {
        setResult("❌ " + (json.error || "Lỗi không xác định"));
      }
    } catch (e) {
      setResult("❌ " + (e as Error).message);
    } finally {
      setSyncing(false);
      setTimeout(() => setResult(null), 8000);
    }
  }

  const isOk = result?.startsWith("✓");
  const isErr = result?.startsWith("❌");

  return (
    <button
      className="btn btn-ghost btn-xs"
      onClick={run}
      disabled={syncing}
      title={result || undefined}
      style={{ minWidth: 70, maxWidth: result ? 500 : undefined, ...style }}
    >
      {syncing ? (
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span
            style={{
              width: 12,
              height: 12,
              border: "2px solid var(--border)",
              borderTopColor: "var(--blue)",
              borderRadius: "50%",
              display: "inline-block",
              animation: "spin .6s linear infinite",
              flexShrink: 0,
            }}
          />
          Đang sync...
        </span>
      ) : result ? (
        <span style={{
          color: isOk ? "var(--green)" : isErr ? "var(--red)" : "var(--text)",
          fontSize: 10,
          lineHeight: 1.3,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}>
          {result}
        </span>
      ) : (
        label
      )}
    </button>
  );
}
