"use client";

import { useState } from "react";
import { loginAction } from "./actions";
import Link from "next/link";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const result = await loginAction(email, password);
      if (result.error) {
        setError("Invalid credentials or no active membership.");
      }
    } catch {
      setError("Invalid credentials or no active membership.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-6 text-center">
        <div className="mx-auto mb-3 h-10 w-10 rounded-lg bg-emerald-600" aria-hidden="true" />
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Sign in to ASSOCIET</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Multi-tenant financial OS for associations
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/20 dark:text-red-400">
            {error}
          </div>
        )}

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Password
          </label>
          <input
            id="password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {loading ? "Signing in..." : "Sign in"}
        </button>
      </form>

      <div className="mt-6 space-y-2 text-center text-sm">
        <Link href="/join" className="font-medium text-emerald-600 hover:text-emerald-700 dark:text-emerald-400">
          Join an association →
        </Link>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Closed registration. Contact your association administrator for staff access.
        </p>
      </div>
    </div>
  );
}
