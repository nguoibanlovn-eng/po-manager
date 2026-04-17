"use client";

import { useState } from "react";

export default function SyncButton({
  url,
  label,
  onDone,
  style,
}: {
  url: string;
  label: string;
  onDone?: () => void;
  style?: React.CSSProperties;
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
        body: "{}",
      });
      if (res.redirected || res.url.includes("/login")) {
        setResult("Chưa đăng nhập");
        return;
      }
      const json = await res.json();
      if (json.ok) {
        const detail = json.fetched != null ? `✓ ${json.fetched} dòng` : "OK";
        setResult(detail);
        if (json.errors?.length) console.warn("Sync warnings:", json.errors);
        onDone?.();
      } else {
        const msg = json.error || "Lỗi không xác định";
        setResult(msg);
        console.error("Sync error:", msg);
      }
    } catch (e) {
      setResult((e as Error).message);
    } finally {
      setSyncing(false);
      setTimeout(() => setResult(null), 4000);
    }
  }

  return (
    <button
      className="btn btn-ghost btn-xs"
      onClick={run}
      disabled={syncing}
      style={{ minWidth: 70, ...style }}
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
            }}
          />
          Đang sync...
        </span>
      ) : result ? (
        <span style={{ color: result.startsWith("✓") || result === "OK" ? "var(--green)" : "var(--red)" }}>
          {result === "OK" ? "✓ Xong" : result.substring(0, 40)}
        </span>
      ) : (
        label
      )}
    </button>
  );
}
