import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import { generateReceiptPDF } from "@/lib/pdf/receipt";

export async function GET(
  req: NextRequest,
  { params }: { params: { receiptId: string } }
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Fetch receipt with association context
  const { data: receipt, error } = await supabase
    .from("receipts")
    .select(`
      id,
      receipt_number,
      amount_kobo,
      verification_token,
      pdf_status,
      pdf_path,
      payments(
        membership_id,
        method,
        payer_reference,
        paid_at,
        accounting_date,
        payment_allocations(
          amount_kobo,
          member_bills(bill_configs(name))
        )
      ),
      associations(
        name,
        address,
        cac_number
      )
    `)
    .eq("id", params.receiptId)
    .single();

  if (error || !receipt) {
    return NextResponse.json({ error: "Receipt not found" }, { status: 404 });
  }

  // Verify tenant context
  try {
    await getTenantContext(receipt.associations.id);
  } catch {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  // If PDF already generated, return signed URL
  if (receipt.pdf_status === "ready" && receipt.pdf_path) {
    const { data: signedUrl } = await supabase.storage
      .from("receipts")
      .createSignedUrl(receipt.pdf_path, 300);

    if (signedUrl) {
      return NextResponse.redirect(signedUrl.signedUrl);
    }
  }

  // Generate PDF
  const payment = receipt.payments;
  const association = receipt.associations;

  const pdfData = {
    receiptNumber: receipt.receipt_number,
    associationName: association.name,
    associationAddress: association.address || "",
    cacNumber: association.cac_number || undefined,
    memberName: "Member", // Would fetch from profiles in production
    unitLabel: "Unit", // Would fetch from unit_occupancies in production
    amountKobo: receipt.amount_kobo,
    allocations: payment.payment_allocations.map((a: Record<string, unknown>) => ({
      billName: (a.member_bills as Record<string, unknown>)?.bill_configs
        ? ((a.member_bills as Record<string, unknown>).bill_configs as Record<string, unknown>).name as string
        : "Bill",
      amountKobo: a.amount_kobo as number,
    })),
    method: payment.method,
    payerReference: payment.payer_reference || "",
    paidAt: payment.paid_at,
    verifiedAt: payment.accounting_date,
    verificationToken: receipt.verification_token,
    appUrl: process.env.NEXT_PUBLIC_APP_URL || "https://associt.com",
  };

  try {
    const pdfBytes = await generateReceiptPDF(pdfData);
    const path = `${receipt.associations.id}/receipts/${receipt.id}.pdf`;

    const { error: uploadError } = await supabase.storage
      .from("receipts")
      .upload(path, pdfBytes, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (uploadError) throw uploadError;

    await supabase
      .from("receipts")
      .update({ pdf_status: "ready", pdf_path: path })
      .eq("id", receipt.id);

    const { data: signedUrl } = await supabase.storage
      .from("receipts")
      .createSignedUrl(path, 300);

    if (signedUrl) {
      return NextResponse.redirect(signedUrl.signedUrl);
    }

    return new Response(pdfBytes, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="receipt-${receipt.receipt_number}.pdf"`,
      },
    });
  } catch (err) {
    await supabase
      .from("receipts")
      .update({ pdf_status: "failed" })
      .eq("id", receipt.id);

    return NextResponse.json({ error: "Failed to generate PDF" }, { status: 500 });
  }
}
