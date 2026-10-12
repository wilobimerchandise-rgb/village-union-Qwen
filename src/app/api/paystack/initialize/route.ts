import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import { decryptPaystackKey, initializePaystackTransaction, computePaystackFee } from "@/lib/paystack";
import { z } from "zod";

const initializeSchema = z.object({
  associationId: z.string().uuid(),
  amountKobo: z.number().int().positive(),
  email: z.string().email(),
  allocations: z.array(z.object({
    bill_id: z.string().uuid(),
    amount_kobo: z.number().int().positive(),
  })),
});

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

  const parsed = initializeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }

  const { associationId, amountKobo, email, allocations } = parsed.data;

  // Validate tenant context
  let ctx;
  try {
    ctx = await getTenantContext(associationId);
  } catch {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  // Fetch association settings
  const { data: association } = await supabase
    .from("associations")
    .select("fee_bearer")
    .eq("id", ctx.associationId)
    .single();

  if (!association) {
    return NextResponse.json({ error: "Association not found" }, { status: 404 });
  }

  // Compute fee
  const { grossKobo, feeKobo, netKobo } = computePaystackFee(
    amountKobo,
    association.fee_bearer as "member" | "association"
  );

  // Decrypt Paystack key
  let secretKey: string;
  try {
    secretKey = await decryptPaystackKey(ctx.associationId);
  } catch (err) {
    return NextResponse.json({ error: "Paystack not configured" }, { status: 500 });
  }

  // Generate unique reference
  const reference = `ASSOCIET-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  // Initialize Paystack transaction
  try {
    const result = await initializePaystackTransaction(secretKey, {
      email,
      amountKobo: grossKobo,
      reference,
      metadata: {
        association_id: ctx.associationId,
        membership_id: ctx.membershipId,
        allocations,
        fee_bearer: association.fee_bearer,
      },
    });

    // Create pending payment record
    const { error: insertError } = await supabase.from("payments").insert({
      association_id: ctx.associationId,
      membership_id: ctx.membershipId,
      method: "paystack",
      gross_kobo: grossKobo,
      fee_kobo: feeKobo,
      net_kobo: netKobo,
      payer_reference: reference,
      status: "initiated",
    });

    if (insertError) {
      return NextResponse.json({ error: "Failed to create payment" }, { status: 500 });
    }

    return NextResponse.json({
      authorization_url: result.authorization_url,
      reference,
      gross_kobo: grossKobo,
      fee_kobo: feeKobo,
      net_kobo: netKobo,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Paystack initialization failed" },
      { status: 500 }
    );
  }
}
