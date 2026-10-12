import { z } from "zod";

export const onboardingSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  shortCode: z.string().regex(/^[A-Z]{2,10}$/, "Short code must be 2-10 uppercase letters"),
  address: z.string().min(5, "Address is required"),
  phone: z.string().min(10, "Valid phone number required"),
  cacNumber: z.string().optional(),
  cacType: z.enum(["incorporated_trustees", "company_limited_by_guarantee", "other"]),
  fyStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  fyEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dualApprovalThresholdKobo: z.number().int().min(0),
  billConfigs: z.array(z.object({
    billType: z.enum(["annual", "registration", "constitution", "support", "party", "renewal", "custom"]),
    name: z.string().min(2),
    amountKobo: z.number().int().min(0),
    effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    isRecurring: z.boolean().default(true),
  })).min(1, "At least one bill config is required"),
  bankAccounts: z.array(z.object({
    bankName: z.string().min(2),
    accountNumberHash: z.string(),
    accountName: z.string().min(2),
    isDefault: z.boolean().default(false),
  })).min(1, "At least one bank account is required"),
  staffInvites: z.array(z.object({
    role: z.enum(["president", "secretary", "treasurer", "financial_secretary", "association_admin"]),
    contactType: z.enum(["email", "phone"]),
    contactValueHash: z.string(),
    tokenHash: z.string(),
    expiresAt: z.string(),
  })).optional(),
  dpaAccepted: z.boolean().refine((val) => val === true, "You must accept the Data Processing Agreement"),
});

export type OnboardingData = z.infer<typeof onboardingSchema>;
