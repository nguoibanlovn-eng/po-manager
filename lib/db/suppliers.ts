import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";

export type SupplierRef = { supplier_name: string; supplier_contact: string | null };

export async function listSuppliers(): Promise<SupplierRef[]> {
  const { data } = await supabaseAdmin()
    .from("suppliers")
    .select("supplier_name, supplier_contact")
    .eq("is_deleted", false)
    .order("use_count", { ascending: false })
    .order("last_used", { ascending: false })
    .limit(500);
  return (data as SupplierRef[]) || [];
}
