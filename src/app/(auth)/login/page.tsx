"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const supabase = createClient();

    // 1. Sign in
    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    console.log("Sign In Result:", { data, error: signInError });

    if (signInError || !data.user) {
      setError(signInError?.message || "Invalid credentials.");
      setLoading(false);
      return;
    }

    // 2. Use the secure RPC function to bypass RLS stack depth issues
    const { data: activeAssocId, error: membershipError } = await supabase
      .rpc("get_active_association_id");

    console.log("RPC Membership Check Result:", { activeAssocId, error: membershipError });

    if (membershipError || !activeAssocId) {
      console.error("Membership Check Failed:", membershipError);
      setError("No active membership found. Contact your administrator.");
      await supabase.auth.signOut();
      setLoading(false);
      return;
    }

    // 3. Success! Redirect to the specific association dashboard
    console.log("Redirecting to:", `/${activeAssocId}/dashboard`);
    router.push(`/${activeAssocId}/dashboard`);
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8 bg-zinc-50">
      <div className="w-full max-w-md space-y-8 bg-white p-8 rounded-lg shadow-sm border border-zinc-200">
        <div className="text-center">
          <h2 className="text-2xl font-bold tracking-tight text-zinc-900">Sign in to ASSOCIET</h2>
          <p className="mt-2 text-sm text-zinc-600">Multi-tenant financial OS for associations</p>
        </div>
        
        {error && (
          <div className="rounded-md bg-red-50 p-4 border border-red-200">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label htmlFor="email" className="sr-only">Email</label>
              <input
                id="email"
                name="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="relative block w-full rounded-md border-0 py-2 px-3 text-gray-900 ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-emerald-600 sm:text-sm sm:leading-6"
                placeholder="Email address"
              />
            </div>
            <div>
              <label htmlFor="password" className="sr-only">Password</label>
              <input
                id="password"
                name="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="relative block w-full rounded-md border-0 py-2 px-3 text-gray-900 ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-emerald-600 sm:text-sm sm:leading-6"
                placeholder="Password"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="group relative flex w-full justify-center rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 disabled:opacity-50 transition-colors"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </div>
    </main>
  );
}
