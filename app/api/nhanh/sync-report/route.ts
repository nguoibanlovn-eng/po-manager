import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/user";
import { syncNhanhReport } from "@/lib/nhanh/report-scraper";

export const maxDuration = 300;

export async function POST(req: Request) {
  // Allow cron token OR admin session
  const auth = req.headers.get("authorization") || "";
  const cronOk = process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`;
  if (!cronOk) {
    const u = await getCurrentUser();
    if (!u || u.role !== "ADMIN") {
      return NextResponse.json({ ok: false, error: "Admin only" }, { status: 403 });
    }
  }
  try {
    const body = await req.json().catch(() => ({}));
    const r = await syncNhanhReport({ from: body.from, to: body.to });
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
