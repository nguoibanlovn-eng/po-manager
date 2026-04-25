"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { formatDate } from "@/lib/format";
import { ROLES, type RoleCode } from "@/lib/auth/roles";
import type { AdminUserRow } from "@/lib/db/admin-users";
import type { HrEvaluation } from "@/lib/db/hr";
import { deleteUserAction, saveUserAction, toggleLockAction } from "./actions";
import { saveEvaluationAction } from "./hr-actions";

const TEAMS = ["", "Team FB", "Team TikTok", "Team Shopee", "Kỹ thuật", "Mua hàng", "Kế toán"];
const GRADES: Record<string, { label: string; chip: string }> = {
  excellent: { label: "Xuất sắc", chip: "chip-green" },
  good: { label: "Tốt", chip: "chip-blue" },
  average: { label: "Trung bình", chip: "chip-amber" },
  weak: { label: "Yếu", chip: "chip-red" },
  pending: { label: "Chưa đánh giá", chip: "chip-gray" },
};
const ROLE_OPTIONS: RoleCode[] = ["ADMIN", "LEADER_MH", "NV_MH", "LEADER_KT", "NV_KT", "LEADER_KD", "NV_KD", "LEADER_KETOAN", "NV_KETOAN", "VIEWER"];

function initials(name: string) {
  return name.split(" ").map((w) => w[0]).slice(-2).join("").toUpperCase();
}
function avatarColor(email: string) {
  const colors = ["#7C3AED", "#3B82F6", "#16A34A", "#F59E0B", "#DC2626", "#06B6D4", "#EC4899"];
  let h = 0;
  for (let i = 0; i < email.length; i++) h = ((h << 5) - h + email.charCodeAt(i)) | 0;
  return colors[Math.abs(h) % colors.length];
}
function stars(n: number) {
  return "★".repeat(n) + "☆".repeat(5 - n);
}

