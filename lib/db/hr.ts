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

// Auto-calculate KPI% per user based on their channels + sales_sync revenue vs targets
export async function calcAutoKpi(period: string): Promise<Map<string, { kpi: number; revenue: number; target: number; channels: string }>> {
  const db = supabaseAdmin();
  const [y, m] = period.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const from = `${period}-01`;
  const to = `${period}-${String(lastDay).padStart(2, "0")}`;

  // Get users with channels
  const { data: users } = await db.from("users").select("email, channels").eq("is_active", true);

  // Normalize channel name for sales_sync lookup
  const normCh = (ch: string) => {
    const c = ch.trim();
    if (c === "TikTok") return "TikTok Shop";
    return c;
  };

  // Get revenue by channel from sales_sync
  const { data: sales } = await db.from("sales_sync")
    .select("channel, revenue_success")
    .gte("period_from", from).lte("period_from", to);
  const revByChannel = new Map<string, number>();
  for (const s of sales || []) {
    const ch = String(s.channel || "");
    revByChannel.set(ch, (revByChannel.get(ch) || 0) + Number(s.revenue_success || 0));
  }

  // Get targets by channel
  const { data: targets } = await db.from("targets")
    .select("ref_id, rev_target")
    .eq("type", "channel")
    .eq("month_key", period);
  const targetMap = new Map<string, number>();
  for (const t of targets || []) targetMap.set(t.ref_id, Number(t.rev_target || 0));

  // Channel display → target key mapping
  const chToTargetKey: Record<string, string> = {
    "Facebook": "facebook", "TikTok Shop": "tiktok", "Shopee": "shopee",
    "API": "web_b2b", "Admin": "web_b2b", "WebApp": "web_b2b", "Website": "web_b2b",
  };

  const result = new Map<string, { kpi: number; revenue: number; target: number; channels: string }>();

  for (const u of users || []) {
    if (!u.channels) continue;
    const channels = String(u.channels).split(",").map((c: string) => c.trim()).filter(Boolean);
    if (channels.length === 0) continue;

    // Count how many users share each channel
    const userCountPerChannel = new Map<string, number>();
    for (const uu of users || []) {
      if (!uu.channels) continue;
      for (const c of String(uu.channels).split(",").map((x: string) => x.trim())) {
        userCountPerChannel.set(c, (userCountPerChannel.get(c) || 0) + 1);
      }
    }

    let totalRev = 0;
    let totalTarget = 0;
    for (const ch of channels) {
      const dbCh = normCh(ch);
      const rev = revByChannel.get(dbCh) || 0;
      const targetKey = chToTargetKey[dbCh] || ch.toLowerCase();
      const target = targetMap.get(targetKey) || 0;
      const share = userCountPerChannel.get(ch) || 1;
      totalRev += rev / share;
      totalTarget += target / share;
    }

    const kpi = totalTarget > 0 ? Math.round((totalRev / totalTarget) * 100) : 0;
    result.set(u.email, { kpi, revenue: Math.round(totalRev), target: Math.round(totalTarget), channels: channels.join(", ") });
  }

  return result;
}

// Count work items from tasks + RD pipeline per user
export async function calcWorkStats(from: string, to: string): Promise<Map<string, { tasks: number; tasksDone: number; rdSteps: number; rdDone: number }>> {
  const db = supabaseAdmin();

  // Tasks
  const { data: tasks } = await db.from("tasks")
    .select("assignee_email, done_at")
    .gte("created_at", from + "T00:00:00");
  const result = new Map<string, { tasks: number; tasksDone: number; rdSteps: number; rdDone: number }>();
  for (const t of tasks || []) {
    const email = t.assignee_email || "";
    if (!email) continue;
    const cur = result.get(email) || { tasks: 0, tasksDone: 0, rdSteps: 0, rdDone: 0 };
    cur.tasks++;
    if (t.done_at) cur.tasksDone++;
    result.set(email, cur);
  }

  // RD pipeline steps — count steps assigned to each user
  const { data: rdItems } = await db.from("rd_items").select("data");
  for (const item of rdItems || []) {
    const d = (item.data as Record<string, unknown>) || {};
    for (const key of ["research_steps", "production_steps"]) {
      const raw = d[key];
      if (!raw) continue;
      try {
        const steps = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (!Array.isArray(steps)) continue;
        for (const step of steps) {
          const email = step.assignee || "";
          if (!email) continue;
          const cur = result.get(email) || { tasks: 0, tasksDone: 0, rdSteps: 0, rdDone: 0 };
          cur.rdSteps++;
          if (step.status === "approved") cur.rdDone++;
          result.set(email, cur);
        }
      } catch { /* */ }
    }
  }

  return result;
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
