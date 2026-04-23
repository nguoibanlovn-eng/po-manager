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
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window !== "undefined") return localStorage.getItem("sb-col") === "1";
    return false;
  });
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
          onClick={() => setCollapsed((c) => { const v = !c; localStorage.setItem("sb-col", v ? "1" : "0"); return v; })}
          aria-label="Toggle sidebar"
        >
          ☰
        </button>
        <Link href="/dash" className="logo" style={{ cursor: "pointer", textDecoration: "none", display: "flex", alignItems: "center" }}>
          <img src="/logo-lovu.jpg" alt="Lỗ Vũ" style={{ height: 28, width: "auto", borderRadius: 4 }} />
        </Link>
        <div id="search-wrap">
          <span className="si">🔍</span>
          <input type="text" placeholder="Tìm đơn, sản phẩm, NCC..." />
        </div>
        <div className="spacer" />
        <div id="pill" className="ok">✓ Sẵn sàng</div>
        <div id="user-badge">
          <span id="user-name">{user.name || user.email}</span>
          <span id="user-role-badge" className={`role-badge role-${user.role}`}>{roleLabel}</span>
        </div>
        <button onClick={logout} title="Đăng xuất"
          style={{ background: "none", border: "1px solid #E5E7EB", borderRadius: 6, padding: "4px 10px", fontSize: 11, color: "#6B7280", cursor: "pointer", marginLeft: 6 }}>
          Đăng xuất
        </button>
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
                <div className="nav-section">{section.title}</div>
                {visible.map((it) => (
                  <div key={it.href} className="nav-tip-wrap" data-tip={it.label}>
                    <Link
                      href={it.href}
                      className={
                        "nav-item" + (pathname === it.href ? " active" : "")
                      }
                    >
                      {it.icon}
                      <span className="nav-label">{it.label}</span>
                    </Link>
                  </div>
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
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  // Clear pending when page actually loads
  useEffect(() => { setPending(null); }, [pathname]);

  const mainRole = user.role;

  // 5 main tabs matching mockup: Ngày, Tháng, Năm, Tồn kho, Menu
  const tabs = [
    { href: "/dash?view=day", label: "Ngày", icon: "📊", match: (p: string) => p === "/dash" },
    { href: "/dash?view=month", label: "Tháng", icon: "📅", match: (p: string) => false },
    { href: "/dash?view=year", label: "Năm", icon: "📈", match: (p: string) => false },
    { href: "/inventory", label: "Tồn kho", icon: "📦", match: (p: string) => p === "/inventory" },
  ];

  const drawerSections = [
    {
      title: "KINH DOANH",
      items: [
        { href: "/fb-pages", label: "Facebook", icon: "🔵" },
        { href: "/sales-leader", label: "TikTok", icon: "⚫" },
        { href: "/shopee-ads", label: "Shopee", icon: "🟠" },
        { href: "/web-app", label: "Web/App B2B", icon: "🟣" },
        { href: "/product-info", label: "Thông tin SP", icon: "📱" },
        { href: "/deploy", label: "Launch SP", icon: "🚀" },
      ],
    },
    {
      title: "MUA HÀNG",
      items: [
        { href: "/create", label: "Tạo đơn", icon: "✏️" },
        { href: "/list", label: "Danh sách đơn", icon: "📋" },
        { href: "/rd", label: "R&D", icon: "🔬" },
        { href: "/damage-mgmt", label: "Hàng hỏng", icon: "⚠️" },
      ],
    },
    {
      title: "KỸ THUẬT",
      items: [
        { href: "/tech", label: "QC & Lên kệ", icon: "✅" },
        { href: "/returns", label: "Hoàn & Thanh lý", icon: "↩️" },
      ],
    },
    {
      title: "KHÁCH HÀNG",
      items: [
        { href: "/customers", label: "Khách hàng", icon: "👥" },
        { href: "/cskh", label: "CSKH", icon: "💬" },
      ],
    },
    {
      title: "QUẢN TRỊ",
      items: [
        { href: "/finance", label: "Kế toán", icon: "💰" },
        { href: "/tasks", label: "Giao việc", icon: "📋" },
        { href: "/my-tasks", label: "Việc của tôi", icon: "📝" },
        ...(mainRole === "ADMIN" ? [
          { href: "/admin-users", label: "Người dùng", icon: "👤" },
          { href: "/admin-settings", label: "Cấu hình", icon: "⚙️" },
        ] : []),
      ],
    },
  ];

  const isTabActive = (tab: typeof tabs[0]) => {
    if (tab.href.includes("?")) {
      const [path, qs] = tab.href.split("?");
      const params = new URLSearchParams(qs);
      // For dash tabs, check pathname + search params from window
      if (pathname === path || pathname === "/dash") {
        if (typeof window !== "undefined") {
          const currentParams = new URLSearchParams(window.location.search);
          return currentParams.get("view") === params.get("view")
            || (!currentParams.get("view") && params.get("view") === "day");
        }
      }
      return false;
    }
    return pathname === tab.href || tab.match(pathname);
  };

  return (
    <>
      <div id="bottom-nav">
        {tabs.map((t) => {
          const active = isTabActive(t);
          const isPending = pending === t.href;
          return (
            <button
              key={t.href}
              className={"bn-item" + (active ? " active" : "")}
              onClick={() => {
                if (active) return;
                setPending(t.href);
                router.push(t.href);
              }}
              style={{ cursor: "pointer", opacity: isPending ? .5 : 1 }}
            >
              {isPending
                ? <span style={{ fontSize: 14, lineHeight: 1 }}>⏳</span>
                : <span style={{ fontSize: 18, lineHeight: 1 }}>{t.icon}</span>}
              <span style={{ fontSize: 9, fontWeight: 600 }}>{t.label}</span>
            </button>
          );
        })}
        <button
          className={"bn-item" + (drawerOpen ? " active" : "")}
          onClick={() => setDrawerOpen(true)}
          style={{ cursor: "pointer" }}
        >
          <span style={{ fontSize: 18, lineHeight: 1 }}>☰</span>
          <span style={{ fontSize: 9, fontWeight: 600 }}>Menu</span>
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
              maxHeight: "80vh",
              overflowY: "auto",
              padding: "16px 16px calc(20px + env(safe-area-inset-bottom, 0px))",
            }}
          >
            <div style={{ width: 40, height: 4, background: "#E4E4E7", borderRadius: 2, margin: "0 auto 12px" }} />
            {drawerSections.map((sec) => (
              <div key={sec.title} style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 6, paddingLeft: 4 }}>{sec.title}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  {sec.items
                    .filter((it) => {
                      const navItem = NAV_SECTIONS.flatMap((s) => s.items).find((n) => n.href === it.href);
                      return !navItem?.perm || hasPermission(user, navItem.perm);
                    })
                    .map((it) => (
                      <Link
                        key={it.href}
                        href={it.href}
                        onClick={() => setDrawerOpen(false)}
                        style={{
                          display: "flex", alignItems: "center", gap: 10,
                          padding: "10px 12px", borderRadius: 10,
                          textDecoration: "none", color: "#18181B",
                          background: pathname === it.href ? "#F1F5F9" : "transparent",
                        }}
                      >
                        <span style={{ fontSize: 16 }}>{it.icon}</span>
                        <span style={{ fontSize: 13, fontWeight: pathname === it.href ? 700 : 500 }}>{it.label}</span>
                        {pathname === it.href && <span style={{ marginLeft: "auto", width: 6, height: 6, borderRadius: "50%", background: "#3B82F6" }} />}
                      </Link>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
