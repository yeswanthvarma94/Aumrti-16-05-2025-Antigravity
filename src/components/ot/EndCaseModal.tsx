import React, { useState } from "react";
import { X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { generateBillNumber } from "@/hooks/useBillNumber";
import { autoPostJournalEntry } from "@/lib/accounting";
import { calcGST, roundCurrency } from "@/lib/currency";
import { recalculateBillTotalsSafe } from "@/lib/billTotals";
import { getRate, SERVICE_RATE_CODES } from "@/lib/serviceRates";
import { useToast } from "@/hooks/use-toast";
import type { OTSchedule } from "@/pages/ot/OTPage";

interface Props {
  schedule: OTSchedule;
  onClose: () => void;
  onEnded: () => void;
}

const EndCaseModal: React.FC<Props> = ({ schedule, onClose, onEnded }) => {
  const { toast } = useToast();
  const [postOpDx, setPostOpDx] = useState("");
  const [outcome, setOutcome] = useState("success");
  const [complications, setComplications] = useState("");
  const [saving, setSaving] = useState(false);

  const elapsed = schedule.actual_start_time
    ? Math.round((Date.now() - new Date(schedule.actual_start_time).getTime()) / 60000)
    : 0;

  const triggerOTBilling = async (otSchedule: OTSchedule) => {
    const { data: userData } = await supabase.rpc("get_user_hospital_id") as any;
    const hospitalId = userData;
    if (!hospitalId) return;

    if (!otSchedule.admission_id) {
      toast({ title: "OT completed. Create bill manually for OPD procedure." });
      return;
    }

    // Find or create IPD bill
    const { data: existingBill } = await supabase
      .from("bills")
      .select("id, total_amount, balance_due")
      .eq("hospital_id", hospitalId)
      .eq("admission_id", otSchedule.admission_id)
      .eq("bill_type", "ipd")
      .maybeSingle();

    let billId = existingBill?.id;

    if (!billId) {
      const today = new Date().toISOString().split("T")[0];
      const billNum = await generateBillNumber(hospitalId, "BILL");
      const { data: newBill } = await supabase
        .from("bills")
        .insert({
          hospital_id: hospitalId,
          patient_id: otSchedule.patient_id,
          admission_id: otSchedule.admission_id,
          bill_number: billNum,
          bill_type: "ipd",
          bill_date: today,
          bill_status: "draft",
          payment_status: "unpaid",
          total_amount: 0,
          balance_due: 0,
        })
        .select("id")
        .maybeSingle();
      billId = newBill?.id;
    }

    if (!billId) return;

    // Fetch rates from service_master (per-procedure overrides)
    const getServiceMasterRate = async (itemType: string, fallback: number) => {
      const { data } = await supabase
        .from("service_master")
        .select("fee, gst_percent, gst_applicable, hsn_code")
        .eq("hospital_id", hospitalId)
        .eq("item_type", itemType)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();
      if (!data) return { fee: fallback, gstPct: 0, gst: 0, hsn: "" };
      const fee = Number(data.fee) || fallback;
      const gstPct = data.gst_applicable ? (Number(data.gst_percent) || 0) : 0;
      return { fee, gstPct, gst: calcGST(fee, gstPct), hsn: data.hsn_code || "" };
    };

    // Hospital-configurable fallbacks from service_rates (no hardcoded amounts)
    const anaesFallback = await getRate(hospitalId, SERVICE_RATE_CODES.ANAESTHESIA_FEE, 1500);
    const surgeryFallback = await getRate(hospitalId, SERVICE_RATE_CODES.SURGERY_FEE, 5000);

    const otRate = await getServiceMasterRate("ot_charge", 2000);
    const surgRate = await getServiceMasterRate("surgeon_fee", surgeryFallback);
    const anaesRate = await getServiceMasterRate("anaesthesia_fee", anaesFallback);

    // Calculate OT time charge
    const actualDuration =
      otSchedule.actual_start_time && otSchedule.actual_end_time
        ? Math.ceil(
            (new Date(otSchedule.actual_end_time).getTime() -
              new Date(otSchedule.actual_start_time).getTime()) /
              3600000
          )
        : Math.ceil((otSchedule.estimated_duration_minutes || 60) / 60);

    const hours = Math.max(1, actualDuration);
    const otTimeCharge = roundCurrency(hours * otRate.fee);
    const otTimeGst = calcGST(otTimeCharge, otRate.gstPct);

    // Fetch existing OT line items for this schedule (deduplication)
    const { data: existingOTItems } = await (supabase as any)
      .from("bill_line_items")
      .select("source_dedupe_key")
      .eq("bill_id", billId)
      .eq("source_module", "ot");
    const existingDedupeKeys = new Set<string>(
      (existingOTItems || []).map((i: any) => i.source_dedupe_key).filter(Boolean)
    );

    const lineItems: any[] = [];
    const addItem = (item: any) => {
      if (item.source_dedupe_key && existingDedupeKeys.has(item.source_dedupe_key)) return;
      lineItems.push(item);
    };

    // OT Time charge
    addItem({
      hospital_id: hospitalId, bill_id: billId,
      item_type: "ot_charge",
      description: `OT Charges: ${otSchedule.surgery_name} (${hours} hr)`,
      quantity: hours, unit_rate: otRate.fee,
      taxable_amount: otTimeCharge, gst_percent: otRate.gstPct,
      gst_amount: otTimeGst, total_amount: otTimeCharge + otTimeGst,
      hsn_code: otRate.hsn || "999315", source_module: "ot",
      source_record_id: otSchedule.id,
      source_dedupe_key: `ot:${otSchedule.id}:ot_charge`,
    });

    // Surgeon fee
    if (otSchedule.surgeon_id) {
      addItem({
        hospital_id: hospitalId, bill_id: billId,
        item_type: "surgeon_fee",
        description: `Surgeon Fee: ${otSchedule.surgery_name}`,
        quantity: 1, unit_rate: surgRate.fee,
        taxable_amount: surgRate.fee, gst_percent: surgRate.gstPct,
        gst_amount: surgRate.gst, total_amount: surgRate.fee + surgRate.gst,
        hsn_code: surgRate.hsn || "999316", source_module: "ot",
        source_record_id: otSchedule.id,
        source_dedupe_key: `ot:${otSchedule.id}:surgeon_fee`,
      });
    }

    // Anaesthesia fee
    if (otSchedule.anaesthetist_id) {
      addItem({
        hospital_id: hospitalId, bill_id: billId,
        item_type: "anaesthesia_fee",
        description: `Anaesthesia: ${otSchedule.anaesthesia_type || "General"}`,
        quantity: 1, unit_rate: anaesRate.fee,
        taxable_amount: anaesRate.fee, gst_percent: anaesRate.gstPct,
        gst_amount: anaesRate.gst, total_amount: anaesRate.fee + anaesRate.gst,
        hsn_code: anaesRate.hsn || "999317", source_module: "ot",
        source_record_id: otSchedule.id,
        source_dedupe_key: `ot:${otSchedule.id}:anaesthesia_fee`,
      });
    }

    // Implants/consumables
    const implants = (otSchedule.implants_consumables as any[]) || [];
    implants.forEach((imp: any, idx: number) => {
      const cost = Number(imp.cost || imp.price || 0);
      if (cost <= 0) return;
      const qty = Number(imp.quantity || 1);
      const total = roundCurrency(cost * qty);
      addItem({
        hospital_id: hospitalId, bill_id: billId,
        item_type: "implant",
        description: `Implant: ${imp.name || imp.item_name || "Surgical Consumable"}`,
        quantity: qty, unit_rate: cost,
        taxable_amount: total, gst_percent: 12,
        gst_amount: calcGST(total, 12),
        total_amount: roundCurrency(total + calcGST(total, 12)),
        hsn_code: "9021", source_module: "ot",
        source_record_id: otSchedule.id,
        source_dedupe_key: `ot:${otSchedule.id}:implant:${idx}`,
      });
    });

    // Insert line items — trigger auto-recalculates bill totals
    if (lineItems.length > 0) {
      await supabase.from("bill_line_items").insert(lineItems);

      const result = await recalculateBillTotalsSafe(billId);
      if (!result.ok) {
        console.error("OT bill recalculation failed:", result.error);
        toast({ title: "OT bill totals need refresh", description: result.error || "Charges were added but totals could not be updated", variant: "destructive" });
      }

      // Re-fetch updated bill total for journal entry
      const { data: updatedBill } = await supabase.from("bills").select("total_amount").eq("id", billId).maybeSingle();
      const total = Number(updatedBill?.total_amount || 0);

      const { data: { user: authUser } } = await supabase.auth.getUser();
      await autoPostJournalEntry({
        triggerEvent: "bill_finalized_ot",
        sourceModule: "ot",
        sourceId: billId,
        amount: total,
        description: `OT Revenue - ${otSchedule.surgery_name}`,
        hospitalId,
        postedBy: authUser?.id || "",
      });

      // Mark schedule as billed
      await (supabase as any)
        .from("ot_schedules")
        .update({ billed: true, bill_id: billId })
        .eq("id", otSchedule.id);

      toast({ title: `OT charges auto-billed: ₹${total.toLocaleString("en-IN")}` });
    } else if (existingDedupeKeys.size > 0) {
      toast({ title: "OT charges already billed", description: "No new items to add" });
    }
  };

  const handleEnd = async () => {
    setSaving(true);
    const endTime = new Date().toISOString();
    const { error } = await supabase
      .from("ot_schedules")
      .update({
        status: "completed",
        actual_end_time: endTime,
        post_op_diagnosis: postOpDx || null,
        booking_notes: complications
          ? `${schedule.booking_notes || ""}\n\nComplications: ${complications}`.trim()
          : schedule.booking_notes,
      })
      .eq("id", schedule.id);

    if (error) {
      toast({ title: "Failed to end case", description: error.message, variant: "destructive" });
      setSaving(false);
      return;
    }

    toast({ title: `Case completed ✓ — ${schedule.surgery_name} (${elapsed} min)` });

    // Trigger OT billing with the actual_end_time set
    await triggerOTBilling({ ...schedule, actual_end_time: endTime, status: "completed" });

    setSaving(false);
    onEnded();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card rounded-2xl w-full max-w-[480px] shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-border">
          <h2 className="text-lg font-bold text-foreground">End Case</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1 active:scale-95"><X size={18} /></button>
        </div>

        <div className="px-6 py-4 space-y-4">
          <div className="bg-muted/50 rounded-lg p-3">
            <p className="text-sm font-bold text-foreground">{schedule.surgery_name}</p>
            <p className="text-xs text-muted-foreground">{schedule.patient?.full_name} · {elapsed} min elapsed</p>
          </div>

          <div>
            <label className="text-xs font-medium mb-1 block">Post-op Diagnosis</label>
            <input value={postOpDx} onChange={(e) => setPostOpDx(e.target.value)} placeholder="Final diagnosis after surgery" className="w-full text-sm border border-border rounded-md px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-primary" />
          </div>

          <div>
            <label className="text-xs font-medium mb-2 block">Case Outcome</label>
            <div className="space-y-2">
              {[
                { value: "success", label: "Completed Successfully" },
                { value: "complications", label: "Completed with Complications" },
                { value: "abandoned", label: "Abandoned / Converted" },
              ].map((opt) => (
                <label key={opt.value} className="flex items-center gap-3 cursor-pointer">
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${outcome === opt.value ? "border-primary" : "border-muted-foreground/30"}`}>
                    {outcome === opt.value && <div className="w-2 h-2 rounded-full bg-primary" />}
                  </div>
                  <span className="text-sm text-foreground">{opt.label}</span>
                </label>
              ))}
            </div>
          </div>

          {outcome === "complications" && (
            <div>
              <label className="text-xs font-medium mb-1 block">Describe complications</label>
              <textarea value={complications} onChange={(e) => setComplications(e.target.value)} rows={2} className="w-full text-sm border border-border rounded-md px-3 py-2 bg-background resize-none focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
          )}
        </div>

        <div className="px-6 pb-5 pt-2">
          <button
            onClick={handleEnd}
            disabled={saving}
            className="w-full bg-[hsl(var(--sidebar-accent))] text-white font-semibold py-3 rounded-lg hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {saving ? "Ending & Billing..." : "✓ End Case & Close OT"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default EndCaseModal;
