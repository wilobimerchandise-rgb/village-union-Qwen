import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";

export async function GET(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  // Rate limit: 10 requests per minute per IP
  const ip = req.headers.get("x-forwarded-for") || "unknown";
  const rateLimit = checkRateLimit(`verify:${ip}`, 10, 60 * 1000);

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rateLimit.resetAt - Date.now()) / 1000)) } }
    );
  }

  const supabase = createClient();

  // Constant-time lookup (fetch all and compare in JS to avoid timing attacks)
  const { data: receipts } = await supabase
    .from("receipts")
    .select(`
      id,
      receipt_number,
      amount_kobo,
      revoked_at,
      revocation_reason,
      associations(
        name
      ),
      payments(
        paid_at,
        payment_allocations(
          member_bills(bill_configs(name))
        )
      )
    `)
    .limit(1000);

  // Find matching token (constant-time comparison)
  const tokenBuffer = Buffer.from(params.token, "hex");
  let matchedReceipt = null;

  for (const receipt of receipts || []) {
    const receiptTokenBuffer = Buffer.from(receipt.verification_token, "hex");
    if (
      tokenBuffer.length === receiptTokenBuffer.length &&
      Buffer.compare(tokenBuffer, receiptTokenBuffer) === 0
    ) {
      matchedReceipt = receipt;
      break;
    }
  }

  if (!matchedReceipt) {
    return NextResponse.json({
      status: "NOT_FOUND",
      message: "Receipt not found",
    });
  }

  const payment = matchedReceipt.payments;
  const allocations = payment.payment_allocations.map((a: Record<string, unknown>) => ({
    billName: (a.member_bills as Record<string, unknown>)?.bill_configs
      ? ((a.member_bills as Record<string, unknown>).bill_configs as Record<string, unknown>).name as string
      : "Bill",
  }));

  const response = {
    status: matchedReceipt.revoked_at ? "REVOKED" : "VALID",
    association: matchedReceipt.associations.name,
    receiptNumber: matchedReceipt.receipt_number,
    amountKobo: matchedReceipt.amount_kobo,
    paidAt: payment.paid_at,
    purpose: allocations.map((a: { billName: string }) => a.billName).join(", "),
    revokedAt: matchedReceipt.revoked_at,
    revocationReason: matchedReceipt.revocation_reason,
  };

  return NextResponse.json(response);
}
