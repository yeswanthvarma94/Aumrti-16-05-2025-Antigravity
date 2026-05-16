import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft } from "lucide-react";
import { Input } from "@/components/ui/input";

const SettingsProfilePage: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: "", address: "", state: "", pincode: "",
    gstin: "", nabh_number: "", primary_color: "#0EA5E9",
    nabl_accreditation_number: "", nabl_valid_upto: "",
    registration_80g: "", trust_pan: "",
  });

  const { data: hospital } = useQuery({
    queryKey: ["settings-hospital"],
    queryFn: async () => {
      const { data: me } = await supabase.from("users").select("hospital_id").limit(1).maybeSingle();
      if (!me) return null;
      const { data, error } = await supabase.from("hospitals").select("*").eq("id", me.hospital_id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (hospital) {
      setForm({
        name: hospital.name || "",
        address: hospital.address || "",
        state: hospital.state || "",
        pincode: hospital.pincode || "",
        gstin: hospital.gstin || "",
        nabh_number: hospital.nabh_number || "",
        primary_color: hospital.primary_color || "#0EA5E9",
        nabl_accreditation_number: (hospital as any).nabl_accreditation_number || "",
        nabl_valid_upto: (hospital as any).nabl_valid_upto || "",
        registration_80g: (hospital as any).registration_80g || "",
        trust_pan: (hospital as any).trust_pan || "",
      });
    }
  }, [hospital]);

  const save = useMutation({
    mutationFn: async () => {
      if (!hospital) return;
      const { error } = await supabase.from("hospitals").update({
        name: form.name,
        address: form.address || null,
        state: form.state || null,
        pincode: form.pincode || null,
        gstin: form.gstin || null,
        nabh_number: form.nabh_number || null,
        primary_color: form.primary_color,
        nabl_accreditation_number: form.nabl_accreditation_number || null,
        nabl_valid_upto: form.nabl_valid_upto || null,
        registration_80g: form.registration_80g || null,
        trust_pan: form.trust_pan || null,
      } as any).eq("id", hospital.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Hospital profile updated" });
      qc.invalidateQueries({ queryKey: ["settings-hospital"] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="h-[calc(100vh-56px)] flex flex-col overflow-hidden">
      <div className="flex-shrink-0 px-6 py-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/settings")} className="text-muted-foreground hover:text-foreground active:scale-95"><ArrowLeft size={18} /></button>
          <h1 className="text-lg font-bold text-foreground">Hospital Profile</h1>
        </div>
        <button onClick={() => save.mutate()} disabled={save.isPending} className="bg-primary text-primary-foreground px-5 py-2 rounded-lg text-sm font-medium hover:opacity-90 active:scale-[0.97] disabled:opacity-40">
          {save.isPending ? "Saving..." : "Save Changes"}
        </button>
      </div>

      <div className="flex-1 overflow-hidden flex justify-center pt-8 px-6">
        <div className="w-full max-w-2xl space-y-5">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Hospital Name *</label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="h-10" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Address</label>
            <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Full address" className="h-10" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">State</label>
              <Input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} className="h-10" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Pincode</label>
              <Input value={form.pincode} onChange={(e) => setForm({ ...form, pincode: e.target.value })} className="h-10" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">GSTIN</label>
              <Input value={form.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value })} placeholder="22AAAAA0000A1Z5" className="h-10" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">NABH Number</label>
              <Input value={form.nabh_number} onChange={(e) => setForm({ ...form, nabh_number: e.target.value })} className="h-10" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">NABL Accreditation No.</label>
              <Input value={form.nabl_accreditation_number} onChange={(e) => setForm({ ...form, nabl_accreditation_number: e.target.value })} placeholder="MC-0000" className="h-10" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">NABL Valid Up To</label>
              <Input type="date" value={form.nabl_valid_upto} onChange={(e) => setForm({ ...form, nabl_valid_upto: e.target.value })} className="h-10" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">80G Registration No. (Charitable)</label>
              <Input value={form.registration_80g} onChange={(e) => setForm({ ...form, registration_80g: e.target.value })} placeholder="AAATH1234QF20213" className="h-10" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Trust PAN (for 80G receipts)</label>
              <Input value={form.trust_pan} onChange={(e) => setForm({ ...form, trust_pan: e.target.value })} placeholder="AAATH1234Q" className="h-10" />
            </div>
          </div>
          <div className="w-40">
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Brand Color</label>
            <div className="flex items-center gap-2">
              <input type="color" value={form.primary_color} onChange={(e) => setForm({ ...form, primary_color: e.target.value })} className="h-10 w-10 rounded border border-input cursor-pointer" />
              <Input value={form.primary_color} onChange={(e) => setForm({ ...form, primary_color: e.target.value })} className="h-10 w-28 font-mono text-sm" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsProfilePage;
