import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import { KpiCard } from "@/components/ui/kpi-card";
import { Badge } from "@/components/ui/badge";
import { Money } from "@/components/ui/money";
import { DataTable, type Column } from "@/components/ui/data-table";
import { TrendingUp, Users, Clock, AlertCircle, DollarSign, PieChart } from "lucide-react";

interface Payment {
  id: string;
  gross_kobo: number;
  status: string;
  payer_reference: string;
  paid_at: string;
  accounting_date: string;
  association_memberships: { profiles: { full_name: string } };
}

export default async function DashboardPage({
  params,
  searchParams,
}: {
  params: { associationId: string };
  searchParams: { fy?: string };
}) {
  const ctx = await getTenantContext(params.associationId);
  const supabase = createClient();
  const financialYearId = searchParams.fy;

  // Fetch all dashboard data in parallel
  const [metrics, trend, byBillType, topOutstanding, aging, recentPayments, financialYears] = await Promise.all([
    supabase.rpc("get_dashboard_metrics", {
      p_association_id: ctx.associationId,
      p_financial_year_id: financialYearId || null,
    }),
    supabase.rpc("get_collection_trend", {
      p_association_id: ctx.associationId,
      p_months: 12,
    }),
    supabase.rpc("get_revenue_by_bill_type", {
      p_association_id: ctx.associationId,
      p_financial_year_id: financialYearId || null,
    }),
    supabase.rpc("get_top_outstanding", {
      p_association_id: ctx.associationId,
      p_limit: 10,
    }),
    supabase.rpc("get_aging_report", {
      p_association_id: ctx.associationId,
    }),
    supabase
      .from("payments")
      .select(`
        id,
        gross_kobo,
        status,
        payer_reference,
        paid_at,
        accounting_date,
        association_memberships(profiles(full_name))
      `)
      .eq("association_id", ctx.associationId)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("financial_years")
      .select("id, label, start_date, end_date, status")
      .eq("association_id", ctx.associationId)
      .order("start_date", { ascending: false }),
  ]);

  const paymentColumns: Column<Payment>[] = [
    { id: "name", header: "Member", accessor: (row) => row.association_memberships.profiles.full_name },
    { id: "amount", header: "Amount", accessor: (row) => <Money amountKobo={row.gross_kobo} />, align: "right" },
    { id: "date", header: "Date", accessor: (row) => new Date(row.accounting_date).toLocaleDateString("en-NG") },
    {
      id: "status",
      header: "Status",
      accessor: (row) => (
        <Badge variant={row.status === "verified" ? "verified" : row.status === "pending_verification" ? "pending" : "rejected"}>
          {row.status}
        </Badge>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header with FY filter */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">Dashboard</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Financial overview for your association
          </p>
        </div>
        <select
          className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          defaultValue={financialYearId || ""}
          onChange={(e) => {
            const url = new URL(window.location.href);
            if (e.target.value) {
              url.searchParams.set("fy", e.target.value);
            } else {
              url.searchParams.delete("fy");
            }
            window.location.href = url.toString();
          }}
        >
          <option value="">All Financial Years</option>
          {financialYears.data?.map((fy) => (
            <option key={fy.id} value={fy.id}>
              {fy.label} ({fy.status})
            </option>
          ))}
        </select>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Total Revenue"
          value={metrics.data?.total_revenue_kobo || 0}
          format="money"
          icon={DollarSign}
          variant="hot"
        />
        <KpiCard
          label="Outstanding"
          value={metrics.data?.total_outstanding_kobo || 0}
          format="money"
          icon={AlertCircle}
          variant="bad"
        />
        <KpiCard
          label="Collection Rate"
          value={metrics.data?.collection_rate_percent || 0}
          format="percent"
          icon={TrendingUp}
          variant="good"
        />
        <KpiCard
          label="Active Members"
          value={metrics.data?.active_members || 0}
          icon={Users}
        />
      </div>

      {/* Secondary KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard
          label="Pending Verification"
          value={metrics.data?.pending_verifications || 0}
          icon={Clock}
        />
        <KpiCard
          label="Overdue Bills"
          value={metrics.data?.overdue_bills || 0}
          icon={AlertCircle}
          variant="bad"
        />
        <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="text-sm text-zinc-500 dark:text-zinc-400">Aging Summary</div>
          <div className="mt-2 space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-zinc-700 dark:text-zinc-300">0-30 days</span>
              <Money amountKobo={aging.data?.current || 0} className="text-sm" />
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-700 dark:text-zinc-300">31-60 days</span>
              <Money amountKobo={aging.data?.days_31_60 || 0} className="text-sm" />
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-700 dark:text-zinc-300">61-90 days</span>
              <Money amountKobo={aging.data?.days_61_90 || 0} className="text-sm" />
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-700 dark:text-zinc-300">90+ days</span>
              <Money amountKobo={(aging.data?.days_91_120 || 0) + (aging.data?.over_120 || 0)} className="text-sm" />
            </div>
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Monthly Revenue Chart */}
        <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            <TrendingUp className="h-4 w-4" /> Monthly Revenue
          </h2>
          <div className="flex h-48 items-end justify-around gap-2">
            {trend.data?.map((month: { month: string; revenue_kobo: number }) => {
              const maxRevenue = Math.max(...(trend.data?.map((m: { revenue_kobo: number }) => m.revenue_kobo) || [1]), 1);
              const height = (month.revenue_kobo / maxRevenue) * 100;
              return (
                <div key={month.month} className="flex flex-1 flex-col items-center gap-1">
                  <div
                    className="w-full rounded-t bg-emerald-600 transition-all hover:bg-emerald-700"
                    style={{ height: `${height}%` }}
                    title={`${month.month}: ₦${(month.revenue_kobo / 100).toLocaleString()}`}
                  />
                  <div className="text-xs text-zinc-500 dark:text-zinc-400">
                    {month.month.slice(5)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Revenue by Bill Type */}
        <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            <PieChart className="h-4 w-4" /> Revenue by Bill Type
          </h2>
          <div className="space-y-3">
            {byBillType.data?.map((item: { bill_name: string; revenue_kobo: number }) => {
              const maxRevenue = Math.max(...(byBillType.data?.map((i: { revenue_kobo: number }) => i.revenue_kobo) || [1]), 1);
              const width = (item.revenue_kobo / maxRevenue) * 100;
              return (
                <div key={item.bill_name}>
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-700 dark:text-zinc-300">{item.bill_name}</span>
                    <Money amountKobo={item.revenue_kobo} />
                  </div>
                  <div className="mt-1 h-2 rounded-full bg-zinc-100 dark:bg-zinc-800">
                    <div
                      className="h-full rounded-full bg-emerald-600"
                      style={{ width: `${width}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Tables Row */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Recent Payments */}
        <div className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <div className="border-b border-zinc-200 p-4 dark:border-zinc-800">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Recent Payments</h2>
          </div>
          <DataTable
            columns={paymentColumns}
            data={recentPayments.data || []}
            rowKey={(row) => row.id}
            emptyMessage="No recent payments"
          />
        </div>

        {/* Top Outstanding */}
        <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-4 text-sm font-semibold text-zinc-900 dark:text-zinc-100">Top Outstanding Members</h2>
          {topOutstanding.data?.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">No outstanding balances</p>
          ) : (
            <div className="space-y-3">
              {topOutstanding.data?.map((member: { membership_id: string; full_name: string; total_outstanding_kobo: number; bill_count: number }) => (
                <div key={member.membership_id} className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                      {member.full_name || "Unclaimed"}
                    </div>
                    <div className="text-xs text-zinc-500 dark:text-zinc-400">
                      {member.bill_count} bill{member.bill_count !== 1 ? "s" : ""}
                    </div>
                  </div>
                  <Money amountKobo={member.total_outstanding_kobo} className="text-sm font-semibold text-red-600 dark:text-red-400" />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
