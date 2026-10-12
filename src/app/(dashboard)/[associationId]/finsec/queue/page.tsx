"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Money } from "@/components/ui/money";
import { AlertTriangle, CheckCircle2, XCircle, Clock, Flag } from "lucide-react";

interface QueueItem {
  id: string;
  gross_kobo: number;
  status: string;
  payer_reference: string;
  proof_path: string;
  paid_at: string;
  expires_at: string | null;
  rejection_reason: string | null;
  suspicious_flag: boolean;
  suspicious_reason: string | null;
  duplicate_proof_warning: boolean;
  is_large_payment: boolean;
  has_duplicate_proof: boolean;
  membership_id: string;
  association_memberships: {
    profiles: { full_name: string };
    unit_occupancies: { units: { label: string } }[];
  };
  payment_allocations: {
    amount_kobo: number;
    status: string;
    member_bills: {
      bill_configs: { name: string };
      financial_years: { label: string };
    };
  }[];
  bank_statement_lines: {
    id: string;
    statement_date: string;
    amount_kobo: number;
    reference: string;
  }[];
}

export default function FinSecQueuePage({
  params,
}: {
  params: { associationId: string };
}) {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [showRejectModal, setShowRejectModal] = useState(false);

  const supabase = createClient();

  const fetchQueue = useCallback(async () => {
    try {
      const { data } = await supabase
        .from("payments")
        .select(`
          id,
          gross_kobo,
          fee_kobo,
          net_kobo,
          status,
          payer_reference,
          proof_path,
          proof_sha256,
          paid_at,
          accounting_date,
          expires_at,
          rejection_reason,
          suspicious_flag,
          suspicious_reason,
          duplicate_proof_warning,
          created_at,
          membership_id,
          association_memberships(
            profiles(full_name),
            unit_occupancies(units(label))
          ),
          payment_allocations(
            amount_kobo,
            status,
            member_bills(
              bill_configs(name),
              financial_years(label)
            )
          ),
          bank_statement_lines(
            id,
            statement_date,
            amount_kobo,
            reference
          )
        `)
        .eq("association_id", params.associationId)
        .in("status", ["pending_verification", "expired"])
        .order("created_at", { ascending: false });

      // Check for duplicate proofs
      const sha256Counts = new Map<string, number>();
      (data || []).forEach((p) => {
        if (p.proof_sha256) {
          sha256Counts.set(p.proof_sha256, (sha256Counts.get(p.proof_sha256) || 0) + 1);
        }
      });

      const enriched = (data || []).map((p) => ({
        ...p,
        is_large_payment: p.gross_kobo >= 50000000,
        has_duplicate_proof: sha256Counts.get(p.proof_sha256 || "") > 1,
      }));

      setQueue(enriched);
      if (!selectedId && enriched.length > 0) {
        setSelectedId(enriched[0].id);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [params.associationId, selectedId, supabase]);

  useEffect(() => {
    fetchQueue();
    const interval = setInterval(fetchQueue, 30000);
    return () => clearInterval(interval);
  }, [fetchQueue]);

  useEffect(() => {
    const selected = queue.find((q) => q.id === selectedId);
    if (selected?.proof_path) {
      supabase.storage
        .from("payment-proofs")
        .createSignedUrl(selected.proof_path, 300)
        .then(({ data }) => setProofUrl(data?.signedUrl || null))
        .catch(() => setProofUrl(null));
    } else {
      setProofUrl(null);
    }
  }, [selectedId, queue, supabase]);

  // Keyboard navigation
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const currentIndex = queue.findIndex((q) => q.id === selectedId);
      if (e.key === "ArrowUp" && currentIndex > 0) {
        setSelectedId(queue[currentIndex - 1].id);
      } else if (e.key === "ArrowDown" && currentIndex < queue.length - 1) {
        setSelectedId(queue[currentIndex + 1].id);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [queue, selectedId]);

  const selectedItem = queue.find((q) => q.id === selectedId);

  async function handleApprove() {
    if (!selectedId) return;
    setActionLoading(true);
    try {
      const { error } = await supabase.rpc("staff_verify_payment", {
        p_payment_id: selectedId,
        p_decision: "approved",
        p_note: note,
      });
      if (error) throw error;
      setNote("");
      await fetchQueue();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to approve");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleReject() {
    if (!selectedId || !reason) return;
    setActionLoading(true);
    try {
      const { error } = await supabase.rpc("staff_verify_payment", {
        p_payment_id: selectedId,
        p_decision: "rejected",
        p_note: reason,
      });
      if (error) throw error;
      setReason("");
      setShowRejectModal(false);
      await fetchQueue();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to reject");
    } finally {
      setActionLoading(false);
    }
  }

  if (loading) {
    return <div className="p-8">Loading queue...</div>;
  }

  return (
    <div className="flex h-[calc(100vh-56px)]">
      {/* Left Pane: Queue List */}
      <aside className="w-96 overflow-y-auto border-r border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="border-b border-zinc-200 p-4 dark:border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Pending Verification ({queue.length})
          </h2>
        </div>
        {queue.length === 0 ? (
          <div className="p-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
            No pending payments.
          </div>
        ) : (
          <div>
            {queue.map((item) => (
              <button
                key={item.id}
                onClick={() => setSelectedId(item.id)}
                className={`w-full border-b border-zinc-100 p-4 text-left hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800 ${
                  selectedId === item.id ? "bg-emerald-50 dark:bg-emerald-950/20" : ""
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-medium text-zinc-900 dark:text-zinc-100">
                      {item.association_memberships.profiles.full_name}
                    </div>
                    <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                      {item.association_memberships.unit_occupancies[0]?.units.label || "—"} •{" "}
                      <Money amountKobo={item.gross_kobo} />
                    </div>
                  </div>
                  <Badge variant={item.status === "pending_verification" ? "pending" : "void"}>
                    {item.status === "pending_verification" ? "Pending" : "Expired"}
                  </Badge>
                </div>
                <div className="mt-2 flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                  <span>{item.payer_reference || "No ref"}</span>
                  {item.is_large_payment && <Badge variant="info">Large</Badge>}
                  {item.has_duplicate_proof && <Badge variant="rejected">Duplicate</Badge>}
                  {item.suspicious_flag && <Badge variant="rejected">Suspicious</Badge>}
                </div>
              </button>
            ))}
          </div>
        )}
      </aside>

      {/* Right Pane: Detail View */}
      <main className="flex-1 overflow-y-auto bg-zinc-50 p-6 dark:bg-zinc-950">
        {!selectedItem ? (
          <div className="flex h-full items-center justify-center text-sm text-zinc-500 dark:text-zinc-400">
            Select a payment to view details.
          </div>
        ) : (
          <div className="mx-auto max-w-4xl space-y-6">
            {/* Header */}
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
                  {selectedItem.association_memberships.profiles.full_name}
                </h1>
                <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                  {selectedItem.association_memberships.unit_occupancies[0]?.units.label || "—"} •{" "}
                  Paid {new Date(selectedItem.paid_at).toLocaleDateString()}
                </p>
              </div>
              <div className="flex gap-2">
                {selectedItem.status === "expired" ? (
                  <Button variant="outline" onClick={() => {}} loading={actionLoading}>
                    Reopen
                  </Button>
                ) : (
                  <>
                    <Button variant="outline" onClick={() => setShowRejectModal(true)} disabled={actionLoading}>
                      Reject
                    </Button>
                    <Button variant="primary" onClick={handleApprove} loading={actionLoading}>
                      Approve
                    </Button>
                  </>
                )}
              </div>
            </div>

            {/* Warnings */}
            {(selectedItem.is_large_payment || selectedItem.has_duplicate_proof || selectedItem.suspicious_flag) && (
              <div className="space-y-2">
                {selectedItem.is_large_payment && (
                  <div className="flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700 dark:border-blue-800 dark:bg-blue-950/20 dark:text-blue-400">
                    <AlertTriangle className="h-4 w-4" />
                    Large payment (≥ ₦500,000)
                  </div>
                )}
                {selectedItem.has_duplicate_proof && (
                  <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/20 dark:text-red-400">
                    <AlertTriangle className="h-4 w-4" />
                    Duplicate proof detected
                  </div>
                )}
                {selectedItem.suspicious_flag && (
                  <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/20 dark:text-red-400">
                    <Flag className="h-4 w-4" />
                    Flagged suspicious: {selectedItem.suspicious_reason}
                  </div>
                )}
              </div>
            )}

            {/* Payment Details */}
            <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
              <h2 className="mb-4 text-sm font-semibold text-zinc-900 dark:text-zinc-100">Payment Details</h2>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-zinc-500 dark:text-zinc-400">Amount</div>
                  <div className="mt-1 font-mono text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                    <Money amountKobo={selectedItem.gross_kobo} />
                  </div>
                </div>
                <div>
                  <div className="text-zinc-500 dark:text-zinc-400">Reference</div>
                  <div className="mt-1 font-mono text-zinc-900 dark:text-zinc-100">
                    {selectedItem.payer_reference || "—"}
                  </div>
                </div>
              </div>
            </div>

            {/* Allocation Breakdown */}
            <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
              <h2 className="mb-4 text-sm font-semibold text-zinc-900 dark:text-zinc-100">Allocation Breakdown</h2>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 text-left text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                    <th className="pb-2 font-medium">Bill</th>
                    <th className="pb-2 font-medium">Amount</th>
                    <th className="pb-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {selectedItem.payment_allocations.map((alloc, i) => (
                    <tr key={i}>
                      <td className="py-3 text-zinc-900 dark:text-zinc-100">
                        {alloc.member_bills.bill_configs.name} {alloc.member_bills.financial_years.label}
                      </td>
                      <td className="py-3 font-mono text-zinc-900 dark:text-zinc-100">
                        <Money amountKobo={alloc.amount_kobo} />
                      </td>
                      <td className="py-3">
                        <Badge variant={alloc.status === "reserved" ? "pending" : "verified"}>
                          {alloc.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Proof Preview */}
            <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
              <h2 className="mb-4 text-sm font-semibold text-zinc-900 dark:text-zinc-100">Proof of Payment</h2>
              {proofUrl ? (
                <div className="flex h-64 items-center justify-center rounded-md border-2 border-dashed border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800">
                  <img src={proofUrl} alt="Proof" className="max-h-full max-w-full object-contain" />
                </div>
              ) : (
                <div className="flex h-64 items-center justify-center rounded-md border-2 border-dashed border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800">
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">No proof available</p>
                </div>
              )}
            </div>

            {/* Bank Statement Match */}
            <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
              <h2 className="mb-4 text-sm font-semibold text-zinc-900 dark:text-zinc-100">Bank Statement Match</h2>
              {selectedItem.bank_statement_lines.length > 0 ? (
                <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-950/20">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="text-emerald-600 dark:text-emerald-400" />
                    <span className="text-sm font-medium text-emerald-900 dark:text-emerald-300">
                      Matched to {selectedItem.bank_statement_lines.length} statement line(s)
                    </span>
                  </div>
                </div>
              ) : (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/20">
                  <div className="flex items-center gap-2">
                    <Clock className="text-amber-600 dark:text-amber-400" />
                    <span className="text-sm font-medium text-amber-900 dark:text-amber-300">
                      No matching bank statement line found
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Note Input */}
            <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Approval Note (optional)
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              />
            </div>
          </div>
        )}
      </main>

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-lg bg-white p-6 dark:bg-zinc-900">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Reject Payment</h2>
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
              Provide a reason for rejection (required).
            </p>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
              required
              className="mt-4 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            />
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowRejectModal(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleReject}
                loading={actionLoading}
                disabled={!reason}
              >
                Reject
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
