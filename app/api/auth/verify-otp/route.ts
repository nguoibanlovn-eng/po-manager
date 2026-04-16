import { NextResponse } from "next/server";
import { verifyOtp } from "@/lib/auth/otp";
import { createSession } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const email = String(body?.email || "").trim().toLowerCase();
    const code = String(body?.code || "");

    const v = await verifyOtp(email, code);
    if (!v.ok) return NextResponse.json(v);

    // Re-check user still active
    const { data: user } = await supabaseAdmin()
      .from("users")
      .select("email, name, role, is_active")
      .eq("email", email)
      .maybeSingle();
    if (!user || user.is_active === false) {
      return NextResponse.json({ ok: false, error: "Tài khoản không khả dụng." });
    }

    const ua = req.headers.get("user-agent");
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      null;

    await createSession(email, ua, ip);
    return NextResponse.json({
      ok: true,
      user: { email: user.email, name: user.name, role: user.role },
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
