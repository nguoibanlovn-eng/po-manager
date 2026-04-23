import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/user";
import { supabaseAdmin } from "@/lib/supabase/admin";
import webpush from "web-push";

webpush.setVapidDetails(
  "mailto:admin@vuabanlo.vn",
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!,
);

export async function POST(req: Request) {
  // Allow cron or admin
  const auth = req.headers.get("authorization") || "";
  const cronOk = process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`;
  if (!cronOk) {
    const user = await getCurrentUser();
    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const { title, body, url } = await req.json();
  if (!title) return NextResponse.json({ error: "title required" }, { status: 400 });

  const db = supabaseAdmin();
  const { data: subs } = await db.from("push_subscriptions").select("endpoint, keys");

  let sent = 0, failed = 0;
  for (const sub of subs || []) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: sub.keys },
        JSON.stringify({ title, body: body || "", url: url || "/dash" }),
      );
      sent++;
    } catch {
      failed++;
      // Remove invalid subscription
      await db.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
    }
  }

  return NextResponse.json({ ok: true, sent, failed });
}
