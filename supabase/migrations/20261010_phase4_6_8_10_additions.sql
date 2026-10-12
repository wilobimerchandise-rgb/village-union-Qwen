BEGIN;

-- Phase 4: Onboarding additions
ALTER TABLE public.associations 
ADD COLUMN IF NOT EXISTS paystack_secret_key_encrypted TEXT,
ADD COLUMN IF NOT EXISTS paystack_webhook_token TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS dpa_accepted_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS dpa_version TEXT DEFAULT '1.0';

-- Phase 6: Payment flags
ALTER TABLE public.associations ADD COLUMN IF NOT EXISTS large_payment_threshold_kobo BIGINT NOT NULL DEFAULT 50000000 CHECK (large_payment_threshold_kobo >= 0);
ALTER TABLE public.payments 
ADD COLUMN IF NOT EXISTS suspicious_flag BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS suspicious_reason TEXT,
ADD COLUMN IF NOT EXISTS suspicious_flagged_by UUID REFERENCES public.profiles(id),
ADD COLUMN IF NOT EXISTS suspicious_flagged_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS duplicate_proof_warning BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_payments_suspicious ON public.payments(association_id, suspicious_flag) WHERE suspicious_flag = TRUE;

-- Phase 8: Dashboard & Reports RPCs
CREATE OR REPLACE FUNCTION public.get_dashboard_metrics(p_association_id UUID, p_financial_year_id UUID DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_user_id UUID; v_membership_id UUID; v_fy_id UUID; v_metrics JSONB;
BEGIN
  v_user_id := (SELECT auth.uid()); IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501'; END IF;
  SELECT id INTO v_membership_id FROM public.association_memberships WHERE user_id = v_user_id AND association_id = p_association_id AND status = 'active' FOR UPDATE;
  IF v_membership_id IS NULL THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501'; END IF;
  
  IF p_financial_year_id IS NULL THEN SELECT id INTO v_fy_id FROM public.financial_years WHERE association_id = p_association_id AND status = 'open' ORDER BY start_date DESC LIMIT 1;
  ELSE v_fy_id := p_financial_year_id; END IF;

  SELECT jsonb_build_object(
    'total_revenue_kobo', COALESCE((SELECT SUM(gross_kobo) FROM public.payments WHERE association_id = p_association_id AND status = 'verified'), 0),
    'total_outstanding_kobo', COALESCE((SELECT SUM(amount_kobo) FROM public.member_bills WHERE association_id = p_association_id AND status IN ('open', 'partial')), 0),
    'active_members', (SELECT COUNT(*) FROM public.association_memberships WHERE association_id = p_association_id AND status = 'active'),
    'pending_verifications', (SELECT COUNT(*) FROM public.payments WHERE association_id = p_association_id AND status = 'pending_verification'),
    'collection_rate_percent', CASE WHEN (SELECT SUM(amount_kobo) FROM public.member_bills WHERE association_id = p_association_id) > 0 THEN ROUND((COALESCE((SELECT SUM(amount_kobo) FROM public.payment_allocations pa JOIN public.member_bills mb ON mb.id = pa.bill_id WHERE mb.association_id = p_association_id AND pa.status = 'verified'), 0)::NUMERIC / (SELECT SUM(amount_kobo) FROM public.member_bills WHERE association_id = p_association_id)::NUMERIC) * 100, 1) ELSE 0 END
  ) INTO v_metrics;
  RETURN v_metrics;
END; $$;
REVOKE EXECUTE ON FUNCTION public.get_dashboard_metrics(UUID, UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_dashboard_metrics(UUID, UUID) TO authenticated;

-- Phase 10: Notifications
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  channel notification_channel NOT NULL, event_type TEXT NOT NULL, enabled BOOLEAN NOT NULL DEFAULT TRUE,
  quiet_hours_start TIME, quiet_hours_end TIME, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, channel, event_type)
);
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notification_preferences_own" ON public.notification_preferences FOR ALL TO authenticated USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));

CREATE TABLE IF NOT EXISTS public.notification_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), association_id UUID NOT NULL REFERENCES public.associations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE, channel notification_channel NOT NULL, event_type TEXT NOT NULL,
  recipient_hash BYTEA NOT NULL, status TEXT NOT NULL CHECK (status IN ('queued', 'sent', 'failed', 'skipped')),
  provider_message_id TEXT, error_message TEXT, attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_retry_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), sent_at TIMESTAMPTZ, idempotency_key TEXT UNIQUE
);
CREATE INDEX idx_notification_logs_user ON public.notification_logs(user_id, created_at DESC);
CREATE INDEX idx_notification_logs_status ON public.notification_logs(status) WHERE status IN ('queued', 'failed');
ALTER TABLE public.notification_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notification_logs_tenant_isolation" ON public.notification_logs AS RESTRICTIVE TO authenticated USING (association_id = ANY(SELECT public.user_active_association_ids()));

ALTER TABLE public.notifications 
ADD COLUMN IF NOT EXISTS log_id UUID REFERENCES public.notification_logs(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS event_type TEXT, ADD COLUMN IF NOT EXISTS reference_id UUID,
ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0, ADD COLUMN IF NOT EXISTS error_message TEXT;

COMMIT;
