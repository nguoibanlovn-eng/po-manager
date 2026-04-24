"use client";

import type { AppUser } from "@/lib/auth/user";
import type { UserRef } from "@/lib/db/users";

export default function BizOrdersView({
  user, orders, users,
}: {
  user: AppUser; orders: unknown[]; users: UserRef[];
}) {
  return (
    <div style={{ padding: 24 }}>
      <h2>Đơn hàng kinh doanh</h2>
      <p className="muted">Đang phát triển...</p>
    </div>
  );
}
