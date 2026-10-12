import { createClient } from "@/lib/supabase/server";

export interface TenantContext {
  userId: string;
  associationId: string;
  membershipId: string;
  role: string;
}

export async function getTenantContext(associationId: string): Promise<TenantContext> {
  const supabase = createClient();
  
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (!user || userError) throw new Error("Unauthorized");

  const { data: membership, error: membershipError } = await supabase
    .from("association_memberships")
    .select("id, association_id, role, status")
    .eq("user_id", user.id)
    .eq("association_id", associationId)
    .eq("status", "active")
    .single();

  if (membershipError || !membership) {
    throw new Error("Access denied: No active membership in this association");
  }

  return {
    userId: user.id,
    associationId: membership.association_id,
    membershipId: membership.id,
    role: membership.role,
  };
}
