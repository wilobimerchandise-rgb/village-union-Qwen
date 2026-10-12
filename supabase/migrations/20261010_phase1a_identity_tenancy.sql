BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN
  CREATE TYPE membership_status AS ENUM ('invited', 'pending', 'active', 'suspended', 'inactive');
  CREATE TYPE membership_role AS ENUM ('member', 'secretary', 'treasurer', 'financial_secretary', 'president', 'association_admin');
  CREATE TYPE contact_type AS ENUM ('email', 'phone');
  CREATE TYPE join_request_status AS ENUM ('pending', 'approved', 'rejected', 'expired');
  CREATE TYPE financial_year_status AS ENUM ('open', 'closed');
  CREATE TYPE invitation_status AS ENUM ('pending', 'accepted', 'expired', 'revoked');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL CHECK (char_length(full_name) BETWEEN 2 AND 200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  privacy_notice_version TEXT NOT NULL DEFAULT '1.0',
  consent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.platform_admins (
  profile_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  is_super BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.platform_access_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_admin_id UUID NOT NULL REFERENCES public.platform_admins(profile_id) ON DELETE CASCADE,
  association_id UUID NOT NULL,
  reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 10 AND 1000),
  opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  closed_at TIMESTAMPTZ,
  CHECK (expires_at > opened_at)
);
ALTER TABLE public.platform_access_sessions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.data_subject_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  request_type TEXT NOT NULL CHECK (request_type IN ('access', 'correction', 'erasure', 'restriction', 'portability')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'denied')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  notes TEXT
);
ALTER TABLE public.data_subject_requests ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.associations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 2 AND 200),
  short_code TEXT NOT NULL UNIQUE CHECK (short_code ~ '^[A-Z]{2,10}$'),
  logo_url TEXT, address TEXT, phone TEXT, cac_number TEXT,
  cac_type TEXT CHECK (cac_type IN ('incorporated_trustees', 'company_limited_by_guarantee', 'other')),
  fee_bearer TEXT NOT NULL DEFAULT 'member' CHECK (fee_bearer IN ('member', 'association')),
  dual_approval_threshold_kobo BIGINT NOT NULL DEFAULT 50000000 CHECK (dual_approval_threshold_kobo >= 0),
  proof_retention_months INTEGER NOT NULL DEFAULT 24 CHECK (proof_retention_months BETWEEN 1 AND 120),
  status TEXT NOT NULL DEFAULT 'trial' CHECK (status IN ('trial', 'active', 'suspended', 'offboarded')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.associations ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.association_join_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  association_id UUID NOT NULL REFERENCES public.associations(id) ON DELETE CASCADE,
  code_hash BYTEA NOT NULL,
  code_prefix TEXT NOT NULL CHECK (char_length(code_prefix) = 4),
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  expires_at TIMESTAMPTZ, revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (association_id, code_hash)
);
ALTER TABLE public.association_join_codes ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.association_memberships (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  association_id UUID NOT NULL REFERENCES public.associations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  unit_label TEXT,
  role membership_role NOT NULL DEFAULT 'member',
  status membership_status NOT NULL DEFAULT 'invited',
  invited_by UUID REFERENCES public.profiles(id),
  approved_by UUID REFERENCES public.profiles(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (association_id, id),
  CHECK ((status = 'invited' AND user_id IS NULL) OR (status IN ('pending', 'active', 'suspended', 'inactive') AND user_id IS NOT NULL))
);
CREATE INDEX idx_memberships_user_active ON public.association_memberships(user_id, association_id, status) WHERE status = 'active';
ALTER TABLE public.association_memberships ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.membership_contacts (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  association_id UUID NOT NULL,
  membership_id UUID NOT NULL,
  contact_type contact_type NOT NULL,
  contact_value_hash BYTEA NOT NULL,
  contact_value_verified_at TIMESTAMPTZ,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (association_id, id),
  FOREIGN KEY (association_id, membership_id) REFERENCES public.association_memberships(association_id, id) ON DELETE CASCADE,
  UNIQUE (association_id, membership_id, contact_type, contact_value_hash)
);
ALTER TABLE public.membership_contacts ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.association_invitations (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  association_id UUID NOT NULL REFERENCES public.associations(id) ON DELETE CASCADE,
  role membership_role NOT NULL,
  contact_type contact_type NOT NULL,
  contact_value_hash BYTEA NOT NULL,
  token_hash BYTEA NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  status invitation_status NOT NULL DEFAULT 'pending',
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (association_id, id),
  UNIQUE (association_id, token_hash),
  CHECK (expires_at > created_at)
);
ALTER TABLE public.association_invitations ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.join_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  association_id UUID NOT NULL REFERENCES public.associations(id) ON DELETE CASCADE,
  unit_label TEXT NOT NULL,
  contact_type contact_type NOT NULL,
  contact_value_hash BYTEA NOT NULL,
  otp_code_hash BYTEA NOT NULL,
  otp_expires_at TIMESTAMPTZ NOT NULL,
  status join_request_status NOT NULL DEFAULT 'pending',
  membership_id UUID,
  reviewed_by UUID REFERENCES public.profiles(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (association_id, id),
  FOREIGN KEY (association_id, membership_id) REFERENCES public.association_memberships(association_id, id) ON DELETE SET NULL,
  CHECK (otp_expires_at > created_at)
);
ALTER TABLE public.join_requests ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.financial_years (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  association_id UUID NOT NULL REFERENCES public.associations(id) ON DELETE CASCADE,
  label TEXT NOT NULL CHECK (char_length(label) BETWEEN 3 AND 20),
  start_date DATE NOT NULL, end_date DATE NOT NULL,
  status financial_year_status NOT NULL DEFAULT 'open',
  closed_at TIMESTAMPTZ, closed_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (association_id, id),
  UNIQUE (association_id, label),
  CHECK (end_date > start_date)
);
ALTER TABLE public.financial_years ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.bank_accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  association_id UUID NOT NULL REFERENCES public.associations(id) ON DELETE CASCADE,
  bank_name TEXT NOT NULL CHECK (char_length(bank_name) BETWEEN 2 AND 100),
  account_number_hash BYTEA NOT NULL,
  account_name TEXT NOT NULL CHECK (char_length(account_name) BETWEEN 2 AND 200),
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (association_id, id)
);
ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.activity_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  association_id UUID NOT NULL REFERENCES public.associations(id) ON DELETE CASCADE,
  actor_membership_id UUID,
  actor_platform_admin_id UUID REFERENCES public.platform_admins(profile_id),
  action TEXT NOT NULL CHECK (char_length(action) BETWEEN 1 AND 100),
  target_table TEXT NOT NULL, target_id UUID NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (association_id, id),
  CHECK ((actor_membership_id IS NOT NULL AND actor_platform_admin_id IS NULL) OR (actor_membership_id IS NULL AND actor_platform_admin_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_activity_logs_association ON public.activity_logs(association_id, created_at DESC);
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

-- Helpers
CREATE OR REPLACE FUNCTION public.current_uid() RETURNS UUID LANGUAGE sql STABLE AS $$ SELECT auth.uid(); $$;
CREATE OR REPLACE FUNCTION public.user_active_association_ids() RETURNS UUID[] LANGUAGE sql STABLE AS $$
  SELECT ARRAY(SELECT association_id FROM public.association_memberships WHERE user_id = (SELECT auth.uid()) AND status = 'active'); $$;
CREATE OR REPLACE FUNCTION public.is_active_member_of(p_association_id UUID) RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM public.association_memberships WHERE user_id = (SELECT auth.uid()) AND association_id = p_association_id AND status = 'active'); $$;
CREATE OR REPLACE FUNCTION public.has_role(p_association_id UUID, p_roles membership_role[]) RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM public.association_memberships WHERE user_id = (SELECT auth.uid()) AND association_id = p_association_id AND status = 'active' AND role = ANY(p_roles)); $$;
CREATE OR REPLACE FUNCTION public.is_platform_admin() RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM public.platform_admins WHERE profile_id = (SELECT auth.uid())); $$;
CREATE OR REPLACE FUNCTION public.has_break_glass(p_association_id UUID) RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM public.platform_access_sessions WHERE platform_admin_id = (SELECT auth.uid()) AND association_id = p_association_id AND NOW() BETWEEN opened_at AND expires_at AND closed_at IS NULL); $$;

-- RLS Policies (Simplified for brevity, ensuring RESTRICTIVE tenant isolation)
ALTER TABLE public.associations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "associations_select_public" ON public.associations;
CREATE POLICY "associations_select_public" ON public.associations FOR SELECT TO authenticated USING (status IN ('trial', 'active'));

CREATE POLICY "memberships_tenant_isolation" ON public.association_memberships AS RESTRICTIVE TO authenticated USING (association_id = ANY(public.user_active_association_ids()));
CREATE POLICY "memberships_select_member" ON public.association_memberships FOR SELECT TO authenticated USING ((SELECT public.is_active_member_of(association_id)));

-- Revoke defaults
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_uid(), public.user_active_association_ids(), public.is_active_member_of(UUID), public.has_role(UUID, membership_role[]), public.is_platform_admin(), public.has_break_glass(UUID) TO authenticated;

COMMIT;
