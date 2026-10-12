import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyPaystackSignature, decryptPaystackKey, verifyPaystackTransaction } from "@/lib/paystack";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: { tenantToken: string } }
) {
  const supabaseAdmin = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // 1. Look up association by webhook token
  const { data: association, error: assocError } = await supabaseAdmin
    .from("associations")
    .select("id, fee_bearer")
    .eq("webhook_token", params.tenantToken)
    .single();

  if (assocError || !association) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // 2. Read raw body
  const rawBody = await req.text();
  const signature = req.headers.get("x-paystack-signature") || "";

  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 401 });
  }

  // 3. Decrypt Paystack secret key
  let secretKey: string;
  try {
    secretKey = await decryptPaystackKey(association.id);
  } catch (err) {
    console.error("Failed to decrypt Paystack key:", err);
    return NextResponse.json({ error: "Key not configured" }, { status: 500 });
  }

  // 4. Verify HMAC-SHA512 signature (timing-safe)
  const isValid = await verifyPaystackSignature(secretKey, rawBody, signature);
  if (!isValid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  // 5. Parse event
  let event: Record<string, unknown>;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const eventId = event.id as string;
  const eventType = event.event as string;

  if (!eventId) {
    return NextResponse.json({ error: "Missing event ID" }, { status: 400 });
  }

  // 6. Insert webhook event (idempotent via UNIQUE constraint)
  const { data: webhookEvent, error: insertError } = await supabaseAdmin
    .from("webhook_events")
    .insert({
      association_id: association.id,
      provider: "paystack",
      event_id: eventId,
      status: "received",
      payload_hash: await crypto.subtle
        .digest("SHA-256", new TextEncoder().encode(rawBody))
        .then((buf) => new Uint8Array(buf)),
      attempt_count: 1,
    })
    .select("id")
    .single();

  if (insertError) {
    if (insertError.code === "23505") {
      return NextResponse.json({ status: "duplicate" });
    }
    return NextResponse.json({ error: "Failed to insert event" }, { status: 500 });
  }

  // 7. Update to 'processing' with lock
  await supabaseAdmin
    .from("webhook_events")
    .update({
      status: "processing",
      locked_until: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    })
    .eq("id", webhookEvent.id);

  // 8. Process only charge.success events
  if (eventType !== "charge.success") {
    await supabaseAdmin
      .from("webhook_events")
      .update({ status: "processed", processed_at: new Date().toISOString() })
      .eq("id", webhookEvent.id);

    return NextResponse.json({ status: "ignored", event_type: eventType });
  }

  // 9. Re-verify via Paystack API (never trust webhook payload alone)
  const eventData = event.data as Record<string, unknown>;
  const reference = eventData.reference as string;

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
    await supabaseAdmin
      .from("webhook_events")
      .update({ status: "failed", attempt_count: 2 })
      .eq("id", webhookEvent.id);

    return NextResponse.json({ error: "Verification failed" }, { status: 500 });
  }

  // 10. Match amount/currency/reference
  const { data: payment } = await supabaseAdmin
    .from("payments")
    .select("id, membership_id, gross_kobo, net_kobo, status")
    .eq("association_id", association.id)
    .eq("payer_reference", reference)
    .eq("method", "paystack")
    .single();

  if (!payment) {
    await supabaseAdmin
      .from("webhook_events")
      .update({ status: "processed", processed_at: new Date().toISOString() })
      .eq("id", webhookEvent.id);

    return NextResponse.json({ status: "payment_not_found" });
  }

  // Amount mismatch: flag without issuing receipt
  if (verified.amount !== payment.gross_kobo || verified.currency !== "NGN") {
    await supabaseAdmin
      .from("payments")
      .update({
        suspicious_flag: true,
        suspicious_reason: `Webhook amount mismatch: expected ${payment.gross_kobo}, got ${verified.amount}`,
      })
      .eq("id", payment.id);

    await supabaseAdmin
      .from("webhook_events")
      .update({ status: "processed", processed_at: new Date().toISOString() })
      .eq("id", webhookEvent.id);

    return NextResponse.json({ status: "amount_mismatch" });
  }

  // 11. Call apply_provider_payment via service_role
  const { error: applyError } = await supabaseAdmin.rpc("apply_provider_payment", {
    p_event_id: eventId,
    p_reference: reference,
    p_amount_kobo: verified.amount,
    p_currency: verified.currency,
    p_fee_kobo: verified.fees,
    p_membership_id: payment.membership_id,
    p_allocations: "[]", // Would fetch from payment_allocations in production
  });

  if (applyError) {
    await supabaseAdmin
      .from("webhook_events")
      .update({ status: "failed", attempt_count: 2 })
      .eq("id", webhookEvent.id);

    return NextResponse.json({ error: "Failed to apply payment" }, { status: 500 });
  }

  // 12. Mark as processed
  await supabaseAdmin
    .from("webhook_events")
    .update({ status: "processed", processed_at: new Date().toISOString() })
    .eq("id", webhookEvent.id);

  return NextResponse.json({ status: "processed" });
}
