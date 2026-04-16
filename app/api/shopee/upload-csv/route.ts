import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/user";
import { uploadShopeeCsv } from "@/lib/shopee/csv-upload";

export const maxDuration = 120;

export async function POST(req: Request) {
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    const shopOverride = (form.get("shop") as string | null) || undefined;
    if (!file) return NextResponse.json({ ok: false, error: "Thiếu file" }, { status: 400 });
    const csvText = await file.text();
    const r = await uploadShopeeCsv(csvText, shopOverride);
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
