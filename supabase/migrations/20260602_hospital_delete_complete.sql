-- ============================================================
-- COMPLETE HOSPITAL DELETION — purge_hospital() function
-- Migration: 20260602_hospital_delete_complete.sql
--
-- WHY A FUNCTION instead of ALTER TABLE cascade upgrades:
--   Dynamically scanning pg_catalog + running many ALTER TABLE
--   statements during migration causes statement timeouts on
--   Supabase hosted instances.
--
-- THIS approach: CREATE a stored function that does explicit
--   DELETEs in the right order, bypassing FK constraints
--   entirely.  The function runs at deletion time (not migration
--   time), so no timeout risk.
--
-- The edge function delete-hospital calls this via supabase.rpc().
-- ============================================================

CREATE OR REPLACE FUNCTION public.purge_hospital(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN

  -- ── Step 1: Transitive grandchild tables ─────────────────────
  -- These reference a hospital-owned table (not hospitals directly),
  -- so they must be deleted BEFORE their parent or FK will block.

  -- OT team members → ot_schedules
  DELETE FROM ot_team_members
  WHERE ot_schedule_id IN (
    SELECT id FROM ot_schedules WHERE hospital_id = p_id
  );

  -- OT checklists items (if they exist and reference ot_schedules)
  DELETE FROM ot_checklist_items
  WHERE checklist_id IN (
    SELECT id FROM ot_checklists WHERE hospital_id = p_id
  );

  -- Pharmacy dispensing items → pharmacy_dispensing
  DELETE FROM pharmacy_dispensing_items
  WHERE dispense_id IN (
    SELECT id FROM pharmacy_dispensing WHERE hospital_id = p_id
  );

  -- Purchase order items → purchase_orders
  DELETE FROM po_items
  WHERE po_id IN (
    SELECT id FROM purchase_orders WHERE hospital_id = p_id
  );

  -- GRN items → grn_records
  DELETE FROM grn_items
  WHERE grn_id IN (
    SELECT id FROM grn_records WHERE hospital_id = p_id
  );

  -- Indent items → department_indents
  DELETE FROM indent_items
  WHERE indent_id IN (
    SELECT id FROM department_indents WHERE hospital_id = p_id
  );

  -- Lab order items → lab_orders
  DELETE FROM lab_order_items
  WHERE order_id IN (
    SELECT id FROM lab_orders WHERE hospital_id = p_id
  );

  -- Lab samples → lab_orders
  DELETE FROM lab_samples
  WHERE order_id IN (
    SELECT id FROM lab_orders WHERE hospital_id = p_id
  );

  -- Nursing MAR → admissions / patients (references auth.users too)
  DELETE FROM nursing_mar        WHERE hospital_id = p_id;
  DELETE FROM nursing_handovers  WHERE hospital_id = p_id;

  -- Teleconsult sessions (references auth.users)
  DELETE FROM teleconsult_sessions WHERE hospital_id = p_id;

  -- Bill line items → bills (may also have hospital_id, delete anyway)
  DELETE FROM bill_line_items
  WHERE bill_id IN (
    SELECT id FROM bills WHERE hospital_id = p_id
  );

  -- Bill payments → bills
  DELETE FROM bill_payments
  WHERE bill_id IN (
    SELECT id FROM bills WHERE hospital_id = p_id
  );

  -- Discount approvals → bills
  DELETE FROM discount_approvals WHERE hospital_id = p_id;

  -- Ward round notes → admissions
  DELETE FROM ward_round_notes
  WHERE admission_id IN (
    SELECT id FROM admissions WHERE hospital_id = p_id
  );

  -- IPD vitals / medications → admissions
  DELETE FROM ipd_vitals
  WHERE admission_id IN (
    SELECT id FROM admissions WHERE hospital_id = p_id
  );
  DELETE FROM ipd_medications
  WHERE admission_id IN (
    SELECT id FROM admissions WHERE hospital_id = p_id
  );

  -- ── Step 2: Direct hospital_id tables ────────────────────────
  -- Delete these explicitly so nothing blocks the hospital delete.
  -- (ON DELETE CASCADE from migration 20260601f should handle most
  -- of these automatically, but being explicit is safer.)

  DELETE FROM opd_tokens            WHERE hospital_id = p_id;
  DELETE FROM opd_encounters        WHERE hospital_id = p_id;
  DELETE FROM opd_visits            WHERE hospital_id = p_id;
  DELETE FROM prescriptions         WHERE hospital_id = p_id;
  DELETE FROM clinical_alerts       WHERE hospital_id = p_id;
  DELETE FROM admissions            WHERE hospital_id = p_id;
  DELETE FROM ed_visits             WHERE hospital_id = p_id;
  DELETE FROM ot_schedules          WHERE hospital_id = p_id;
  DELETE FROM ot_checklists         WHERE hospital_id = p_id;
  DELETE FROM ot_rooms              WHERE hospital_id = p_id;
  DELETE FROM lab_orders            WHERE hospital_id = p_id;
  DELETE FROM radiology_orders      WHERE hospital_id = p_id;
  DELETE FROM radiology_reports     WHERE hospital_id = p_id;
  DELETE FROM radiology_modalities  WHERE hospital_id = p_id;
  DELETE FROM pharmacy_dispensing   WHERE hospital_id = p_id;
  DELETE FROM drug_batches          WHERE hospital_id = p_id;
  DELETE FROM ndps_register         WHERE hospital_id = p_id;
  DELETE FROM pharmacy_stock_alerts WHERE hospital_id = p_id;
  DELETE FROM nursing_procedures    WHERE hospital_id = p_id;
  DELETE FROM pcpndt_form_f         WHERE hospital_id = p_id;
  DELETE FROM bills                 WHERE hospital_id = p_id;
  DELETE FROM advance_receipts      WHERE hospital_id = p_id;
  DELETE FROM insurance_pre_auth    WHERE hospital_id = p_id;
  DELETE FROM insurance_claims      WHERE hospital_id = p_id;
  DELETE FROM tpa_config            WHERE hospital_id = p_id;
  DELETE FROM staff_profiles        WHERE hospital_id = p_id;
  DELETE FROM staff_attendance      WHERE hospital_id = p_id;
  DELETE FROM leave_requests        WHERE hospital_id = p_id;
  DELETE FROM leave_balance         WHERE hospital_id = p_id;
  DELETE FROM payroll_runs          WHERE hospital_id = p_id;
  DELETE FROM payroll_items         WHERE hospital_id = p_id;
  DELETE FROM shift_master          WHERE hospital_id = p_id;
  DELETE FROM duty_roster           WHERE hospital_id = p_id;
  DELETE FROM inventory_items       WHERE hospital_id = p_id;
  DELETE FROM inventory_stock       WHERE hospital_id = p_id;
  DELETE FROM vendors               WHERE hospital_id = p_id;
  DELETE FROM purchase_orders       WHERE hospital_id = p_id;
  DELETE FROM grn_records           WHERE hospital_id = p_id;
  DELETE FROM department_indents    WHERE hospital_id = p_id;
  DELETE FROM stock_transactions    WHERE hospital_id = p_id;
  DELETE FROM drug_master           WHERE hospital_id = p_id;
  DELETE FROM nabh_criteria         WHERE hospital_id = p_id;
  DELETE FROM quality_indicators    WHERE hospital_id = p_id;
  DELETE FROM audit_records         WHERE hospital_id = p_id;
  DELETE FROM incident_reports      WHERE hospital_id = p_id;
  DELETE FROM capa_records          WHERE hospital_id = p_id;
  DELETE FROM ai_digests            WHERE hospital_id = p_id;
  DELETE FROM patient_portal_sessions WHERE hospital_id = p_id;
  DELETE FROM patient_feedback      WHERE hospital_id = p_id;
  DELETE FROM whatsapp_notifications WHERE hospital_id = p_id;
  DELETE FROM role_permissions      WHERE hospital_id = p_id;
  DELETE FROM referral_doctors      WHERE hospital_id = p_id;
  DELETE FROM marketing_campaigns   WHERE hospital_id = p_id;
  DELETE FROM patient_acquisition   WHERE hospital_id = p_id;
  DELETE FROM online_reviews        WHERE hospital_id = p_id;
  DELETE FROM patient_segments      WHERE hospital_id = p_id;
  DELETE FROM patients              WHERE hospital_id = p_id;
  DELETE FROM beds                  WHERE hospital_id = p_id;
  DELETE FROM wards                 WHERE hospital_id = p_id;
  DELETE FROM departments           WHERE hospital_id = p_id;
  DELETE FROM service_master        WHERE hospital_id = p_id;
  DELETE FROM lab_test_master       WHERE hospital_id = p_id;
  DELETE FROM branches              WHERE hospital_id = p_id;

  -- Users last (they reference auth.users — auth deletion is
  -- handled by the edge function AFTER this function completes)
  DELETE FROM users                 WHERE hospital_id = p_id;

  -- ── Step 3: Hospital itself ───────────────────────────────────
  DELETE FROM hospitals WHERE id = p_id;

  RAISE NOTICE 'Hospital % fully purged.', p_id;
END;
$$;

-- Only the service_role (edge function) may call this.
REVOKE ALL   ON FUNCTION public.purge_hospital(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_hospital(uuid) TO service_role;
