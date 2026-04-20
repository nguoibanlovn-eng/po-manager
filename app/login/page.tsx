"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "otp">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<{ text: string; err: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  async function requestOtp() {
    if (!email.trim()) return setMsg({ text: "Nhập email.", err: true });
    setBusy(true); setMsg(null);
    try {
      const r = await fetch("/api/auth/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      }).then((r) => r.json());
      if (!r.ok) setMsg({ text: r.error || "Lỗi gửi OTP.", err: true });
      else { setStep("otp"); setMsg({ text: "Mã OTP đã gửi. Kiểm tra email.", err: false }); }
    } finally { setBusy(false); }
  }

  async function verifyOtp() {
    if (!code.trim()) return setMsg({ text: "Nhập mã OTP.", err: true });
    setBusy(true); setMsg(null);
    try {
      const r = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), code: code.trim() }),
      }).then((r) => r.json());
      if (!r.ok) { setMsg({ text: r.error || "OTP không đúng.", err: true }); return; }
      router.replace("/");
      router.refresh();
    } finally { setBusy(false); }
  }

  return (
    <div id="login-screen">
      <div className="login-card">
        <div className="login-logo" style={{ marginBottom: 8 }}>
          <img src="/logo-lovu.jpg" alt="Lỗ Vũ" style={{ width: 180, height: "auto", borderRadius: 8 }} />
        </div>
        <div className="login-sub">Hệ thống quản lý nhập hàng v7.0</div>
        <div className="login-divider" />

        {step === "email" ? (
          <div className="login-step active" style={{ width: "100%" }}>
            <div className="form-group" style={{ marginBottom: 12 }}>
              <label>Email đăng nhập</label>
              <input
                type="email"
                value={email}
                placeholder="your@email.com"
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && requestOtp()}
                autoFocus
              />
            </div>
            <button
              className="btn btn-primary"
              style={{ width: "100%" }}
              onClick={requestOtp}
              disabled={busy}
            >
              {busy ? "Đang gửi..." : "Gửi mã OTP"}
            </button>
          </div>
        ) : (
          <div className="login-step active" style={{ width: "100%" }}>
            <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 12 }}>
              Nhập mã OTP đã gửi đến email: <b>{email}</b>
            </div>
            <div className="form-group" style={{ marginBottom: 12 }}>
              <label>Mã OTP (6 số)</label>
              <input
                type="text"
                value={code}
                placeholder="123456"
                maxLength={6}
                inputMode="numeric"
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                onKeyDown={(e) => e.key === "Enter" && verifyOtp()}
                autoFocus
              />
            </div>
            <button
              className="btn btn-primary"
              style={{ width: "100%", marginBottom: 8 }}
              onClick={verifyOtp}
              disabled={busy}
            >
              {busy ? "Đang kiểm tra..." : "Đăng nhập"}
            </button>
            <button
              className="btn btn-ghost btn-sm"
              style={{ width: "100%" }}
              onClick={() => { setStep("email"); setCode(""); setMsg(null); }}
              disabled={busy}
            >
              ← Đổi email
            </button>
          </div>
        )}

        {msg && (
          <div
            style={{
              marginTop: 12,
              fontSize: 13,
              color: msg.err ? "var(--red)" : "var(--green)",
            }}
          >
            {msg.text}
          </div>
        )}
      </div>
    </div>
  );
}
