"use client";

import { useState } from "react";
import { initiateClaimAction, verifyOtpAction } from "./actions";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function JoinPage() {
  const [step, setStep] = useState<"code" | "otp" | "success">("code");
  const [code, setCode] = useState("");
  const [unitLabel, setUnitLabel] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleInitiate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const result = await initiateClaimAction(code, unitLabel);
    if (result.error) {
      // Generic failure - never reveal whether code/unit exists
      setError("Invalid code or unit.");
    } else {
      setStep("otp");
    }
    setLoading(false);
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const result = await verifyOtpAction(code, unitLabel, otp);
    if (result.error) {
      setError("Invalid code, unit, or OTP.");
    } else {
      setStep("success");
    }
    setLoading(false);
  }

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-6 text-center">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Join your Association</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Enter your association code and unit to get started
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/20 dark:text-red-400">
          {error}
        </div>
      )}

      {step === "code" && (
        <form onSubmit={handleInitiate} className="space-y-4">
          <div>
            <label htmlFor="code" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Association Join Code
            </label>
            <input
              id="code"
              type="text"
              required
              placeholder="SHORTCODE-XXXX-XXXX"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 font-mono text-sm uppercase focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            />
          </div>
          <div>
            <label htmlFor="unit" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Unit Label (as shown on your roster)
            </label>
            <input
              id="unit"
              type="text"
              required
              placeholder="e.g., Block A, Flat 2"
              value={unitLabel}
              onChange={(e) => setUnitLabel(e.target.value)}
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            />
          </div>
          <Button type="submit" variant="primary" className="w-full" loading={loading}>
            Request OTP
          </Button>
        </form>
      )}

      {step === "otp" && (
        <form onSubmit={handleVerify} className="space-y-4">
          <div className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400">
            An OTP has been sent to the contact already registered for your unit.
          </div>
          <div>
            <label htmlFor="otp" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Enter OTP
            </label>
            <input
              id="otp"
              type="text"
              required
              maxLength={6}
              pattern="[0-9]{6}"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-center font-mono text-lg tracking-widest focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              placeholder="000000"
            />
          </div>
          <Button type="submit" variant="primary" className="w-full" loading={loading}>
            Verify and Submit Claim
          </Button>
        </form>
      )}

      {step === "success" && (
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
            <svg className="h-6 w-6 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Claim Submitted</h2>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            An officer will review and approve your request. You will receive an email once approved.
          </p>
          <Link href="/login" className="mt-6 inline-block text-sm font-medium text-emerald-600 hover:text-emerald-700 dark:text-emerald-400">
            Return to login →
          </Link>
        </div>
      )}

      <div className="mt-6 text-center text-sm">
        <Link href="/login" className="text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200">
          ← Already have an account? Sign in
        </Link>
      </div>
    </div>
  );
}
