import React, { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, X, ChevronDown, ChevronUp, Sparkles, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BillRecord } from "@/pages/billing/BillingPage";
import type { LineItem } from "@/components/billing/BillEditor";
import LeakageScanner from "@/components/billing/LeakageScanner";
import UnbilledServicesModal from "@/components/billing/UnbilledServicesModal";
import { autoPullAdmissionCharges } from "@/lib/ipdBilling";
import { formatINR } from "@/lib/currency";
import { getDefaultGSTRate } from "@/lib/gstRules";

function numberToWords(n: number): string {
  if (n === 0) return "Zero";
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
    "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const convert = (num: number): string => {
    if (num < 20) return ones[num];
    if (num < 100) return tens[Math.floor(num / 10)] + (num % 10 ? " " + ones[num % 10] : "");
    if (num < 1000) return ones[Math.floor(num / 100)] + " Hundred" + (num % 100 ? " " + convert(num % 100) : "");
    if (num < 100000) return convert(Math.floor(num / 1000)) + " Thousand" + (num % 1000 ? " " + convert(num % 1000) : "");
    if (num < 10000000) return convert(Math.floor(num / 100000)) + " Lakh" + (num % 100000 ? " " + convert(num % 100000) : "");
    return convert(Math.floor(num / 10000000)) + " Crore" + (num % 10000000 ? " " + convert(num % 10000000) : "");
  };
  return convert(Math.floor(n));
}

interface Props {
  bill: BillRecord;
  hospitalId: string | null;
  lineItems: LineItem[];
  loading: boolean;
  onRefresh: () => void;
}

const ITEM_TYPE_COLORS: Record<string, string> = {
  consultation: "bg-primary/10 text-primary",
  lab: "bg-success/10 text-success",
  radiology: "bg-accent/10 text-accent",
  pharmacy: "bg-secondary/10 text-secondary",
  room_charge: "bg-muted text-muted-foreground",
  procedure: "bg-primary/10 text-primary",
  nursing: "bg-success/10 text-success",
};

