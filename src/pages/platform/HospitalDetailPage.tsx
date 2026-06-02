import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ChevronLeft, Save, Loader2, Trash2, AlertTriangle, X, Activity } from "lucide-react";

// ── Usage tab data fetcher ────────────────────────────────────────────────────
interface UsageData {
  opd: number; billing: number; ipd: number; lab: number;
  radiology: number; er: number; ot: number; insurance: number;
  pharmacy: number; hr: number;
}

async function fetchHospitalUsage(hospitalId: string): Promise<UsageData> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
  const hid = hospitalId;

  const [opd, billing, ipd, lab, radiology, er, ot, insurance, pharmacy, hr] = await Promise.all([
    (supabase as any).from("opd_tokens").select("id", { count: "exact", head: true })
      .eq("hospital_id", hid).gte("created_at", thirtyDaysAgo),
    (supabase as any).from("bills").select("id", { count: "exact", head: true })
      .eq("hospital_id", hid).gte("created_at", thirtyDaysAgo),
    (supabase as any).from("admissions").select("id", { count: "exact", head: true })
      .eq("hospital_id", hid).gte("admitted_at", thirtyDaysAgo),
    (supabase as any).from("lab_orders").select("id", { count: "exact", head: true })
      .eq("hospital_id", hid).gte("created_at", thirtyDaysAgo),
    (supabase as any).from("radiology_orders").select("id", { count: "exact", head: true })
      .eq("hospital_id", hid).gte("created_at", thirtyDaysAgo),
    (supabase as any).from("ed_visits").select("id", { count: "exact", head: true })
      .eq("hospital_id", hid).gte("arrival_time", thirtyDaysAgo),
    (supabase as any).from("ot_schedules").select("id", { count: "exact", head: true })
      .eq("hospital_id", hid).gte("created_at", thirtyDaysAgo),
    (supabase as any).from("insurance_claims").select("id", { count: "exact", head: true })
      .eq("hospital_id", hid).gte("created_at", thirtyDaysAgo),
    (supabase as any).from("pharmacy_dispenses").select("id", { count: "exact", head: true })
      .eq("hospital_id", hid).gte("created_at", thirtyDaysAgo),
    (supabase as any).from("staff_attendance").select("id", { count: "exact", head: true })
      .eq("hospital_id", hid).gte("date", thirtyDaysAgo.substring(0, 10)),
  ]);

  return {
    opd:       opd.count       || 0,
    billing:   billing.count   || 0,
    ipd:       ipd.count       || 0,
    lab:       lab.count       || 0,
    radiology: radiology.count || 0,
    er:        er.count        || 0,
    ot:        ot.count        || 0,
    insurance: insurance.count || 0,
    pharmacy:  pharmacy.count  || 0,
    hr:        hr.count        || 0,
  };
}
import { toast } from "sonner";
import { ALL_MODULES } from "@/lib/modules";
import { CANONICAL_MODULE_KEYS } from "@/hooks/useSubscriptionConfig";

// ── helpers ──────────────────────────────────────────────────

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
const MODULE_NAME: Record<string, string> = Object.fromEntries(
  ALL_MODULES.map((m) => [ROUTE_KEY[m.route] ?? ROUTE_KEY[m.route.split("?")[0]], m.name])
);
const MODULE_CATEGORY: Record<string, string> = Object.fromEntries(
  ALL_MODULES.map((m) => [ROUTE_KEY[m.route] ?? ROUTE_KEY[m.route.split("?")[0]], m.category])
);

const STATUS_PILL: Record<string, string> = {
  active:"bg-emerald-500/20 text-emerald-400", trial:"bg-blue-500/20 text-blue-400",
  suspended:"bg-red-500/20 text-red-400", past_due:"bg-amber-500/20 text-amber-400",
  cancelled:"bg-slate-500/20 text-slate-500", no_subscription:"bg-slate-700/40 text-slate-400",
};

// ── data fetchers ─────────────────────────────────────────────

