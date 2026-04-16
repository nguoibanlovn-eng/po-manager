import { NextResponse } from "next/server";
import { requestOtp } from "@/lib/auth/otp";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const email = String(body?.email || "");
    const res = await requestOtp(email);
    return NextResponse.json(res);
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
