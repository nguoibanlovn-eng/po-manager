import { createHash } from "crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendMail } from "@/lib/auth/mailer";

const OTP_TTL_MS = 10 * 60_000;   // 10 minutes
const MAX_ATTEMPTS = 5;

function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

function genCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function renderEmail(name: string, code: string): string {
  return `<div style="font-family:sans-serif;max-width:400px">
  <h2 style="color:#2563EB">Mã đăng nhập PO Manager</h2>
  <p>Xin chào <b>${name}</b>,</p>
  <div style="font-size:36px;font-weight:900;letter-spacing:8px;background:#EFF6FF;padding:16px;border-radius:10px;text-align:center;margin:16px 0;border:2px solid #BFDBFE">${code}</div>
  <p style="color:#666">Mã có hiệu lực <b>10 phút</b>.</p>
</div>`;
}

export async function requestOtp(email: string): Promise<{ ok: boolean; error?: string }> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return { ok: false, error: "Thiếu email." };

  const db = supabaseAdmin();
  const { data: user } = await db
    .from("users")
    .select("email, name, is_active")
    .ilike("email", normalized)
    .maybeSingle();
  if (!user) return { ok: false, error: "Email chưa được cấp quyền." };
  if (user.is_active === false) return { ok: false, error: "Tài khoản bị khoá." };

  const code = genCode();
  const expires = new Date(Date.now() + OTP_TTL_MS);

  const { error: upsertErr } = await db
    .from("otp_codes")
    .upsert(
      {
        email: normalized,
        code_hash: hashCode(code),
        expires_at: expires.toISOString(),
        attempts: 0,
      },
      { onConflict: "email" },
    );
  if (upsertErr) return { ok: false, error: upsertErr.message };

  try {
    await sendMail({
      to: normalized,
      subject: "[Lỗ Vũ PO] Mã đăng nhập",
      text: "OTP: " + code,
      html: renderEmail(user.name || normalized, code),
    });
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  return { ok: true };
}

export async function verifyOtp(
  email: string,
  code: string,
): Promise<{ ok: boolean; error?: string }> {
  const normalized = email.trim().toLowerCase();
  if (!normalized || !code) return { ok: false, error: "Thiếu thông tin." };

  const db = supabaseAdmin();
  const { data: row } = await db
    .from("otp_codes")
    .select("code_hash, expires_at, attempts")
    .eq("email", normalized)
    .maybeSingle();
  if (!row) return { ok: false, error: "OTP không tồn tại hoặc đã hết hạn." };
  if (new Date(row.expires_at) < new Date()) {
    await db.from("otp_codes").delete().eq("email", normalized);
    return { ok: false, error: "OTP đã hết hạn." };
  }
  if (row.attempts >= MAX_ATTEMPTS) {
    await db.from("otp_codes").delete().eq("email", normalized);
    return { ok: false, error: "Nhập sai quá nhiều lần, vui lòng xin mã mới." };
  }
  if (hashCode(code.trim()) !== row.code_hash) {
    await db
      .from("otp_codes")
      .update({ attempts: row.attempts + 1 })
      .eq("email", normalized);
    return { ok: false, error: "OTP không đúng." };
  }
  await db.from("otp_codes").delete().eq("email", normalized);
  return { ok: true };
}
