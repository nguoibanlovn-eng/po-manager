import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { nowVN } from "@/lib/helpers";

export type HrEvaluation = {
  id: string;
  email: string;
  period: string;
  kpi_percent: number;
  quality: number;
  attitude: number;
  total_score: number;
  grade: string;
  note: string | null;
  evaluated_by: string | null;
  evaluated_at: string | null;
  created_at: string | null;
};

export async function listEvaluations(period: string): Promise<HrEvaluation[]> {
  const { data } = await supabaseAdmin()
    .from("hr_evaluations")
    .select("*")
    .eq("period", period)
    .order("total_score", { ascending: false });
  return (data as HrEvaluation[]) || [];
}

export async function saveEvaluation(eval_: {
  email: string;
  period: string;
  kpi_percent: number;
  quality: number;
  attitude: number;
  note?: string;
  evaluated_by: string;
}): Promise<{ ok: boolean; error?: string }> {
  const totalScore = parseFloat(
    ((eval_.kpi_percent / 100) * 5 * 0.4 + eval_.quality * 0.3 + eval_.attitude * 0.3).toFixed(1)
  );
  const grade = totalScore >= 4.5 ? "excellent"
    : totalScore >= 3.5 ? "good"
    : totalScore >= 2.5 ? "average"
    : "weak";

  const { error } = await supabaseAdmin()
    .from("hr_evaluations")
    .upsert({
      email: eval_.email,
      period: eval_.period,
      kpi_percent: eval_.kpi_percent,
      quality: eval_.quality,
      attitude: eval_.attitude,
      total_score: totalScore,
      grade,
      note: eval_.note || null,
      evaluated_by: eval_.evaluated_by,
      evaluated_at: nowVN(),
      updated_at: nowVN(),
    }, { onConflict: "email,period" });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function deleteEvaluation(id: string): Promise<void> {
  await supabaseAdmin().from("hr_evaluations").delete().eq("id", id);
}

// Get task stats per user for a period
export async function getTaskStats(from: string, to: string): Promise<
  Array<{ email: string; total: number; done: number; in_progress: number; overdue: number }>
> {
  const db = supabaseAdmin();
  const { data: tasks } = await db
    .from("tasks")
    .select("assignee_email, status, deadline, done_at")
    .gte("created_at", from + "T00:00:00")
    .lte("created_at", to + "T23:59:59");

  const map = new Map<string, { total: number; done: number; in_progress: number; overdue: number }>();
  const today = new Date().toISOString().substring(0, 10);

  for (const t of tasks || []) {
    const email = t.assignee_email || "";
    if (!email) continue;
    const cur = map.get(email) || { total: 0, done: 0, in_progress: 0, overdue: 0 };
    cur.total++;
    const isDone = t.status === "done" || t.status === "completed" || !!t.done_at;
    if (isDone) cur.done++;
    else if (t.status === "in_progress") cur.in_progress++;
    else cur.in_progress++; // null status = in progress
    const dl = t.deadline ? String(t.deadline).substring(0, 10) : "";
    if (dl && dl < today && !isDone) cur.overdue++;
    map.set(email, cur);
  }

  return Array.from(map.entries()).map(([email, v]) => ({ email, ...v }));
}

// Get overdue tasks
export async function getOverdueTasks(limit = 10): Promise<
  Array<{ id: string; title: string; assignee: string; deadline: string; status: string }>
> {
  const today = new Date().toISOString();
  const db = supabaseAdmin();
  const { data } = await db
    .from("tasks")
    .select("task_id, title, assignee_email, deadline, status, done_at")
    .lt("deadline", today)
    .is("done_at", null)
    .order("deadline", { ascending: true })
    .limit(limit);
  return (data || []).map((t) => ({
    id: t.task_id,
    title: t.title || "",
    assignee: t.assignee_email || "",
    deadline: t.deadline ? String(t.deadline).substring(0, 10) : "",
    status: t.status || "pending",
  }));
}
