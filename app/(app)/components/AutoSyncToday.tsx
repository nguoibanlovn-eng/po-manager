"use client";

import { useEffect, useRef } from "react";

/** Auto-sync Nhanh sales for today on mount. Runs once, non-blocking. */
export default function AutoSyncToday({ onDone }: { onDone?: () => void }) {
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const today = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

    fetch("/api/nhanh/sync-sales", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from: todayStr, to: todayStr }),
    })
      .then((r) => r.json())
      .then((j) => {
        if (j.ok && onDone) onDone();
      })
      .catch(() => {});
  }, [onDone]);

  return null;
}
