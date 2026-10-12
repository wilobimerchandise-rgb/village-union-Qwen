import { z } from "zod";

export const unitSchema = z.object({
  label: z.string().min(1, "Label is required").max(100),
  address: z.string().max(500).optional(),
  status: z.enum(["active", "inactive"]).default("active"),
});

export const memberSchema = z.object({
  fullName: z.string().min(2, "Name must be at least 2 characters").max(200),
  phone: z.string().min(10, "Valid phone number required").max(20),
  email: z.string().email("Valid email required").optional().or(z.literal("")),
  unitLabel: z.string().optional(),
  role: z.enum(["member", "secretary", "treasurer", "financial_secretary", "president", "association_admin"]).default("member"),
});

export const occupancySchema = z.object({
  unitId: z.string().uuid(),
  membershipId: z.string().uuid(),
  role: z.enum(["owner", "tenant"]),
  validFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  validTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
});

export const csvImportRowSchema = z.object({
  fullName: z.string().min(2),
  phone: z.string().min(10),
  email: z.string().email().optional().or(z.literal("")),
  unitLabel: z.string().optional(),
  role: z.enum(["member", "secretary", "treasurer", "financial_secretary", "president", "association_admin"]).default("member"),
});

export const openingBalanceRowSchema = z.object({
  accountCode: z.string().min(1),
  debitKobo: z.number().int().min(0),
  creditKobo: z.number().int().min(0),
  accountingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().optional(),
});

export type UnitData = z.infer<typeof unitSchema>;
export type MemberData = z.infer<typeof memberSchema>;
export type OccupancyData = z.infer<typeof occupancySchema>;
export type CsvImportRow = z.infer<typeof csvImportRowSchema>;
export type OpeningBalanceRow = z.infer<typeof openingBalanceRowSchema>;
