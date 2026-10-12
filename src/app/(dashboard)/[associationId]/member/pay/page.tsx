"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Money } from "@/components/ui/money";
import { CheckCircle2, Copy, Upload } from "lucide-react";
import { verifyMagicBytes, computeSHA256, compressImage } from "@/lib/upload";

interface Bill {
  bill_id: string;
  total_amount_kobo: number;
  outstanding_kobo: number;
  member_bills: {
    bill_configs: { name: string };
    financial_years: { label: string };
  };
}

interface BankAccount {
  id: string;
  bank_name: string;
  account_name: string;
  is_default: boolean;
}

export default function MemberPayPage({
  params,
}: {
  params: { associationId: string };
}) {
  const [bills, setBills] = useState<Bill[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [selectedBills, setSelectedBills] = useState<Set<string>>(new Set());
  const [payerReference, setPayerReference] = useState("");
  const [paidAt, setPaidAt] = useState(new Date().toISOString().split("T")[0]);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const supabase = createClient();

  useEffect(() => {
    async function fetchData() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: memberships } = await supabase
        .from("association_memberships")
        .select("id")
        .eq("user_id", user.id)
        .eq("association_id", params.associationId)
        .eq("status", "active")
        .single();

      if (!memberships) return;

      const { data: billsData } = await supabase
        .from("bill_balances")
        .select("bill_id, total_amount_kobo, outstanding_kobo, member_bills(bill_configs(name), financial_years(label))")
        .eq("association_id", params.associationId)
        .gt("outstanding_kobo", 0);

      setBills(billsData || []);

      const { data: bankData } = await supabase
        .from("bank_accounts")
        .select("id, bank_name, account_name, is_default")
        .eq("association_id", params.associationId);

      setBankAccounts(bankData || []);
    }
    fetchData();
  }, [params.associationId, supabase]);

  const totalSelected = bills
    .filter((b) => selectedBills.has(b.bill_id))
    .reduce((sum, b) => sum + b.outstanding_kobo, 0);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    if (!verifyMagicBytes(bytes, file.type)) {
      setError("Invalid file type. Only JPEG, PNG, WebP, or PDF allowed.");
      setProofFile(null);
      return;
    }

    setError(null);
    setProofFile(file);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!proofFile || selectedBills.size === 0) return;

    setLoading(true);
    setError(null);

    try {
      const processedFile = proofFile.type.startsWith("image/")
        ? await compressImage(proofFile)
        : proofFile;

      const clientHash = await computeSHA256(processedFile);
      const path = `${params.associationId}/${Date.now()}-${processedFile.name}`;

      const { error: uploadError } = await supabase.storage
        .from("payment-proofs")
        .upload(path, processedFile, {
          cacheControl: "3600",
          upsert: false,
          contentType: processedFile.type,
        });

      if (uploadError) throw new Error("Failed to upload proof");

      const { error: rpcError } = await supabase.rpc("submit_bank_transfer_payment", {
        p_allocations: JSON.stringify(
          bills
            .filter((b) => selectedBills.has(b.bill_id))
            .map((b) => ({ bill_id: b.bill_id, amount_kobo: b.outstanding_kobo }))
        ),
        p_proof_path: path,
        p_proof_sha256: clientHash,
        p_payer_reference: payerReference,
        p_paid_at: paidAt,
      });

      if (rpcError) throw new Error(rpcError.message);

      setSuccess(true);
      setSelectedBills(new Set());
      setPayerReference("");
      setProofFile(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit payment");
    } finally {
      setLoading(false);
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
  }

  if (success) {
    return (
      <div className="mx-auto max-w-2xl p-8">
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-6 dark:border-emerald-800 dark:bg-emerald-950/20">
          <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
          <h2 className="mt-4 text-center text-xl font-semibold text-emerald-900 dark:text-emerald-100">
            Payment Submitted
          </h2>
          <p className="mt-2 text-center text-sm text-emerald-700 dark:text-emerald-300">
            Your payment is pending verification.
          </p>
          <Button className="mt-6 w-full" variant="primary" onClick={() => setSuccess(false)}>
            Submit Another Payment
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">Make a Payment</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Select bills, transfer to the association account, then upload proof.
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/20 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Outstanding Bills */}
      <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">Outstanding Bills</h2>
        {bills.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">No outstanding bills.</p>
        ) : (
          <div className="space-y-2">
            {bills.map((bill) => (
              <label
                key={bill.bill_id}
                className="flex cursor-pointer items-center gap-3 rounded-md border border-zinc-200 p-3 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                <input
                  type="checkbox"
                  checked={selectedBills.has(bill.bill_id)}
                  onChange={(e) => {
                    const next = new Set(selectedBills);
                    if (e.target.checked) next.add(bill.bill_id);
                    else next.delete(bill.bill_id);
                    setSelectedBills(next);
                  }}
                  className="h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
                />
                <div className="flex-1">
                  <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    {bill.member_bills.bill_configs.name} {bill.member_bills.financial_years.label}
                  </div>
                </div>
                <div className="text-right">
                  <Money amountKobo={bill.outstanding_kobo} className="text-sm font-semibold" />
                </div>
              </label>
            ))}
            <div className="flex items-center justify-between border-t border-zinc-200 pt-3 dark:border-zinc-800">
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Total Selected</span>
              <Money amountKobo={totalSelected} className="text-lg font-semibold" />
            </div>
          </div>
        )}
      </div>

      {/* Bank Details */}
      <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">Transfer to Association Account</h2>
        {bankAccounts.map((account) => (
          <div key={account.id} className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-zinc-500 dark:text-zinc-400">Bank</span>
              <div className="flex items-center gap-2">
                <span className="font-medium text-zinc-900 dark:text-zinc-100">{account.bank_name}</span>
                <button onClick={() => copyToClipboard(account.bank_name)} className="rounded p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800" aria-label="Copy bank name">
                  <Copy className="h-3 w-3" />
                </button>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-zinc-500 dark:text-zinc-400">Account Name</span>
              <div className="flex items-center gap-2">
                <span className="font-medium text-zinc-900 dark:text-zinc-100">{account.account_name}</span>
                <button onClick={() => copyToClipboard(account.account_name)} className="rounded p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800" aria-label="Copy account name">
                  <Copy className="h-3 w-3" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Payment Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">Payment Details</h2>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">Payer Reference</label>
              <input
                type="text"
                value={payerReference}
                onChange={(e) => setPayerReference(e.target.value)}
                required
                className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">Payment Date</label>
              <input
                type="date"
                value={paidAt}
                onChange={(e) => setPaidAt(e.target.value)}
                required
                className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">Proof of Payment</label>
              <label className="mt-1 flex cursor-pointer items-center gap-2 rounded-md border border-zinc-300 px-4 py-2 text-sm hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800">
                <Upload className="h-4 w-4" />
                <span>{proofFile ? proofFile.name : "Choose file"}</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>
            </div>
          </div>
        </div>

        <Button type="submit" variant="primary" size="lg" className="w-full" disabled={selectedBills.size === 0 || !proofFile || loading} loading={loading}>
          Submit Payment
        </Button>
      </form>
    </div>
  );
}
