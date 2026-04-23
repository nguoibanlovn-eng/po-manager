"use client";

import { useEffect, useRef, useState } from "react";

const VAPID_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

async function subscribePush() {
  const reg = await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  if (existing) {
    await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(existing.toJSON()),
    });
    return true;
  }

  const perm = await Notification.requestPermission();
  if (perm !== "granted") return false;

  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_KEY),
  });

  await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sub.toJSON()),
  });
  return true;
}

export default function PushSubscribe() {
  const [status, setStatus] = useState<"loading" | "prompt" | "subscribed" | "denied" | "unsupported">("loading");
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const hasSW = "serviceWorker" in navigator;
    const hasPush = "PushManager" in window;
    const hasNoti = "Notification" in window;
    console.log("[Push]", { VAPID_KEY: !!VAPID_KEY, hasSW, hasPush, hasNoti });

    if (!VAPID_KEY || !hasSW) {
      console.log("[Push] unsupported: no VAPID or SW");
      setStatus("unsupported");
      return;
    }
    if (!hasPush && !hasNoti) {
      console.log("[Push] unsupported: no PushManager or Notification");
      setStatus("unsupported");
      return;
    }

    if (hasNoti && Notification.permission === "granted") {
      subscribePush().then(() => setStatus("subscribed")).catch((e) => { console.log("[Push] sub err:", e); setStatus("prompt"); });
    } else if (hasNoti && Notification.permission === "denied") {
      setStatus("denied");
    } else {
      setStatus("prompt");
      console.log("[Push] showing prompt banner");
    }
  }, []);

  if (status === "subscribed" || status === "unsupported" || status === "loading") return null;

  if (status === "denied") return null; // Can't do anything

  // Show banner prompting user to enable notifications
  return (
    <div style={{
      position: "fixed", bottom: 70, left: 10, right: 10, zIndex: 180,
      background: "#1F2937", color: "#fff", borderRadius: 12,
      padding: "10px 14px", display: "flex", alignItems: "center", gap: 10,
      boxShadow: "0 4px 20px rgba(0,0,0,.3)",
      animation: "slideUp .3s ease",
    }}>
      <span style={{ fontSize: 24 }}>🔔</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>Bật thông báo</div>
        <div style={{ fontSize: 10, opacity: .7 }}>Nhận cập nhật doanh thu, đơn hàng realtime</div>
      </div>
      <button
        onClick={async () => {
          try {
            const ok = await subscribePush();
            setStatus(ok ? "subscribed" : "denied");
          } catch { setStatus("denied"); }
        }}
        style={{
          background: "#3B82F6", color: "#fff", border: "none", borderRadius: 8,
          padding: "8px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        Bật ngay
      </button>
      <button onClick={() => setStatus("subscribed")}
        style={{ background: "none", border: "none", color: "#6B7280", fontSize: 18, cursor: "pointer", padding: 4 }}>✕</button>
      <style>{`@keyframes slideUp { from { transform: translateY(100px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`}</style>
    </div>
  );
}
