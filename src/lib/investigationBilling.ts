import { supabase } from "@/integrations/supabase/client";
import { generateBillNumber } from "@/hooks/useBillNumber";
import { autoPostJournalEntry } from "@/lib/accounting";
import { recalculateBillTotalsSafe } from "@/lib/billTotals";

/**
 * Auto-bill OPD lab/radiology charges when results are finalized.
 * Skips IPD patients (handled by discharge auto-pull).
 */
export async function autoBillOpdInvestigation(opts: {
  hospitalId: string;
  patientId: string;
  encounterId?: string | null;
  admissionId?: string | null;
  orderedBy: string;
  lineItems: {
    description: string;
    itemType: "lab_test" | "radiology";
    unitRate: number;
    quantity?: number;
    gstPercent?: number;
    gstAmount?: number;
  }[];
  billPrefix: string; // 'LAB' or 'RAD'
  sourceModule: string;
  sourceId: string;
}): Promise<{ billId: string; total: number } | null> {
  // Skip if IPD (admission-based billing handles it)
  if (opts.admissionId) return null;
  if (!opts.lineItems.length) return null;

  try {
    // Check if an existing OPD bill already covers this encounter
    let existingBill: any = null;
    if (opts.encounterId) {
      const { data } = await (supabase as any)
        .from("bills")
        .select("id, subtotal, gst_amount, total_amount, patient_payable, balance_due")
        .eq("hospital_id", opts.hospitalId)
        .eq("patient_id", opts.patientId)
        .eq("encounter_id", opts.encounterId)
        .eq("bill_type", "opd")
        .maybeSingle();
      existingBill = data;
    }

    // Calculate line item totals
    let subtotal = 0;
    let totalGst = 0;
    const lineItemPayloads: any[] = [];

    for (const item of opts.lineItems) {
      const qty = item.quantity || 1;
      const lineTotal = item.unitRate * qty;
      const gst = item.gstAmount || (item.gstPercent ? lineTotal * item.gstPercent / 100 : 0);
      subtotal += lineTotal;
      totalGst += gst;

      lineItemPayloads.push({
        hospital_id: opts.hospitalId,
        description: item.description,
        item_type: item.itemType === "lab_test" ? "lab_test" : "radiology",
        unit_rate: item.unitRate,
        quantity: qty,
        total_amount: lineTotal + gst,
        gst_percent: item.gstPercent || 0,
        gst_amount: gst,
        taxable_amount: lineTotal,
        service_date: new Date().toISOString().split("T")[0],
        source_module: opts.sourceModule,
        source_record_id: opts.sourceId,
        ordered_by: opts.orderedBy,
      });
    }

    const grandTotal = subtotal + totalGst;

    if (existingBill) {
      // Add line items to existing bill
      for (const lp of lineItemPayloads) {
        await (supabase as any).from("bill_line_items").insert({
          ...lp,
          bill_id: existingBill.id,
        });
      }

      const result = await recalculateBillTotalsSafe(existingBill.id);
      if (!result.ok) {
        console.error("Investigation bill recalculation failed:", result.error);
      }

      return { billId: existingBill.id, total: grandTotal };
    } else {
      // Create new bill
      const billNumber = await generateBillNumber(opts.hospitalId, opts.billPrefix);

      const { data: newBill, error: billErr } = await (supabase as any)
        .from("bills")
        .insert({
          hospital_id: opts.hospitalId,
          patient_id: opts.patientId,
          encounter_id: opts.encounterId || null,
          bill_number: billNumber,
          bill_type: "opd",
          bill_date: new Date().toISOString().split("T")[0],
          bill_status: "final",
          payment_status: "unpaid",
          subtotal,
          gst_amount: totalGst,
          total_amount: grandTotal,
          patient_payable: grandTotal,
          balance_due: grandTotal,
        })
        .select("id")
        .maybeSingle();

      if (billErr || !newBill) {
        console.error("Auto-bill creation failed:", billErr?.message);
        return null;
      }

      // Insert line items
      for (const lp of lineItemPayloads) {
        await (supabase as any).from("bill_line_items").insert({
          ...lp,
          bill_id: newBill.id,
        });
      }

      // Auto-post journal entry for revenue recognition
      try {
        const triggerEvent = opts.billPrefix === "LAB" ? "bill_finalized_lab" : "bill_finalized_radiology";
        await autoPostJournalEntry({
          triggerEvent,
          sourceModule: opts.sourceModule,
          sourceId: newBill.id,
          amount: grandTotal,
          description: `${opts.billPrefix} charges — Bill ${billNumber}`,
          hospitalId: opts.hospitalId,
          postedBy: opts.orderedBy,
        });
      } catch (e) {
        console.error("Journal auto-post error (non-blocking):", e);
      }

      return { billId: newBill.id, total: grandTotal };
    }
  } catch (err) {
    console.error("Auto-bill OPD investigation error:", err);
    return null;
  }
}

/**
 * Look up service rate from service_master, lab_test_master, or radiology_modalities.
 */
export async function getInvestigationRate(
  hospitalId: string,
  name: string,
  type: "lab" | "radiology"
): Promise<{ rate: number; gstPercent: number }> {
  // Try service_master first
  const itemType = type === "lab" ? "lab_test" : "radiology";
  const { data: svc } = await (supabase as any)
    .from("service_master")
    .select("rate, gst_percent")
    .eq("hospital_id", hospitalId)
    .eq("item_type", itemType)
    .ilike("name", `%${name}%`)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (svc?.rate) return { rate: svc.rate, gstPercent: svc.gst_percent || 0 };

  // Fallback: lab_test_master fee or radiology_modalities fee
  if (type === "lab") {
    const { data: lt } = await (supabase as any)
      .from("lab_test_master")
      .select("fee")
      .eq("hospital_id", hospitalId)
      .ilike("test_name", `%${name}%`)
      .limit(1)
      .maybeSingle();
    if (lt?.fee) return { rate: lt.fee, gstPercent: 0 };
  } else {
    const { data: rm } = await (supabase as any)
      .from("radiology_modalities")
      .select("fee")
      .eq("hospital_id", hospitalId)
      .ilike("name", `%${name}%`)
      .limit(1)
      .maybeSingle();
    if (rm?.fee) return { rate: rm.fee, gstPercent: 0 };
  }

  // Default fallback
  return { rate: type === "lab" ? 200 : 500, gstPercent: 0 };
}
