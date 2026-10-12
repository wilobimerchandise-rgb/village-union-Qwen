"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { getInviteInfoAction, acceptInviteAction } from "./actions";
import { Button } from "@/components/ui/button";

export default function InviteAcceptancePage() {
  const params = useParams();
  const token = params.token as string;

  const [step, setStep] = useState<"loading" | "info" | "otp" | "success" | "error">("loading");
  const [inviteInfo, setInviteInfo] = useState<{ associationName: string; role: string } | null>(null);
  const [otp, setOtp] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function load() {
      const result = await getInviteInfoAction(token);
      if (result.error) {
        setStep("error");
        setError(result.message || "Invalid or expired invitation");
      } else {
        setInviteInfo({ associationName: result.associationName || "", role: result.role || "" });
        setStep("info");
      }
    }
    load();
  }, [token]);

  async function handleRequestOtp() {
    if (!fullName) return;
    setLoading(true);
    setError("");
    // In production, this would trigger OTP send to the bound contact
    setStep("otp");
    setLoading(false);
  }

  async function handleAccept(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const result = await acceptInviteAction(token, otp, fullName);
    if (result.error) {
      setError(result.message || "Failed to accept invitation");
    } else {
      setStep("success");
    }
    setLoading(false);
  }

  if (step === "loading") {
    return (
      <div className="rounded-lg border border-zinc-200 bg-white p-6 text-center dark:border-zinc-800 dark:bg-zinc-900">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading invitation...</p>
      </div>
    );
  }

  if (step === "error") {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center dark:border-red-800 dark:bg-red-950/20">
        <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
      </div>
    );
  }

  if (step === "success") {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-6 text-center dark:border-emerald-800 dark:bg-emerald-950/20">
        <h2 className="text-lg font-semibold text-emerald-900 dark:text-emerald-100">
          Invitation Accepted
        </h2>
        <p className="mt-2 text-sm text-emerald-700 dark:text-emerald-300">
          You can now sign in to access your association.
        </p>
        <a href="/login" className="mt-4 inline-block text-sm font-medium text-emerald-600 hover:text-emerald-700 dark:text-emerald-400">
          Go to login →
        </a>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Accept Invitation</h1>

      {inviteInfo && (
        <div className="mt-4 rounded-md bg-zinc-50 p-3 dark:bg-zinc-800">
          <div className="text-sm text-zinc-700 dark:text-zinc-300">
            <strong>Association:</strong> {inviteInfo.associationName}
          </div>
          <div className="text-sm text-zinc-700 dark:text-zinc-300">
            <strong>Role:</strong> {inviteInfo.role.replace("_", " ")}
          </div>
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/20 dark:text-red-400">
          {error}
        </div>
      )}

      {step === "info" && (
        <div className="mt-6 space-y-4">
          <div>
            <label htmlFor="fullName" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Your Full Name
            </label>
            <input
              id="fullName"
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            />
          </div>
          <Button variant="primary" className="w-full" onClick={handleRequestOtp} loading={loading} disabled={!fullName}>
            Continue
          </Button>
        </div>
      )}

      {step === "otp" && (
        <form onSubmit={handleAccept} className="mt-6 space-y-4">
          <div className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400">
            An OTP has been sent to your registered contact.
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
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-center font-mono text-lg tracking-widest dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              placeholder="000000"
            />
          </div>
          <Button type="submit" variant="primary" className="w-full" loading={loading}>
            Accept Invitation
          </Button>
        </form>
      )}
    </div>
  );
}
