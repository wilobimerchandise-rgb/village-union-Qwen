import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Fetch user's profile and first active membership for context
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .single();

  const { data: memberships } = await supabase
    .from("association_memberships")
    .select("association_id, role, associations(name)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1);

  const membership = memberships?.[0];
  const associationName = membership?.associations?.name || "Association";
  const userRole = membership?.role || "member";
  const userName = profile?.full_name || "User";

  return (
    <AppShell associationName={associationName} userName={userName} userRole={userRole}>
      {children}
    </AppShell>
  );
}
