import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/user";
import { hasPermission } from "@/lib/auth/roles";
import { saveFbToken, getFbTokenStatus } from "@/lib/fb/sync";

export const maxDuration = 30;

export async function POST(req: Request) {
  const u = await requireUser();
  if (!hasPermission(u, "admin_settings")) return NextResponse.json({ ok: false, error: "Không có quyền" }, { status: 403 });
  const { token } = (await req.json()) as { token?: string };
  if (!token) return NextResponse.json({ ok: false, error: "Thiếu token" }, { status: 400 });

  try {
    const result = await saveFbToken(token);
    return NextResponse.json({ ok: true, expiresInDays: result.expiresInDays });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 });
  }
}

export async function GET() {
  const status = await getFbTokenStatus();
  return NextResponse.json(status);
}
