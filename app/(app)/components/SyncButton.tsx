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
  const [logs, setLogs] = useState<string[]>([]);
  const [showLogs, setShowLogs] = useState(false);

  async function run() {
    setSyncing(true);
    setResult(null);
    setLogs([]);
    setShowLogs(true);
    try {
      const t0 = Date.now();
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body || {}),
      });
      if (res.redirected || res.url.includes("/login")) {
        setResult("❌ Chưa đăng nhập");
        return;
      }

      const ct = res.headers.get("content-type") || "";

      // SSE stream response
      if (ct.includes("text/event-stream") && res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let finalResult: Record<string, unknown> | null = null;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              const parsed = JSON.parse(line.slice(6));
              if (typeof parsed === "string") {
                setLogs((prev) => [...prev, parsed]);
              } else if (parsed.__done) {
                finalResult = parsed;
              }
            } catch { /* skip */ }
          }
        }

        const duration = ((Date.now() - t0) / 1000).toFixed(1);
        if (finalResult?.ok) {
          const parts: string[] = [];
          if (finalResult.updated != null) parts.push(`${finalResult.updated} cập nhật`);
          if (finalResult.found != null) parts.push(`${finalResult.found} tìm thấy`);
          if (finalResult.total != null) parts.push(`${finalResult.total} SKU`);
          parts.push(`${duration}s`);
          setResult("✓ " + parts.join(" · "));
          onDone?.();
        } else {
          setResult("❌ " + (finalResult?.error || "Lỗi"));
        }
        return;
      }

      // Regular JSON response
      const duration = ((Date.now() - t0) / 1000).toFixed(1);
      const json = await res.json();
      if (json.ok) {
        const parts: string[] = [];
        if (json.inserted != null) parts.push(`${json.inserted} SP`);
        if (json.updated != null) parts.push(`${json.updated} cập nhật`);
        if (json.found != null) parts.push(`${json.found} tìm thấy`);
        if (json.total != null && json.inserted == null) parts.push(`${json.total} SKU`);
        if (json.imported?.length != null) parts.push(`${json.imported.length} ngày`);
        if (json.fetched != null) parts.push(`${json.fetched} dòng`);
        if (json.channels != null) parts.push(`${json.channels} kênh`);
        if (json.orders != null) parts.push(`${json.orders} đơn`);
        if (json.skipped) parts.push(`bỏ qua ${json.skipped}`);

        if (json.imported?.length > 0) {
          const dates = json.imported.map((r: { date: string; rows: number }) => `${r.date.substring(5)}(${r.rows})`);
          parts.push(dates.join(" "));
        }
        if (json.errors?.length) parts.push(`⚠${json.errors.length} lỗi`);
        parts.push(`${duration}s`);

        setResult("✓ " + (parts.join(" · ") || "Xong"));
        setLogs(json.logs || []);
        onDone?.();
      } else {
        setResult("❌ " + (json.error || "Lỗi không xác định"));
        setLogs(json.logs || []);
      }
    } catch (e) {
      setResult("❌ " + (e as Error).message);
    } finally {
      setSyncing(false);
      setTimeout(() => { setResult(null); setShowLogs(false); setLogs([]); }, 15000);
    }
  }

  const isOk = result?.startsWith("✓");
  const isErr = result?.startsWith("❌");

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <button
        className="btn btn-ghost btn-xs"
        onClick={run}
        disabled={syncing}
        title={result || undefined}
        style={{ minWidth: 70, maxWidth: result ? 500 : undefined, ...style }}
      >
        {syncing ? (
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{
              width: 12, height: 12,
              border: "2px solid var(--border)", borderTopColor: "var(--blue)",
              borderRadius: "50%", display: "inline-block",
              animation: "spin .6s linear infinite", flexShrink: 0,
            }} />
            Đang sync...
          </span>
        ) : result ? (
          <span style={{
            color: isOk ? "var(--green)" : isErr ? "var(--red)" : "var(--text)",
            fontSize: 10, lineHeight: 1.3, whiteSpace: "nowrap",
            overflow: "hidden", textOverflow: "ellipsis",
          }}>
            {result}
          </span>
        ) : (
          label
        )}
      </button>

      {showLogs && (logs.length > 0 || syncing) && (
        <div style={{
          position: "fixed", top: 60, right: 16,
          width: 400, maxHeight: 260, overflow: "auto",
          background: "#1F2937", color: "#E5E7EB", borderRadius: 8,
          padding: "8px 10px", fontSize: 10,
          fontFamily: "'SF Mono',Menlo,monospace", lineHeight: 1.6,
          zIndex: 9999, boxShadow: "0 4px 20px rgba(0,0,0,.4)",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ color: "#9CA3AF", fontSize: 9, fontWeight: 600 }}>SYNC LOG</span>
            <button onClick={() => setShowLogs(false)} style={{ background: "none", border: "none", color: "#9CA3AF", cursor: "pointer", fontSize: 10, padding: 0 }}>✕</button>
          </div>
          {logs.map((l, i) => (
            <div key={i} style={{
              color: l.includes("✓") || l.includes("Hoàn tất") ? "#34D399"
                : l.includes("❌") || l.includes("Lỗi") ? "#F87171"
                : l.includes("Đang") || l.includes("bắt đầu") || l.includes("Token") ? "#93C5FD"
                : "#E5E7EB",
            }}>{l}</div>
          ))}
          {syncing && <div style={{ color: "#93C5FD", animation: "pulse 1.5s infinite" }}>⏳ Đang xử lý...</div>}
        </div>
      )}
    </div>
  );
}
