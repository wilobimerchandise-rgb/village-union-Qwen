import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import { generateCSV } from "@/lib/reports/csv-generator";

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { reportType, associationId } = body as { reportType: string; associationId: string };

  if (!reportType || !associationId) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  let ctx;
  try {
    ctx = await getTenantContext(associationId);
  } catch {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  let data: unknown[] = [];
  let filename = "";

  switch (reportType) {
    case "revenue": {
      const { data: payments } = await supabase
        .from("payments")
        .select(`
          id,
          gross_kobo,
          fee_kobo,
          net_kobo,
          method,
          payer_reference,
          paid_at,
          accounting_date,
          status,
          association_memberships(profiles(full_name))
        `)
        .eq("association_id", ctx.associationId)
        .eq("status", "verified")
        .order("accounting_date", { ascending: false });

      data = payments || [];
      filename = `revenue-report-${new Date().toISOString().split("T")[0]}.csv`;
      break;
    }

    case "outstanding": {
      const { data: bills } = await supabase
        .from("bill_balances")
        .select(`
          bill_id,
          total_amount_kobo,
          paid_kobo,
          outstanding_kobo,
          member_bills(
            issued_at,
            bill_configs(name),
            financial_years(label)
          )
        `)
        .eq("association_id", ctx.associationId)
        .gt("outstanding_kobo", 0)
        .order("outstanding_kobo", { ascending: false });

      data = bills || [];
      filename = `outstanding-report-${new Date().toISOString().split("T")[0]}.csv`;
      break;
    }

    case "aging": {
      const { data: aging } = await supabase.rpc("get_aging_report", {
        p_association_id: ctx.associationId,
      });

      data = [aging];
      filename = `aging-report-${new Date().toISOString().split("T")[0]}.csv`;
      break;
    }

    case "audit-log": {
      const { data: logs } = await supabase
        .from("activity_logs")
        .select(`
          id,
          action,
          target_table,
          target_id,
          metadata,
          created_at
        `)
        .eq("association_id", ctx.associationId)
        .order("created_at", { ascending: false })
        .limit(1000);

      data = logs || [];
      filename = `audit-log-${new Date().toISOString().split("T")[0]}.csv`;
      break;
    }

    default:
      return NextResponse.json({ error: "Unknown report type" }, { status: 400 });
  }

  const csv = generateCSV(data);

  // Upload to storage
  const path = `${ctx.associationId}/reports/${filename}`;
  const { error: uploadError } = await supabase.storage
    .from("reports")
    .upload(path, csv, {
      contentType: "text/csv",
      upsert: true,
    });

  if (uploadError) {
    return NextResponse.json({ error: "Failed to generate report" }, { status: 500 });
  }

  // Create signed URL
  const { data: signedUrl } = await supabase.storage
    .from("reports")
    .createSignedUrl(path, 3600);

  return NextResponse.json({
    success: true,
    filename,
    downloadUrl: signedUrl?.signedUrl,
  });
}
