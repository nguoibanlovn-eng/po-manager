import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/user";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const maxDuration = 300;

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ ok: false, error: "Admin only" }, { status: 403 });
  }

  const RESEND_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_KEY) {
    return NextResponse.json({ ok: false, error: "RESEND_API_KEY chưa cài. Thêm vào .env.local" }, { status: 500 });
  }

  const body = await req.json();
  const { subject, htmlContent, segment, testEmail } = body as {
    subject: string;
    htmlContent: string;
    segment: { minOrders?: number; city?: string };
    testEmail?: string;
  };

  if (!subject || !htmlContent) {
    return NextResponse.json({ ok: false, error: "Thiếu subject hoặc nội dung" }, { status: 400 });
  }

  // Test mode: gửi 1 email test
  if (testEmail) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.RESEND_FROM || "Lỗ Vũ <marketing@levu.vn>",
        to: [testEmail],
        subject: `[TEST] ${subject}`,
        html: htmlContent,
      }),
    });
    const result = await res.json();
    if (!res.ok) return NextResponse.json({ ok: false, error: result.message || "Gửi test thất bại" });
    return NextResponse.json({ ok: true, sent: 1, test: true, id: result.id });
  }

  // Production: lấy danh sách email từ segment
  const db = supabaseAdmin();
  let q = db.from("customers").select("email, name").not("email", "is", null).neq("email", "");
  if (segment?.minOrders) q = q.gte("total_orders", segment.minOrders);
  if (segment?.city) q = q.eq("city", segment.city);

  const emails: Array<{ email: string; name: string | null }> = [];
  let off = 0;
  while (true) {
    const { data } = await q.range(off, off + 999);
    if (!data || data.length === 0) break;
    for (const r of data) {
      if (r.email && r.email.includes("@")) emails.push(r);
    }
    if (data.length < 1000) break;
    off += 1000;
  }

  if (emails.length === 0) {
    return NextResponse.json({ ok: false, error: "Không có email nào trong segment này" });
  }

  // Gửi batch (Resend hỗ trợ batch API)
  let sent = 0, errors = 0;
  const BATCH = 100;
  for (let i = 0; i < emails.length; i += BATCH) {
    const chunk = emails.slice(i, i + BATCH);
    const batch = chunk.map((c) => ({
      from: process.env.RESEND_FROM || "Lỗ Vũ <marketing@levu.vn>",
      to: [c.email],
      subject,
      html: htmlContent.replace(/\{\{name\}\}/g, c.name || "Quý khách"),
    }));

    const res = await fetch("https://api.resend.com/emails/batch", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(batch),
    });

    if (res.ok) sent += chunk.length;
    else errors += chunk.length;

    // Rate limit
    if (i + BATCH < emails.length) await new Promise((r) => setTimeout(r, 200));
  }

  // Log campaign
  // Log campaign (ignore error if table doesn't exist)
  try {
    await db.from("email_campaigns").insert({
      subject,
      segment: JSON.stringify(segment),
      total_recipients: emails.length,
      sent,
      errors,
      sent_by: user.email,
      sent_at: new Date().toISOString(),
    });
  } catch { /* table may not exist */ }

  return NextResponse.json({ ok: true, sent, errors, total: emails.length });
}
