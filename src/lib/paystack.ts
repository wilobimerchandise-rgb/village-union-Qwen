import { createClient } from "@supabase/supabase-js";

const enc = new TextEncoder();

export async function verifyPaystackSignature(
  secret: string,
  body: string,
  signature: string
): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"]
  );

  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  const expected = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  if (expected.length !== signature.length) return false;
  
  const a = enc.encode(expected);
  const b = enc.encode(signature);
  
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ b[i];
  }
  return result === 0;
}

export async function decryptPaystackKey(associationId: string): Promise<string> {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data, error } = await supabase.rpc("decrypt_paystack_key", {
    p_association_id: associationId,
  });

  if (error) throw new Error(`Failed to decrypt Paystack key: ${error.message}`);
  return data as string;
}

export async function initializePaystackTransaction(
  secretKey: string,
  params: {
    email: string;
    amountKobo: number;
    reference: string;
    metadata?: Record<string, unknown>;
  }
): Promise<{ authorization_url: string; reference: string }> {
  const response = await fetch("https://api.paystack.co/transaction/initialize", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: params.email,
      amount: params.amountKobo,
      reference: params.reference,
      currency: "NGN",
      metadata: params.metadata || {},
    }),
  });

  const data = await response.json();
  if (!data.status) throw new Error(data.message || "Paystack initialization failed");

  return {
    authorization_url: data.data.authorization_url,
    reference: data.data.reference,
  };
}

export async function verifyPaystackTransaction(
  secretKey: string,
  reference: string
): Promise<{
  status: string;
  amount: number;
  currency: string;
  reference: string;
  fees: number;
  paid_at: string;
}> {
  const response = await fetch(
    `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
    { headers: { Authorization: `Bearer ${secretKey}` } }
  );

  const data = await response.json();
  if (!data.status) throw new Error(data.message || "Paystack verification failed");

  return {
    status: data.data.status,
    amount: data.data.amount,
    currency: data.data.currency,
    reference: data.data.reference,
    fees: data.data.fees || 0,
    paid_at: data.data.paid_at,
  };
}

export function computePaystackFee(
  amountKobo: number,
  feeBearer: "member" | "association"
): { grossKobo: number; feeKobo: number; netKobo: number } {
  const baseFee = Math.round(amountKobo * 0.015) + 10000;
  const feeKobo = Math.min(baseFee, 200000);

  if (feeBearer === "member") {
    return { grossKobo: amountKobo + feeKobo, feeKobo, netKobo: amountKobo };
  } else {
    return { grossKobo: amountKobo, feeKobo, netKobo: amountKobo - feeKobo };
  }
}
