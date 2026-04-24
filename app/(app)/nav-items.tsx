import { type Permission } from "@/lib/auth/roles";
import { type ReactNode } from "react";

export type NavItem = {
  href: string;
  label: string;
  icon: ReactNode;
  perm?: Permission;
};
export type NavSection = { title: string; items: NavItem[] };

const i = (e: string) => <span style={{ fontSize: 13, width: 18, textAlign: "center", display: "inline-block", lineHeight: 1 }}>{e}</span>;

export const NAV_SECTIONS: NavSection[] = [
  {
    title: "MUA HÀNG",
    items: [
      { href: "/list",         label: "Đơn hàng",          icon: i("☰"), perm: "list_order" },
      { href: "/rd",           label: "R&D",              icon: i("◉"), perm: "create_order" },
      { href: "/damage-mgmt",  label: "Hàng hỏng",        icon: i("△"), perm: "damage_mgmt" },
    ],
  },
  {
    title: "KỸ THUẬT",
    items: [
      { href: "/tech",    label: "QC & Lên kệ",     icon: i("✓"), perm: "qc" },
      { href: "/returns", label: "Hoàn & Thanh Lý", icon: i("↩"), perm: "qc" },
    ],
  },
  {
    title: "KINH DOANH",
    items: [
      { href: "/biz-orders",    label: "Order nhập",       icon: i("✦"), perm: "deploy" },
      { href: "/deploy",        label: "Thông tin SP",     icon: i("⊞"), perm: "deploy" },
      { href: "/sales-leader",  label: "TikTok",           icon: i("♪"), perm: "deploy" },
      { href: "/fb-pages",      label: "Facebook",         icon: i("f"), perm: "fb_pages" },
      { href: "/shopee-ads",    label: "Shopee",           icon: i("S"), perm: "fb_pages" },
      { href: "/web-app",       label: "Web/App B2B",      icon: i("◎"), perm: "deploy" },
      { href: "/launch-plan",   label: "Launch SP",        icon: i("▶"), perm: "deploy" },
      { href: "/inventory",     label: "Tồn kho",          icon: i("▣"), perm: "inventory" },
    ],
  },
  {
    title: "CÁ NHÂN",
    items: [
      { href: "/tasks",    label: "Giao việc",     icon: i("⊕") },
      { href: "/my-tasks", label: "Việc của tôi",  icon: i("☐") },
      { href: "/dash",     label: "Dashboard",     icon: i("⊟"), perm: "dashboard" },
    ],
  },
  {
    title: "KHÁCH HÀNG",
    items: [
      { href: "/customers", label: "Khách hàng", icon: i("⊙") },
      { href: "/cskh",      label: "CSKH",       icon: i("◇") },
    ],
  },
  {
    title: "QUẢN TRỊ",
    items: [
      { href: "/finance",         label: "Kế toán",      icon: i("$"), perm: "finance" },
      { href: "/admin-users",     label: "Người dùng",   icon: i("⊙"), perm: "admin_users" },
      { href: "/admin-settings",  label: "Cấu hình",     icon: i("⊛"), perm: "admin_settings" },
    ],
  },
];
