import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { RotateCcw, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Props {
  hospitalId: string;
}

interface DispensingItem {
  id: string;
  drug_name: string;
  quantity: number;
  return_quantity: number | null;
  return_reason: string | null;
  dispensed_at: string;
  batch_id: string | null;
  patient_name?: string;
  uhid?: string;
}

const PharmacyReturnsTab: React.FC<Props> = ({ hospitalId }) => {
  const { toast } = useToast();
  const [items, setItems] = useState<DispensingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [returnQty, setReturnQty] = useState<Record<string, string>>({});
  const [returnReason, setReturnReason] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [showReturned, setShowReturned] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const since = new Date(Date.now() - 30 * 86400000).toISOString();

    const { data, error } = await (supabase as any)
      .from("pharmacy_dispensing_items")
      .select(`
        id, drug_name, quantity, return_quantity, return_reason,
        batch_id,
        pharmacy_dispensing_records!inner(
          dispensed_at, hospital_id,
          patients(full_name, uhid)
        )
      `)
      .eq("pharmacy_dispensing_records.hospital_id", hospitalId)
      .gte("pharmacy_dispensing_records.dispensed_at", since)
      .order("pharmacy_dispensing_records.dispensed_at", { ascending: false })
      .limit(200);

    if (error) {
      setLoading(false);
      return;
    }

    const mapped: DispensingItem[] = (data || []).map((d: any) => ({
      id: d.id,
      drug_name: d.drug_name,
      quantity: d.quantity,
      return_quantity: d.return_quantity,
      return_reason: d.return_reason,
      batch_id: d.batch_id,
      dispensed_at: d.pharmacy_dispensing_records?.dispensed_at,
      patient_name: d.pharmacy_dispensing_records?.patients?.full_name,
      uhid: d.pharmacy_dispensing_records?.patients?.uhid,
    }));

    setItems(mapped);
    setLoading(false);
  }, [hospitalId]);

  useEffect(() => { load(); }, [load]);

  const handleReturn = async (item: DispensingItem) => {
    const qty = parseInt(returnQty[item.id] || "0");
    const reason = returnReason[item.id]?.trim();
    if (!qty || qty <= 0 || qty > item.quantity) {
      toast({ title: "Invalid quantity", variant: "destructive" });
      return;
    }
    if (!reason) {
      toast({ title: "Return reason required", variant: "destructive" });
      return;
    }

    setSaving(item.id);

    const { error: itemErr } = await (supabase as any)
      .from("pharmacy_dispensing_items")
      .update({ return_quantity: qty, return_reason: reason })
      .eq("id", item.id);

    if (itemErr) {
      toast({ title: "Failed to record return", description: itemErr.message, variant: "destructive" });
      setSaving(null);
      return;
    }

    if (item.batch_id) {
      await (supabase as any)
        .from("drug_batches")
        .update({ quantity_available: (supabase as any).rpc("increment", { x: qty }) })
        .eq("id", item.batch_id);

      const { data: batch } = await (supabase as any)
        .from("drug_batches")
        .select("quantity_available")
        .eq("id", item.batch_id)
        .maybeSingle();

      if (batch) {
        await (supabase as any)
          .from("drug_batches")
          .update({ quantity_available: (batch.quantity_available || 0) + qty })
          .eq("id", item.batch_id);
      }
    }

    setSaving(null);
    setExpandedId(null);
    setReturnQty(prev => { const n = { ...prev }; delete n[item.id]; return n; });
    setReturnReason(prev => { const n = { ...prev }; delete n[item.id]; return n; });
    toast({ title: `Return recorded — ${qty} units of ${item.drug_name} restored to stock` });
    load();
  };

  const pending = items.filter(i => !i.return_quantity);
  const returned = items.filter(i => i.return_quantity && i.return_quantity > 0);

  const formatDate = (iso: string) =>
    iso ? new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";

  return (
    <div className="p-4 space-y-4 max-w-3xl">
      <div className="flex items-center gap-2 mb-1">
        <RotateCcw className="h-4 w-4 text-amber-600" />
        <span className="text-sm font-semibold">Drug Returns (last 30 days)</span>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground py-8">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Loading dispensing records…</span>
        </div>
      ) : pending.length === 0 ? (
        <p className="text-xs text-muted-foreground py-4">No returnable dispensing records in the last 30 days.</p>
      ) : (
        <div className="space-y-1.5">
          {pending.map((item) => {
            const expanded = expandedId === item.id;
            return (
              <div key={item.id} className="border border-border rounded-lg overflow-hidden">
                <div
                  className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => setExpandedId(expanded ? null : item.id)}
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">{item.drug_name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {item.patient_name || "—"} {item.uhid ? `(${item.uhid})` : ""} · {formatDate(item.dispensed_at)} · Qty: {item.quantity}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px]">Returnable</Badge>
                    {expanded ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                  </div>
                </div>

                {expanded && (
                  <div className="border-t border-border bg-muted/30 p-3 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] text-muted-foreground font-medium block mb-1">Return Qty (max {item.quantity})</label>
                        <Input
                          type="number"
                          min={1}
                          max={item.quantity}
                          value={returnQty[item.id] || ""}
                          onChange={e => setReturnQty(prev => ({ ...prev, [item.id]: e.target.value }))}
                          placeholder="Qty"
                          className="h-7 text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground font-medium block mb-1">Reason</label>
                        <select
                          value={returnReason[item.id] || ""}
                          onChange={e => setReturnReason(prev => ({ ...prev, [item.id]: e.target.value }))}
                          className="w-full h-7 text-sm border border-input rounded px-2 bg-background"
                        >
                          <option value="">Select reason</option>
                          <option value="patient_discharged">Patient discharged</option>
                          <option value="medication_changed">Medication changed</option>
                          <option value="excess_dispensed">Excess dispensed</option>
                          <option value="patient_refused">Patient refused medication</option>
                          <option value="other">Other</option>
                        </select>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="h-7 text-xs flex-1"
                        disabled={saving === item.id || !returnQty[item.id] || !returnReason[item.id]}
                        onClick={() => handleReturn(item)}
                      >
                        {saving === item.id && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
                        Confirm Return
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setExpandedId(null)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Returned history */}
      {returned.length > 0 && (
        <div>
          <button
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setShowReturned(!showReturned)}
          >
            {showReturned ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            {returned.length} returned item{returned.length !== 1 ? "s" : ""} (last 30 days)
          </button>

          {showReturned && (
            <div className="mt-2 space-y-1.5">
              {returned.map(item => (
                <div key={item.id} className="flex items-center justify-between border border-border rounded-lg px-3 py-2 bg-emerald-50/50 dark:bg-emerald-950/20">
                  <div>
                    <p className="text-sm font-medium text-foreground">{item.drug_name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {item.patient_name || "—"} · {formatDate(item.dispensed_at)} · Returned: {item.return_quantity}/{item.quantity}
                    </p>
                  </div>
                  <Badge className="bg-emerald-100 text-emerald-700 text-[10px]">
                    {item.return_reason?.replace(/_/g, " ")}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default PharmacyReturnsTab;
