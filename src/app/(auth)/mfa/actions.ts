"use server";

import { createClient } from "@/lib/supabase/server";

export async function enrollMFAAction() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: true, message: "Unauthorized" };

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
  });

  if (error || !data) {
    return { error: true, message: "Failed to enroll MFA" };
  }

  return {
    error: false,
    factorId: data.id,
    qrCode: data.totp.qr_code,
    secret: data.totp.secret,
  };
}

export async function verifyMFAAction(factorId: string, code: string) {
  const supabase = createClient();

  const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
    factorId,
  });

  if (challengeError || !challengeData) {
    return { error: true, message: "Failed to initiate challenge" };
  }

  const { error: verifyError } = await supabase.auth.mfa.verify({
    factorId,
    challengeId: challengeData.id,
    code,
  });

  if (verifyError) {
    return { error: true, message: "Invalid verification code" };
  }

  return { error: false };
}
