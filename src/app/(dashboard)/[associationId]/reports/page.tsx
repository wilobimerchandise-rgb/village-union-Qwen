import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, Download, Clock, CheckCircle2 } from "lucide-react";

export default async function ReportsPage({
  params,
}: {
  params: { associationId: string };
}) {
  const ctx = await getTenantContext(params.associationId);
  const supabase = createClient();

  const { data: jobs } = await supabase
    .from("report_jobs")
    .select("id, report_type, parameters, file_path, status, created_at, expires_at")
    .eq("association_id", ctx.associationId)
    .eq("created_by", ctx.membershipId)
    .order("created_at", { ascending: false });

  const reportTypes = [
    { id: "revenue", name: "Revenue Report", description: "All verified payments with amounts and dates" },
    { id: "outstanding", name: "Outstanding Bills", description: "All unpaid or partially paid bills" },
    { id: "aging", name: "Aging Report", description: "Outstanding amounts grouped by age" },
    { id: "audit-log", name: "Audit Log", description: "All activity logs for the association" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">Reports</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Generate and download reports for your association
        </p>
      </div>

      {/* Available Reports */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {reportTypes.map((report) => (
          <div key={report.id} className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-start gap-3">
              <FileText className="h-5 w-5 flex-shrink-0 text-emerald-600 dark:text-emerald-400" />
              <div className="flex-1">
                <h3 className="font-medium text-zinc-900 dark:text-zinc-100">{report.name}</h3>
                <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{report.description}</p>
                <Button variant="outline" size="sm" className="mt-3">
                  <Download className="h-4 w-4" /> Generate CSV
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Recent Report Jobs */}
      <div className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="border-b border-zinc-200 p-4 dark:border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Recent Reports</h2>
        </div>
        {(!jobs || jobs.length === 0) ? (
          <div className="p-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
            No reports generated yet
          </div>
        ) : (
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {jobs.map((job) => (
              <div key={job.id} className="flex items-center justify-between p-4">
                <div>
                  <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{job.report_type}</div>
                  <div className="text-xs text-zinc-500 dark:text-zinc-400">
                    {new Date(job.created_at).toLocaleString("en-NG")}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={job.status === "completed" ? "verified" : "pending"}>
                    {job.status === "completed" ? <CheckCircle2 className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                    {job.status}
                  </Badge>
                  {job.file_path && (
                    <Button variant="ghost" size="sm">
                      <Download className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
