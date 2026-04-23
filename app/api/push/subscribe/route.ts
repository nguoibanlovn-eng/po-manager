import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/user";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const subscription = await req.json();
  const db = supabaseAdmin();

  await db.from("push_subscriptions").upsert({
    user_id: user.email,
    endpoint: subscription.endpoint,
    keys: subscription.keys,
    user_agent: req.headers.get("user-agent") || "",
    updated_at: new Date().toISOString(),
  }, { onConflict: "endpoint" });

  return NextResponse.json({ ok: true });
}
