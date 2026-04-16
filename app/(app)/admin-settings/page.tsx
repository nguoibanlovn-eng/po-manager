import { getCurrentUser } from "@/lib/auth/user";
import { redirect } from "next/navigation";
import SyncPanel from "./SyncPanel";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  const u = await getCurrentUser();
  if (!u || u.role !== "ADMIN") redirect("/");

  return (
    <section className="section">
      <div className="page-hdr">
        <div>
          <div className="page-title">⚙️ Cấu hình hệ thống</div>
          <div className="page-sub">Admin-only — Đồng bộ dữ liệu từ Nhanh.vn</div>
        </div>
      </div>

      <SyncPanel />
    </section>
  );
}
