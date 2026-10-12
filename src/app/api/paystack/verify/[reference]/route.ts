import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import { decryptPaystackKey, verifyPaystackTransaction } from "@/lib/paystack";

export async function GET(
  req: NextRequest,
  { params }: { params: { reference: string } }
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const reference = params.reference;

  // Fetch payment by reference
  const { data: payment, error: paymentError } = await supabase
    .from("payments")
    .select("id, association_id, membership_id, gross_kobo, net_kobo, fee_kobo, status")
    .eq("payer_reference", reference)
    .eq("method", "paystack")
    .single();

  if (paymentError || !payment) {
    return NextResponse.json({ error: "Payment not found" }, { status: 404 });
  }

  // Validate tenant context
  let ctx;
  try {
    ctx = await getTenantContext(payment.association_id);
  } catch {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  // Only the payment owner can verify
  if (ctx.membershipId !== payment.membership_id) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  // If already verified, return status
  if (payment.status === "verified") {
    return NextResponse.json({ status: "verified", payment_id: payment.id });
  }

  // Decrypt Paystack key
  let secretKey: string;
  try {
    secretKey = await decryptPaystackKey(ctx.associationId);
  } catch (err) {
    return NextResponse.json({ error: "Paystack not configured" }, { status: 500 });
  }

  // Verify via Paystack API
  let verified: {
    status: string;
    amount: number;
    currency: string;
    reference: string;
    fees: number;
    paid_at: string;
  };

  try {
    verified = await verifyPaystackTransaction(secretKey, reference);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Verification failed" },
      { status: 500 }
    );
  }

  // Check status
  if (verified.status !== "success") {
    await supabase
      .from("payments")
      .update({ status: "failed" })
      .eq("id", payment.id);

    return NextResponse.json({ status: "failed", payment_id: payment.id });
  }

  // Match amount/currency
  if (verified.amount !== payment.gross_kobo || verified.currency !== "NGN") {
    await supabase
      .from("payments")
      .update({
        suspicious_flag: true,
        suspicious_reason: `Amount mismatch: expected ${payment.gross_kobo}, got ${verified.amount}`,
      })
      .eq("id", payment.id);

    return NextResponse.json({ status: "mismatch", payment_id: payment.id });
  }

  // Fetch allocations
  const { data: allocations } = await supabase
    .from("payment_allocations")
    .select("bill_id, amount_kobo")
    .eq("payment_id", payment.id);

  // Call apply_provider_payment
  const { error: applyError } = await supabase.rpc("apply_provider_payment", {
    p_event_id: `callback-${reference}`,
    p_reference: reference,
    p_amount_kobo: verified.amount,
    p_currency: verified.currency,
    p_fee_kobo: verified.fees,
    p_membership_id: payment.membership_id,
    p_allocations: allocations || [],
  });

  if (applyError) {
    return NextResponse.json({ error: "Failed to apply payment" }, { status: 500 });
  }

  return NextResponse.json({ status: "verified", payment_id: payment.id });
}
