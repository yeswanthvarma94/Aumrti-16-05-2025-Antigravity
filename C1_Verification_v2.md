# C1 Verification Test Script — v2
**Test:** OPD Investigation → Lab → Result → Bill
**Fix under test:** Critical Fix C1 — investigation orders create real DB rows and trigger billing on result sign-off
**Verified by:** Sunita
**Last updated:** 2026-05-17

---

## Pre-flight Checklist

Before starting the test, confirm both migrations are applied to the Supabase database.
Run the following command from the project root:

```
supabase db push
```

Confirm both files are included in the push output:
- `20260516000001_investigation_order_billing_status.sql`
- `20260517000001_investigation_order_schema_hardening.sql`

**If these migrations have not been applied, every step from Step 4 onward will fail
at the Postgres level — the `billing_status` and `ordered_at` columns will not exist.**

---

## Test Steps

### Step 1 — Register test patient

Register a new patient at the front desk.
- UHID: `TEST-C1-001`
- Use any name, phone, and DOB.

> **PASS** if patient record is created and appears in patient search.
> **FAIL** if registration errors or UHID is not accepted.

---

### Step 2 — Create OPD consultation

Create an OPD walk-in token and start a consultation for `TEST-C1-001`.
Confirm an `opd_encounters` row and an `opd_tokens` row are created for today.

> **PASS** if ConsultationWorkspace opens for this patient.
> **FAIL** if encounter creation errors.

---

### Step 3 — Add CBC investigation in ConsultationWorkspace

In the Investigations section of ConsultationWorkspace, add:
- **CBC - Complete Blood Count**

Do not click Complete yet. The CBC is stored in prescription JSON only at this point —
no `lab_orders` row exists yet.

> **PASS** if CBC appears in the prescription investigations list.
> **FAIL** if the investigation input does not accept CBC.

---

### Step 3b — Trigger the revenue gate (REQUIRED — do not skip)

Click **Complete** in ConsultationWorkspace.

**Expected behaviour:**
1. The system calls `syncInvestigationOrders()`, which writes a real `lab_orders` row
   with `billing_status = 'unbilled'` to the database.
2. Immediately after, the revenue gate queries `lab_orders` directly and finds the
   unbilled CBC order.
3. A **"Revenue Protection"** toast appears:
   > "Revenue Protection: 1 unbilled investigation order(s) exist for this encounter.
   > Bill via Order Lab / Order Radiology before completing: CBC - Complete Blood Count"
4. Consultation does **NOT** close.

**VERIFY:** The toast names "CBC - Complete Blood Count" specifically.
> **FAIL** if the toast does not appear — the revenue gate is bypassed. Notify Priya.
> **FAIL** if the toast appears but does not name CBC — the test name lookup is broken.

Now bill the CBC order:
- Click **Order Lab** in the ConsultationWorkspace header (or via the billing modal).
- Complete payment for the CBC order.
- Confirm `billing_status` updates to `'billed'` on the order.

Click **Complete** a second time.

**VERIFY:** Consultation closes without a Revenue Protection toast.
> **PASS** if consultation closes and token status changes to `completed`.
> **FAIL** if the revenue gate fires again after billing — idempotency is broken. Notify Priya.

---

### Step 4 — Verify lab_orders row in Supabase

Open Supabase Table Editor → `lab_orders` table.
Filter by `patient_id` matching `TEST-C1-001`.

**VERIFY all of the following on the CBC row:**

| Column | Expected value |
|---|---|
| `status` | `'ordered'` |
| `billing_status` | `'unbilled'` (set at sync time, before billing) OR `'billed'` (if billing completed in Step 3b) |
| `hospital_id` | matches the test hospital |
| `patient_id` | matches `TEST-C1-001` |
| `encounter_id` | matches the OPD encounter from Step 2 (not null) |
| `ordered_by` | matches the logged-in user's `users.id` (not `auth.uid()`) |
| `ordered_at` | a recent timestamp |

> **PASS** if all columns match.
> **FAIL** if row does not exist — sync did not fire. Notify Priya.
> **FAIL** if `status = 'pending'` — wrong value; the correct initial status is `'ordered'`. Notify Priya.
> **FAIL** if `encounter_id` is null — FK link is broken. Notify Priya.

---

### Step 5 — Verify CBC appears in Lab module queue

Navigate to the Lab module → Worklist tab.

**VERIFY:** The CBC order for `TEST-C1-001` appears in the queue with priority
and patient name visible.

> **PASS** if order is visible.
> **FAIL** if not visible — Realtime subscription or order_date filter may be broken. Notify Priya.

---

### Step 6 — Process the order in the Lab module

Perform the following actions in the Lab Worklist:

1. Mark the order as **Sample Collected**.
2. Enter a result value for CBC (any valid numeric result).
3. Click **Validate All / Sign Off** to release the report.

