import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Edit2, Save, X, Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import { ALL_MODULES } from "@/lib/modules";

interface Plan {
  id: string; name: string; slug: string;
  price_monthly: number; price_yearly: number;
  max_beds: number | null; max_staff: number | null;
  trial_days: number; is_active: boolean;
  is_custom_price: boolean; sort_order: number;
  badge_text: string | null; description: string | null;
  razorpay_plan_id: string | null;
}

const ROUTE_KEY: Record<string, string> = {
  "/opd":"opd","/ipd":"ipd","/ipd/day-care":"day_care","/emergency":"emergency",
  "/ot":"ot","/nursing":"nursing","/telemedicine":"telemedicine","/packages":"health_packages",
  "/lab":"lab","/radiology":"radiology","/blood-bank":"blood_bank","/cssd":"cssd",
  "/pharmacy":"pharmacy","/pharmacy?mode=retail":"pharmacy_retail","/billing":"billing",
  "/billing/closure":"day_closure","/insurance":"insurance","/payments":"payments",
  "/accounts":"accounts","/assets":"assets","/pmjay":"pmjay","/hr":"hr",
  "/inventory":"inventory","/quality":"quality","/dialysis":"dialysis","/oncology":"oncology",
  "/physio":"physio","/mortuary":"mortuary","/vaccination":"vaccination","/ambulance":"ambulance",
  "/home-care":"home_care","/dental":"dental","/ayush":"ayush","/ivf":"ivf",
  "/specialty/anc":"obstetric_anc","/specialty/neonatal":"neonatal",
  "/specialty/anaesthesia":"anaesthesia","/specialty/ophthalmology":"ophthalmology",
  "/specialty/partograph":"partograph","/mental-health":"mental_health",
  "/chronic-disease":"chronic_disease","/mrd":"mrd","/biomedical":"biomedical",
  "/housekeeping":"housekeeping","/hmis":"hmis","/dietetics":"dietetics","/lms":"lms",
  "/crm":"crm","/abdm":"abdm","/portal":"patient_portal","/pro":"patient_relations",
  "/inbox":"inbox","/analytics":"analytics","/hod-dashboard":"hod_dashboard",
  "/tv-display":"tv_display","/settings":"settings",
};
const ALL_KEYS = [...new Set(Object.values(ROUTE_KEY))];

async function fetchPlans() {
  const [pRes, fRes] = await Promise.all([
    (supabase as any).from("subscription_plans").select("*").order("sort_order"),
    (supabase as any).from("plan_features").select("plan_id, module_key, is_enabled"),
  ]);
  const featureMap = new Map<string, Map<string, boolean>>();
  for (const f of (fRes.data || [])) {
    if (!featureMap.has(f.plan_id)) featureMap.set(f.plan_id, new Map());
    featureMap.get(f.plan_id)!.set(f.module_key, f.is_enabled);
  }
  return { plans: (pRes.data || []) as Plan[], featureMap };
}

const BLANK_PLAN: Partial<Plan> = {
  name: "", slug: "", price_monthly: 0, price_yearly: 0,
  max_beds: 50, max_staff: 20, trial_days: 30,
  is_active: true, is_custom_price: false, sort_order: 99,
  badge_text: null, description: null, razorpay_plan_id: null,
};

