"use server";

import { createClient } from "@/lib/supabase/server";

export async function initiateClaimAction(code: string, unitLabel: string) {
  const supabase = createClient();

  // Calls the Phase 1D.6 RPC: public.initiate_member_claim
  // This RPC returns identical generic errors for all failures
  const { data, error } = await supabase.rpc("initiate_member_claim", {
    p_code: code,
    p_unit_label: unitLabel,
  });

  if (error || data?.status === "error") {
    return { error: true };
  }
  return { error: false };
}

export async function verifyOtpAction(code: string, unitLabel: string, otp: string) {
  const supabase = createClient();

  // Calls the Phase 1D.6 RPC: public.verify_member_claim_otp
  const { data, error } = await supabase.rpc("verify_member_claim_otp", {
    p_code: code,
    p_unit_label: unitLabel,
    p_otp: otp,
  });

  if (error || data?.status === "error") {
    return { error: true };
  }
  return { error: false };
}
