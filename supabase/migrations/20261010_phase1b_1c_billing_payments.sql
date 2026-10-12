BEGIN;

DO $$ BEGIN
  CREATE TYPE unit_status AS ENUM ('active', 'inactive');
  CREATE TYPE occupancy_role AS ENUM ('owner', 'tenant');
  CREATE TYPE bill_type AS ENUM ('annual', 'registration', 'constitution', 'support', 'party', 'renewal', 'custom');
  CREATE TYPE bill_status AS ENUM ('open', 'partial', 'paid', 'void');
  CREATE TYPE adjustment_type AS ENUM ('waiver', 'discount', 'late_fee', 'write_off');
  CREATE TYPE payment_method AS ENUM ('bank_transfer', 'paystack', 'cash');
  CREATE TYPE payment_status AS ENUM ('initiated', 'pending_verification', 'verified', 'rejected', 'failed', 'cancelled', 'expired');
  CREATE TYPE allocation_status AS ENUM ('reserved', 'verified', 'released');
  CREATE TYPE approval_decision AS ENUM ('approved', 'rejected');
  CREATE TYPE credit_source AS ENUM ('expired_payment', 'overpayment', 'adjustment');
  CREATE TYPE credit_status AS ENUM ('available', 'applied');
  CREATE TYPE pdf_status AS ENUM ('pending', 'ready', 'failed');
  CREATE TYPE entry_type AS ENUM ('payment', 'allocation', 'reversal', 'adjustment', 'credit', 'migration');
  CREATE TYPE webhook_status AS ENUM ('received', 'processing', 'processed', 'failed');
  CREATE TYPE job_status AS ENUM ('pending', 'running', 'completed', 'failed');
  CREATE TYPE notification_channel AS ENUM ('in_app', 'email', 'sms', 'whatsapp');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Units & Billing