async function fetchHospitalDetail(id: string) {
  const [hRes, sRes, overRes, pricRes, plansRes] = await Promise.all([
    (supabase as any).from("hospitals").select("*").eq("id", id).maybeSingle(),
    (supabase as any).from("hospital_subscriptions")
      .select("*, subscription_plans(id,name,slug,price_monthly,price_yearly)")
      .eq("hospital_id", id).maybeSingle(),
    (supabase as any).from("hospital_feature_overrides")
      .select("module_key, is_enabled, reason").eq("hospital_id", id),
    (supabase as any).from("hospital_pricing_overrides")
      .select("*").eq("hospital_id", id).maybeSingle(),
    (supabase as any).from("subscription_plans")
      .select("id, name, slug, price_monthly").eq("is_active", true).order("sort_order"),
  ]);
  return {
    hospital: hRes.data,
    subscription: sRes.data,
    overrides: (overRes.data || []) as Array<{ module_key: string; is_enabled: boolean; reason: string | null }>,
    pricing: pricRes.data,
    plans: (plansRes.data || []) as Array<{ id: string; name: string; slug: string; price_monthly: number }>,
  };
}

async function fetchPlanFeatures(planId: string) {
  const { data } = await (supabase as any).from("plan_features")
    .select("module_key, is_enabled").eq("plan_id", planId);
  return new Map<string, boolean>((data || []).map((f: any) => [f.module_key, f.is_enabled]));
}

// ── component ─────────────────────────────────────────────────

const TABS = ["Overview", "Subscription", "Modules", "Pricing", "Notes", "Usage"];