export default function PlansManagerPage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<Plan>>(BLANK_PLAN);
  const [enabledKeys, setEnabledKeys] = useState<Set<string>>(new Set());
  const [isNew, setIsNew] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["platform-plans"],
    queryFn: fetchPlans,
    staleTime: 60_000,
  });

  const openEdit = (plan: Plan) => {
    setForm({ ...plan });
    setIsNew(false);
    const planFeatures = data?.featureMap.get(plan.id) || new Map();
    setEnabledKeys(new Set(ALL_KEYS.filter((k) => planFeatures.get(k) !== false)));
    setEditing(plan.id);
  };

  const openNew = () => {
    setForm({ ...BLANK_PLAN });
    setIsNew(true);
    setEnabledKeys(new Set(ALL_KEYS));
    setEditing("new");
  };

  const savePlan = useMutation({
    mutationFn: async () => {
      let planId = editing === "new" ? null : editing!;
      if (isNew || editing === "new") {
        const { data: inserted } = await (supabase as any)
          .from("subscription_plans").insert([form]).select("id").single();
        planId = inserted.id;
      } else {
        await (supabase as any).from("subscription_plans").update(form).eq("id", planId);
      }
      // Upsert all plan_features
      const rows = ALL_KEYS.map((k) => ({ plan_id: planId, module_key: k, is_enabled: enabledKeys.has(k) }));
      await (supabase as any).from("plan_features")
        .upsert(rows, { onConflict: "plan_id,module_key" });
    },
    onSuccess: () => {
      toast.success("Plan saved");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["platform-plans"] });
    },
    onError: (e: any) => toast.error(e?.message || "Save failed"),
  });

  const togglePlanActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      await (supabase as any).from("subscription_plans").update({ is_active }).eq("id", id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["platform-plans"] }),
  });

  const f = (key: keyof Plan, val: any) => setForm((p) => ({ ...p, [key]: val }));

  return (
    <div className="flex flex-col h-full">
      <div className="h-14 border-b border-slate-800 flex items-center justify-between px-6 shrink-0">
        <h1 className="text-[15px] font-semibold text-white">Plans Manager</h1>
        <button onClick={openNew} className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg transition-colors">
          <Plus size={12} /> New Plan
        </button>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {isLoading ? (
          <div className="flex items-center justify-center h-40"><Loader2 size={20} className="animate-spin text-slate-500" /></div>
        ) : (
          <div className="grid grid-cols-3 gap-4">
            {(data?.plans || []).map((plan) => {
              const features = data?.featureMap.get(plan.id) || new Map();
              const enabledCount = ALL_KEYS.filter((k) => features.get(k) !== false).length;
              return (
                <div key={plan.id} className={`bg-slate-900 border rounded-xl p-5 space-y-3 ${plan.is_active ? "border-slate-700" : "border-slate-800 opacity-60"}`}>
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-bold text-white">{plan.name}</p>
                      {plan.badge_text && (
                        <span className="text-[10px] bg-blue-600 text-white px-2 py-0.5 rounded-full">{plan.badge_text}</span>
                      )}
                    </div>
                    <button onClick={() => openEdit(plan)} className="text-slate-500 hover:text-white transition-colors">
                      <Edit2 size={13} />
                    </button>
                  </div>
                  <p className="text-xl font-bold text-white font-mono">
                    {plan.is_custom_price ? "Custom" : `₹${plan.price_monthly.toLocaleString("en-IN")}/mo`}
                  </p>
                  <div className="text-xs text-slate-500 space-y-1">
                    <p>Max beds: {plan.max_beds ?? "Unlimited"}</p>
                    <p>Modules: {enabledCount} / {ALL_KEYS.length}</p>
                    <p>Trial: {plan.trial_days} days</p>
                    <p className={plan.razorpay_plan_id ? "text-emerald-400" : "text-amber-400"}>
                      {plan.razorpay_plan_id
                        ? `✓ Razorpay: ${plan.razorpay_plan_id}`
                        : "⚠ No Razorpay Plan ID"}
                    </p>
                  </div>
                  <button
                    onClick={() => togglePlanActive.mutate({ id: plan.id, is_active: !plan.is_active })}
                    className={`text-[10px] px-2 py-1 rounded-lg transition-colors ${plan.is_active ? "bg-red-500/20 text-red-400 hover:bg-red-500/30" : "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30"}`}
                  >
                    {plan.is_active ? "Deactivate" : "Activate"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Edit / Create drawer */}
      {editing && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/60" onClick={() => setEditing(null)} />
          <div className="w-[560px] bg-slate-900 border-l border-slate-800 flex flex-col h-full overflow-auto">
            <div className="h-14 border-b border-slate-800 flex items-center justify-between px-5 shrink-0">
              <p className="text-sm font-semibold text-white">{isNew ? "Create Plan" : "Edit Plan"}</p>
              <button onClick={() => setEditing(null)}><X size={16} className="text-slate-500 hover:text-white" /></button>
            </div>

            <div className="flex-1 overflow-auto p-5 space-y-4">
              {/* Basic fields */}
              {[
                { label: "Plan Name", key: "name" as const, type: "text" },
                { label: "Slug (unique)", key: "slug" as const, type: "text" },
                { label: "Monthly Price (₹)", key: "price_monthly" as const, type: "number" },
                { label: "Yearly Price (₹)", key: "price_yearly" as const, type: "number" },
                { label: "Max Beds (blank = unlimited)", key: "max_beds" as const, type: "number" },
                { label: "Max Staff (blank = unlimited)", key: "max_staff" as const, type: "number" },
                { label: "Trial Days", key: "trial_days" as const, type: "number" },
                { label: "Badge Text (e.g. Most Popular)", key: "badge_text" as const, type: "text" },
                { label: "Description", key: "description" as const, type: "text" },
                { label: "Razorpay Plan ID (from Razorpay Dashboard → Products → Plans)", key: "razorpay_plan_id" as const, type: "text" },
              ].map(({ label, key, type }) => (
                <div key={key}>
                  <label className="text-xs text-slate-400">{label}</label>
                  <input
                    type={type}
                    value={(form[key] as any) ?? ""}
                    onChange={(e) => f(key, type === "number" ? (e.target.value === "" ? null : Number(e.target.value)) : e.target.value)}
                    className="w-full mt-1 h-8 px-3 text-xs bg-slate-800 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:border-blue-500"
                  />
                </div>
              ))}

              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
                  <input type="checkbox" checked={form.is_custom_price ?? false} onChange={(e) => f("is_custom_price", e.target.checked)} />
                  Show "Contact Sales" instead of price
                </label>
                <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
                  <input type="checkbox" checked={form.is_active ?? true} onChange={(e) => f("is_active", e.target.checked)} />
                  Active (visible to hospitals)
                </label>
              </div>

              {/* Module checklist grouped by category */}
              <div>
                <p className="text-xs text-slate-400 uppercase font-bold tracking-wider mb-3">Module Access</p>
                <div className="flex gap-2 mb-3">
                  <button onClick={() => setEnabledKeys(new Set(ALL_KEYS))} className="text-[10px] px-2 py-1 bg-blue-600/20 text-blue-400 rounded">Select All</button>
                  <button onClick={() => setEnabledKeys(new Set())} className="text-[10px] px-2 py-1 bg-slate-700 text-slate-400 rounded">Clear All</button>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {ALL_MODULES.map((m) => {
                    const key = ROUTE_KEY[m.route] ?? ROUTE_KEY[m.route.split("?")[0]];
                    if (!key) return null;
                    const on = enabledKeys.has(key);
                    return (
                      <label key={key} className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer text-xs transition-colors ${on ? "bg-blue-600/15 text-slate-200" : "text-slate-500 hover:bg-slate-800"}`}>
                        <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${on ? "bg-blue-600 border-blue-600" : "border-slate-600"}`}>
                          {on && <Check size={8} className="text-white" />}
                        </div>
                        <span className="truncate">{m.name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-slate-800 shrink-0">
              <button
                onClick={() => savePlan.mutate()}
                disabled={savePlan.isPending}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
              >
                {savePlan.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                {isNew ? "Create Plan" : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
