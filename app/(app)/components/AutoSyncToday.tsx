"use client";

import { useEffect, useRef } from "react";

const COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes between syncs
const STORAGE_KEY = "auto-sync-last";

/** Auto-sync on mount. Runs once per 10 minutes, non-blocking.
 *  Default: sync Nhanh sales.
 *  Pass `extraSyncs` to also trigger other sync endpoints. */
export default function AutoSyncToday({ onDone, extraSyncs }: {
  onDone?: () => void;
  extraSyncs?: string[];
}) {
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    // Cooldown: skip if synced within last 10 minutes
    const lastSync = Number(localStorage.getItem(STORAGE_KEY) || "0");
    if (Date.now() - lastSync < COOLDOWN_MS) {
      if (onDone) onDone();
      return;
    }
    localStorage.setItem(STORAGE_KEY, String(Date.now()));

    const today = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

    const syncs = [
      // Use report scraper for accurate "ngày thành công" revenue
      fetch("/api/nhanh/sync-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: todayStr, to: todayStr }),
      }),
      ...(extraSyncs || []).map((url) =>
        fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ from: todayStr, to: todayStr }),
        }),
      ),
    ];

    Promise.allSettled(syncs).then(() => {
      if (onDone) onDone();
    });
  }, [onDone, extraSyncs]);

  return null;
}
