import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Plus, X, Receipt } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "consultation", label: "OPD Consultation" },
  { key: "procedure", label: "Procedures" },
  { key: "package", label: "Packages" },
  { key: "lab", label: "Lab Tests" },
  { key: "radiology", label: "Radiology" },
  { key: "rates", label: "Default Rates" },
];

// Common item codes used by modules (OT, Dialysis, IPD, etc.) for fallback billing rates.
const DEFAULT_RATE_SEEDS: { item_code: string; item_name: string; item_type: string; default_rate: number }[] = [
  { item_code: "consultation",     item_name: "OPD Consultation",     item_type: "consultation", default_rate: 500 },
  { item_code: "anaesthesia_fee",  item_name: "Anaesthesia Fee",      item_type: "procedure",    default_rate: 1500 },
  { item_code: "surgery_fee",      item_name: "Surgery / Surgeon Fee", item_type: "procedure",   default_rate: 5000 },
  { item_code: "dialysis_session", item_name: "Dialysis Session",     item_type: "procedure",    default_rate: 2500 },
  { item_code: "icu_per_day",      item_name: "ICU Bed (per day)",    item_type: "ward",         default_rate: 5000 },
  { item_code: "ward_per_day",     item_name: "General Ward (per day)", item_type: "ward",       default_rate: 1500 },
];

const DEFAULT_PROCEDURES = [
  { name: "ECG", category: "procedure", fee: 150 },
  { name: "X-Ray Chest (PA View)", category: "radiology", fee: 200 },
  { name: "USG Abdomen", category: "radiology", fee: 500 },
  { name: "IV Cannula Insertion", category: "procedure", fee: 150 },
  { name: "Dressing (Simple)", category: "procedure", fee: 100 },
  { name: "Dressing (Complex)", category: "procedure", fee: 250 },
  { name: "Nebulization", category: "procedure", fee: 100 },
  { name: "Injection Administration", category: "procedure", fee: 50 },
  { name: "Blood Collection (Phlebotomy)", category: "procedure", fee: 50 },
  { name: "Urine Catheter Insertion", category: "procedure", fee: 300 },
  { name: "Ryles Tube Insertion", category: "procedure", fee: 250 },
  { name: "Blood Transfusion", category: "procedure", fee: 500 },
  { name: "Oxygen Administration (per day)", category: "procedure", fee: 200 },
  { name: "Ventilator (per day)", category: "procedure", fee: 2000 },
  { name: "Monitor Charges (per day)", category: "procedure", fee: 500 },
];

