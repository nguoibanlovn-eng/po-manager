import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/user";
import { getNhanhBill, listNhanhBills } from "@/lib/nhanh/bills";

export async function GET(req: Request) {
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  try {
    if (id) {
      const bill = await getNhanhBill(id);
      if (!bill) return NextResponse.json({ ok: false, error: "Không tìm thấy bill " + id });
      return NextResponse.json({ ok: true, bill });
    }
    const bills = await listNhanhBills();
    return NextResponse.json({ ok: true, bills });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
