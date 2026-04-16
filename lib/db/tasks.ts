import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { nowVN } from "@/lib/helpers";

export type TaskRow = {
  task_id: string;
  title: string | null;
  description: string | null;
  assignee_email: string | null;
  assignee_name: string | null;
  team: string | null;
  created_by: string | null;
  status: string | null;
  priority: string | null;
  deadline: string | null;
  recurring: string | null;
  parent_task_id: string | null;
  alerted_1h: boolean | null;
  alerted_overdue: boolean | null;
  note: string | null;
  created_at: string | null;
  updated_at: string | null;
  done_at: string | null;
};

export async function listTasks(filter: "all" | "mine" | "assigned_by_me" = "all", userEmail?: string): Promise<TaskRow[]> {
  const db = supabaseAdmin();
  let q = db.from("tasks").select("*").order("created_at", { ascending: false });
  if (filter === "mine" && userEmail) q = q.eq("assignee_email", userEmail);
  else if (filter === "assigned_by_me" && userEmail) q = q.eq("created_by", userEmail);
  const { data } = await q.limit(500);
  return (data as TaskRow[]) || [];
}

export async function createTask(data: Partial<TaskRow>): Promise<string> {
  const db = supabaseAdmin();
  const { data: row, error } = await db
    .from("tasks")
    .insert({
      title: data.title || null,
      description: data.description || null,
      assignee_email: data.assignee_email || null,
      assignee_name: data.assignee_name || null,
      team: data.team || null,
      created_by: data.created_by || null,
      status: data.status || "OPEN",
      priority: data.priority || "MEDIUM",
      deadline: data.deadline || null,
      recurring: data.recurring || null,
      note: data.note || null,
      created_at: nowVN(),
      updated_at: nowVN(),
    })
    .select("task_id")
    .single();
  if (error) throw error;
  return row.task_id;
}

export async function updateTask(taskId: string, data: Partial<TaskRow>) {
  await supabaseAdmin()
    .from("tasks")
    .update({ ...data, updated_at: nowVN() })
    .eq("task_id", taskId);
}

export async function markTaskDone(taskId: string) {
  await supabaseAdmin()
    .from("tasks")
    .update({ status: "DONE", done_at: nowVN(), updated_at: nowVN() })
    .eq("task_id", taskId);
}

export async function deleteTask(taskId: string) {
  await supabaseAdmin().from("tasks").delete().eq("task_id", taskId);
}