const SettingsServicesPage: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState("consultation");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", category: "consultation", fee: "", follow_up_fee: "", gst_applicable: false });

  // Bulk fee
  const [bulkFee, setBulkFee] = useState("");

  const { data: services, isLoading } = useQuery({
    queryKey: ["settings-services"],
    queryFn: async () => {
      const { data, error } = await supabase.from("service_master")
        .select("id, name, category, fee, follow_up_fee, is_active, gst_applicable")
        .order("category").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: departments } = useQuery({
    queryKey: ["settings-dept-for-services"],
    queryFn: async () => {
      const { data } = await supabase.from("departments").select("id, name").eq("is_active", true).order("name");
      return data ?? [];
    },
  });

  const { data: serviceRates } = useQuery({
    queryKey: ["settings-service-rates"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("service_rates")
        .select("id, item_code, item_name, item_type, default_rate, gst_rate, is_active")
        .order("item_code");
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; item_code: string; item_name: string; item_type: string; default_rate: number; gst_rate: number; is_active: boolean }>;
    },
  });

  const getHospitalId = async () => {
    const { data } = await supabase.from("users").select("hospital_id").limit(1).maybeSingle();
    if (!data) throw new Error("No hospital context");
    return data.hospital_id;
  };

  const seedRates = useMutation({
    mutationFn: async () => {
      const hid = await getHospitalId();
      const existing = new Set((serviceRates ?? []).map((r) => r.item_code));
      const rows = DEFAULT_RATE_SEEDS.filter((s) => !existing.has(s.item_code))
        .map((s) => ({ ...s, hospital_id: hid, gst_rate: 0, is_active: true }));
      if (rows.length === 0) return 0;
      const { error } = await (supabase as any).from("service_rates").insert(rows);
      if (error) throw error;
      return rows.length;
    },
    onSuccess: (count) => {
      toast({ title: count ? `${count} default rates seeded` : "All defaults already present" });
      qc.invalidateQueries({ queryKey: ["settings-service-rates"] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const inlineUpdateRate = async (id: string, field: "default_rate" | "gst_rate", value: string) => {
    const numVal = parseFloat(value);
    if (isNaN(numVal)) return;
    await (supabase as any).from("service_rates").update({ [field]: numVal }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["settings-service-rates"] });
  };

  const filtered = services?.filter((s) => {
    if (tab === "consultation") return s.category === "consultation";
    if (tab === "procedure") return s.category === "procedure";
    if (tab === "package") return s.category === "package";
    if (tab === "lab") return s.category === "lab";
    if (tab === "radiology") return s.category === "radiology";
    return true;
  }) ?? [];

  const saveService = useMutation({
    mutationFn: async () => {
      const hid = await getHospitalId();
      if (editingId) {
        const { error } = await supabase.from("service_master").update({
          name: form.name, category: form.category, fee: parseFloat(form.fee) || 0,
          follow_up_fee: form.follow_up_fee ? parseFloat(form.follow_up_fee) : null,
          gst_applicable: form.gst_applicable,
        }).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("service_master").insert({
          hospital_id: hid, name: form.name, category: form.category,
          fee: parseFloat(form.fee) || 0,
          follow_up_fee: form.follow_up_fee ? parseFloat(form.follow_up_fee) : null,
          gst_applicable: form.gst_applicable,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast({ title: `Service ${editingId ? "updated" : "added"}` });
      qc.invalidateQueries({ queryKey: ["settings-services"] });
      closeDrawer();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const loadDefaults = useMutation({
    mutationFn: async () => {
      const hid = await getHospitalId();
      const rows = DEFAULT_PROCEDURES.map((p) => ({
        hospital_id: hid, name: p.name, category: p.category, fee: p.fee,
      }));
      const { error } = await supabase.from("service_master").insert(rows);
      if (error) throw error;
      return rows.length;
    },
    onSuccess: (count) => {
      toast({ title: `${count} default procedures loaded` });
      qc.invalidateQueries({ queryKey: ["settings-services"] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const applyBulkFee = useMutation({
    mutationFn: async () => {
      const hid = await getHospitalId();
      const fee = parseFloat(bulkFee);
      if (!fee) return;
      // For each department without a consultation entry, create one
      const existing = services?.filter((s) => s.category === "consultation").map((s) => s.name) ?? [];
      const missing = departments?.filter((d) => !existing.includes(`${d.name} Consultation`)) ?? [];
      if (missing.length > 0) {
        const rows = missing.map((d) => ({
          hospital_id: hid, name: `${d.name} Consultation`, category: "consultation" as const, fee,
        }));
        await supabase.from("service_master").insert(rows);
      }
      // Update existing ones with 0 fee
      const zeroFee = services?.filter((s) => s.category === "consultation" && Number(s.fee) === 0) ?? [];
      for (const s of zeroFee) {
        await supabase.from("service_master").update({ fee }).eq("id", s.id);
      }
    },
    onSuccess: () => {
      toast({ title: "Consultation fees applied" });
      qc.invalidateQueries({ queryKey: ["settings-services"] });
      setBulkFee("");
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const inlineUpdateFee = async (id: string, field: "fee" | "follow_up_fee", value: string) => {
    const numVal = parseFloat(value);
    if (isNaN(numVal)) return;
    await supabase.from("service_master").update({ [field]: numVal } as any).eq("id", id);
    qc.invalidateQueries({ queryKey: ["settings-services"] });
  };

  const openDrawer = (service?: any) => {
    if (service) {
      setEditingId(service.id);
      setForm({
        name: service.name, category: service.category,
        fee: String(service.fee), follow_up_fee: service.follow_up_fee ? String(service.follow_up_fee) : "",
        gst_applicable: service.gst_applicable,
      });
    } else {
      setEditingId(null);
      setForm({ name: "", category: tab === "consultation" ? "consultation" : tab, fee: "", follow_up_fee: "", gst_applicable: false });
    }
    setDrawerOpen(true);
  };
  const closeDrawer = () => { setDrawerOpen(false); setEditingId(null); };

  const procedureCount = services?.filter((s) => s.category === "procedure" || s.category === "radiology").length ?? 0;

  return (
    <div className="h-[calc(100vh-56px)] flex flex-col overflow-hidden relative">
      {/* HEADER */}
      <div className="flex-shrink-0 px-6 py-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/settings")} className="text-muted-foreground hover:text-foreground active:scale-95"><ArrowLeft size={18} /></button>
          <div>
            <h1 className="text-lg font-bold text-foreground">Services & Fees</h1>
            <p className="text-xs text-muted-foreground">Settings › Services & Fees</p>
          </div>
        </div>
        <button onClick={() => openDrawer()} className="flex items-center gap-1.5 bg-[hsl(222,55%,23%)] text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 active:scale-[0.97]">
          <Plus size={14} /> Add Service
        </button>
      </div>

      {/* TABS */}
      <div className="flex-shrink-0 px-6 py-2.5 border-b border-border flex gap-1.5 overflow-x-auto">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={cn(
              "px-4 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors active:scale-[0.97]",
              tab === t.key ? "bg-[hsl(222,55%,23%)] text-white" : "bg-muted text-muted-foreground hover:bg-muted/80"
            )}>
            {t.label}
          </button>
        ))}
      </div>

      {/* BULK FEE for consultation tab */}
      {tab === "consultation" && (
        <div className="flex-shrink-0 px-6 py-2.5 border-b border-border flex items-center gap-3 bg-muted/20">
          <span className="text-xs text-muted-foreground">Set all consultation fees:</span>
          <Input type="number" value={bulkFee} onChange={(e) => setBulkFee(e.target.value)} placeholder="₹500" className="h-8 w-24 text-sm" />
          <button onClick={() => applyBulkFee.mutate()} disabled={!bulkFee || applyBulkFee.isPending}
            className="text-xs font-medium text-primary hover:underline disabled:opacity-40">
            {applyBulkFee.isPending ? "Applying..." : "Apply to all"}
          </button>
        </div>
      )}

      {/* LOAD DEFAULTS for procedure tab */}
      {tab === "procedure" && procedureCount === 0 && (
        <div className="flex-shrink-0 mx-6 mt-3 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 flex items-center justify-between">
          <p className="text-[13px] text-blue-800 font-medium">No procedures yet — load common hospital procedures?</p>
          <button onClick={() => loadDefaults.mutate()} disabled={loadDefaults.isPending}
            className="text-sm font-medium text-blue-700 border border-blue-300 rounded-lg px-3 py-1.5 hover:bg-blue-100 active:scale-[0.97]">
            {loadDefaults.isPending ? "Loading..." : "Load Default Procedures"}
          </button>
        </div>
      )}

      {/* DEFAULT RATES TAB */}
      {tab === "rates" ? (
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Module Default Rates</h2>
              <p className="text-xs text-muted-foreground">Used as fallback fees by OT, Dialysis, IPD and other modules. Each hospital can set its own.</p>
            </div>
            <button
              onClick={() => seedRates.mutate()}
              disabled={seedRates.isPending}
              className="text-xs font-medium text-primary border border-input rounded-lg px-3 py-1.5 hover:bg-muted active:scale-[0.97] disabled:opacity-40"
            >
              {seedRates.isPending ? "Seeding…" : "Seed Common Codes"}
            </button>
          </div>
          <table className="w-full text-sm border border-border rounded-lg overflow-hidden">
            <thead className="bg-muted/50">
              <tr className="text-left text-[11px] text-muted-foreground uppercase tracking-wider">
                <th className="px-4 py-2.5 font-medium">Item Code</th>
                <th className="px-4 py-2.5 font-medium">Display Name</th>
                <th className="px-4 py-2.5 font-medium">Type</th>
                <th className="px-4 py-2.5 font-medium text-right">Default Rate (₹)</th>
                <th className="px-4 py-2.5 font-medium text-right">GST %</th>
              </tr>
            </thead>
            <tbody>
              {(serviceRates ?? []).length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground text-xs">No rates configured. Click <span className="font-medium">Seed Common Codes</span> to start.</td></tr>
              ) : (serviceRates ?? []).map((r) => (
                <tr key={r.id} className="border-t border-border/50 hover:bg-muted/20">
                  <td className="px-4 py-2.5 font-mono text-xs text-foreground">{r.item_code}</td>
                  <td className="px-4 py-2.5 text-foreground">{r.item_name}</td>
                  <td className="px-4 py-2.5"><span className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground capitalize">{r.item_type}</span></td>
                  <td className="px-4 py-2.5 text-right">
                    <input
                      type="number"
                      defaultValue={Number(r.default_rate)}
                      onBlur={(e) => inlineUpdateRate(r.id, "default_rate", e.target.value)}
                      className="w-24 h-7 text-right text-sm font-medium tabular-nums bg-transparent border border-transparent hover:border-input focus:border-input rounded px-1 outline-none"
                    />
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <input
                      type="number"
                      defaultValue={Number(r.gst_rate ?? 0)}
                      onBlur={(e) => inlineUpdateRate(r.id, "gst_rate", e.target.value)}
                      className="w-16 h-7 text-right text-sm tabular-nums text-muted-foreground bg-transparent border border-transparent hover:border-input focus:border-input rounded px-1 outline-none"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
      <>
      {/* TABLE */}
      <div className="flex-1 overflow-y-auto">
        {!isLoading && filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center"><Receipt size={24} className="text-muted-foreground" /></div>
            <p className="text-sm font-medium text-foreground">No {tab} services yet</p>
            <button onClick={() => openDrawer()} className="flex items-center gap-1.5 bg-[hsl(222,55%,23%)] text-white px-4 py-2 rounded-lg text-sm font-medium active:scale-[0.97]">
              <Plus size={14} /> Add First Service
            </button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted/50 backdrop-blur-sm z-10">
              <tr className="text-left text-[11px] text-muted-foreground uppercase tracking-wider">
                <th className="px-6 py-2.5 font-medium">Service Name</th>
                <th className="px-4 py-2.5 font-medium">Category</th>
                <th className="px-4 py-2.5 font-medium text-right">Fee (₹)</th>
                {tab === "consultation" && <th className="px-4 py-2.5 font-medium text-right">Follow-up (₹)</th>}
                <th className="px-4 py-2.5 font-medium">GST</th>
                <th className="px-4 py-2.5 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">Loading...</td></tr>}
              {filtered.map((s) => (
                <tr key={s.id} className="border-b border-border/50 hover:bg-muted/20">
                  <td className="px-6 py-3 font-medium text-foreground">{s.name}</td>
                  <td className="px-4 py-3">
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium capitalize">{s.category}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <input
                      type="number"
                      defaultValue={Number(s.fee)}
                      onBlur={(e) => inlineUpdateFee(s.id, "fee", e.target.value)}
                      className="w-20 h-7 text-right text-sm font-medium tabular-nums bg-transparent border border-transparent hover:border-input focus:border-input rounded px-1 outline-none"
                    />
                  </td>
                  {tab === "consultation" && (
                    <td className="px-4 py-3 text-right">
                      <input
                        type="number"
                        defaultValue={s.follow_up_fee ? Number(s.follow_up_fee) : ""}
                        onBlur={(e) => inlineUpdateFee(s.id, "follow_up_fee", e.target.value)}
                        placeholder="—"
                        className="w-20 h-7 text-right text-sm tabular-nums text-muted-foreground bg-transparent border border-transparent hover:border-input focus:border-input rounded px-1 outline-none"
                      />
                    </td>
                  )}
                  <td className="px-4 py-3 text-muted-foreground text-xs">{s.gst_applicable ? "Yes" : "No"}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => openDrawer(s)} className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted">Edit</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      </>
      )}

      {/* DRAWER */}
      {drawerOpen && (
        <>
          <div className="fixed inset-0 bg-black/20 z-40" onClick={closeDrawer} />
          <div className="fixed right-0 top-0 bottom-0 w-[380px] bg-card border-l border-border z-50 flex flex-col shadow-xl animate-in slide-in-from-right duration-200">
            <div className="flex-shrink-0 px-6 py-4 border-b border-border flex items-center justify-between">
              <h2 className="text-lg font-bold text-foreground">{editingId ? "Edit Service" : "Add Service"}</h2>
              <button onClick={closeDrawer} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              <div>
                <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Service Name *</label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="OPD Consultation" className="h-10" />
              </div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Category</label>
                <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="consultation">Consultation</option>
                  <option value="procedure">Procedure</option>
                  <option value="package">Package</option>
                  <option value="lab">Lab</option>
                  <option value="radiology">Radiology</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Fee (₹) *</label>
                  <Input type="number" value={form.fee} onChange={(e) => setForm({ ...form, fee: e.target.value })} placeholder="500" className="h-10" />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Follow-up (₹)</label>
                  <Input type="number" value={form.follow_up_fee} onChange={(e) => setForm({ ...form, follow_up_fee: e.target.value })} placeholder="200" className="h-10" />
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.gst_applicable} onChange={(e) => setForm({ ...form, gst_applicable: e.target.checked })}
                  className="h-4 w-4 rounded border-input" />
                <span className="text-sm text-foreground">GST applicable</span>
              </label>
            </div>
            <div className="flex-shrink-0 px-6 py-4 border-t border-border flex gap-3">
              <button onClick={closeDrawer} className="flex-1 h-11 rounded-lg border border-border text-sm font-medium text-muted-foreground hover:bg-muted active:scale-[0.98]">Cancel</button>
              <button onClick={() => saveService.mutate()} disabled={!form.name || !form.fee || saveService.isPending}
                className="flex-[2] h-11 rounded-lg bg-[hsl(222,55%,23%)] text-white text-sm font-semibold hover:opacity-90 active:scale-[0.97] disabled:opacity-40">
                {saveService.isPending ? "Saving..." : "Save Service"}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default SettingsServicesPage;
