import { supabase } from "@/integrations/supabase/client";
import { roundCurrency } from "@/lib/currency";

interface RecalculateResult {
  ok: boolean;
  usedFallback: boolean;
  error?: string;
}

export async function recalculateBillTotalsSafe(billId: string): Promise<RecalculateResult> {
  const { error: rpcError } = await (supabase as any).rpc("recalculate_bill_totals", { p_bill_id: billId });

  if (!rpcError) {
    return { ok: true, usedFallback: false };
  }

  try {
    const [{ data: bill, error: billError }, { data: items, error: itemsError }] = await Promise.all([
      supabase
        .from("bills")
        .select("advance_received, insurance_amount, paid_amount")
        .eq("id", billId)
        .maybeSingle(),
      (supabase as any)
        .from("bill_line_items")
        .select("taxable_amount, gst_amount")
        .eq("bill_id", billId),
    ]);

    if (billError || !bill) {
      return { ok: false, usedFallback: true, error: billError?.message || "Bill not found for recalculation" };
    }

    if (itemsError) {
      return { ok: false, usedFallback: true, error: itemsError.message };
    }

    const subtotal = roundCurrency((items || []).reduce((sum: number, item: any) => sum + Number(item.taxable_amount || 0), 0));
    const gst = roundCurrency((items || []).reduce((sum: number, item: any) => sum + Number(item.gst_amount || 0), 0));
    const total = roundCurrency(subtotal + gst);
    const advance = roundCurrency(Number(bill.advance_received || 0));
    const insurance = roundCurrency(Number(bill.insurance_amount || 0));
    const paid = roundCurrency(Number(bill.paid_amount || 0));
    const patientPayable = roundCurrency(Math.max(total - advance - insurance, 0));
    const balanceDue = roundCurrency(Math.max(patientPayable - paid, 0));
    const paymentStatus = balanceDue <= 0 && paid > 0 ? "paid" : paid > 0 ? "partial" : "unpaid";

    const { error: updateError } = await (supabase as any)
      .from("bills")
      .update({
        subtotal,
        taxable_amount: subtotal,
        gst_amount: gst,
        total_amount: total,
        patient_payable: patientPayable,
        balance_due: balanceDue,
        payment_status: paymentStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", billId);

    if (updateError) {
      return { ok: false, usedFallback: true, error: updateError.message };
    }

    console.error("recalculate_bill_totals RPC failed, client fallback applied:", rpcError.message);
    return { ok: true, usedFallback: true };
  } catch (fallbackError) {
    return {
      ok: false,
      usedFallback: true,
      error: fallbackError instanceof Error ? fallbackError.message : "Unknown bill recalculation error",
    };
  }
}