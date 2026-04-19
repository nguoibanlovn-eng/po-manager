import { listCustomers, getCustomerStats } from "@/lib/db/customers";
import CustomersView from "./CustomersView";

export const dynamic = "force-dynamic";

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; sort?: string; city?: string; minOrders?: string; page?: string }>;
}) {
  const { q = "", sort = "revenue_desc", city = "", minOrders = "0", page = "1" } = await searchParams;
  const pageNum = Math.max(1, Number(page) || 1);
  const limit = 100;
  const offset = (pageNum - 1) * limit;
  const minOrd = Number(minOrders) || 0;

  const [{ rows, total }, stats] = await Promise.all([
    listCustomers({
      search: q || undefined,
      sort,
      city: city || undefined,
      minOrders: minOrd || undefined,
      limit,
      offset,
    }),
    getCustomerStats(),
  ]);

  return (
    <CustomersView
      rows={rows}
      total={total}
      q={q}
      sort={sort}
      city={city}
      minOrders={minOrd}
      stats={stats}
      page={pageNum}
      totalPages={Math.ceil(total / limit)}
    />
  );
}