export default function HrView({
  users, evaluations, taskStats, overdueTasks, autoKpi, workStats, currentPeriod, currentUserEmail,
}: {
  users: AdminUserRow[];
  evaluations: HrEvaluation[];
  taskStats: Array<{ email: string; total: number; done: number; in_progress: number; overdue: number }>;
  overdueTasks: Array<{ id: string; title: string; assignee: string; deadline: string; status: string }>;
  autoKpi: Record<string, { kpi: number; revenue: number; target: number; channels: string }>;
  workStats: Record<string, { tasks: number; tasksDone: number; rdSteps: number; rdDone: number }>;
  currentPeriod: string;
  currentUserEmail: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [tab, setTab] = useState<"accounts" | "evaluate" | "dashboard">("accounts");
  const [filterTeam, setFilterTeam] = useState("");
  const [filterGrade, setFilterGrade] = useState("");
  const [sortBy, setSortBy] = useState("score_desc");

  const activeUsers = users.filter((u) => u.is_active);
  const evalMap = new Map(evaluations.map((e) => [e.email, e]));
  const taskMap = new Map(taskStats.map((t) => [t.email, t]));

  // Merged user+eval data
  const userEvals = useMemo(() => {
    let list = activeUsers.map((u) => {
      const ev = evalMap.get(u.email);
      const ts = taskMap.get(u.email);
      return { ...u, eval: ev || null, tasks: ts || null };
    });
    if (filterTeam) list = list.filter((u) => u.team === filterTeam);
    if (filterGrade) {
      if (filterGrade === "pending") list = list.filter((u) => !u.eval);
      else list = list.filter((u) => u.eval?.grade === filterGrade);
    }
    if (sortBy === "score_desc") list.sort((a, b) => (b.eval?.total_score || 0) - (a.eval?.total_score || 0));
    else if (sortBy === "score_asc") list.sort((a, b) => (a.eval?.total_score || 0) - (b.eval?.total_score || 0));
    else if (sortBy === "kpi_desc") list.sort((a, b) => (b.eval?.kpi_percent || 0) - (a.eval?.kpi_percent || 0));
    else if (sortBy === "name_asc") list.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    return list;
  }, [activeUsers, filterTeam, filterGrade, sortBy, evalMap, taskMap]);

  const evalStats = useMemo(() => {
    const evaluated = evaluations.length;
    const avgScore = evaluated > 0 ? evaluations.reduce((s, e) => s + e.total_score, 0) / evaluated : 0;
    const avgKpi = evaluated > 0 ? evaluations.reduce((s, e) => s + e.kpi_percent, 0) / evaluated : 0;
    return { total: activeUsers.length, evaluated, pending: activeUsers.length - evaluated, avgScore, avgKpi };
  }, [evaluations, activeUsers]);

  const taskTotals = useMemo(() => {
    return taskStats.reduce((s, t) => ({
      total: s.total + t.total, done: s.done + t.done,
      in_progress: s.in_progress + t.in_progress, overdue: s.overdue + t.overdue,
    }), { total: 0, done: 0, in_progress: 0, overdue: 0 });
  }, [taskStats]);

  // Top 3
  const top3 = useMemo(() => {
    return [...evaluations].sort((a, b) => b.total_score - a.total_score).slice(0, 3);
  }, [evaluations]);

  return (
    <section className="section">
      {/* Header */}
      <div className="page-hdr">
        <div>
          <div className="page-title">👥 Nhân sự</div>
          <div className="page-sub">Quản lý tài khoản · Đánh giá · Theo dõi công việc</div>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => { setTab("accounts"); }}>+ Thêm nhân viên</button>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 0, borderBottom: "2px solid var(--border)", marginBottom: 16 }}>
        {([
          { key: "accounts" as const, icon: "👤", label: "Tài khoản", badge: String(users.length) },
          { key: "evaluate" as const, icon: "⭐", label: "Đánh giá", badge: currentPeriod.substring(5) },
          { key: "dashboard" as const, icon: "📊", label: "Dashboard", badge: "" },
        ]).map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: "10px 20px", fontSize: 13, fontWeight: 600, cursor: "pointer",
            border: "none", borderBottom: tab === t.key ? "2px solid #7C3AED" : "2px solid transparent",
            marginBottom: -2, background: "none", color: tab === t.key ? "#7C3AED" : "#64748B",
            fontFamily: "inherit",
          }}>
            {t.icon} {t.label}
            {t.badge && <span style={{ fontSize: 10, background: tab === t.key ? "#F3E8FF" : "#F1F5F9", color: tab === t.key ? "#7C3AED" : "#64748B", padding: "1px 6px", borderRadius: 10, marginLeft: 4 }}>{t.badge}</span>}
          </button>
        ))}
      </div>

      {/* ═══ TAB: TÀI KHOẢN ═══ */}
      {tab === "accounts" && <AccountsTab users={users} pending={pending} start={start} router={router} />}

      {/* ═══ TAB: ĐÁNH GIÁ ═══ */}
      {tab === "evaluate" && (
        <>
          {/* Filters */}
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
            <FilterSelect label="TEAM" value={filterTeam} onChange={setFilterTeam} options={[{ v: "", l: "Tất cả" }, ...TEAMS.filter(Boolean).map((t) => ({ v: t, l: t }))]} />
            <FilterSelect label="XẾP LOẠI" value={filterGrade} onChange={setFilterGrade} options={[{ v: "", l: "Tất cả" }, { v: "excellent", l: "Xuất sắc" }, { v: "good", l: "Tốt" }, { v: "average", l: "Trung bình" }, { v: "weak", l: "Yếu" }, { v: "pending", l: "Chưa đánh giá" }]} />
            <FilterSelect label="SẮP XẾP" value={sortBy} onChange={setSortBy} options={[{ v: "score_desc", l: "Điểm cao → thấp" }, { v: "score_asc", l: "Điểm thấp → cao" }, { v: "kpi_desc", l: "KPI cao → thấp" }, { v: "name_asc", l: "Tên A-Z" }]} />
          </div>

          {/* Stats */}
          <div className="stat-grid">
            <div className="stat-card c-purple"><div className="sl">Tổng NV</div><div className="sv">{evalStats.total}</div></div>
            <div className="stat-card c-green"><div className="sl">Đã đánh giá</div><div className="sv" style={{ color: "var(--green)" }}>{evalStats.evaluated}</div></div>
            <div className="stat-card c-amber"><div className="sl">Chưa đánh giá</div><div className="sv" style={{ color: "var(--amber)" }}>{evalStats.pending}</div></div>
            <div className="stat-card c-green"><div className="sl">Điểm TB /5</div><div className="sv" style={{ color: "var(--green)" }}>{evalStats.avgScore.toFixed(1)}</div></div>
            <div className="stat-card c-blue"><div className="sl">KPI TB</div><div className="sv" style={{ color: "var(--blue)" }}>{evalStats.avgKpi.toFixed(0)}%</div></div>
          </div>

          {/* Evaluation table */}
          <div className="card" style={{ padding: 0 }}>
            <div className="tbl-wrap">
              <table>
                <thead><tr>
                  <th></th><th>Nhân viên</th><th>Team</th>
                  <th style={{ textAlign: "center" }}>KPI %</th>
                  <th style={{ textAlign: "center" }}>Công việc</th>
                  <th style={{ textAlign: "center" }}>Chất lượng</th>
                  <th style={{ textAlign: "center" }}>Thái độ</th>
                  <th style={{ textAlign: "center" }}>Tổng điểm</th>
                  <th>Xếp loại</th>
                  <th>Nhận xét</th>
                  <th></th>
                </tr></thead>
                <tbody>
                  {userEvals.map((u) => (
                    <EvalRow key={u.email} user={u} ev={u.eval} period={currentPeriod} currentUserEmail={currentUserEmail} pending={pending} start={start} onDone={() => router.refresh()} autoKpi={autoKpi[u.email]} workStat={workStats[u.email]} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Top 3 + Trend */}
          {top3.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16 }}>
              <div className="card">
                <div style={{ fontSize: 12, fontWeight: 800, color: "#64748B", textTransform: "uppercase", marginBottom: 10 }}>🏆 Top 3 nhân viên tháng</div>
                {top3.map((ev, i) => {
                  const u = users.find((u) => u.email === ev.email);
                  const medal = ["🥇", "🥈", "🥉"][i];
                  return (
                    <div key={ev.email} style={{ display: "flex", alignItems: "center", gap: 10, padding: 8, background: i === 0 ? "#FEF9C3" : "#F8FAFC", borderRadius: 8, marginBottom: 6, border: i === 0 ? "1px solid #FDE68A" : "none" }}>
                      <div style={{ fontSize: 20, width: 28, textAlign: "center" }}>{medal}</div>
                      <div style={{ width: 28, height: 28, borderRadius: "50%", background: avatarColor(ev.email), display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 10, fontWeight: 700 }}>{initials(u?.name || ev.email)}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 12 }}>{u?.name || ev.email}</div>
                        <div style={{ fontSize: 9, color: "#94A3B8" }}>{u?.team || "—"} · KPI {ev.kpi_percent}%</div>
                      </div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: ev.total_score >= 4.5 ? "#16A34A" : "#3B82F6" }}>{ev.total_score}</div>
                    </div>
                  );
                })}
              </div>
              <div className="card">
                <div style={{ fontSize: 12, fontWeight: 800, color: "#64748B", textTransform: "uppercase", marginBottom: 10 }}>📈 Tổng quan kỳ này</div>
                {[
                  { label: "Điểm TB toàn team", value: evalStats.avgScore.toFixed(1) },
                  { label: "KPI trung bình", value: evalStats.avgKpi.toFixed(0) + "%" },
                  { label: "NV xuất sắc", value: String(evaluations.filter((e) => e.grade === "excellent").length) },
                  { label: "NV yếu", value: String(evaluations.filter((e) => e.grade === "weak").length), warn: evaluations.some((e) => e.grade === "weak") },
                  { label: "Việc quá hạn", value: String(taskTotals.overdue), warn: taskTotals.overdue > 0 },
                ].map((r) => (
                  <div key={r.label} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #F1F5F9", fontSize: 12 }}>
                    <span style={{ color: "#64748B" }}>{r.label}</span>
                    <span style={{ fontWeight: 700, color: r.warn ? "#DC2626" : undefined }}>{r.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Criteria */}
          <div className="card" style={{ background: "#F8FAFC", marginTop: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: "#64748B", textTransform: "uppercase", marginBottom: 10 }}>Tiêu chí đánh giá</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, fontSize: 11 }}>
              <div><div style={{ fontWeight: 700, marginBottom: 4 }}>📊 KPI (40%)</div><div style={{ color: "#64748B" }}>Doanh thu / target kênh được giao. Tự tính từ data dashboard.</div></div>
              <div><div style={{ fontWeight: 700, marginBottom: 4 }}>✅ Chất lượng (30%)</div><div style={{ color: "#64748B" }}>Leader đánh giá: content, QC, xử lý đơn, chăm sóc KH.</div></div>
              <div><div style={{ fontWeight: 700, marginBottom: 4 }}>🤝 Thái độ (30%)</div><div style={{ color: "#64748B" }}>Chủ động, đúng giờ, teamwork, tinh thần học hỏi.</div></div>
            </div>
            <div style={{ marginTop: 8, fontSize: 10, color: "#94A3B8" }}>
              Xếp loại: <span className="chip chip-green">Xuất sắc ≥4.5</span>{" "}
              <span className="chip chip-blue">Tốt 3.5-4.4</span>{" "}
              <span className="chip chip-amber">TB 2.5-3.4</span>{" "}
              <span className="chip chip-red">Yếu &lt;2.5</span>
            </div>
          </div>
        </>
      )}

      {/* ═══ TAB: DASHBOARD ═══ */}
      {tab === "dashboard" && (
        <>
          <div className="stat-grid" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
            <div className="stat-card c-blue"><div className="sl">Tổng việc tháng</div><div className="sv">{taskTotals.total}</div></div>
            <div className="stat-card c-green"><div className="sl">Hoàn thành</div><div className="sv" style={{ color: "var(--green)" }}>{taskTotals.done}</div></div>
            <div className="stat-card c-amber"><div className="sl">Đang làm</div><div className="sv" style={{ color: "var(--amber)" }}>{taskTotals.in_progress}</div></div>
            <div className="stat-card c-red"><div className="sl">Quá hạn</div><div className="sv" style={{ color: "var(--red)" }}>{taskTotals.overdue}</div></div>
          </div>

          {/* Per-person */}
          <div className="card" style={{ padding: 0 }}>
            <div style={{ padding: "12px 16px", fontWeight: 800, fontSize: 12, color: "#64748B", textTransform: "uppercase", borderBottom: "1px solid var(--border)" }}>
              Công việc theo nhân viên — {currentPeriod}
            </div>
            <div className="tbl-wrap">
              <table>
                <thead><tr>
                  <th></th><th>Nhân viên</th><th>Team</th>
                  <th style={{ textAlign: "center" }}>Giao</th>
                  <th style={{ textAlign: "center" }}>Xong</th>
                  <th style={{ textAlign: "center" }}>Đang làm</th>
                  <th style={{ textAlign: "center" }}>Quá hạn</th>
                  <th style={{ textAlign: "center" }}>Tỷ lệ</th>
                  <th>Tiến độ</th>
                </tr></thead>
                <tbody>
                  {taskStats.sort((a, b) => (b.total > 0 ? b.done / b.total : 0) - (a.total > 0 ? a.done / a.total : 0)).map((ts) => {
                    const u = users.find((u) => u.email === ts.email);
                    const pct = ts.total > 0 ? Math.round((ts.done / ts.total) * 100) : 0;
                    const color = pct >= 80 ? "#16A34A" : pct >= 50 ? "#D97706" : "#DC2626";
                    return (
                      <tr key={ts.email} style={{ background: ts.overdue > 0 ? "#FEF2F2" : undefined }}>
                        <td><div style={{ width: 28, height: 28, borderRadius: "50%", background: avatarColor(ts.email), display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 10, fontWeight: 700 }}>{initials(u?.name || ts.email)}</div></td>
                        <td style={{ fontWeight: 700 }}>{u?.name || ts.email}</td>
                        <td><span className="chip chip-blue" style={{ fontSize: 10 }}>{u?.team || "—"}</span></td>
                        <td style={{ textAlign: "center", fontWeight: 700 }}>{ts.total}</td>
                        <td style={{ textAlign: "center", color: "#16A34A", fontWeight: 700 }}>{ts.done}</td>
                        <td style={{ textAlign: "center", color: "#D97706" }}>{ts.in_progress}</td>
                        <td style={{ textAlign: "center", color: "#DC2626", fontWeight: ts.overdue > 0 ? 700 : 400 }}>{ts.overdue}</td>
                        <td style={{ textAlign: "center", fontWeight: 700, color }}>{pct}%</td>
                        <td><div style={{ width: 120, height: 6, borderRadius: 3, background: "#E2E8F0", overflow: "hidden" }}><div style={{ height: "100%", width: pct + "%", borderRadius: 3, background: color }} /></div></td>
                      </tr>
                    );
                  })}
                  {taskStats.length === 0 && <tr><td colSpan={9} style={{ textAlign: "center", padding: 24, color: "#94A3B8" }}>Chưa có data công việc tháng này</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          {/* Overdue */}
          {overdueTasks.length > 0 && (
            <div className="card" style={{ borderColor: "#FECACA", background: "#FFFBFB", marginTop: 16, padding: 0 }}>
              <div style={{ padding: "12px 16px", fontWeight: 800, fontSize: 12, color: "#DC2626", textTransform: "uppercase", borderBottom: "1px solid #FECACA" }}>
                ⚠ Việc quá hạn ({overdueTasks.length})
              </div>
              <div className="tbl-wrap">
                <table>
                  <thead><tr><th>Việc</th><th>Giao cho</th><th>Deadline</th><th>Trễ</th><th>Trạng thái</th></tr></thead>
                  <tbody>
                    {overdueTasks.map((t) => {
                      const u = users.find((u) => u.email === t.assignee);
                      const daysLate = Math.ceil((Date.now() - new Date(t.deadline).getTime()) / 86400000);
                      return (
                        <tr key={t.id}>
                          <td style={{ fontWeight: 600 }}>{t.title}</td>
                          <td>{u?.name || t.assignee}</td>
                          <td style={{ color: "#DC2626" }}>{t.deadline.substring(5)}</td>
                          <td style={{ color: "#DC2626", fontWeight: 700 }}>{daysLate} ngày</td>
                          <td><span className="chip chip-amber">{t.status}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

// ─── Sub-components ───

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { v: string; l: string }[] }) {
  return (
    <div>
      <span style={{ fontSize: 11, color: "#94A3B8", fontWeight: 600, marginRight: 4 }}>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} style={{ padding: "6px 10px", border: "1px solid #E2E8F0", borderRadius: 7, fontSize: 12 }}>
        {options.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
    </div>
  );
}

function EvalRow({ user, ev, period, currentUserEmail, pending, start, onDone, autoKpi, workStat }: {
  user: AdminUserRow; ev: HrEvaluation | null; period: string;
  currentUserEmail: string; pending: boolean; start: ReturnType<typeof useTransition>[1]; onDone: () => void;
  autoKpi?: { kpi: number; revenue: number; target: number; channels: string };
  workStat?: { tasks: number; tasksDone: number; rdSteps: number; rdDone: number };
}) {
  const [editing, setEditing] = useState(false);
  const displayKpi = ev?.kpi_percent || autoKpi?.kpi || 0;
  const [kpi, setKpi] = useState(String(displayKpi || ""));
  const [quality, setQuality] = useState(ev?.quality || 0);
  const [attitude, setAttitude] = useState(ev?.attitude || 0);
  const [note, setNote] = useState(ev?.note || "");

  const grade = ev ? GRADES[ev.grade] || GRADES.pending : GRADES.pending;

  if (editing) {
    return (
      <tr><td colSpan={11}>
        <div style={{ padding: 14, background: "#F8FAFC", border: "1px solid #7C3AED", borderRadius: 8 }}>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>Đánh giá: {user.name || user.email}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 2fr", gap: 10, marginBottom: 10 }}>
            <div><label style={{ fontSize: 11, fontWeight: 600, color: "#64748B" }}>KPI %</label><input type="number" value={kpi} onChange={(e) => setKpi(e.target.value)} style={{ width: "100%", padding: "6px 10px", border: "1px solid #E2E8F0", borderRadius: 7, fontSize: 12 }} /></div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: "#64748B" }}>Chất lượng (1-5)</label>
              <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} type="button" onClick={() => setQuality(n)} style={{ fontSize: 18, background: "none", border: "none", cursor: "pointer", color: n <= quality ? "#F59E0B" : "#D1D5DB" }}>★</button>
                ))}
              </div>
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: "#64748B" }}>Thái độ (1-5)</label>
              <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} type="button" onClick={() => setAttitude(n)} style={{ fontSize: 18, background: "none", border: "none", cursor: "pointer", color: n <= attitude ? "#F59E0B" : "#D1D5DB" }}>★</button>
                ))}
              </div>
            </div>
            <div><label style={{ fontSize: 11, fontWeight: 600, color: "#64748B" }}>Nhận xét</label><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Nhận xét..." style={{ width: "100%", padding: "6px 10px", border: "1px solid #E2E8F0", borderRadius: 7, fontSize: 12 }} /></div>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setEditing(false)}>Huỷ</button>
            <button className="btn btn-primary btn-sm" disabled={pending} onClick={() => {
              if (!kpi || !quality || !attitude) return alert("Điền đủ KPI, Chất lượng, Thái độ");
              start(async () => {
                const r = await saveEvaluationAction({ email: user.email, period, kpi_percent: Number(kpi), quality, attitude, note });
                if (!r.ok) alert(r.error);
                else { setEditing(false); onDone(); }
              });
            }}>💾 Lưu đánh giá</button>
          </div>
        </div>
      </td></tr>
    );
  }

  if (!ev) {
    return (
      <tr style={{ background: "#FFF7ED" }}>
        <td><div style={{ width: 32, height: 32, borderRadius: "50%", background: avatarColor(user.email), display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 11, fontWeight: 700 }}>{initials(user.name || user.email)}</div></td>
        <td style={{ fontWeight: 700, color: "#94A3B8" }}>{user.name || user.email}</td>
        <td><span className="chip chip-gray" style={{ fontSize: 10 }}>{user.team || "—"}</span></td>
        <td style={{ textAlign: "center" }}>
          {autoKpi ? (
            <div title={`DT: ${Math.round(autoKpi.revenue / 1e6)}M / Target: ${Math.round(autoKpi.target / 1e6)}M`}>
              <div style={{ fontWeight: 700, color: autoKpi.kpi >= 100 ? "#16A34A" : autoKpi.kpi >= 70 ? "#D97706" : "#DC2626" }}>{autoKpi.kpi}%</div>
              <div style={{ fontSize: 8, color: "#94A3B8" }}>auto</div>
            </div>
          ) : <span style={{ color: "#94A3B8" }}>—</span>}
        </td>
        <td style={{ textAlign: "center", fontSize: 10 }}>
          {workStat ? (
            <div title={`Tasks: ${workStat.tasksDone}/${workStat.tasks} · R&D: ${workStat.rdDone}/${workStat.rdSteps}`}>
              <div style={{ fontWeight: 600 }}>{workStat.tasksDone + workStat.rdDone}/{workStat.tasks + workStat.rdSteps}</div>
              <div style={{ fontSize: 8, color: "#94A3B8" }}>việc xong</div>
            </div>
          ) : <span style={{ color: "#94A3B8" }}>—</span>}
        </td>
        <td colSpan={4} style={{ textAlign: "center", color: "#D97706", fontStyle: "italic" }}>
          Chưa đánh giá — <button onClick={() => setEditing(true)} style={{ color: "#7C3AED", fontWeight: 600, background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>Đánh giá ngay</button>
        </td>
        <td></td>
      </tr>
    );
  }

  const kpiColor = ev.kpi_percent >= 100 ? "#16A34A" : ev.kpi_percent >= 70 ? "#D97706" : "#DC2626";
  return (
    <tr style={{ background: ev.grade === "weak" ? "#FEF2F2" : undefined }}>
      <td><div style={{ width: 32, height: 32, borderRadius: "50%", background: avatarColor(user.email), display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 11, fontWeight: 700 }}>{initials(user.name || user.email)}</div></td>
      <td style={{ fontWeight: 700 }}>{user.name || user.email}</td>
      <td><span className="chip chip-blue" style={{ fontSize: 10 }}>{user.team || "—"}</span></td>
      <td style={{ textAlign: "center" }}>
        <div style={{ fontWeight: 700, color: kpiColor }}>{ev.kpi_percent}%</div>
        <div style={{ width: 80, height: 4, borderRadius: 2, background: "#E2E8F0", margin: "3px auto 0", overflow: "hidden" }}>
          <div style={{ height: "100%", width: Math.min(ev.kpi_percent, 100) + "%", background: kpiColor, borderRadius: 2 }} />
        </div>
      </td>
      <td style={{ textAlign: "center", fontSize: 10 }}>
        {workStat ? (
          <div title={`Tasks: ${workStat.tasksDone}/${workStat.tasks} · R&D: ${workStat.rdDone}/${workStat.rdSteps}`}>
            <div style={{ fontWeight: 600 }}>{workStat.tasksDone + workStat.rdDone}/{workStat.tasks + workStat.rdSteps}</div>
            <div style={{ fontSize: 8, color: "#94A3B8" }}>việc xong</div>
          </div>
        ) : <span style={{ color: "#94A3B8" }}>—</span>}
      </td>
      <td style={{ textAlign: "center", color: "#F59E0B", letterSpacing: 2 }}>{stars(ev.quality)}</td>
      <td style={{ textAlign: "center", color: "#F59E0B", letterSpacing: 2 }}>{stars(ev.attitude)}</td>
      <td style={{ textAlign: "center", fontWeight: 800, fontSize: 16, color: ev.total_score >= 4.5 ? "#16A34A" : ev.total_score >= 3.5 ? "#3B82F6" : ev.total_score >= 2.5 ? "#D97706" : "#DC2626" }}>{ev.total_score}</td>
      <td><span className={`chip ${grade.chip}`} style={{ fontSize: 10 }}>{grade.label}</span></td>
      <td style={{ color: "#64748B", maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ev.note || "—"}</td>
      <td><button className="btn btn-ghost btn-xs" onClick={() => setEditing(true)}>Sửa</button></td>
    </tr>
  );
}

function AccountsTab({ users, pending, start, router }: {
  users: AdminUserRow[]; pending: boolean; start: ReturnType<typeof useTransition>[1]; router: ReturnType<typeof useRouter>;
}) {
  const [editing, setEditing] = useState<string | "new" | null>(null);

  return (
    <>
      {editing === "new" && (
        <EditForm initial={null} onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); router.refresh(); }} disabled={pending} startTransition={start} />
      )}
      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: "8px 16px", display: "flex", justifyContent: "flex-end" }}>
          <button className="btn btn-primary btn-xs" onClick={() => setEditing("new")}>+ Thêm user</button>
        </div>
        <div className="tbl-wrap">
          <table>
            <thead><tr>
              <th></th><th>Tên</th><th>Email</th><th>Vai trò</th><th>Team</th><th>Trạng thái</th><th>Ngày tạo</th><th></th>
            </tr></thead>
            <tbody>
              {users.map((u) => {
                if (editing === u.email) {
                  return (
                    <tr key={u.email}><td colSpan={8}>
                      <EditForm initial={u} onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); router.refresh(); }} disabled={pending} startTransition={start} />
                    </td></tr>
                  );
                }
                const roleInfo = u.role && u.role !== "VIEWER" ? ROLES[u.role as Exclude<RoleCode, "VIEWER">] : null;
                return (
                  <tr key={u.email} style={{ opacity: u.is_active ? 1 : 0.5 }}>
                    <td><div style={{ width: 32, height: 32, borderRadius: "50%", background: avatarColor(u.email), display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 11, fontWeight: 700 }}>{initials(u.name || u.email)}</div></td>
                    <td style={{ fontWeight: 700 }}>{u.name || "—"}</td>
                    <td style={{ color: "#64748B", fontSize: 12, fontFamily: "monospace" }}>{u.email}</td>
                    <td><span className={`chip ${u.role === "ADMIN" ? "chip-purple" : u.role?.startsWith("LEADER") ? "chip-blue" : "chip-gray"}`} style={{ fontSize: 10 }}>{roleInfo?.label || u.role}</span></td>
                    <td style={{ color: "#64748B", fontSize: 12 }}>{u.team || "—"}</td>
                    <td>{u.is_active ? <span className="chip chip-green">Hoạt động</span> : <span className="chip chip-red">Đã khoá</span>}</td>
                    <td style={{ color: "#94A3B8", fontSize: 11 }}>{formatDate(u.created_at)}</td>
                    <td>
                      <div style={{ display: "flex", gap: 4 }}>
                        <button className="btn btn-ghost btn-xs" onClick={() => setEditing(u.email)}>✏️</button>
                        <button className="btn btn-ghost btn-xs" onClick={() => {
                          if (!confirm(u.is_active ? `Khoá ${u.email}?` : `Mở khoá ${u.email}?`)) return;
                          start(async () => { await toggleLockAction(u.email, !!u.is_active); router.refresh(); });
                        }}>{u.is_active ? "🔒" : "🔓"}</button>
                        <button className="btn btn-ghost btn-xs" style={{ color: "var(--red)" }} onClick={() => {
                          if (!confirm(`Xoá ${u.email}?`)) return;
                          start(async () => { await deleteUserAction(u.email); router.refresh(); });
                        }}>🗑</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function EditForm({ initial, onCancel, onSaved, disabled, startTransition }: {
  initial: AdminUserRow | null; onCancel: () => void; onSaved: () => void; disabled: boolean; startTransition: ReturnType<typeof useTransition>[1];
}) {
  const [d, setD] = useState({
    email: initial?.email || "", name: initial?.name || "", role: initial?.role || "VIEWER",
    team: initial?.team || "", channels: initial?.channels || "", is_active: initial?.is_active !== false, note: initial?.note || "",
  });
  function save() {
    if (!d.email.trim()) return alert("Nhập email");
    startTransition(async () => {
      const r = await saveUserAction({ email: d.email.trim().toLowerCase(), name: d.name, role: d.role, team: d.team || null, channels: d.channels || null, is_active: d.is_active, note: d.note || null });
      if (!r.ok) alert(r.error); else onSaved();
    });
  }
  return (
    <div style={{ padding: 14, background: "#FAFAFA", border: "1px solid var(--blue)", borderRadius: 8 }}>
      <div style={{ fontWeight: 700, marginBottom: 10 }}>{initial ? `Sửa: ${initial.email}` : "+ User mới"}</div>
      <div className="form-grid fg-3" style={{ marginBottom: 10 }}>
        <div className="form-group"><label>Email *</label><input value={d.email} onChange={(e) => setD({ ...d, email: e.target.value })} disabled={!!initial} /></div>
        <div className="form-group"><label>Tên</label><input value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} /></div>
        <div className="form-group"><label>Role</label><select value={d.role} onChange={(e) => setD({ ...d, role: e.target.value })}>{ROLE_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}</select></div>
      </div>
      <div className="form-grid fg-3" style={{ marginBottom: 10 }}>
        <div className="form-group"><label>Team</label><input value={d.team} onChange={(e) => setD({ ...d, team: e.target.value })} /></div>
        <div className="form-group"><label>Channels</label><input value={d.channels} onChange={(e) => setD({ ...d, channels: e.target.value })} /></div>
        <div className="form-group"><label>Trạng thái</label><select value={d.is_active ? "1" : "0"} onChange={(e) => setD({ ...d, is_active: e.target.value === "1" })}><option value="1">Active</option><option value="0">Locked</option></select></div>
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
        <button className="btn btn-ghost btn-sm" onClick={onCancel}>Huỷ</button>
        <button className="btn btn-primary btn-sm" onClick={save} disabled={disabled}>💾 Lưu</button>
      </div>
    </div>
  );
}
