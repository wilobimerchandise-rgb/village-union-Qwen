"use server";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export async function loginAction(email: string, password: string) {
  // 1. Get cookie store INSIDE the server action
  const cookieStore = cookies();

  // 2. Create client inline to avoid any module caching issues
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: any) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch (error) {
            // Ignore errors during server action execution
          }
        },
        remove(name: string, options: any) {
          try {
            cookieStore.set({ name, value: "", ...options });
          } catch (error) {
            // Ignore errors during server action execution
          }
        },
      },
    }
  );

  // 3. Attempt login
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user) {
    return { error: "Invalid credentials or no active membership." };
  }

  // 4. Check for active membership
  const { data: membership } = await supabase
    .from("association_memberships")
    .select("association_id")
    .eq("user_id", data.user.id)
    .eq("status", "active")
    .limit(1)
    .single();

  if (!membership) {
    await supabase.auth.signOut();
    return { error: "Invalid credentials or no active membership." };
  }

  // 5. Redirect to the specific association dashboard
  redirect(`/${membership.association_id}/dashboard`);
}
