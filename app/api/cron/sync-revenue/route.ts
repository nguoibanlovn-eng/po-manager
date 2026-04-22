import { NextResponse } from "next/server";
import { syncNhanhReport } from "@/lib/nhanh/report-scraper";

export const maxDuration = 300;

// Lightweight cron: only sync Nhanh revenue report (today + yesterday).
// Runs every 2 hours to keep dashboard revenue up-to-date throughout the day.
// The full daily-sync (products, ads, etc.) still runs once at 01:00 VN.
export async function POST(req: Request) {
  const expected = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  if (!expected || auth !== `Bearer ${expected}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  try {
    const r = await syncNhanhReport({});
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return POST(req);
}
