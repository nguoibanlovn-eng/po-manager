import { listInventory } from "@/lib/db/inventory";
import InventoryView from "./InventoryView";

export const dynamic = "force-dynamic";

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; filter?: string; page?: string }>;
}) {
  const { q = "", filter = "all", page = "1" } = await searchParams;
  const pageNum = Math.max(1, Number(page) || 1);
  const limit = 200;
  const offset = (pageNum - 1) * limit;

  const { rows, total } = await listInventory({
    search: q || undefined,
    filter: (filter as "all" | "in_stock" | "low_stock" | "out_of_stock" | "active" | "inactive") || "all",
    limit,
    offset,
  });

  return (
    <InventoryView
      rows={rows}
      total={total}
      q={q}
      filter={filter}
      page={pageNum}
      totalPages={Math.ceil(total / limit)}
    />
  );
}
