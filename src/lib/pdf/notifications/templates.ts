export const templates = {
  payment_submitted: {
    subject: "Payment Submitted",
    body: (amountKobo: number, reference: string) =>
      `Your payment of ₦${(amountKobo / 100).toLocaleString()} (ref: ${reference}) has been submitted and is pending verification.`,
  },
  payment_verified: {
    subject: "Payment Verified",
    body: (amountKobo: number, reference: string) =>
      `Your payment of ₦${(amountKobo / 100).toLocaleString()} (ref: ${reference}) has been verified.`,
  },
  payment_rejected: {
    subject: "Payment Rejected",
    body: (reference: string, reason: string) =>
      `Your payment (ref: ${reference}) was rejected. Reason: ${reason}.`,
  },
  receipt_ready: {
    subject: "Receipt Ready",
    body: (receiptNumber: string) =>
      `Your receipt ${receiptNumber} is ready. Download it from your dashboard.`,
  },
  bill_generated: {
    subject: "New Bill Generated",
    body: (billName: string, amountKobo: number) =>
      `A new bill: ${billName} for ₦${(amountKobo / 100).toLocaleString()}.`,
  },
  overdue_reminder: {
    subject: "Overdue Payment Reminder",
    body: (billName: string, amountKobo: number, daysOverdue: number) =>
      `Reminder: ${billName} (₦${(amountKobo / 100).toLocaleString()}) is ${daysOverdue} days overdue.`,
  },
  join_request_approved: {
    subject: "Join Request Approved",
    body: (associationName: string) =>
      `Your join request for ${associationName} has been approved.`,
  },
  join_request_rejected: {
    subject: "Join Request Rejected",
    body: (associationName: string) =>
      `Your join request for ${associationName} was not approved.`,
  },
};

export type TemplateKey = keyof typeof templates;