const LineItemsTab: React.FC<Props> = ({ bill, hospitalId, lineItems, loading, onRefresh }) => {
  const { toast } = useToast();
  const [serviceSearch, setServiceSearch] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [showSearch, setShowSearch] = useState(false);
  const [showGst, setShowGst] = useState(false);
  const [showUnbilled, setShowUnbilled] = useState(false);
  const [recalculating, setRecalculating] = useState(false);

  const handleRecalcIPD = async () => {
    if (!hospitalId || !bill.admission_id) return;
    setRecalculating(true);
    const result = await autoPullAdmissionCharges(bill.id, bill.admission_id, hospitalId);
    setRecalculating(false);
    if (!result.ok) {
      toast({ title: "Recalculation failed", description: result.error || "Try again", variant: "destructive" });
      return;
    }
    toast({
      title: result.insertedCount > 0
        ? `Pulled ${result.insertedCount} new charges`
        : "Already up to date",
      description: "Room, doctor visits, lab, radiology, pharmacy, nursing.",
    });
    if (result.usedFallbackRate) {
      toast({ title: "Using fallback rates", description: "Configure service rates in Settings → Service Rates." });
    }
    onRefresh();
  };

  const isEditable = bill.bill_status === "draft" || bill.bill_status === "final";

  const handleServiceSearch = async (q: string) => {
    setServiceSearch(q);
    if (!q || !hospitalId) { setSearchResults([]); return; }
    const { data } = await supabase
      .from("service_master")
      .select("id, name, fee, category, gst_percent, hsn_code, item_type")
      .eq("hospital_id", hospitalId)
      .eq("is_active", true)
      .ilike("name", `%${q}%`)
      .limit(10);
    setSearchResults(data || []);
  };

  // Load all services when search opens (show initial list)
  const loadInitialServices = async () => {
    if (!hospitalId) return;
    const { data } = await supabase
      .from("service_master")
      .select("id, name, fee, category, gst_percent, hsn_code, item_type")
      .eq("hospital_id", hospitalId)
      .eq("is_active", true)
      .order("name")
      .limit(20);
    setSearchResults(data || []);
  };

  const VALID_ITEM_TYPES = ['consultation','procedure','room_charge','lab','radiology','pharmacy','surgery','package','nursing','consumable','blood','oxygen','other','service'];

  const addServiceItem = async (svc: any) => {
    if (!hospitalId) return;
    const rate = Number(svc.fee) || 0;
    const itemType = VALID_ITEM_TYPES.includes(svc.item_type) ? svc.item_type : "other";
    // Use GST from service master if set; otherwise derive from rule engine
    const gstPct = svc.gst_percent != null && svc.gst_percent > 0
      ? Number(svc.gst_percent)
      : getDefaultGSTRate(itemType, rate);
    const taxable = rate;
    const gstAmt = taxable * gstPct / 100;
    const total = taxable + gstAmt;

    const { error } = await supabase.from("bill_line_items").insert({
      hospital_id: hospitalId,
      bill_id: bill.id,
      service_id: svc.id,
      item_type: itemType,
      description: svc.name,
      quantity: 1,
      unit_rate: rate,
      taxable_amount: taxable,
      gst_percent: gstPct,
      gst_amount: gstAmt,
      total_amount: total,
      hsn_code: svc.hsn_code,
    });
    if (error) {
      toast({ title: "Failed to add service", description: error.message, variant: "destructive" });
      return;
    }
    setShowSearch(false);
    setServiceSearch("");
    onRefresh();
    toast({ title: `Added: ${svc.name}` });
  };

  const addCustomItem = async (desc: string) => {
    if (!hospitalId || !desc) return;
    const { error } = await supabase.from("bill_line_items").insert({
      hospital_id: hospitalId,
      bill_id: bill.id,
      item_type: "other",
      description: desc,
      quantity: 1,
      unit_rate: 0,
      taxable_amount: 0,
      gst_percent: 0,
      gst_amount: 0,
      total_amount: 0,
    });
    if (error) {
      toast({ title: "Failed to add item", description: error.message, variant: "destructive" });
      return;
    }
    setShowSearch(false);
    setServiceSearch("");
    onRefresh();
  };

  const deleteItem = async (itemId: string) => {
    // Hard delete (is_deleted column not in schema yet)
    await (supabase as any).from("bill_line_items").delete().eq("id", itemId);
    onRefresh();
  };

  const updateItem = async (itemId: string, field: string, value: number) => {
    const item = lineItems.find((i) => i.id === itemId);
    if (!item) return;
    const updated = { ...item, [field]: value };
    const taxable = updated.quantity * updated.unit_rate * (1 - updated.discount_percent / 100);
    const gstAmt = taxable * updated.gst_percent / 100;
    const total = taxable + gstAmt;
    await supabase.from("bill_line_items").update({
      taxable_amount: taxable,
      discount_amount: updated.quantity * updated.unit_rate * updated.discount_percent / 100,
      gst_amount: gstAmt,
      total_amount: total,
      ...(field === "quantity" ? { quantity: value } : {}),
      ...(field === "unit_rate" ? { unit_rate: value } : {}),
      ...(field === "discount_percent" ? { discount_percent: value } : {}),
      ...(field === "gst_percent" ? { gst_percent: value } : {}),
    } as any).eq("id", itemId);
    onRefresh();
  };

  // Calculate totals
  const subtotal = lineItems.reduce((s, i) => s + i.quantity * i.unit_rate * (1 - i.discount_percent / 100), 0);
  const gstBreakdown: Record<number, number> = {};
  lineItems.forEach((i) => {
    const taxable = i.quantity * i.unit_rate * (1 - i.discount_percent / 100);
    const gst = taxable * i.gst_percent / 100;
    gstBreakdown[i.gst_percent] = (gstBreakdown[i.gst_percent] || 0) + gst;
  });
  const totalGst = Object.values(gstBreakdown).reduce((a, b) => a + b, 0);
  const grossTotal = subtotal + totalGst;
  const patientPayable = grossTotal - bill.advance_received - bill.insurance_amount;
  const balanceDue = patientPayable - bill.paid_amount;

  return (
    <div className="flex flex-col h-full">
      {/* Auto-pull banner */}
      {(bill.encounter_id || bill.admission_id) && lineItems.some((i) => i.source_module) && (
        <div className="bg-primary/5 border-l-[3px] border-l-primary px-4 py-2.5 text-xs text-primary flex-shrink-0">
          🔗 Auto-charges pulled from linked clinical modules · {lineItems.filter((i) => i.source_module).length} items
        </div>
      )}

      {/* Empty-state CTA for IPD drafts with 0 items */}
      {bill.bill_type === "ipd" && bill.admission_id && lineItems.length === 0 && !loading && (
        <div className="m-4 p-6 border-2 border-dashed border-accent/40 rounded-lg bg-accent/5 text-center flex-shrink-0">
          <Sparkles className="h-8 w-8 text-accent mx-auto mb-2" />
          <p className="text-sm font-bold text-foreground mb-1">No charges yet on this IPD bill</p>
          <p className="text-xs text-muted-foreground mb-3">
            Pull room/bed days, doctor visits, lab orders, radiology, pharmacy dispenses and nursing procedures linked to this admission.
          </p>
          <Button size="sm" className="gap-1.5 text-xs bg-accent hover:bg-accent/90 text-accent-foreground" onClick={handleRecalcIPD} disabled={recalculating}>
            <RefreshCw size={14} className={recalculating ? "animate-spin" : ""} />
            {recalculating ? "Recalculating..." : "Recalculate IPD Charges"}
          </Button>
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 sticky top-0">
            <tr className="text-[11px] font-bold uppercase text-muted-foreground">
              <th className="px-3 py-2 text-left w-8">#</th>
              <th className="px-3 py-2 text-left">Description</th>
              <th className="px-3 py-2 text-center w-20">Qty</th>
              <th className="px-3 py-2 text-center w-24">Rate (₹)</th>
              <th className="px-3 py-2 text-center w-16">Disc%</th>
              <th className="px-3 py-2 text-center w-16">GST%</th>
              <th className="px-3 py-2 text-right w-24">Amount (₹)</th>
              {isEditable && <th className="px-3 py-2 w-10" />}
            </tr>
          </thead>
          <tbody>
            {lineItems.map((item, idx) => {
              const taxable = item.quantity * item.unit_rate * (1 - item.discount_percent / 100);
              const gst = taxable * item.gst_percent / 100;
              const amount = taxable + gst;
              const typeColor = ITEM_TYPE_COLORS[item.item_type] || "bg-muted text-muted-foreground";
              return (
                <tr key={item.id} className="border-b border-border hover:bg-muted/30">
                  <td className="px-3 py-2 text-[10px] text-muted-foreground">{idx + 1}</td>
                  <td className="px-3 py-2">
                    <span className="text-[13px] text-foreground">{item.description}</span>
                    <div className="flex gap-1 mt-0.5">
                      <Badge className={cn("text-[9px] h-4", typeColor)}>{item.item_type}</Badge>
                      {item.source_module && <Badge className="text-[9px] h-4 bg-primary/10 text-primary">↗ Auto</Badge>}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-center">
                    {isEditable ? (
                      <Input type="number" min={0.5} step={0.5} value={item.quantity}
                        onChange={(e) => updateItem(item.id, "quantity", Number(e.target.value))}
                        className="h-7 w-16 text-center text-xs mx-auto" />
                    ) : item.quantity}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {isEditable ? (
                      <Input type="number" min={0} value={item.unit_rate}
                        onChange={(e) => updateItem(item.id, "unit_rate", Number(e.target.value))}
                        className="h-7 w-20 text-center text-xs mx-auto" />
                    ) : formatINR(item.unit_rate)}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {isEditable ? (
                      <Input type="number" min={0} max={100} value={item.discount_percent}
                        onChange={(e) => updateItem(item.id, "discount_percent", Number(e.target.value))}
                        className="h-7 w-14 text-center text-xs mx-auto" />
                    ) : `${item.discount_percent}%`}
                  </td>
                  <td className="px-3 py-2 text-center text-xs">{item.gst_percent}%</td>
                  <td className="px-3 py-2 text-right font-bold text-[14px]">{formatINR(amount)}</td>
                  {isEditable && (
                    <td className="px-3 py-2">
                      <button onClick={() => deleteItem(item.id)} className="text-destructive hover:text-destructive/80">
                        <X size={14} />
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Add service */}
        {isEditable && (
          <div className="px-4 py-3">
            {showSearch ? (
              <div className="space-y-2">
                <Input
                  placeholder="Search service (e.g. Consultation, X-Ray, ECG)..."
                  value={serviceSearch}
                  onChange={(e) => handleServiceSearch(e.target.value)}
                  autoFocus
                  className="h-9 text-sm"
                />
                {searchResults.length > 0 && (
                  <div className="border border-border rounded-lg bg-card shadow-lg max-h-48 overflow-y-auto">
                    {searchResults.map((svc) => (
                      <button
                        key={svc.id}
                        onClick={() => addServiceItem(svc)}
                        className="w-full text-left px-3 py-2 hover:bg-muted/50 flex justify-between text-sm border-b border-border last:border-0"
                      >
                        <span>{svc.name}</span>
                        <span className="text-muted-foreground">{formatINR(Number(svc.fee) || 0)}</span>
                      </button>
                    ))}
                  </div>
                )}
                {searchResults.length === 0 && (
                  <div className="text-xs text-muted-foreground py-2">
                    {serviceSearch ? (
                      <Button variant="outline" size="sm" onClick={() => addCustomItem(serviceSearch)}>
                        + Add as custom item: "{serviceSearch}"
                      </Button>
                    ) : (
                      <span>No services found. Type to add a custom item, or seed services in Settings → Services.</span>
                    )}
                  </div>
                )}
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="text-[11px]" onClick={() => addCustomItem("Custom Charge")}>
                    + Custom Item
                  </Button>
                  <Button variant="ghost" size="sm" className="text-[11px]" onClick={() => { setShowSearch(false); setServiceSearch(""); setSearchResults([]); }}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 flex-wrap">
                <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={() => { setShowSearch(true); loadInitialServices(); }}>
                  <Plus size={14} /> Add Service
                </Button>
                {bill.admission_id && (
                  <>
                    <Button variant="outline" size="sm" className="gap-1 text-xs gap-1 border-primary/40 text-primary hover:bg-primary/5" onClick={() => setShowUnbilled(true)}>
                      <Sparkles size={14} /> Add Unbilled Services
                    </Button>
                    <Button variant="outline" size="sm" className="gap-1 text-xs border-accent/40 text-accent hover:bg-accent/5" onClick={handleRecalcIPD} disabled={recalculating}>
                      <RefreshCw size={14} className={recalculating ? "animate-spin" : ""} />
                      {recalculating ? "Recalculating..." : "Recalculate IPD Charges"}
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* AI Leakage Scanner */}
      <LeakageScanner bill={bill} hospitalId={hospitalId} lineItems={lineItems} onRefresh={onRefresh} />

      {/* Unbilled services modal — IPD only */}
      {showUnbilled && bill.admission_id && hospitalId && (
        <UnbilledServicesModal
          bill={bill}
          hospitalId={hospitalId}
          onClose={() => setShowUnbilled(false)}
          onAdded={onRefresh}
        />
      )}

      {/* Totals */}
      <div className="bg-card border-t-2 border-border px-5 py-4 flex-shrink-0">
        <div className="flex justify-end">
          <div className="w-72 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span>{formatINR(subtotal)}</span>
            </div>

            {bill.discount_amount > 0 && (
              <div className="flex justify-between text-destructive">
                <span>Discount ({bill.discount_percent}%)</span>
                <span>-{formatINR(bill.discount_amount)}</span>
              </div>
            )}

            <button
              onClick={() => setShowGst(!showGst)}
              className="flex justify-between w-full text-muted-foreground hover:text-foreground"
            >
              <span className="flex items-center gap-1">
                GST {showGst ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </span>
              <span>{formatINR(totalGst)}</span>
            </button>
            {showGst && Object.entries(gstBreakdown).filter(([, v]) => v > 0).map(([pct, amt]) => (
              <div key={pct} className="flex justify-between pl-4 text-xs text-muted-foreground">
                <span>GST {pct}%</span>
                <span>{formatINR(amt)}</span>
              </div>
            ))}

            <div className="flex justify-between font-bold text-base pt-1 border-t border-border">
              <span>Gross Total</span>
              <span>{formatINR(grossTotal)}</span>
            </div>

            {bill.advance_received > 0 && (
              <div className="flex justify-between text-success">
                <span>Advance received</span>
                <span>-{formatINR(bill.advance_received)}</span>
              </div>
            )}
            {bill.insurance_amount > 0 && (
              <div className="flex justify-between text-primary">
                <span>Insurance covers</span>
                <span>-{formatINR(bill.insurance_amount)}</span>
              </div>
            )}

            <div className="flex justify-between font-bold text-xl pt-1 border-t border-border">
              <span>Patient Payable</span>
              <span>{formatINR(Math.max(0, patientPayable))}</span>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Rupees {numberToWords(Math.max(0, Math.round(patientPayable)))} Only
            </p>

            {bill.paid_amount > 0 && (
              <div className="flex justify-between text-success">
                <span>Paid</span>
                <span>{formatINR(bill.paid_amount)}</span>
              </div>
            )}
            {balanceDue > 0 && (
              <div className="flex justify-between text-destructive font-bold">
                <span>Balance Due</span>
                <span>{formatINR(balanceDue)}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default LineItemsTab;
