"use client";

import { useState } from "react";
import { enrollMFAAction, verifyMFAAction } from "./actions";
import { Button } from "@/components/ui/button";

export default function MFAEnrollmentPage() {
  const [step, setStep] = useState<"enroll" | "verify">("enroll");
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleEnroll() {
    setLoading(true);
    setError("");
    const result = await enrollMFAAction();
    if (result.error) {
      setError(result.message || "Failed to enroll MFA");
    } else {
      setQrCode(result.qrCode || null);
      setFactorId(result.factorId || null);
      setSecret(result.secret || null);
      setStep("verify");
    }
    setLoading(false);
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!factorId) return;
    setLoading(true);
    setError("");
    const result = await verifyMFAAction(factorId, code);
    if (result.error) {
      setError(result.message || "Invalid verification code");
    } else {
      window.location.href = "/dashboard";
    }
    setLoading(false);
  }

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
        Set up Multi-Factor Authentication
      </h1>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        MFA is mandatory for staff and platform administrators.
      </p>

      {error && (
        <div className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/20 dark:text-red-400">
          {error}
        </div>
      )}

      {step === "enroll" ? (
        <Button className="mt-6 w-full" variant="primary" onClick={handleEnroll} loading={loading}>
          Enroll Authenticator App
        </Button>
      ) : (
        <form onSubmit={handleVerify} className="mt-6 space-y-4">
          {qrCode && (
            <div className="flex justify-center">
              <img src={qrCode} alt="MFA QR Code" className="rounded border border-zinc-200 dark:border-zinc-700" />
            </div>
          )}
          {secret && (
            <div className="rounded-md bg-zinc-50 p-3 text-xs dark:bg-zinc-800">
              <div className="font-medium text-zinc-700 dark:text-zinc-300">Manual entry key:</div>
              <code className="mt-1 block break-all font-mono text-zinc-900 dark:text-zinc-100">{secret}</code>
            </div>
          )}
          <div>
            <label htmlFor="code" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Verification Code
            </label>
            <input
              id="code"
              type="text"
              required
              maxLength={6}
              pattern="[0-9]{6}"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm tracking-widest focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              placeholder="000000"
            />
          </div>
          <Button type="submit" variant="primary" className="w-full" loading={loading}>
            Verify and Complete Setup
          </Button>
        </form>
      )}
    </div>
  );
}
