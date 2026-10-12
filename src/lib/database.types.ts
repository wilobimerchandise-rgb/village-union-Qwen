// Generate this file by running:
// npx supabase gen types typescript --project-id <your-proj-ref> > src/lib/database.types.ts

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      associations: { Row: { id: string; name: string; short_code: string; status: string }; Insert: { id?: string; name: string; short_code: string; status?: string }; Update: { id?: string; name?: string; short_code?: string; status?: string } };
      association_memberships: { Row: { id: string; association_id: string; user_id: string | null; role: string; status: string }; Insert: { id?: string; association_id: string; user_id?: string | null; role?: string; status?: string }; Update: { id?: string; association_id?: string; user_id?: string | null; role?: string; status?: string } };
      payments: { Row: { id: string; association_id: string; membership_id: string; gross_kobo: number; status: string }; Insert: { id?: string; association_id: string; membership_id: string; gross_kobo: number; status?: string }; Update: { id?: string; association_id?: string; membership_id?: string; gross_kobo?: number; status?: string } };
      // ... Add remaining tables as needed
    };
    Views: {
      bill_balances: { Row: { association_id: string; bill_id: string; total_amount_kobo: number; paid_kobo: number; reserved_kobo: number; adjusted_kobo: number; outstanding_kobo: number } };
    };
    Functions: {
      submit_bank_transfer_payment: { Args: { p_allocations: Json; p_proof_path: string; p_proof_sha256: string; p_payer_reference: string; p_paid_at: string }; Returns: Json };
      staff_verify_payment: { Args: { p_payment_id: string; p_decision: string; p_note: string; p_adjusted_allocations?: Json }; Returns: Json };
      get_dashboard_metrics: { Args: { p_association_id: string; p_financial_year_id?: string }; Returns: Json };
      // ... Add remaining functions as needed
    };
  };
}
