import { listInventory, getInventoryStats, getInventoryMobileSummary } from "@/lib/db/inventory";
import InventoryView from "./InventoryView";
import InventorySwitch from "./InventorySwitch";

export const dynamic = "force-dynamic";

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; filter?: string; sort?: string; category?: string; page?: string }>;
}) {
  const { q = "", filter = "all", sort = "stock_desc", category = "", page = "1" } = await searchParams;
  const pageNum = Math.max(1, Number(page) || 1);
  const limit = 200;
  const offset = (pageNum - 1) * limit;

  const [{ rows, total }, stats, mobileSummary] = await Promise.all([
    listInventory({
      search: q || undefined,
      filter: (filter as "all" | "in_stock" | "low_stock" | "out_of_stock" | "active" | "inactive") || "all",
      category: category || undefined,
      sort,
      limit,
      offset,
    }),
    getInventoryStats(),
    getInventoryMobileSummary(),
  ]);

  return (
    <div id="inventory-page">
      <InventorySwitch mobileProps={mobileSummary} />
      <InventoryView
        rows={rows}
        total={total}
        q={q}
        filter={filter}
        sort={sort}
        category={category}
        stats={stats}
        page={pageNum}
        totalPages={Math.ceil(total / limit)}
      />
    </div>
  );
}