CREATE TABLE IF NOT EXISTS public.units (
  id UUID NOT NULL DEFAULT gen_random_uuid(), association_id UUID NOT NULL REFERENCES public.associations(id) ON DELETE CASCADE,
  label TEXT NOT NULL CHECK (char_length(label) BETWEEN 1 AND 100), address TEXT, status unit_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY (association_id, id), UNIQUE (association_id, label)
);
ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.unit_occupancies (
  id UUID NOT NULL DEFAULT gen_random_uuid(), association_id UUID NOT NULL, unit_id UUID NOT NULL, membership_id UUID NOT NULL,
  role occupancy_role NOT NULL, valid_from DATE NOT NULL, valid_to DATE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (association_id, id),
  FOREIGN KEY (association_id, unit_id) REFERENCES public.units(association_id, id) ON DELETE CASCADE,
  FOREIGN KEY (association_id, membership_id) REFERENCES public.association_memberships(association_id, id) ON DELETE CASCADE,
  CHECK (valid_to IS NULL OR valid_to > valid_from)
);
ALTER TABLE public.unit_occupancies ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.bill_configs (
  id UUID NOT NULL DEFAULT gen_random_uuid(), association_id UUID NOT NULL REFERENCES public.associations(id) ON DELETE CASCADE,
  bill_type bill_type NOT NULL, name TEXT NOT NULL CHECK (char_length(name) BETWEEN 2 AND 100),
  amount_kobo BIGINT NOT NULL CHECK (amount_kobo >= 0), effective_from DATE NOT NULL, effective_to DATE, is_recurring BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY (association_id, id), CHECK (effective_to IS NULL OR effective_to > effective_from)
);
ALTER TABLE public.bill_configs ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.member_bills (
  id UUID NOT NULL DEFAULT gen_random_uuid(), association_id UUID NOT NULL, unit_id UUID NOT NULL, bill_config_id UUID NOT NULL, financial_year_id UUID NOT NULL,
  period_label TEXT NOT NULL CHECK (char_length(period_label) BETWEEN 1 AND 50), amount_kobo BIGINT NOT NULL CHECK (amount_kobo >= 0),
  status bill_status NOT NULL DEFAULT 'open', issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (association_id, id),
  FOREIGN KEY (association_id, unit_id) REFERENCES public.units(association_id, id) ON DELETE CASCADE,
  FOREIGN KEY (association_id, bill_config_id) REFERENCES public.bill_configs(association_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (association_id, financial_year_id) REFERENCES public.financial_years(association_id, id) ON DELETE RESTRICT,
  UNIQUE (association_id, unit_id, bill_config_id, financial_year_id, period_label)
);
ALTER TABLE public.member_bills ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.bill_adjustments (
  id UUID NOT NULL DEFAULT gen_random_uuid(), association_id UUID NOT NULL, bill_id UUID NOT NULL, adjustment_type adjustment_type NOT NULL,
  amount_kobo BIGINT NOT NULL CHECK (amount_kobo >= 0), reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 5 AND 500),
  requested_by UUID NOT NULL REFERENCES public.profiles(id), approved_by UUID REFERENCES public.profiles(id), approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY (association_id, id),
  FOREIGN KEY (association_id, bill_id) REFERENCES public.member_bills(association_id, id) ON DELETE CASCADE,
  CHECK (approved_by IS NULL AND approved_at IS NULL OR approved_by IS NOT NULL AND approved_at IS NOT NULL)
);
ALTER TABLE public.bill_adjustments ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE VIEW public.bill_balances AS
SELECT b.association_id, b.id AS bill_id, b.unit_id, b.amount_kobo AS total_amount_kobo,
  COALESCE(SUM(CASE WHEN pa.status = 'verified' THEN pa.amount_kobo ELSE 0 END), 0)::BIGINT AS paid_kobo,
  COALESCE(SUM(CASE WHEN pa.status = 'reserved' THEN pa.amount_kobo ELSE 0 END), 0)::BIGINT AS reserved_kobo,
  COALESCE(SUM(CASE WHEN ba.approved_at IS NOT NULL THEN ba.amount_kobo ELSE 0 END), 0)::BIGINT AS adjusted_kobo,
  b.amount_kobo - COALESCE(SUM(CASE WHEN pa.status = 'verified' THEN pa.amount_kobo ELSE 0 END), 0) - COALESCE(SUM(CASE WHEN ba.approved_at IS NOT NULL THEN ba.amount_kobo ELSE 0 END), 0) AS outstanding_kobo
FROM public.member_bills b
LEFT JOIN public.payment_allocations pa ON pa.association_id = b.association_id AND pa.bill_id = b.id
LEFT JOIN public.bill_adjustments ba ON ba.association_id = b.association_id AND ba.bill_id = b.id
GROUP BY b.association_id, b.id, b.unit_id, b.amount_kobo;
GRANT SELECT ON public.bill_balances TO authenticated;

