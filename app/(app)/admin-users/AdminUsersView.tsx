"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ROLES, type RoleCode } from "@/lib/auth/roles";
import { formatDate } from "@/lib/format";
import type { AdminUserRow } from "@/lib/db/admin-users";
import { deleteUserAction, saveUserAction, toggleLockAction } from "./actions";

const ROLE_OPTIONS: RoleCode[] = [
  "ADMIN",
  "LEADER_MH", "NV_MH",
  "LEADER_KT", "NV_KT",
  "LEADER_KD", "NV_KD",
  "LEADER_KETOAN", "NV_KETOAN",
  "VIEWER",
];

export default function AdminUsersView({ users }: { users: AdminUserRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<string | "new" | null>(null);

  function startNew() { setEditing("new"); }
  function startEdit(email: string) { setEditing(email); }
  function cancel() { setEditing(null); }

  function toggleLock(email: string, currentlyActive: boolean) {
    if (!confirm(currentlyActive ? `Khoá ${email}?` : `Mở khoá ${email}?`)) return;
    startTransition(async () => {
      await toggleLockAction(email, currentlyActive);
      router.refresh();
    });
  }

  function del(email: string) {
    if (!confirm(`Xoá ${email}? (không khôi phục được)`)) return;
    startTransition(async () => {
      await deleteUserAction(email);
      router.refresh();
    });
  }

  return (
    <section className="section">
      <div className="page-hdr">
        <div>
          <div className="page-title">👤 Quản lý người dùng</div>
          <div className="page-sub">{users.length} users · {users.filter((u) => u.is_active).length} active</div>
        </div>
        <button className="btn btn-primary btn-sm" onClick={startNew}>+ Thêm user</button>
      </div>

      {editing === "new" && (
        <EditForm
          initial={null}
          onCancel={cancel}
          onSaved={() => { cancel(); router.refresh(); }}
          disabled={pending}
          startTransition={startTransition}
        />
      )}

      <div className="card" style={{ padding: 0 }}>
        <div className="tbl-wrap">
          <table>
            <thead><tr>
              <th>Email</th>
              <th>Tên</th>
              <th>Role</th>
              <th>Team</th>
              <th>Channels</th>
              <th>Trạng thái</th>
              <th>Ngày tạo</th>
              <th style={{ width: 160 }}></th>
            </tr></thead>
            <tbody>
              {users.map((u) => (
                <RowUser
                  key={u.email}
                  u={u}
                  editing={editing === u.email}
                  startEdit={() => startEdit(u.email)}
                  cancelEdit={cancel}
                  onSaved={() => { cancel(); router.refresh(); }}
                  onToggleLock={() => toggleLock(u.email, !!u.is_active)}
                  onDelete={() => del(u.email)}
                  disabled={pending}
                  startTransition={startTransition}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function RowUser({
  u, editing, startEdit, cancelEdit, onSaved, onToggleLock, onDelete, disabled, startTransition,
}: {
  u: AdminUserRow;
  editing: boolean;
  startEdit: () => void;
  cancelEdit: () => void;
  onSaved: () => void;
  onToggleLock: () => void;
  onDelete: () => void;
  disabled: boolean;
  startTransition: ReturnType<typeof useTransition>[1];
}) {
  if (editing) {
    return (
      <tr>
        <td colSpan={8}>
          <EditForm
            initial={u}
            onCancel={cancelEdit}
            onSaved={onSaved}
            disabled={disabled}
            startTransition={startTransition}
          />
        </td>
      </tr>
    );
  }
  const roleInfo = u.role && u.role !== "VIEWER" ? ROLES[u.role as Exclude<RoleCode, "VIEWER">] : null;
  return (
    <tr style={{ opacity: u.is_active ? 1 : 0.5 }}>
      <td style={{ fontFamily: "monospace", fontSize: 12 }}>{u.email}</td>
      <td>{u.name || "—"}</td>
      <td>
        <span className={`role-badge role-${u.role}`}>{roleInfo?.label || u.role}</span>
      </td>
      <td className="muted" style={{ fontSize: 12 }}>{u.team || "—"}</td>
      <td className="muted" style={{ fontSize: 11 }}>{u.channels || "—"}</td>
      <td>
        {u.is_active ? (
          <span className="chip chip-green">Active</span>
        ) : (
          <span className="chip chip-red">Locked</span>
        )}
      </td>
      <td className="muted" style={{ fontSize: 11 }}>{formatDate(u.created_at)}</td>
      <td>
        <div className="row" style={{ gap: 4 }}>
          <button className="btn btn-ghost btn-xs" onClick={startEdit}>✏️</button>
          <button className="btn btn-ghost btn-xs" onClick={onToggleLock} disabled={disabled}>
            {u.is_active ? "🔒" : "🔓"}
          </button>
          <button className="btn btn-ghost btn-xs" style={{ color: "var(--red)" }} onClick={onDelete} disabled={disabled}>🗑</button>
        </div>
      </td>
    </tr>
  );
}

function EditForm({
  initial,
  onCancel,
  onSaved,
  disabled,
  startTransition,
}: {
  initial: AdminUserRow | null;
  onCancel: () => void;
  onSaved: () => void;
  disabled: boolean;
  startTransition: ReturnType<typeof useTransition>[1];
}) {
  const [d, setD] = useState({
    email: initial?.email || "",
    name: initial?.name || "",
    role: initial?.role || "VIEWER",
    team: initial?.team || "",
    channels: initial?.channels || "",
    is_active: initial?.is_active !== false,
    note: initial?.note || "",
  });

  function save() {
    if (!d.email.trim()) return alert("Nhập email");
    startTransition(async () => {
      const r = await saveUserAction({
        email: d.email.trim().toLowerCase(),
        name: d.name,
        role: d.role,
        team: d.team || null,
        channels: d.channels || null,
        is_active: d.is_active,
        note: d.note || null,
      });
      if (!r.ok) alert(r.error);
      else onSaved();
    });
  }

  return (
    <div style={{ padding: 14, background: "#FAFAFA", border: "1px solid var(--blue)" }}>
      <div style={{ fontWeight: 700, marginBottom: 10 }}>
        {initial ? `Sửa user: ${initial.email}` : "+ User mới"}
      </div>
      <div className="form-grid fg-3" style={{ marginBottom: 10 }}>
        <div className="form-group">
          <label>Email *</label>
          <input
            value={d.email}
            onChange={(e) => setD({ ...d, email: e.target.value })}
            disabled={!!initial}
          />
        </div>
        <div className="form-group">
          <label>Tên</label>
          <input value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />
        </div>
        <div className="form-group">
          <label>Role</label>
          <select value={d.role} onChange={(e) => setD({ ...d, role: e.target.value })}>
            {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
      </div>
      <div className="form-grid fg-3" style={{ marginBottom: 10 }}>
        <div className="form-group">
          <label>Team</label>
          <input value={d.team} onChange={(e) => setD({ ...d, team: e.target.value })} placeholder="VD: KD – Facebook" />
        </div>
        <div className="form-group">
          <label>Channels (CSV)</label>
          <input value={d.channels} onChange={(e) => setD({ ...d, channels: e.target.value })} placeholder="Facebook,TikTok,Shopee" />
        </div>
        <div className="form-group">
          <label>Trạng thái</label>
          <select value={d.is_active ? "TRUE" : "FALSE"} onChange={(e) => setD({ ...d, is_active: e.target.value === "TRUE" })}>
            <option value="TRUE">Active</option>
            <option value="FALSE">Locked</option>
          </select>
        </div>
      </div>
      <div className="form-group" style={{ marginBottom: 10 }}>
        <label>Note</label>
        <input value={d.note} onChange={(e) => setD({ ...d, note: e.target.value })} />
      </div>
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button className="btn btn-ghost btn-sm" onClick={onCancel}>Huỷ</button>
        <button className="btn btn-primary btn-sm" onClick={save} disabled={disabled}>💾 Lưu</button>
      </div>
    </div>
  );
}
