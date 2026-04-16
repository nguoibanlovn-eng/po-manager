"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { formatDate } from "@/lib/format";
import type { TaskRow } from "@/lib/db/tasks";
import type { UserRef } from "@/lib/db/users";
import { createTaskAction, deleteTaskAction, markDoneAction, updateTaskAction } from "./actions";

const STATUS_LABEL: Record<string, string> = {
  OPEN: "Mở", IN_PROGRESS: "Đang làm", DONE: "Xong", CANCELLED: "Huỷ",
};
const PRIORITY_LABEL: Record<string, { label: string; color: string }> = {
  LOW: { label: "Thấp", color: "chip-gray" },
  MEDIUM: { label: "TB", color: "chip-blue" },
  HIGH: { label: "Cao", color: "chip-amber" },
  URGENT: { label: "Khẩn", color: "chip-red" },
};

export default function TasksView({
  tasks,
  users,
  filter,
  currentUser,
}: {
  tasks: TaskRow[];
  users: UserRef[];
  filter: "all" | "mine" | "assigned_by_me";
  currentUser: { email: string; name: string } | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [showCreate, setShowCreate] = useState(false);

  const grouped = useMemo(() => {
    const byStatus: Record<string, TaskRow[]> = { OPEN: [], IN_PROGRESS: [], DONE: [], CANCELLED: [] };
    for (const t of tasks) {
      const k = t.status || "OPEN";
      (byStatus[k] = byStatus[k] || []).push(t);
    }
    return byStatus;
  }, [tasks]);

  return (
    <section className="section">
      <div className="page-hdr">
        <div>
          <div className="page-title">✅ Giao việc</div>
          <div className="page-sub">{tasks.length} tasks · đăng nhập: {currentUser?.email}</div>
        </div>
        <div className="row" style={{ gap: 6 }}>
          <Link href="/tasks" className={"btn btn-sm " + (filter === "all" ? "btn-primary" : "btn-ghost")} style={{ textDecoration: "none" }}>Tất cả</Link>
          <Link href="/tasks?filter=mine" className={"btn btn-sm " + (filter === "mine" ? "btn-primary" : "btn-ghost")} style={{ textDecoration: "none" }}>Của tôi</Link>
          <Link href="/tasks?filter=assigned_by_me" className={"btn btn-sm " + (filter === "assigned_by_me" ? "btn-primary" : "btn-ghost")} style={{ textDecoration: "none" }}>Tôi giao</Link>
          <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>+ Task mới</button>
        </div>
      </div>

      {showCreate && (
        <CreateForm
          users={users}
          onClose={() => setShowCreate(false)}
          onSaved={() => { setShowCreate(false); router.refresh(); }}
          disabled={pending}
          startTransition={startTransition}
        />
      )}

      {/* Kanban-style columns */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
        {(["OPEN", "IN_PROGRESS", "DONE"] as const).map((status) => (
          <div key={status} className="card" style={{ padding: 0 }}>
            <div style={{
              padding: "10px 14px",
              borderBottom: "1px solid var(--border)",
              fontWeight: 700,
              display: "flex",
              justifyContent: "space-between",
            }}>
              <span>{STATUS_LABEL[status]}</span>
              <span className="muted">{grouped[status].length}</span>
            </div>
            <div style={{ padding: 10, display: "flex", flexDirection: "column", gap: 8, minHeight: 200 }}>
              {grouped[status].map((t) => (
                <TaskCard
                  key={t.task_id}
                  task={t}
                  users={users}
                  disabled={pending}
                  startTransition={startTransition}
                  refresh={() => router.refresh()}
                />
              ))}
              {grouped[status].length === 0 && (
                <div className="muted" style={{ textAlign: "center", padding: 14, fontSize: 12 }}>—</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function TaskCard({
  task,
  users,
  disabled,
  startTransition,
  refresh,
}: {
  task: TaskRow;
  users: UserRef[];
  disabled: boolean;
  startTransition: ReturnType<typeof useTransition>[1];
  refresh: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const priority = task.priority ? PRIORITY_LABEL[task.priority] : null;

  const daysToDeadline = task.deadline
    ? Math.floor((new Date(task.deadline).getTime() - Date.now()) / 86400_000)
    : null;

  function done() {
    startTransition(async () => {
      await markDoneAction(task.task_id);
      refresh();
    });
  }

  function reassign(email: string) {
    const user = users.find((u) => u.email === email);
    startTransition(async () => {
      await updateTaskAction(task.task_id, {
        assignee_email: email || null,
        assignee_name: user?.name || null,
      });
      refresh();
    });
  }

  function del() {
    if (!confirm("Xoá task này?")) return;
    startTransition(async () => {
      const r = await deleteTaskAction(task.task_id);
      if (!r.ok) alert(r.error);
      else refresh();
    });
  }

  return (
    <div className="item-card" style={{ padding: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
        <div style={{ fontWeight: 700, fontSize: 13, flex: 1, minWidth: 0 }}>{task.title}</div>
        {priority && <span className={`chip ${priority.color}`}>{priority.label}</span>}
      </div>
      {task.description && (
        <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{task.description}</div>
      )}
      <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap", alignItems: "center" }}>
        <span className="muted" style={{ fontSize: 11 }}>
          👤 {task.assignee_name || task.assignee_email || "Chưa giao"}
        </span>
        {task.deadline && (
          <span style={{
            fontSize: 11,
            color: daysToDeadline !== null && daysToDeadline < 0 ? "var(--red)" : daysToDeadline !== null && daysToDeadline <= 1 ? "var(--amber)" : "var(--muted)",
          }}>
            ⏱ {formatDate(task.deadline)}
            {daysToDeadline !== null && ` (${daysToDeadline < 0 ? `quá ${-daysToDeadline}d` : `còn ${daysToDeadline}d`})`}
          </span>
        )}
      </div>
      <div className="row" style={{ gap: 4, marginTop: 8 }}>
        {task.status !== "DONE" && (
          <button className="btn btn-success btn-xs" onClick={done} disabled={disabled}>✓ Xong</button>
        )}
        <button className="btn btn-ghost btn-xs" onClick={() => setEditing(!editing)}>✏️</button>
        <button className="btn btn-ghost btn-xs" style={{ color: "var(--red)", marginLeft: "auto" }} onClick={del} disabled={disabled}>🗑</button>
      </div>
      {editing && (
        <div style={{ marginTop: 10, padding: 8, background: "#FAFAFA", borderRadius: 6 }}>
          <label style={{ display: "block", marginBottom: 4 }}>Giao cho</label>
          <select
            defaultValue={task.assignee_email || ""}
            onChange={(e) => reassign(e.target.value)}
            disabled={disabled}
          >
            <option value="">-- Chưa giao --</option>
            {users.map((u) => <option key={u.email} value={u.email}>{u.name || u.email}</option>)}
          </select>
        </div>
      )}
    </div>
  );
}

function CreateForm({
  users,
  onClose,
  onSaved,
  disabled,
  startTransition,
}: {
  users: UserRef[];
  onClose: () => void;
  onSaved: () => void;
  disabled: boolean;
  startTransition: ReturnType<typeof useTransition>[1];
}) {
  const [d, setD] = useState({
    title: "",
    description: "",
    assignee_email: "",
    priority: "MEDIUM",
    deadline: "",
    note: "",
  });

  function save() {
    if (!d.title.trim()) return alert("Nhập tiêu đề");
    const user = users.find((u) => u.email === d.assignee_email);
    startTransition(async () => {
      const r = await createTaskAction({
        title: d.title,
        description: d.description || null,
        assignee_email: d.assignee_email || null,
        assignee_name: user?.name || null,
        priority: d.priority,
        deadline: d.deadline || null,
        note: d.note || null,
      });
      if (!r.ok) alert(r.error);
      else onSaved();
    });
  }

  return (
    <div className="card" style={{ marginBottom: 12, border: "1px solid var(--blue)" }}>
      <div style={{ fontWeight: 700, marginBottom: 12 }}>+ Task mới</div>
      <div className="form-group" style={{ marginBottom: 10 }}>
        <label>Tiêu đề *</label>
        <input value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} />
      </div>
      <div className="form-group" style={{ marginBottom: 10 }}>
        <label>Mô tả</label>
        <textarea rows={2} value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} />
      </div>
      <div className="form-grid fg-3" style={{ marginBottom: 10 }}>
        <div className="form-group">
          <label>Giao cho</label>
          <select value={d.assignee_email} onChange={(e) => setD({ ...d, assignee_email: e.target.value })}>
            <option value="">-- Chưa giao --</option>
            {users.map((u) => <option key={u.email} value={u.email}>{u.name || u.email}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Ưu tiên</label>
          <select value={d.priority} onChange={(e) => setD({ ...d, priority: e.target.value })}>
            <option value="LOW">Thấp</option>
            <option value="MEDIUM">TB</option>
            <option value="HIGH">Cao</option>
            <option value="URGENT">Khẩn</option>
          </select>
        </div>
        <div className="form-group">
          <label>Deadline</label>
          <input type="date" value={d.deadline} onChange={(e) => setD({ ...d, deadline: e.target.value })} />
        </div>
      </div>
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>Huỷ</button>
        <button className="btn btn-primary btn-sm" onClick={save} disabled={disabled}>💾 Lưu</button>
      </div>
    </div>
  );
}
