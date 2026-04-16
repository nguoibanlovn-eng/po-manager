"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { type AppUser } from "@/lib/auth/user";
import { hasPermission, ROLES, type RoleCode } from "@/lib/auth/roles";
import { NAV_SECTIONS } from "./nav-items";

export default function Shell({
  user,
  children,
}: {
  user: AppUser;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [mobile, setMobile] = useState(false);

  useEffect(() => {
    const check = () => setMobile(window.innerWidth <= 900);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    const cls = document.body.classList;
    if (mobile) cls.add("mobile"); else cls.remove("mobile");
    if (collapsed && !mobile) cls.add("sb-col"); else cls.remove("sb-col");
  }, [mobile, collapsed]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  const roleLabel =
    user.role === "VIEWER" ? "Viewer" : ROLES[user.role as Exclude<RoleCode, "VIEWER">]?.label || user.role;

  return (
    <>
      {/* TOPBAR */}
      <div id="topbar" style={{ display: "flex" }}>
        <button
          id="sidebar-toggle"
          className="btn-ghost"
          style={{ width: 30, height: 30, padding: 0, borderRadius: 6 }}
          onClick={() => setCollapsed((c) => !c)}
          aria-label="Toggle sidebar"
        >
          ☰
        </button>
        <Link href="/list" className="logo" style={{ cursor: "pointer", textDecoration: "none" }}>
          <em>Lỗ Vũ</em> PO
        </Link>
        <div id="search-wrap">
          <span className="si">🔍</span>
          <input type="text" placeholder="Tìm đơn, sản phẩm, NCC..." />
        </div>
        <div className="spacer" />
        <div id="pill" className="ok">✓ Sẵn sàng</div>
        <div id="user-badge" onClick={logout} title="Đăng xuất">
          <span id="user-name">{user.name || user.email}</span>
          <span id="user-role-badge" className={`role-badge role-${user.role}`}>{roleLabel}</span>
        </div>
      </div>

      {/* LAYOUT */}
      <div id="layout" style={{ display: "flex" }}>
        <nav id="sidebar">
          {NAV_SECTIONS.map((section) => {
            const visible = section.items.filter((it) =>
              it.perm ? hasPermission(user, it.perm) : true,
            );
            if (!visible.length) return null;
            return (
              <div key={section.title}>
                <div className="nav-section" style={{ display: "block" }}>{section.title}</div>
                {visible.map((it) => (
                  <Link
                    key={it.href}
                    href={it.href}
                    className={
                      "nav-item" + (pathname === it.href ? " active" : "")
                    }
                  >
                    {it.icon}
                    <span className="nav-label">{it.label}</span>
                  </Link>
                ))}
              </div>
            );
          })}
          <div id="sidebar-footer">PO v7 · {user.email}</div>
        </nav>

        <main id="main">{children}</main>
      </div>

      {/* Mobile bottom nav */}
      <MobileBottomNav user={user} />
    </>
  );
}

function MobileBottomNav({ user }: { user: AppUser }) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const mainRole = user.role;
  // 4 chính + 1 hamburger (More)
  const quick = [
    { href: "/list", label: "Đơn", svg: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="9" y1="9" x2="15" y2="9" /><line x1="9" y1="13" x2="15" y2="13" /><line x1="9" y1="17" x2="12" y2="17" /></svg> },
    { href: "/rd", label: "R&D", svg: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21a7 7 0 1 1 0-14 7 7 0 0 1 0 14z"/><path d="M12 8v4l2 2"/></svg> },
    { href: "/tech", label: "QC", svg: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg> },
  ];

  const drawerItems = [
    { href: "/dash", label: "Dashboard" },
    { href: "/inventory", label: "Tồn kho" },
    { href: "/customers", label: "Khách hàng" },
    { href: "/deploy", label: "Triển khai" },
    { href: "/fb-pages", label: "Facebook" },
    { href: "/sales-leader", label: "TikTok" },
    { href: "/shopee-ads", label: "Shopee" },
    { href: "/finance", label: "Kế toán" },
    { href: "/tasks", label: "Giao việc" },
    { href: "/my-tasks", label: "Việc của tôi" },
    { href: "/returns", label: "Hoàn/Thanh lý" },
    { href: "/damage-mgmt", label: "Hàng hỏng" },
    ...(mainRole === "ADMIN" ? [{ href: "/admin-settings", label: "Cấu hình" }, { href: "/admin-users", label: "Users" }] : []),
  ];

  return (
    <>
      <div id="bottom-nav">
        {quick.map((q) => (
          <Link
            key={q.href}
            href={q.href}
            className={"bn-item" + (pathname === q.href ? " active" : "")}
            style={{ textDecoration: "none" }}
          >
            {q.svg}
            <span style={{ fontSize: 11 }}>{q.label}</span>
          </Link>
        ))}
        <Link href="/create" className="bn-item bn-create" style={{ textDecoration: "none" }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </Link>
        <button
          className="bn-item"
          onClick={() => setDrawerOpen(true)}
          style={{ cursor: "pointer" }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="18" x2="21" y2="18" /></svg>
          <span style={{ fontSize: 11 }}>Khác</span>
        </button>
      </div>

      {drawerOpen && (
        <>
          <div
            onClick={() => setDrawerOpen(false)}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", zIndex: 300 }}
          />
          <div
            id="bn-drawer"
            className="open"
            style={{
              position: "fixed",
              bottom: 0, left: 0, right: 0,
              background: "#fff",
              borderRadius: "20px 20px 0 0",
              zIndex: 301,
              maxHeight: "75vh",
              overflowY: "auto",
              padding: "20px 16px calc(20px + env(safe-area-inset-bottom, 0px))",
            }}
          >
            <div style={{ width: 40, height: 4, background: "#E4E4E7", borderRadius: 2, margin: "0 auto 16px" }} />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
              {drawerItems
                .filter((it) => {
                  const navItem = NAV_SECTIONS.flatMap((s) => s.items).find((n) => n.href === it.href);
                  return !navItem?.perm || hasPermission(user, navItem.perm);
                })
                .map((it) => (
                  <Link
                    key={it.href}
                    href={it.href}
                    onClick={() => setDrawerOpen(false)}
                    className="bn-drawer-item"
                    style={{ textDecoration: "none" }}
                  >
                    <span style={{ fontSize: 14 }}>{it.label}</span>
                  </Link>
                ))}
            </div>
          </div>
        </>
      )}
    </>
  );
}
