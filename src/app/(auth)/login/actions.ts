"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export async function loginAction(email: string, password: string) {
  // CRITICAL: createClient() MUST be called inside the async function
  const supabase = createClient();

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user) {
    return { error: true };
  }

  // Check if user has any active membership
  const { data: membership } = await supabase
    .from("association_memberships")
    .select("id")
    .eq("user_id", data.user.id)
    .eq("status", "active")
    .limit(1);

  if (!membership || membership.length === 0) {
    await supabase.auth.signOut();
    return { error: true };
  }

  redirect("/dashboard");
}