export default function HospitalDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [tab, setTab] = useState("Overview");

  const { data, isLoading } = useQuery({
    queryKey: ["platform-hospital", id],
    queryFn: () => fetchHospitalDetail(id!),
    enabled: !!id,
    staleTime: 30_000,
  });

  const planId = data?.subscription?.plan_id;
  const { data: planFeatureMap } = useQuery({
    queryKey: ["plan-features", planId],
    queryFn: () => fetchPlanFeatures(planId!),
    enabled: !!planId,
    staleTime: 5 * 60_000,
  });

  const { data: usageData, isLoading: usageLoading } = useQuery({
    queryKey: ["platform-hospital-usage", id],
    queryFn: () => fetchHospitalUsage(id!),
    enabled: !!id && tab === "Usage",
    staleTime: 5 * 60_000,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["platform-hospital", id] });

  // ── Subscription actions ──
  const [selPlan, setSelPlan] = useState("");
  const [selStatus, setSelStatus] = useState("");
  const [subNotes, setSubNotes] = useState("");

  const updateSub = useMutation({
    mutationFn: async () => {
      const payload: any = { notes: subNotes || data?.subscription?.notes };
      if (selPlan) payload.plan_id = selPlan;
      if (selStatus) payload.status = selStatus;
      if (data?.subscription) {
        await (supabase as any).from("hospital_subscriptions")
          .update(payload).eq("hospital_id", id);
      } else {
        await (supabase as any).from("hospital_subscriptions")
          .insert({ hospital_id: id, ...payload, status: selStatus || "trial" });
      }
    },
    onSuccess: () => { toast.success("Subscription updated"); invalidate(); setSelPlan(""); setSelStatus(""); },
    onError: (e: any) => toast.error(e?.message || "Update failed"),
  });

  // ── Module override toggle ──
  const toggleModule = useMutation({
    mutationFn: async ({ key, enabled }: { key: string; enabled: boolean }) => {
      await (supabase as any).from("hospital_feature_overrides").upsert(
        { hospital_id: id, module_key: key, is_enabled: enabled },
        { onConflict: "hospital_id,module_key" }
      );
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["platform-hospital", id] }); },
    onError: (e: any) => toast.error(e?.message || "Failed"),
  });

  const removeOverride = useMutation({
    mutationFn: async (key: string) => {
      await (supabase as any).from("hospital_feature_overrides")
        .delete().eq("hospital_id", id).eq("module_key", key);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["platform-hospital", id] }); },
  });

  // ── Pricing override ──
  const [pMonthly, setPMonthly] = useState("");
  const [pYearly, setPYearly] = useState("");
  const [pReason, setPReason] = useState("");

  // ── Delete hospital ──
  // Step 0 = closed, Step 1 = warning modal, Step 2 = type-name confirmation
  const [deleteStep, setDeleteStep] = useState<0 | 1 | 2>(0);
  const [deleteNameInput, setDeleteNameInput] = useState("");

  const deleteHospital = useMutation({
    mutationFn: async () => {
      // Calls the delete-hospital edge function (service-role key).
      // It handles: auth.users deletion, storage cleanup, then
      // hospital row delete (which CASCADE-removes all clinical/financial/
      // operational data via ON DELETE CASCADE on all 79+ hospital tables).
      const { data: result, error } = await (supabase as any).functions.invoke(
        "delete-hospital",
        { body: { hospital_id: id } },
      );
      if (error) throw error;
      if (result?.error) throw new Error(result.error);
      // Surface any non-fatal warnings (e.g. storage bucket missing)
      if (result?.warnings?.length) {
        console.warn("Hospital delete warnings:", result.warnings);
      }
      return result;
    },
    onSuccess: (result: any) => {
      const staffMsg = result?.deleted_auth_users > 0
        ? ` · ${result.deleted_auth_users} staff account${result.deleted_auth_users > 1 ? "s" : ""} removed`
        : "";
      toast.success(`${hospital?.name ?? "Hospital"} permanently deleted${staffMsg}`);
      qc.invalidateQueries({ queryKey: ["platform-hospitals"] });
      qc.invalidateQueries({ queryKey: ["platform-dash"] });
      qc.invalidateQueries({ queryKey: ["platform-churn-radar"] });
      qc.invalidateQueries({ queryKey: ["platform-briefing"] });
      navigate("/platform/hospitals", { replace: true });
    },
    onError: (e: any) => {
      toast.error(e?.message || "Delete failed — see console for details.");
      setDeleteStep(0);
    },
  });

  const savePricing = useMutation({
    mutationFn: async () => {
      const payload = {
        hospital_id: id,
        monthly_price: pMonthly ? Number(pMonthly) : null,
        yearly_price: pYearly ? Number(pYearly) : null,
        reason: pReason || null,
      };
      await (supabase as any).from("hospital_pricing_overrides")
        .upsert(payload, { onConflict: "hospital_id" });
    },
    onSuccess: () => { toast.success("Pricing override saved"); invalidate(); },
    onError: (e: any) => toast.error(e?.message || "Failed"),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="animate-spin text-slate-400" size={22} />
      </div>
    );
  }

  const { hospital, subscription, overrides, pricing, plans } = data!;
  if (!hospital) return <div className="p-6 text-slate-500 text-sm">Hospital not found.</div>;

  const overrideMap = new Map(overrides.map((o) => [o.module_key, o.is_enabled]));
  const categories = [...new Set(CANONICAL_MODULE_KEYS.map((k) => MODULE_CATEGORY[k]).filter(Boolean))];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="h-14 border-b border-slate-800 flex items-center gap-3 px-6 shrink-0">
        <button onClick={() => navigate("/platform/hospitals")} className="text-slate-500 hover:text-white transition-colors">
          <ChevronLeft size={18} />
        </button>
        <div>
          <h1 className="text-[14px] font-semibold text-white">{hospital.name}</h1>
          <p className="text-[11px] text-slate-500">{hospital.state || "India"} · {hospital.beds_count} beds</p>
        </div>
        {subscription && (
          <span className={`ml-auto text-[10px] font-medium px-2 py-0.5 rounded-full ${STATUS_PILL[subscription.status] || STATUS_PILL.no_subscription}`}>
            {subscription.status.replace("_", " ")}
          </span>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-800 px-6 shrink-0">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              tab === t ? "border-blue-500 text-white" : "border-transparent text-slate-500 hover:text-slate-300"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto p-6">

        {/* ── Overview ── */}
        {tab === "Overview" && (
          <div className="space-y-6 max-w-xl">
            {/* Hospital info */}
            <div className="space-y-4">
              {[
                ["Name", hospital.name], ["Type", hospital.type],
                ["State", hospital.state || "—"], ["Beds", hospital.beds_count],
                ["GSTIN", hospital.gstin || "—"], ["NABH Number", hospital.nabh_number || "—"],
                ["Address", hospital.address || "—"],
              ].map(([label, val]) => (
                <div key={String(label)} className="flex items-start gap-4">
                  <p className="text-xs text-slate-500 w-32 shrink-0">{label}</p>
                  <p className="text-xs text-slate-200">{String(val)}</p>
                </div>
              ))}
            </div>

            {/* Danger zone */}
            <div className="border border-red-800/50 rounded-xl p-5 space-y-3 bg-red-950/10">
              <p className="text-xs font-bold uppercase tracking-wider text-red-400">Danger Zone</p>
              <p className="text-xs text-slate-400 leading-relaxed">
                Permanently delete this hospital and <strong className="text-slate-200">all its data</strong> — patients,
                appointments, bills, lab results, prescriptions, staff accounts, and every other record.
                This action <strong className="text-red-400">cannot be undone</strong>.
              </p>
              <button
                onClick={() => setDeleteStep(1)}
                className="flex items-center gap-2 px-4 py-2 bg-red-600/20 hover:bg-red-600/30 border border-red-600/40 text-red-400 hover:text-red-300 text-xs font-semibold rounded-lg transition-colors"
              >
                <Trash2 size={13} />
                Delete Hospital Permanently
              </button>
            </div>
          </div>
        )}

        {/* ── Subscription ── */}
        {tab === "Subscription" && (
          <div className="space-y-6 max-w-lg">
            {subscription ? (
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
                <p className="text-xs text-slate-500 uppercase font-bold tracking-wider">Current</p>
                <p className="text-lg font-bold text-white">{subscription.subscription_plans?.name ?? "Unknown Plan"}</p>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div><p className="text-slate-500">Status</p><p className="text-slate-200 font-medium">{subscription.status}</p></div>
                  <div><p className="text-slate-500">Razorpay Sub ID</p><p className="text-slate-400 font-mono text-[10px]">{subscription.razorpay_subscription_id || "—"}</p></div>
                  {subscription.trial_ends_at && <div><p className="text-slate-500">Trial ends</p><p className="text-slate-200">{new Date(subscription.trial_ends_at).toLocaleDateString("en-IN")}</p></div>}
                  {subscription.current_period_end && <div><p className="text-slate-500">Next billing</p><p className="text-slate-200">{new Date(subscription.current_period_end).toLocaleDateString("en-IN")}</p></div>}
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-600">No subscription assigned yet.</p>
            )}

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
              <p className="text-xs text-slate-500 uppercase font-bold tracking-wider">Change Plan / Status</p>
              <div>
                <label className="text-xs text-slate-400">Plan</label>
                <select
                  value={selPlan}
                  onChange={(e) => setSelPlan(e.target.value)}
                  className="w-full mt-1 h-8 px-3 text-xs bg-slate-800 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:border-blue-500"
                >
                  <option value="">Keep current</option>
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>{p.name} — ₹{p.price_monthly.toLocaleString("en-IN")}/mo</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-400">Status</label>
                <select
                  value={selStatus}
                  onChange={(e) => setSelStatus(e.target.value)}
                  className="w-full mt-1 h-8 px-3 text-xs bg-slate-800 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:border-blue-500"
                >
                  <option value="">Keep current</option>
                  {["trial","active","past_due","suspended","cancelled"].map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-400">Internal Notes</label>
                <textarea
                  defaultValue={subscription?.notes || ""}
                  onChange={(e) => setSubNotes(e.target.value)}
                  rows={2}
                  placeholder="CEO notes..."
                  className="w-full mt-1 px-3 py-2 text-xs bg-slate-800 border border-slate-700 rounded-lg text-slate-200 resize-none focus:outline-none focus:border-blue-500"
                />
              </div>
              <button
                onClick={() => updateSub.mutate()}
                disabled={updateSub.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
              >
                {updateSub.isPending ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                Save Changes
              </button>
            </div>
          </div>
        )}

        {/* ── Modules ── */}
        {tab === "Modules" && (
          <div className="space-y-6">
            <p className="text-xs text-slate-500">
              Blue = enabled by plan · Amber = manually overridden · Grey = disabled.
              Click to override. Right-click toggle resets to plan default.
            </p>
            {categories.map((cat) => {
              const keys = CANONICAL_MODULE_KEYS.filter((k) => MODULE_CATEGORY[k] === cat);
              if (!keys.length) return null;
              return (
                <div key={cat}>
                  <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-3">{cat}</p>
                  <div className="grid grid-cols-3 gap-2">
                    {keys.map((key) => {
                      const planDefault = planFeatureMap?.get(key) ?? true;
                      const hasOverride = overrideMap.has(key);
                      const effective = hasOverride ? overrideMap.get(key)! : planDefault;
                      return (
                        <div
                          key={key}
                          className={`flex items-center justify-between px-3 py-2.5 rounded-lg border text-xs transition-colors cursor-pointer ${
                            effective
                              ? hasOverride
                                ? "bg-amber-500/10 border-amber-600/40 text-amber-300"
                                : "bg-slate-800 border-slate-700 text-slate-200"
                              : "bg-slate-900/50 border-slate-800/50 text-slate-600"
                          }`}
                          onClick={() => toggleModule.mutate({ key, enabled: !effective })}
                          onContextMenu={(e) => { e.preventDefault(); if (hasOverride) removeOverride.mutate(key); }}
                          title={hasOverride ? "Right-click to reset to plan default" : "Click to override"}
                        >
                          <span className="truncate">{MODULE_NAME[key] || key}</span>
                          <div className={`w-7 h-3.5 rounded-full relative shrink-0 ml-2 transition-colors ${effective ? hasOverride ? "bg-amber-500" : "bg-blue-500" : "bg-slate-700"}`}>
                            <div className={`absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white shadow transition-transform ${effective ? "translate-x-3.5" : "translate-x-0.5"}`} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Pricing ── */}
        {tab === "Pricing" && (
          <div className="max-w-md space-y-6">
            {pricing && (
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-2">
                <p className="text-xs text-slate-500 uppercase font-bold tracking-wider">Active Override</p>
                <p className="text-xs text-slate-300">Monthly: <span className="text-white font-mono">₹{Number(pricing.monthly_price).toLocaleString("en-IN")}</span></p>
                {pricing.yearly_price && <p className="text-xs text-slate-300">Yearly: <span className="text-white font-mono">₹{Number(pricing.yearly_price).toLocaleString("en-IN")}</span></p>}
                {pricing.reason && <p className="text-xs text-slate-500 italic">"{pricing.reason}"</p>}
                {pricing.valid_until && <p className="text-xs text-slate-500">Valid until: {new Date(pricing.valid_until).toLocaleDateString("en-IN")}</p>}
              </div>
            )}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
              <p className="text-xs text-slate-500 uppercase font-bold tracking-wider">
                {pricing ? "Update Override" : "Set Custom Price"}
              </p>
              {[
                { label: "Custom Monthly Price (₹)", val: pMonthly, set: setPMonthly, placeholder: "e.g. 45000" },
                { label: "Custom Yearly Price (₹)", val: pYearly, set: setPYearly, placeholder: "e.g. 450000" },
                { label: "Reason (internal)", val: pReason, set: setPReason, placeholder: "e.g. Apollo negotiated deal" },
              ].map(({ label, val, set, placeholder }) => (
                <div key={label}>
                  <label className="text-xs text-slate-400">{label}</label>
                  <input
                    value={val}
                    onChange={(e) => set(e.target.value)}
                    placeholder={placeholder}
                    className="w-full mt-1 h-8 px-3 text-xs bg-slate-800 border border-slate-700 rounded-lg text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
                  />
                </div>
              ))}
              <button
                onClick={() => savePricing.mutate()}
                disabled={savePricing.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
              >
                {savePricing.isPending ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                Save Pricing Override
              </button>
            </div>
          </div>
        )}

        {/* ── Usage ── */}
        {tab === "Usage" && (
          <div className="space-y-5 max-w-2xl">
            <p className="text-xs text-slate-500">
              Module activity in the last 30 days. Shows which modules are actually being used.
            </p>
            {usageLoading ? (
              <div className="flex items-center gap-2 text-xs text-slate-500 py-8">
                <Loader2 size={14} className="animate-spin" /> Loading usage data…
              </div>
            ) : usageData ? (() => {
              const modules = [
                { key: "opd",       label: "OPD Tokens",        count: usageData.opd,       unit: "tokens" },
                { key: "billing",   label: "Bills Generated",   count: usageData.billing,   unit: "bills" },
                { key: "ipd",       label: "IPD Admissions",    count: usageData.ipd,       unit: "admissions" },
                { key: "lab",       label: "Lab Orders",        count: usageData.lab,       unit: "orders" },
                { key: "radiology", label: "Radiology Orders",  count: usageData.radiology, unit: "orders" },
                { key: "er",        label: "ER Visits",         count: usageData.er,        unit: "visits" },
                { key: "ot",        label: "OT Cases",          count: usageData.ot,        unit: "cases" },
                { key: "insurance", label: "Insurance Claims",  count: usageData.insurance, unit: "claims" },
                { key: "pharmacy",  label: "Pharmacy Dispenses",count: usageData.pharmacy,  unit: "items" },
                { key: "hr",        label: "HR Attendance",     count: usageData.hr,        unit: "records" },
              ];
              const maxCount  = Math.max(...modules.map((m) => m.count), 1);
              const activeCount = modules.filter((m) => m.count > 0).length;
              const adoptionPct = Math.round((activeCount / modules.length) * 100);
              return (
                <div className="space-y-4">
                  {/* Adoption score */}
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center gap-4">
                    <Activity size={18} className="text-blue-400 shrink-0" />
                    <div>
                      <p className="text-xs text-slate-500">Module Adoption</p>
                      <p className={`text-2xl font-bold font-mono ${adoptionPct >= 60 ? "text-emerald-400" : adoptionPct >= 30 ? "text-amber-400" : "text-red-400"}`}>
                        {adoptionPct}%
                      </p>
                    </div>
                    <div className="ml-2">
                      <p className="text-xs text-slate-500">{activeCount} of {modules.length} tracked modules active in last 30 days</p>
                      {adoptionPct < 40 && (
                        <p className="text-xs text-amber-400 mt-0.5">Low adoption — consider a training call</p>
                      )}
                    </div>
                  </div>

                  {/* Module activity bars */}
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
                    {modules.map((m) => {
                      const pct = Math.round((m.count / maxCount) * 100);
                      const isActive = m.count > 0;
                      return (
                        <div key={m.key} className="flex items-center gap-3">
                          <span className={`text-[10px] w-2.5 h-2.5 rounded-full shrink-0 ${isActive ? "bg-emerald-400" : "bg-slate-700"}`} />
                          <span className="text-xs text-slate-400 w-40 shrink-0">{m.label}</span>
                          <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${isActive ? "bg-blue-500" : "bg-slate-700"}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className={`text-xs font-mono w-20 text-right shrink-0 ${isActive ? "text-slate-300" : "text-slate-600"}`}>
                            {isActive ? `${m.count.toLocaleString()} ${m.unit}` : "No activity"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })() : (
              <p className="text-xs text-slate-600">No usage data available.</p>
            )}
          </div>
        )}

        {/* ── Notes ── */}
        {tab === "Notes" && (
          <div className="max-w-lg">
            <p className="text-xs text-slate-500 mb-3">Internal notes are only visible to Aumrti admins.</p>
            <textarea
              defaultValue={subscription?.notes || ""}
              onChange={(e) => setSubNotes(e.target.value)}
              rows={8}
              placeholder="Add internal notes about this hospital..."
              className="w-full px-4 py-3 text-sm bg-slate-900 border border-slate-800 rounded-xl text-slate-200 resize-none focus:outline-none focus:border-blue-500"
            />
            <button
              onClick={() => updateSub.mutate()}
              disabled={updateSub.isPending}
              className="mt-3 flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
            >
              {updateSub.isPending ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
              Save Notes
            </button>
          </div>
        )}

      </div>

      {/* ═══════════════════════════════════════════════════════
          DELETE CONFIRMATION — STEP 1: Warning
      ════════════════════════════════════════════════════════ */}
      {deleteStep === 1 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75">
          <div className="bg-slate-900 border border-red-800/60 rounded-2xl w-[480px] shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center">
                  <AlertTriangle size={16} className="text-red-400" />
                </div>
                <p className="text-sm font-bold text-white">Delete Hospital?</p>
              </div>
              <button onClick={() => setDeleteStep(0)} className="text-slate-500 hover:text-white">
                <X size={15} />
              </button>
            </div>

            {/* Body */}
            <div className="px-6 py-5 space-y-4">
              <p className="text-sm text-slate-300">
                You are about to permanently delete{" "}
                <span className="font-bold text-white">{hospital.name}</span>.
              </p>
              <div className="bg-red-950/30 border border-red-800/40 rounded-lg p-4 space-y-2">
                <p className="text-xs font-semibold text-red-300 uppercase tracking-wider">
                  The following will be permanently deleted:
                </p>
                <ul className="text-xs text-slate-400 space-y-1 list-disc list-inside leading-relaxed">
                  <li>All patient records, UHID history and medical data</li>
                  <li>All OPD, IPD, Emergency and OT records</li>
                  <li>All lab results, radiology reports and prescriptions</li>
                  <li>All bills, payments and financial records</li>
                  <li>All staff accounts and HR records</li>
                  <li>All settings, configurations and customisations</li>
                  <li>The subscription and all billing history</li>
                </ul>
              </div>
              <p className="text-xs text-red-400 font-medium">
                This action is irreversible. There is no way to recover this data.
              </p>
            </div>

            {/* Footer */}
            <div className="px-6 pb-5 flex gap-3">
              <button
                onClick={() => setDeleteStep(0)}
                className="flex-1 py-2.5 border border-slate-700 text-slate-300 hover:text-white text-sm font-medium rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => { setDeleteNameInput(""); setDeleteStep(2); }}
                className="flex-1 py-2.5 bg-red-600/20 hover:bg-red-600/30 border border-red-600/50 text-red-400 text-sm font-semibold rounded-lg transition-colors"
              >
                I understand, proceed →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════
          DELETE CONFIRMATION — STEP 2: Type hospital name
      ════════════════════════════════════════════════════════ */}
      {deleteStep === 2 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
          <div className="bg-slate-900 border border-red-700/70 rounded-2xl w-[460px] shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-red-500/30 flex items-center justify-center">
                  <Trash2 size={15} className="text-red-400" />
                </div>
                <p className="text-sm font-bold text-red-300">Final Confirmation</p>
              </div>
              <button
                onClick={() => { setDeleteStep(0); setDeleteNameInput(""); }}
                className="text-slate-500 hover:text-white"
              >
                <X size={15} />
              </button>
            </div>

            {/* Body */}
            <div className="px-6 py-5 space-y-4">
              <p className="text-sm text-slate-300 leading-relaxed">
                To confirm deletion, type the hospital name exactly as shown below:
              </p>
              <div className="bg-slate-800 rounded-lg px-4 py-2.5 text-center">
                <p className="text-sm font-mono font-bold text-white tracking-wide select-all">
                  {hospital.name}
                </p>
              </div>
              <input
                autoFocus
                value={deleteNameInput}
                onChange={(e) => setDeleteNameInput(e.target.value)}
                placeholder="Type hospital name here..."
                className="w-full h-10 px-3 text-sm bg-slate-800 border border-slate-700 rounded-lg text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-red-500 font-mono"
              />
              {deleteNameInput && deleteNameInput !== hospital.name && (
                <p className="text-xs text-red-400 flex items-center gap-1.5">
                  <AlertTriangle size={11} />
                  Name does not match — check spelling and capitalisation
                </p>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 pb-5 flex gap-3">
              <button
                onClick={() => { setDeleteStep(0); setDeleteNameInput(""); }}
                className="flex-1 py-2.5 border border-slate-700 text-slate-300 hover:text-white text-sm font-medium rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteHospital.mutate()}
                disabled={deleteNameInput !== hospital.name || deleteHospital.isPending}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-500 text-white text-sm font-bold rounded-lg transition-colors disabled:opacity-40 disabled:pointer-events-none flex items-center justify-center gap-2"
              >
                {deleteHospital.isPending ? (
                  <><Loader2 size={14} className="animate-spin" /> Purging all data…</>
                ) : (
                  <><Trash2 size={14} /> DELETE ALL DATA PERMANENTLY</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
