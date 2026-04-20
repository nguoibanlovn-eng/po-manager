import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/user";
import { hasPermission } from "@/lib/auth/roles";
import { listDriveFiles, scanAndImport } from "@/lib/drive/import-nhanh";

export const maxDuration = 300;

// GET = list files in Drive folder
export async function GET() {
  const u = await requireUser();
  if (!hasPermission(u, "admin_settings"))
    return NextResponse.json({ ok: false, error: "Không có quyền" }, { status: 403 });

  try {
    const files = await listDriveFiles();
    return NextResponse.json({ ok: true, files });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}

// POST = import files from Drive
export async function POST(req: Request) {
  const u = await requireUser();
  if (!hasPermission(u, "admin_settings"))
    return NextResponse.json({ ok: false, error: "Không có quyền" }, { status: 403 });

  try {
    const body = await req.json().catch(() => ({}));
    const result = await scanAndImport({ from: body.from, to: body.to });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
