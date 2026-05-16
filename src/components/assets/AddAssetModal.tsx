import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Props {
  hospitalId: string;
  onClose: () => void;
  onSaved: () => void;
}

const CATEGORIES = ["equipment", "building", "land", "vehicle", "it", "furniture", "other"];
const METHODS = [{ value: "slm", label: "Straight-Line (SLM)" }, { value: "wdv", label: "Written-Down Value (WDV)" }];

const AddAssetModal: React.FC<Props> = ({ hospitalId, onClose, onSaved }) => {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    asset_code: "AST-001",
    asset_name: "",
    category: "equipment",
    acquisition_date: new Date().toISOString().split("T")[0],
    acquisition_cost: "",
    useful_life_years: "5",
    residual_value: "0",
    depreciation_method: "slm",
    insurance_policy_no: "",
    insurance_provider: "",
    insurance_expiry: "",
    insurance_premium: "",
    notes: "",
  });

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    (supabase as any).from("asset_register")
      .select("asset_code")
      .eq("hospital_id", hospitalId)
      .then(({ data }: any) => {
        const codes: string[] = (data || []).map((r: any) => r.asset_code as string);
        const maxSeq = codes.reduce((max, code) => {
          const match = code.match(/^AST-(\d+)$/i);
          return match ? Math.max(max, parseInt(match[1], 10)) : max;
        }, 0);
        setForm((f) => ({ ...f, asset_code: `AST-${String(maxSeq + 1).padStart(3, "0")}` }));
      });
  }, [hospitalId]);

  const handleSave = async () => {
    if (!form.asset_code || !form.asset_name || !form.acquisition_cost) {
      toast({ title: "Asset code, name, and cost are required", variant: "destructive" });
      return;
    }
    // Uniqueness check
    const { data: existing } = await (supabase as any).from("asset_register")
      .select("id")
      .eq("hospital_id", hospitalId)
      .eq("asset_code", form.asset_code.trim())
      .maybeSingle();
    if (existing) {
      toast({ title: `Asset code "${form.asset_code}" already exists`, description: "Use a different code.", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await (supabase as any).from("asset_register").insert({
      hospital_id: hospitalId,
      asset_code: form.asset_code.trim(),
      asset_name: form.asset_name.trim(),
      category: form.category,
      acquisition_date: form.acquisition_date,
      acquisition_cost: parseFloat(form.acquisition_cost),
      useful_life_years: parseInt(form.useful_life_years) || 5,
      residual_value: parseFloat(form.residual_value) || 0,
      depreciation_method: form.depreciation_method,
      insurance_policy_no: form.insurance_policy_no || null,
      insurance_provider: form.insurance_provider || null,
      insurance_expiry: form.insurance_expiry || null,
      insurance_premium: form.insurance_premium ? parseFloat(form.insurance_premium) : null,
      notes: form.notes || null,
    });
    if (error) {
      toast({ title: "Failed to add asset", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Asset registered successfully" });
      onSaved();
    }
    setSaving(false);
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Register New Asset</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4 py-2">
          <div className="col-span-2 grid grid-cols-2 gap-4">
            <div><Label>Asset Code *</Label><Input value={form.asset_code} onChange={(e) => set("asset_code", e.target.value)} placeholder="AST-001" className="mt-1" /></div>
            <div><Label>Asset Name *</Label><Input value={form.asset_name} onChange={(e) => set("asset_name", e.target.value)} placeholder="MRI Machine 1.5T" className="mt-1" /></div>
          </div>

          <div>
            <Label>Category</Label>
            <Select value={form.category} onValueChange={(v) => set("category", v)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          <div><Label>Acquisition Date</Label><Input type="date" value={form.acquisition_date} onChange={(e) => set("acquisition_date", e.target.value)} className="mt-1" /></div>

          <div><Label>Acquisition Cost (₹) *</Label><Input type="number" value={form.acquisition_cost} onChange={(e) => set("acquisition_cost", e.target.value)} placeholder="5000000" className="mt-1" /></div>
          <div><Label>Residual Value (₹)</Label><Input type="number" value={form.residual_value} onChange={(e) => set("residual_value", e.target.value)} placeholder="0" className="mt-1" /></div>

          <div><Label>Useful Life (years)</Label><Input type="number" value={form.useful_life_years} onChange={(e) => set("useful_life_years", e.target.value)} className="mt-1" /></div>
          <div>
            <Label>Depreciation Method</Label>
            <Select value={form.depreciation_method} onValueChange={(v) => set("depreciation_method", v)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>{METHODS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          <div className="col-span-2 border-t border-border pt-3">
            <p className="text-xs font-semibold text-muted-foreground mb-3 uppercase">Insurance (Optional)</p>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Policy Number</Label><Input value={form.insurance_policy_no} onChange={(e) => set("insurance_policy_no", e.target.value)} className="mt-1" /></div>
              <div><Label>Provider</Label><Input value={form.insurance_provider} onChange={(e) => set("insurance_provider", e.target.value)} className="mt-1" /></div>
              <div><Label>Expiry Date</Label><Input type="date" value={form.insurance_expiry} onChange={(e) => set("insurance_expiry", e.target.value)} className="mt-1" /></div>
              <div><Label>Annual Premium (₹)</Label><Input type="number" value={form.insurance_premium} onChange={(e) => set("insurance_premium", e.target.value)} className="mt-1" /></div>
            </div>
          </div>

          <div className="col-span-2"><Label>Notes</Label><Input value={form.notes} onChange={(e) => set("notes", e.target.value)} className="mt-1" /></div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Register Asset"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AddAssetModal;
