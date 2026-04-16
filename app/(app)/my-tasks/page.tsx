import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/user";
import { listMyTasks } from "@/lib/db/myTasks";

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<string, { icon: string; label: string }> = {
  order_action: { icon: "📋", label: "Đơn cần xử lý" },
  damage_pending: { icon: "⚠", label: "Hàng hỏng" },
  assignment: { icon: "🎯", label: "Giao việc" },
  deploy_pending: { icon: "🚀", label: "Triển khai" },
  task: { icon: "✅", label: "Task" },
};

export default async function MyTasksPage() {
  const user = await getCurrentUser();
  const items = user ? await listMyTasks(user.email) : [];

  const byKind: Record<string, typeof items> = {};
  for (const it of items) {
    (byKind[it.kind] = byKind[it.kind] || []).push(it);
  }

  return (
    <section className="section">
      <div className="page-hdr">
        <div>
          <div className="page-title">📥 Việc của tôi</div>
          <div className="page-sub">
            {items.length} việc cần xử lý · {user?.name || user?.email}
          </div>
        </div>
      </div>

      {items.length === 0 && (
        <div className="card" style={{ padding: 32, textAlign: "center", color: "var(--muted)" }}>
          🎉 Không có việc nào chờ xử lý.
        </div>
      )}

      {Object.entries(byKind).map(([kind, list]) => {
        const meta = KIND_LABEL[kind] || { icon: "•", label: kind };
        return (
          <div className="card" key={kind} style={{ marginBottom: 12, padding: 0 }}>
            <div style={{
              padding: "10px 14px",
              background: "#FAFAFA",
              borderBottom: "1px solid var(--border)",
              fontWeight: 700,
              fontSize: 13,
            }}>
              {meta.icon} {meta.label} <span className="muted" style={{ fontWeight: 400 }}>({list.length})</span>
            </div>
            <div>
              {list.map((it, i) => (
                <Link
                  key={i}
                  href={it.href}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "12px 14px",
                    borderBottom: i < list.length - 1 ? "0.5px solid var(--border)" : "none",
                    textDecoration: "none",
                    color: "var(--text)",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {it.title}
                    </div>
                    <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{it.sub}</div>
                  </div>
                  {it.badge && (
                    <span className={`chip ${it.badgeColor || "chip-gray"}`}>{it.badge}</span>
                  )}
                  <span style={{ color: "var(--muted)" }}>›</span>
                </Link>
              ))}
            </div>
          </div>
        );
      })}
    </section>
  );
}