-- Payments & Ledger
CREATE TABLE IF NOT EXISTS public.payments (
  id UUID NOT NULL DEFAULT gen_random_uuid(), association_id UUID NOT NULL REFERENCES public.associations(id) ON DELETE CASCADE,
  membership_id UUID NOT NULL, method payment_method NOT NULL, gross_kobo BIGINT NOT NULL CHECK (gross_kobo >= 0),
  fee_kobo BIGINT NOT NULL DEFAULT 0 CHECK (fee_kobo >= 0), net_kobo BIGINT NOT NULL CHECK (net_kobo >= 0),
  payer_reference TEXT, proof_path TEXT, proof_sha256 BYTEA, status payment_status NOT NULL DEFAULT 'initiated',
  paid_at DATE, accounting_date DATE, expires_at TIMESTAMPTZ, rejection_reason TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (association_id, id),
  FOREIGN KEY (association_id, membership_id) REFERENCES public.association_memberships(association_id, id) ON DELETE RESTRICT,
  CHECK (net_kobo = gross_kobo - fee_kobo), CHECK (paid_at IS NULL OR accounting_date IS NULL OR accounting_date >= paid_at)
);
CREATE UNIQUE INDEX idx_payments_provider_ref ON public.payments(association_id, payer_reference) WHERE method = 'paystack' AND payer_reference IS NOT NULL;
CREATE UNIQUE INDEX idx_payments_proof_sha256 ON public.payments(association_id, proof_sha256) WHERE proof_sha256 IS NOT NULL AND status NOT IN ('rejected', 'cancelled');
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.payment_allocations (
  id UUID NOT NULL DEFAULT gen_random_uuid(), association_id UUID NOT NULL, payment_id UUID NOT NULL, bill_id UUID NOT NULL,
  amount_kobo BIGINT NOT NULL CHECK (amount_kobo >= 0), status allocation_status NOT NULL DEFAULT 'reserved', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (association_id, id),
  FOREIGN KEY (association_id, payment_id) REFERENCES public.payments(association_id, id) ON DELETE CASCADE,
  FOREIGN KEY (association_id, bill_id) REFERENCES public.member_bills(association_id, id) ON DELETE RESTRICT
);
ALTER TABLE public.payment_allocations ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.payment_approvals (
  id UUID NOT NULL DEFAULT gen_random_uuid(), association_id UUID NOT NULL, payment_id UUID NOT NULL, approver_membership_id UUID NOT NULL,
  decision approval_decision NOT NULL, note TEXT, decided_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY (association_id, id),
  FOREIGN KEY (association_id, payment_id) REFERENCES public.payments(association_id, id) ON DELETE CASCADE,
  FOREIGN KEY (association_id, approver_membership_id) REFERENCES public.association_memberships(association_id, id) ON DELETE RESTRICT
);
ALTER TABLE public.payment_approvals ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.payment_reversals (
  id UUID NOT NULL DEFAULT gen_random_uuid(), association_id UUID NOT NULL, payment_id UUID NOT NULL, reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 5 AND 500),
  requested_by UUID NOT NULL REFERENCES public.profiles(id), approved_by UUID REFERENCES public.profiles(id), approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY (association_id, id),
  FOREIGN KEY (association_id, payment_id) REFERENCES public.payments(association_id, id) ON DELETE RESTRICT,
  CHECK (approved_by IS NULL AND approved_at IS NULL OR approved_by IS NOT NULL AND approved_at IS NOT NULL)
);
ALTER TABLE public.payment_reversals ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.member_credits (
  id UUID NOT NULL DEFAULT gen_random_uuid(), association_id UUID NOT NULL REFERENCES public.associations(id) ON DELETE CASCADE,
  membership_id UUID NOT NULL, amount_kobo BIGINT NOT NULL CHECK (amount_kobo >= 0), source credit_source NOT NULL,
  source_payment_id UUID REFERENCES public.payments(id) ON DELETE SET NULL, status credit_status NOT NULL DEFAULT 'available',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY (association_id, id),
  FOREIGN KEY (association_id, membership_id) REFERENCES public.association_memberships(association_id, id) ON DELETE RESTRICT
);
ALTER TABLE public.member_credits ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.receipts (
  id UUID NOT NULL DEFAULT gen_random_uuid(), association_id UUID NOT NULL, payment_id UUID NOT NULL, financial_year_id UUID NOT NULL,
  receipt_number TEXT NOT NULL, verification_token BYTEA NOT NULL DEFAULT gen_random_bytes(16), amount_kobo BIGINT NOT NULL CHECK (amount_kobo >= 0),
  pdf_status pdf_status NOT NULL DEFAULT 'pending', pdf_path TEXT, issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ, revocation_reason TEXT, PRIMARY KEY (association_id, id),
  FOREIGN KEY (association_id, payment_id) REFERENCES public.payments(association_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (association_id, financial_year_id) REFERENCES public.financial_years(association_id, id) ON DELETE RESTRICT,
  CHECK (revoked_at IS NULL OR revocation_reason IS NOT NULL)
);
CREATE UNIQUE INDEX idx_receipts_payment ON public.receipts(payment_id);
ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.receipt_counters (
  association_id UUID NOT NULL, financial_year_id UUID NOT NULL, current_seq BIGINT NOT NULL DEFAULT 0 CHECK (current_seq >= 0),
  PRIMARY KEY (association_id, financial_year_id),
  FOREIGN KEY (association_id, financial_year_id) REFERENCES public.financial_years(association_id, id) ON DELETE RESTRICT
);
ALTER TABLE public.receipt_counters ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.ledger_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid(), association_id UUID NOT NULL REFERENCES public.associations(id) ON DELETE CASCADE,
  financial_year_id UUID NOT NULL, entry_type entry_type NOT NULL, reference_id UUID, account_code TEXT NOT NULL,
  debit_kobo BIGINT NOT NULL DEFAULT 0 CHECK (debit_kobo >= 0), credit_kobo BIGINT NOT NULL DEFAULT 0 CHECK (credit_kobo >= 0),
  accounting_date DATE NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY (association_id, id),
  FOREIGN KEY (association_id, financial_year_id) REFERENCES public.financial_years(association_id, id) ON DELETE RESTRICT,
  CHECK (debit_kobo = 0 OR credit_kobo = 0)
);
ALTER TABLE public.ledger_entries ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.bank_statement_lines (
  id UUID NOT NULL DEFAULT gen_random_uuid(), association_id UUID NOT NULL, bank_account_id UUID NOT NULL, statement_date DATE NOT NULL,
  amount_kobo BIGINT NOT NULL, reference TEXT, narration TEXT, matched_payment_id UUID, imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (association_id, id),
  FOREIGN KEY (association_id, bank_account_id) REFERENCES public.bank_accounts(association_id, id) ON DELETE CASCADE,
  FOREIGN KEY (association_id, matched_payment_id) REFERENCES public.payments(association_id, id) ON DELETE SET NULL
);
ALTER TABLE public.bank_statement_lines ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.webhook_events (
  id UUID NOT NULL DEFAULT gen_random_uuid(), association_id UUID NOT NULL REFERENCES public.associations(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider = 'paystack'), event_id TEXT NOT NULL, status webhook_status NOT NULL DEFAULT 'received',
  payload_hash BYTEA NOT NULL, attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0), locked_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), processed_at TIMESTAMPTZ, PRIMARY KEY (association_id, id), UNIQUE (provider, event_id)
);
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid(), association_id UUID NOT NULL REFERENCES public.associations(id) ON DELETE CASCADE,
  job_type TEXT NOT NULL, status job_status NOT NULL DEFAULT 'pending', payload JSONB NOT NULL DEFAULT '{}', stats JSONB NOT NULL DEFAULT '{}',
  started_at TIMESTAMPTZ, completed_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY (association_id, id)
);
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.report_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid(), association_id UUID NOT NULL REFERENCES public.associations(id) ON DELETE CASCADE,
  report_type TEXT NOT NULL, parameters JSONB NOT NULL DEFAULT '{}', file_path TEXT, expires_at TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES public.profiles(id), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY (association_id, id)
);
ALTER TABLE public.report_jobs ENABLE ROW LEVEL SECURITY;

-- Ledger Immutability Guard
CREATE OR REPLACE FUNCTION public.ledger_immutable_guard() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Ledger entries are immutable. Corrections must be new records.' USING ERRCODE = '42501'; END; $$;
CREATE TRIGGER ledger_no_update BEFORE UPDATE ON public.ledger_entries FOR EACH ROW EXECUTE FUNCTION public.ledger_immutable_guard();
CREATE TRIGGER ledger_no_delete BEFORE DELETE ON public.ledger_entries FOR EACH ROW EXECUTE FUNCTION public.ledger_immutable_guard();

-- Enable RLS on all new tables
DO $$ DECLARE r RECORD; BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT IN ('profiles', 'platform_admins', 'platform_access_sessions', 'data_subject_requests', 'associations') LOOP
    EXECUTE 'ALTER TABLE public.' || quote_ident(r.tablename) || ' ENABLE ROW LEVEL SECURITY';
  END LOOP;
END $$;

COMMIT;
