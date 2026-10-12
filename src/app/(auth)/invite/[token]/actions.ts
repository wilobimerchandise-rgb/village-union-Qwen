"use server";

import { createClient } from "@/lib/supabase/server";

export async function getInviteInfoAction(token: string) {
  const supabase = createClient();

  // Hash the token and look it up (constant-time)
  const { data: invite, error } = await supabase
    .from("association_invitations")
    .select(`
      id,
      role,
      expires_at,
      status,
      associations(name)
    `)
    .eq("token_hash", await hashToken(token))
    .eq("status", "pending")
    .single();

  if (error || !invite) {
    return { error: true, message: "Invalid or expired invitation" };
  }

  // Check expiry
  if (new Date(invite.expires_at) < new Date()) {
    return { error: true, message: "This invitation has expired" };
  }

  return {
    error: false,
    associationName: invite.associations?.name || "Unknown",
    role: invite.role,
  };
}

export async function acceptInviteAction(token: string, otp: string, fullName: string) {
  const supabase = createClient();

  // In production, this would call a SECURITY DEFINER RPC that:
  // 1. Validates the token hash
  // 2. Validates the OTP against the bound contact
  // 3. Creates/updates the profile with the provided name
  // 4. Creates the membership with the bound role
  // 5. Marks the invitation as accepted

  // For now, we'll simulate the RPC call
  const { data, error } = await supabase.rpc("accept_staff_invite", {
    p_token: token,
    p_otp: otp,
  });

  if (error || data?.status === "error") {
    return { error: true, message: "Failed to accept invitation" };
  }

  return { error: false };
}

async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
