"use client";

import { useEffect, useRef } from "react";

/** Auto-sync on mount. Runs once, non-blocking.
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

    const today = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

    const syncs = [
      fetch("/api/nhanh/sync-sales", {
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