> **PASS** if each status transition is accepted without errors.
> **FAIL** if any status update throws a constraint error — the status CHECK constraint
>   in the migration may have been applied with wrong values. Notify Meera.

---

### Step 7 — Verify lab_orders status after sign-off

Open Supabase Table Editor → `lab_orders`.
Filter by the same CBC order row.

**VERIFY:**

| Column | Expected value |
|---|---|
| `status` | `'completed'` |
| `billing_status` | `'billed'` |

> **PASS** if both columns match.
> **FAIL** if `status = 'resulted'` — wrong value; the correct completed status is `'completed'`. Notify Priya.
> **FAIL** if `billing_status` is still `'unbilled'` — auto-billing did not fire. Notify Ravi.

---

### Step 8 — Verify billing records

Check three tables for the CBC billing trail.

**8a — `lab_orders` table (already checked in Step 7)**
- `billing_status = 'billed'` ✓

**8b — `bills` table**
Filter by `patient_id` matching `TEST-C1-001`.

| Column | Expected value |
|---|---|
| `bill_type` | `'lab'` (NOT `'opd'`) |
| `payment_status` | `'unpaid'` |
| `total_amount` | CBC rate (from `service_master` or `lab_test_master`) |

> **FAIL** if `bill_type = 'opd'` — bill type miscategorisation bug is not fixed. Notify Ravi.
> **FAIL** if no `bills` row exists — auto-billing did not create a bill header. Notify Ravi.
>
> Note: `bills` has no `billing_status` column. The billing status for the order lives
> on `lab_orders.billing_status`. Do not look for `billing_status` in `bills`.

**8c — `bill_line_items` table**
Filter by `bill_id` from the row found in 8b.

| Column | Expected value |
|---|---|
| `item_type` | `'lab'` (NOT `'lab_test'`) |
| `description` | `'CBC - Complete Blood Count'` |
| `source_record_id` | matches the `lab_orders.id` for this order |
| `source_module` | `'lab'` |

> **FAIL** if `item_type = 'lab_test'` — item type bug is not fixed. Notify Ravi.
> **FAIL** if `source_record_id` is null or does not match the order — audit trail is broken. Notify Ravi.

---

### Step 9 — Verify journal entry

Open Supabase Table Editor → `journal_entries`.
Filter by `source_id` matching the `bills.id` from Step 8b.

**Pre-condition:** This step requires an `auto_posting_rules` row to exist for this hospital
with `trigger_event = 'bill_finalized_lab'` and `is_active = true`. If no such rule is
configured, `autoPostJournalEntry()` silently skips and no entry is created — this is
correct behaviour, not a bug.

**If the rule IS configured:**

| Column | Expected value |
|---|---|
| `source_module` | `'lab'` |
| `total_debit` | matches `bills.total_amount` |
| `total_credit` | matches `bills.total_amount` |
| `is_balanced` | `true` |

And `journal_line_items` should have two rows (debit + credit) linked to this entry.

> **PASS** if journal entry and two line items exist when rule is configured.
> **PASS** if no entry exists AND no `auto_posting_rules` row is configured — expected.
> **FAIL** if rule IS configured but no journal entry exists — `autoPostJournalEntry()` not called. Notify Ravi.

---

### Step 10 — RLS isolation (cross-hospital)

Log in as a test user belonging to a **different hospital** (Hospital B).

**VERIFY:** The `TEST-C1-001` patient, their `lab_orders` row, `bills` row, and
`bill_line_items` rows are completely invisible.

Attempt the following queries as Hospital B user (via Supabase Table Editor or app):
- `SELECT * FROM lab_orders WHERE patient_id = <TEST-C1-001 patient_id>` → must return 0 rows
- `SELECT * FROM bills WHERE patient_id = <TEST-C1-001 patient_id>` → must return 0 rows

> **PASS** if all queries return 0 rows.
> **CRITICAL FAIL** if any rows are visible — RLS isolation is breached. This is a data
>   privacy incident. Notify Meera immediately and do not proceed with any other testing.
>
> Note: RLS only takes effect if the migrations in the pre-flight checklist have been applied.
> If `supabase db push` was not run before testing, this step cannot be trusted.

---

## Report Format

For each step record:

```
Step N: PASS / FAIL / BLOCKED
If FAIL: <exact error message or observed value> → notify <agent name>
```

---

## Escalation Map

| Symptom | Notify |
|---|---|
| `lab_orders` row not created on Complete | Priya |
| Revenue gate does not fire / fires after billing | Priya |
| Status CHECK constraint violation on insert | Meera |
| `billing_status` still `'unbilled'` after sign-off | Ravi |
| `bill_type = 'opd'` on lab bill | Ravi |
| `item_type = 'lab_test'` in `bill_line_items` | Ravi |
| Journal entry missing when rule is configured | Ravi |
| RLS isolation breach (cross-hospital data visible) | Meera |
