BEGIN;

-- 1. Submit Bank Transfer Payment
CREATE OR REPLACE FUNCTION public.submit_bank_transfer_payment(
  p_allocations JSONB, 
  p_proof_path TEXT, 
  p_proof_sha256 BYTEA, 
  p_payer_reference TEXT, 
  p_paid_at DATE
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE 
  v_user_id UUID; 
  v_membership_id UUID; 
  v_association_id UUID; 
  v_payment_id UUID; 
  v_allocation JSONB; 
  v_bill RECORD; 
  v_total_allocated BIGINT := 0; 
  v_financial_year_id UUID;
BEGIN
  v_user_id := (SELECT auth.uid()); 
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501'; END IF;
  
  IF p_allocations IS NULL OR jsonb_array_length(p_allocations) = 0 THEN 
    RAISE EXCEPTION 'At least one allocation required' USING ERRCODE = '22023'; 
  END IF;
  
  v_association_id := (SELECT mb.association_id FROM public.member_bills mb WHERE mb.id = (p_allocations->0->>'bill_id')::UUID);
  IF v_association_id IS NULL THEN RAISE EXCEPTION 'Bill not found' USING ERRCODE = 'P0002'; END IF;
  
  SELECT id INTO v_membership_id FROM public.association_memberships 
  WHERE user_id = v_user_id AND association_id = v_association_id AND status = 'active' FOR UPDATE;
  IF v_membership_id IS NULL THEN RAISE EXCEPTION 'No active membership' USING ERRCODE = '42501'; END IF;
  
  IF p_paid_at > CURRENT_DATE THEN RAISE EXCEPTION 'Payment date cannot be in the future' USING ERRCODE = '22023'; END IF;
  
  FOR v_allocation IN SELECT * FROM jsonb_array_elements(p_allocations) LOOP
    SELECT * INTO v_bill FROM public.member_bills WHERE id = (v_allocation->>'bill_id')::UUID AND association_id = v_association_id FOR UPDATE;
    IF v_bill IS NULL THEN RAISE EXCEPTION 'Bill not found or cross-tenant' USING ERRCODE = 'P0002'; END IF;
    
    SELECT fy.id INTO v_financial_year_id FROM public.financial_years fy WHERE fy.id = v_bill.financial_year_id AND fy.status = 'open';
    IF v_financial_year_id IS NULL THEN RAISE EXCEPTION 'Financial year is closed' USING ERRCODE = 'P0001'; END IF;
    
    IF (COALESCE((SELECT SUM(amount_kobo) FROM public.payment_allocations WHERE bill_id = v_bill.id AND status IN ('reserved', 'verified')), 0) + (v_allocation->>'amount_kobo')::BIGINT) > v_bill.amount_kobo THEN
      RAISE EXCEPTION 'Allocation exceeds bill balance' USING ERRCODE = '22023'; 
    END IF;
    v_total_allocated := v_total_allocated + (v_allocation->>'amount_kobo')::BIGINT;
  END LOOP;

  INSERT INTO public.payments (association_id, membership_id, method, gross_kobo, fee_kobo, net_kobo, payer_reference, proof_path, proof_sha256, status, paid_at, expires_at)
  VALUES (v_association_id, v_membership_id, 'bank_transfer', v_total_allocated, 0, v_total_allocated, p_payer_reference, p_proof_path, p_proof_sha256, 'pending_verification', p_paid_at, NOW() + INTERVAL '7 days') 
  RETURNING id INTO v_payment_id;
  
  FOR v_allocation IN SELECT * FROM jsonb_array_elements(p_allocations) LOOP
    INSERT INTO public.payment_allocations (association_id, payment_id, bill_id, amount_kobo, status)
    VALUES (v_association_id, v_payment_id, (v_allocation->>'bill_id')::UUID, (v_allocation->>'amount_kobo')::BIGINT, 'reserved');
  END LOOP;
  
  INSERT INTO public.activity_logs (association_id, actor_membership_id, action, target_table, target_id, metadata)
  VALUES (v_association_id, v_membership_id, 'submit_bank_transfer_payment', 'payments', v_payment_id, jsonb_build_object('total_kobo', v_total_allocated));
  
  RETURN jsonb_build_object('payment_id', v_payment_id, 'status', 'pending_verification', 'total_kobo', v_total_allocated);
END; $$;
REVOKE EXECUTE ON FUNCTION public.submit_bank_transfer_payment(JSONB, TEXT, BYTEA, TEXT, DATE) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.submit_bank_transfer_payment(JSONB, TEXT, BYTEA, TEXT, DATE) TO authenticated;


-- 2. Staff Verify Payment
CREATE OR REPLACE FUNCTION public.staff_verify_payment(
  p_payment_id UUID, 
  p_decision TEXT, 
  p_note TEXT, 
  p_adjusted_allocations JSONB DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE 
  v_user_id UUID; 
  v_approver_membership_id UUID; 
  v_payment RECORD; 
  v_association_id UUID; 
  v_submitter_membership_id UUID; 
  v_threshold BIGINT; 
  v_existing_approvals INTEGER; 
  v_receipt_number TEXT; 
  v_seq BIGINT; 
  v_financial_year_id UUID; 
  v_short_code TEXT; 
  v_fy_label TEXT;
BEGIN
  v_user_id := (SELECT auth.uid()); 
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501'; END IF;
  
  SELECT * INTO v_payment FROM public.payments WHERE id = p_payment_id FOR UPDATE;
  IF v_payment IS NULL THEN RAISE EXCEPTION 'Payment not found' USING ERRCODE = 'P0002'; END IF;
  
  v_association_id := v_payment.association_id; 
  v_submitter_membership_id := v_payment.membership_id;
  
  SELECT id INTO v_approver_membership_id FROM public.association_memberships 
  WHERE user_id = v_user_id AND association_id = v_association_id AND status = 'active' AND role IN ('financial_secretary', 'treasurer', 'president', 'association_admin') FOR UPDATE;
  IF v_approver_membership_id IS NULL THEN RAISE EXCEPTION 'Not authorized to verify payments' USING ERRCODE = '42501'; END IF;
  
  IF v_approver_membership_id = v_submitter_membership_id THEN RAISE EXCEPTION 'Cannot approve own payment' USING ERRCODE = '22023'; END IF;
  IF v_payment.status != 'pending_verification' THEN RAISE EXCEPTION 'Payment is not pending verification' USING ERRCODE = '22023'; END IF;

  SELECT dual_approval_threshold_kobo INTO v_threshold FROM public.associations WHERE id = v_association_id;
  IF v_payment.gross_kobo >= v_threshold THEN
    SELECT COUNT(*) INTO v_existing_approvals FROM public.payment_approvals WHERE payment_id = p_payment_id AND decision = 'approved';
    IF v_existing_approvals = 0 THEN
      INSERT INTO public.payment_approvals (association_id, payment_id, approver_membership_id, decision, note) 
      VALUES (v_association_id, p_payment_id, v_approver_membership_id, 'approved', p_note);
      RETURN jsonb_build_object('status', 'awaiting_second_approval', 'message', 'Payment requires second approval');
    END IF;
  END IF;

  IF p_decision = 'approved' THEN
    SELECT fy.id, fy.label INTO v_financial_year_id, v_fy_label FROM public.financial_years fy 
    WHERE fy.id = (SELECT financial_year_id FROM public.member_bills WHERE id = (SELECT bill_id FROM public.payment_allocations WHERE payment_id = p_payment_id LIMIT 1)) AND fy.status = 'open';
    IF v_financial_year_id IS NULL THEN RAISE EXCEPTION 'Financial year is closed' USING ERRCODE = 'P0001'; END IF;
    
    UPDATE public.payment_allocations SET status = 'verified' WHERE payment_id = p_payment_id;
    UPDATE public.payments SET status = 'verified', accounting_date = CURRENT_DATE WHERE id = p_payment_id;
    
    SELECT short_code INTO v_short_code FROM public.associations WHERE id = v_association_id;
    INSERT INTO public.receipt_counters (association_id, financial_year_id, current_seq) 
    VALUES (v_association_id, v_financial_year_id, 0) ON CONFLICT (association_id, financial_year_id) DO NOTHING;
    
    SELECT current_seq + 1 INTO v_seq FROM public.receipt_counters WHERE association_id = v_association_id AND financial_year_id = v_financial_year_id FOR UPDATE;
    UPDATE public.receipt_counters SET current_seq = v_seq WHERE association_id = v_association_id AND financial_year_id = v_financial_year_id;
    
    v_receipt_number := 'REC/' || v_short_code || '/' || v_fy_label || '/' || LPAD(v_seq::TEXT, 5, '0');
    
    INSERT INTO public.receipts (association_id, payment_id, financial_year_id, receipt_number, amount_kobo, pdf_status) 
    VALUES (v_association_id, p_payment_id, v_financial_year_id, v_receipt_number, v_payment.net_kobo, 'pending');
    
    INSERT INTO public.ledger_entries (association_id, financial_year_id, entry_type, reference_id, account_code, debit_kobo, credit_kobo, accounting_date) 
    VALUES (v_association_id, v_financial_year_id, 'payment', p_payment_id, 'bank', v_payment.gross_kobo, 0, CURRENT_DATE);
    
    INSERT INTO public.ledger_entries (association_id, financial_year_id, entry_type, reference_id, account_code, debit_kobo, credit_kobo, accounting_date) 
    VALUES (v_association_id, v_financial_year_id, 'allocation', p_payment_id, 'income', 0, v_payment.net_kobo, CURRENT_DATE);
    
    IF v_payment.fee_kobo > 0 THEN 
      INSERT INTO public.ledger_entries (association_id, financial_year_id, entry_type, reference_id, account_code, debit_kobo, credit_kobo, accounting_date) 
      VALUES (v_association_id, v_financial_year_id, 'payment', p_payment_id, 'paystack_fees', v_payment.fee_kobo, 0, CURRENT_DATE); 
    END IF;
    
    INSERT INTO public.payment_approvals (association_id, payment_id, approver_membership_id, decision, note) 
    VALUES (v_association_id, p_payment_id, v_approver_membership_id, 'approved', p_note);
    
    RETURN jsonb_build_object('status', 'verified', 'receipt_number', v_receipt_number);
  ELSE
    UPDATE public.payment_allocations SET status = 'released' WHERE payment_id = p_payment_id;
    UPDATE public.payments SET status = 'rejected', rejection_reason = p_note WHERE id = p_payment_id;
    INSERT INTO public.payment_approvals (association_id, payment_id, approver_membership_id, decision, note) 
    VALUES (v_association_id, p_payment_id, v_approver_membership_id, 'rejected', p_note);
    RETURN jsonb_build_object('status', 'rejected', 'reason', p_note);
  END IF;
END; $$;
REVOKE EXECUTE ON FUNCTION public.staff_verify_payment(UUID, TEXT, TEXT, JSONB) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.staff_verify_payment(UUID, TEXT, TEXT, JSONB) TO authenticated;


-- 3. Apply Provider Payment (Service Role Only)
CREATE OR REPLACE FUNCTION public.apply_provider_payment(
  p_event_id TEXT, 
  p_reference TEXT, 
  p_amount_kobo BIGINT, 
  p_currency TEXT, 
  p_fee_kobo BIGINT, 
  p_membership_id UUID, 
  p_allocations JSONB
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE 
  v_association_id UUID; 
  v_payment_id UUID; 
  v_allocation JSONB;
BEGIN
  IF EXISTS (SELECT 1 FROM public.webhook_events WHERE event_id = p_event_id AND status = 'processed') THEN 
    RETURN jsonb_build_object('status', 'duplicate', 'message', 'Event already processed'); 
  END IF;
  
  SELECT association_id INTO v_association_id FROM public.association_memberships WHERE id = p_membership_id AND status = 'active';
  IF v_association_id IS NULL THEN RAISE EXCEPTION 'Membership not found or inactive' USING ERRCODE = 'P0002'; END IF;
  IF p_currency != 'NGN' THEN RAISE EXCEPTION 'Unsupported currency' USING ERRCODE = '22023'; END IF;
  
  INSERT INTO public.payments (association_id, membership_id, method, gross_kobo, fee_kobo, net_kobo, payer_reference, status, paid_at, accounting_date)
  VALUES (v_association_id, p_membership_id, 'paystack', p_amount_kobo + p_fee_kobo, p_fee_kobo, p_amount_kobo, p_reference, 'verified', CURRENT_DATE, CURRENT_DATE) 
  RETURNING id INTO v_payment_id;
  
  FOR v_allocation IN SELECT * FROM jsonb_array_elements(p_allocations) LOOP
    INSERT INTO public.payment_allocations (association_id, payment_id, bill_id, amount_kobo, status) 
    VALUES (v_association_id, v_payment_id, (v_allocation->>'bill_id')::UUID, (v_allocation->>'amount_kobo')::BIGINT, 'verified');
  END LOOP;
  
  UPDATE public.webhook_events SET status = 'processed', processed_at = NOW() WHERE event_id = p_event_id;
  RETURN jsonb_build_object('status', 'applied', 'payment_id', v_payment_id);
END; $$;
REVOKE EXECUTE ON FUNCTION public.apply_provider_payment(TEXT, TEXT, BIGINT, TEXT, BIGINT, UUID, JSONB) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_provider_payment(TEXT, TEXT, BIGINT, TEXT, BIGINT, UUID, JSONB) TO service_role;


-- 4. Generate Bills for Unit
CREATE OR REPLACE FUNCTION public.generate_bills_for_unit(
  p_unit_id UUID, 
  p_financial_year_id UUID, 
  p_period_label TEXT
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE 
  v_user_id UUID; 
  v_membership_id UUID; 
  v_unit RECORD; 
  v_association_id UUID; 
  v_fy RECORD; 
  v_occupancy RECORD; 
  v_bill_config RECORD; 
  v_bill_id UUID; 
  v_generated_count INTEGER := 0; 
  v_months_chargeable INTEGER; 
  v_prorated_kobo BIGINT; 
  v_generated_bill_ids UUID[] := '{}';
BEGIN
  v_user_id := (SELECT auth.uid()); 
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501'; END IF;
  
  SELECT * INTO v_unit FROM public.units WHERE id = p_unit_id FOR UPDATE;
  IF v_unit IS NULL THEN RAISE EXCEPTION 'Unit not found' USING ERRCODE = 'P0002'; END IF;
  v_association_id := v_unit.association_id;
  
  SELECT id INTO v_membership_id FROM public.association_memberships 
  WHERE user_id = v_user_id AND association_id = v_association_id AND status = 'active' AND role IN ('treasurer', 'financial_secretary', 'president', 'association_admin') FOR UPDATE;
  IF v_membership_id IS NULL THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501'; END IF;
  
  SELECT * INTO v_fy FROM public.financial_years WHERE id = p_financial_year_id AND association_id = v_association_id FOR UPDATE;
  IF v_fy IS NULL OR v_fy.status != 'open' THEN RAISE EXCEPTION 'Financial year not found or closed' USING ERRCODE = 'P0001'; END IF;
  
  SELECT * INTO v_occupancy FROM public.unit_occupancies 
  WHERE unit_id = p_unit_id AND association_id = v_association_id AND valid_from <= v_fy.end_date AND (valid_to IS NULL OR valid_to >= v_fy.start_date) 
  ORDER BY valid_from DESC LIMIT 1;
  
  IF v_occupancy IS NULL THEN 
    v_months_chargeable := 12;
  ELSIF v_occupancy.valid_from >= v_fy.start_date THEN 
    v_months_chargeable := LEAST(12, EXTRACT(YEAR FROM age(v_fy.end_date, v_occupancy.valid_from)) * 12 + EXTRACT(MONTH FROM age(v_fy.end_date, v_occupancy.valid_from)) + 1);
  ELSE 
    v_months_chargeable := 12; 
  END IF;

  FOR v_bill_config IN SELECT * FROM public.bill_configs WHERE association_id = v_association_id AND effective_from <= v_fy.start_date AND (effective_to IS NULL OR effective_to >= v_fy.start_date) AND is_recurring = TRUE LOOP
    v_prorated_kobo := CASE WHEN v_months_chargeable < 12 THEN (v_bill_config.amount_kobo * v_months_chargeable + 6) / 12 ELSE v_bill_config.amount_kobo END;
    BEGIN
      INSERT INTO public.member_bills (association_id, unit_id, bill_config_id, financial_year_id, period_label, amount_kobo, status)
      VALUES (v_association_id, p_unit_id, v_bill_config.id, p_financial_year_id, p_period_label, v_prorated_kobo, 'open') RETURNING id INTO v_bill_id;
      v_generated_bill_ids := array_append(v_generated_bill_ids, v_bill_id); 
      v_generated_count := v_generated_count + 1;
    EXCEPTION WHEN unique_violation THEN CONTINUE; END;
  END LOOP;
  
  RETURN jsonb_build_object('unit_id', p_unit_id, 'bills_generated', v_generated_count, 'bill_ids', v_generated_bill_ids);
END; $$;
REVOKE EXECUTE ON FUNCTION public.generate_bills_for_unit(UUID, UUID, TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.generate_bills_for_unit(UUID, UUID, TEXT) TO authenticated;


-- 5. Run Invariant Checks
CREATE OR REPLACE FUNCTION public.run_invariant_checks() 
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE 
  v_violations JSONB := '[]'::jsonb; 
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count FROM public.bill_balances WHERE outstanding_kobo < 0;
  IF v_count > 0 THEN v_violations := v_violations || jsonb_build_object('invariant', 'I1', 'count', v_count); END IF;
  
  SELECT COUNT(*) INTO v_count FROM public.member_bills b 
  WHERE (COALESCE((SELECT SUM(amount_kobo) FROM public.payment_allocations WHERE bill_id = b.id AND status IN ('reserved', 'verified')), 0)) > b.amount_kobo;
  IF v_count > 0 THEN v_violations := v_violations || jsonb_build_object('invariant', 'I2', 'count', v_count); END IF;
  
  RETURN jsonb_build_object('violations', v_violations, 'checked_at', NOW());
END; $$;
REVOKE EXECUTE ON FUNCTION public.run_invariant_checks() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_invariant_checks() TO service_role;

COMMIT;
