// Ported from gs.txt — ROLE & PERMISSION SYSTEM.

export const DEPARTMENTS = [
  "MUA_HANG",
  "KY_THUAT",
  "KINH_DOANH",
  "KE_TOAN",
] as const;
export type Department = (typeof DEPARTMENTS)[number];

export type RoleCode =
  | "ADMIN"
  | "LEADER_MH"
  | "NV_MH"
  | "LEADER_KT"
  | "NV_KT"
  | "LEADER_KD"
  | "NV_KD"
  | "LEADER_KETOAN"
  | "NV_KETOAN"
  | "VIEWER";

export const ROLES: Record<
  Exclude<RoleCode, "VIEWER">,
  { label: string; dept: Department | null; level: number }
> = {
  ADMIN:         { label: "Admin",           dept: null,          level: 99 },
  LEADER_MH:     { label: "Leader Mua hàng", dept: "MUA_HANG",    level: 2 },
  NV_MH:         { label: "NV Mua hàng",     dept: "MUA_HANG",    level: 1 },
  LEADER_KT:     { label: "Leader Kỹ thuật", dept: "KY_THUAT",    level: 2 },
  NV_KT:         { label: "NV Kỹ thuật",     dept: "KY_THUAT",    level: 1 },
  LEADER_KD:     { label: "Leader KD",       dept: "KINH_DOANH",  level: 2 },
  NV_KD:         { label: "NV Kinh doanh",   dept: "KINH_DOANH",  level: 1 },
  LEADER_KETOAN: { label: "Leader Kế toán",  dept: "KE_TOAN",     level: 2 },
  NV_KETOAN:     { label: "NV Kế toán",      dept: "KE_TOAN",     level: 1 },
};

export type Permission =
  | "create_order" | "edit_order" | "list_order"
  | "qc" | "shelf" | "inventory"
  | "deploy" | "fb_pages"
  | "finance" | "damage_mgmt"
  | "admin_users" | "admin_settings"
  | "dashboard"
  | "approve_order" | "approve_shelf" | "approve_deploy";

export const ROLE_PERMISSIONS: Record<RoleCode, Permission[]> = {
  ADMIN: [
    "create_order", "edit_order", "list_order", "qc", "shelf", "inventory",
    "deploy", "fb_pages", "finance", "damage_mgmt",
    "admin_users", "admin_settings", "dashboard",
  ],
  LEADER_MH:     ["create_order", "edit_order", "list_order", "damage_mgmt", "approve_order"],
  NV_MH:         ["create_order", "list_order", "damage_mgmt"],
  LEADER_KT:     ["qc", "shelf", "inventory", "damage_mgmt", "approve_shelf"],
  NV_KT:         ["qc", "shelf", "inventory", "damage_mgmt"],
  LEADER_KD:     ["deploy", "fb_pages", "list_order", "inventory", "approve_deploy"],
  NV_KD:         ["deploy", "list_order", "fb_pages"],
  LEADER_KETOAN: ["finance", "dashboard", "list_order"],
  NV_KETOAN:     ["finance", "dashboard"],
  VIEWER:        ["dashboard"],
};

export function hasPermission(
  user: { role: string; extra_permissions?: string | null } | null | undefined,
  perm: Permission,
): boolean {
  if (!user) return false;
  const role = user.role as RoleCode;
  const base = ROLE_PERMISSIONS[role] || [];
  if (base.includes(perm)) return true;
  try {
    const extra = JSON.parse(user.extra_permissions || "[]") as Permission[];
    return extra.includes(perm);
  } catch {
    return false;
  }
}

export function isLeader(role: string | null | undefined): boolean {
  if (!role) return false;
  if (role === "ADMIN") return true;
  const r = ROLES[role as Exclude<RoleCode, "VIEWER">];
  return !!r && r.level >= 2;
}
