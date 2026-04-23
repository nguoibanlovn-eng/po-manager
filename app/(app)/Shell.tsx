"use client";

import Link from "next/link";
import PushSubscribe from "./components/PushSubscribe";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
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
      <PushSubscribe />
      <MobileBottomNav user={user} />
    </>
  );
}

function MobileBottomNav({ user }: { user: AppUser }) {
  const pathname = usePathname();
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const searchParams = useSearchParams();
  const [pending, setPending] = useState<string | null>(null);
  useEffect(() => { setPending(null); }, [pathname, searchParams]);

  // Show full-screen loading overlay when navigating between dash tabs
  const showLoading = pending !== null;

  const mainRole = user.role;

  // 5 main tabs: Ngày, Tháng, Năm, Tồn kho, Menu — flat SVG icons
  const tabIcons: Record<string, React.ReactNode> = {
    day: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/></svg>,
    month: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><rect x="7" y="13" width="10" height="6" rx="1"/></svg>,
    year: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
    inventory: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>,
    menu: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>,
  };
  const tabs = [
    { href: "/dash?view=day", label: "Ngày", iconKey: "day", match: (p: string) => p === "/dash" },
    { href: "/dash?view=month", label: "Tháng", iconKey: "month", match: (p: string) => false },
    { href: "/dash?view=year", label: "Năm", iconKey: "year", match: (p: string) => false },
    { href: "/inventory", label: "Tồn kho", iconKey: "inventory", match: (p: string) => p === "/inventory" },
  ];

  // Flat dot icon helper
  const dot = (color: string) => `color:${color}`;
  const drawerSections = [
    {
      title: "KINH DOANH",
      items: [
        { href: "/fb-pages", label: "Facebook", dot: "#1877F2" },
        { href: "/sales-leader", label: "TikTok", dot: "#18181B" },
        { href: "/shopee-ads", label: "Shopee", dot: "#EE4D2D" },
        { href: "/web-app", label: "Web/App B2B", dot: "#6366F1" },
        { href: "/product-info", label: "Thông tin SP", dot: "#3B82F6" },
        { href: "/deploy", label: "Launch SP", dot: "#16A34A" },
      ],
    },
    {
      title: "MUA HÀNG",
      items: [
        { href: "/create", label: "Tạo đơn", dot: "#7C3AED" },
        { href: "/list", label: "Danh sách đơn", dot: "#64748B" },
        { href: "/rd", label: "R&D", dot: "#D97706" },
        { href: "/damage-mgmt", label: "Hàng hỏng", dot: "#DC2626" },
      ],
    },
    {
      title: "KỸ THUẬT",
      items: [
        { href: "/tech", label: "QC & Lên kệ", dot: "#16A34A" },
        { href: "/returns", label: "Hoàn & Thanh lý", dot: "#9CA3AF" },
      ],
    },
    {
      title: "KHÁCH HÀNG",
      items: [
        { href: "/customers", label: "Khách hàng", dot: "#0EA5E9" },
        { href: "/cskh", label: "CSKH", dot: "#8B5CF6" },
      ],
    },
    {
      title: "QUẢN TRỊ",
      items: [
        { href: "/finance", label: "Kế toán", dot: "#16A34A" },
        { href: "/tasks", label: "Giao việc", dot: "#3B82F6" },
        { href: "/my-tasks", label: "Việc của tôi", dot: "#D97706" },
        ...(mainRole === "ADMIN" ? [
          { href: "/admin-users", label: "Người dùng", dot: "#64748B" },
          { href: "/admin-settings", label: "Cấu hình", dot: "#9CA3AF" },
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
      {/* Loading overlay — shows immediately when switching dash tabs */}
      {showLoading && (
        <div style={{ position: "fixed", inset: 0, zIndex: 250, background: "#F8FAFC", display: "flex", flexDirection: "column" }}>
          <div style={{ background: "linear-gradient(135deg,#1E3A5F,#0F172A)", padding: "14px 14px 16px", color: "#fff" }}>
            <div style={{ fontSize: 17, fontWeight: 800 }}>Dashboard</div>
            <div style={{ fontSize: 11, opacity: .6 }}>Đang tải...</div>
          </div>
          <div style={{ padding: 12, flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
            {[140, 80, 100, 100, 100].map((h, i) => (
              <div key={i} style={{ height: h, borderRadius: i === 0 ? 14 : 12, background: "linear-gradient(90deg,#E2E8F0 25%,#F1F5F9 50%,#E2E8F0 75%)", backgroundSize: "200% 100%", animation: "shimmer 1.5s infinite" }} />
            ))}
          </div>
          <style>{`@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>
        </div>
      )}

      <div id="bottom-nav">
        {tabs.map((t) => {
          const active = isTabActive(t);
          const isPending = pending === t.href;
          return (
            <Link
              key={t.href}
              href={t.href}
              onClick={() => { if (!active) setPending(t.href); }}
              className={"bn-item" + (active ? " active" : "") + (isPending ? " pending" : "")}
              style={{ textDecoration: "none" }}
            >
              {tabIcons[t.iconKey]}
              <span style={{ fontSize: 9, fontWeight: 600 }}>{t.label}</span>
            </Link>
          );
        })}
        <button
          className={"bn-item" + (drawerOpen ? " active" : "")}
          onClick={() => setDrawerOpen(true)}
          style={{ cursor: "pointer" }}
        >
          {tabIcons.menu}
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
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: it.dot, flexShrink: 0 }} />
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
