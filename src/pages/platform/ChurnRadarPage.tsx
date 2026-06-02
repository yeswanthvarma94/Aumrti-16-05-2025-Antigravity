import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { RefreshCw, Phone, Mail, AlertTriangle, CheckCircle2, Eye } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

// ─── types ────────────────────────────────────────────────────────────────────
interface HospitalRisk {
  id: string;
  name: string;
  state: string | null;
  beds_count: number;
  created_at: string;
  status: string;
  plan_name: string;
  plan_price: number;
  trial_ends_at: string | null;
  hasRecentOpd: boolean;
  hasRecentBilling: boolean;
  score: number;
  risk: "high" | "medium" | "low";
  signals: string[];
  action: string;
}

// ─── Health Score ─────────────────────────────────────────────────────────────
function computeScore(
  h: { created_at: string; status: string },
  hasRecentOpd: boolean,
  hasRecentBilling: boolean,
): number {
  const ageDays = (Date.now() - new Date(h.created_at).getTime()) / 86400000;
  if (ageDays < 14) {
    const newBase: Record<string, number> = { active: 78, trial: 72, past_due: 30, suspended: 10 };
    return newBase[h.status] ?? 55;
  }
  let score = 0;
  if (hasRecentOpd)     score += 30;
  if (hasRecentBilling) score += 20;
  const statusScore: Record<string, number> = {
    active: 30, trial: 20, past_due: 8, suspended: 0, cancelled: 0, no_subscription: 0,
  };
  score += statusScore[h.status] ?? 0;
  if (ageDays > 180)     score += 20;
  else if (ageDays > 90) score += 15;
  else if (ageDays > 30) score += 10;
  else                   score += 5;
  return Math.min(100, score);
}

function buildSignals(h: HospitalRisk, hasRecentOpd: boolean, hasRecentBilling: boolean): string[] {
  const signals: string[] = [];
  const ageDays = (Date.now() - new Date(h.created_at).getTime()) / 86400000;

  if (!hasRecentOpd && ageDays > 14)     signals.push("No OPD activity in 30 days");
  if (!hasRecentBilling && ageDays > 14) signals.push("No billing activity in 30 days");
  if (h.status === "past_due")           signals.push("Payment overdue");
  if (h.status === "suspended")          signals.push("Account suspended");

  if (h.trial_ends_at) {
    const trialDaysLeft = Math.round((new Date(h.trial_ends_at).getTime() - Date.now()) / 86400000);
    if (trialDaysLeft <= 7 && trialDaysLeft >= 0)  signals.push(`Trial ends in ${trialDaysLeft} days`);
    if (trialDaysLeft < 0)                         signals.push("Trial expired — no conversion");
  }

  if (hasRecentOpd && !hasRecentBilling && ageDays > 30) signals.push("Using OPD but not billing — revenue leakage risk");
  if (ageDays > 90 && !hasRecentOpd && h.status === "active") signals.push("Paid but inactive — churn risk");

  return signals;
}

// ─── Data Fetcher ─────────────────────────────────────────────────────────────
async function fetchChurnData(): Promise<HospitalRisk[]> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();

  const [hRes, sRes, opdRes, billRes] = await Promise.all([
    (supabase as any).from("hospitals")
      .select("id, name, state, beds_count, created_at")
      .eq("is_active", true),
    (supabase as any).from("hospital_subscriptions")
      .select("hospital_id, status, trial_ends_at, subscription_plans(name, price_monthly)"),
    (supabase as any).from("opd_tokens")
      .select("hospital_id")
      .gte("created_at", thirtyDaysAgo),
    (supabase as any).from("bills")
      .select("hospital_id")
      .gte("created_at", thirtyDaysAgo),
  ]);

  const hospitals: any[] = hRes.data || [];
  const subs: any[]      = sRes.data || [];
  const subMap           = new Map(subs.map((s: any) => [s.hospital_id, s]));
  const opdSet           = new Set((opdRes.data  || []).map((r: any) => r.hospital_id));
  const billSet          = new Set((billRes.data || []).map((r: any) => r.hospital_id));

  return hospitals
    .map((h: any): HospitalRisk => {
      const sub = subMap.get(h.id) as any;
      const hasOpd  = opdSet.has(h.id);
      const hasBill = billSet.has(h.id);
      const base = {
        created_at: h.created_at,
        status: sub?.status || "no_subscription",
      };
      const score = computeScore(base, hasOpd, hasBill);

      const row: HospitalRisk = {
        id: h.id, name: h.name, state: h.state,
        beds_count: h.beds_count, created_at: h.created_at,
        status: sub?.status || "no_subscription",
        plan_name:  sub?.subscription_plans?.name || "—",
        plan_price: Number(sub?.subscription_plans?.price_monthly) || 0,
        trial_ends_at: sub?.trial_ends_at || null,
        hasRecentOpd: hasOpd, hasRecentBilling: hasBill,
        score,
        risk:    score < 40 ? "high" : score < 70 ? "medium" : "low",
        signals: [],
        action:  "",
      };

      row.signals = buildSignals(row, hasOpd, hasBill);
      row.action  = row.risk === "high" ? "Call within 24 hours"
        : row.risk === "medium" ? "Send check-in email this week"
        : "No action needed";

      return row;
    })
    .sort((a, b) => a.score - b.score); // riskiest first
}

// ─── Risk badge ───────────────────────────────────────────────────────────────
function RiskBadge({ risk }: { risk: "high" | "medium" | "low" }) {
  const cfg = {
    high:   { cls: "bg-red-500/15 border-red-500/40 text-red-400",     dot: "bg-red-400",    label: "HIGH RISK" },
    medium: { cls: "bg-amber-500/15 border-amber-500/40 text-amber-400", dot: "bg-amber-400", label: "MONITOR" },
    low:    { cls: "bg-emerald-500/15 border-emerald-500/40 text-emerald-400", dot: "bg-emerald-400", label: "HEALTHY" },
  }[risk];
  return (
    <span className={`flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full border ${cfg.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

const fmtINR = (n: number) => n >= 1_00_000 ? `₹${(n / 1_00_000).toFixed(1)}L` : `₹${n.toLocaleString("en-IN")}`;

// ─── Component ────────────────────────────────────────────────────────────────
export default function ChurnRadarPage() {
  const navigate = useNavigate();
  const { data = [], isLoading, refetch } = useQuery({
    queryKey: ["platform-churn-radar"],
    queryFn: fetchChurnData,
    staleTime: 5 * 60_000,
  });

  const highRisk   = data.filter((h) => h.risk === "high");
  const medRisk    = data.filter((h) => h.risk === "medium");
  const healthy    = data.filter((h) => h.risk === "low");
  const atRiskMrr  = highRisk.reduce((s, h) => s + h.plan_price, 0);

  const renderGroup = (title: string, hospitals: HospitalRisk[], accent: string) => {
    if (hospitals.length === 0) return null;
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 px-1">
          <span className={`text-xs font-bold uppercase tracking-wider ${accent}`}>{title}</span>
          <span className="text-[10px] text-slate-600">{hospitals.length} hospitals</span>
          {title.includes("HIGH") && atRiskMrr > 0 && (
            <span className="text-[10px] text-red-500 font-mono ml-auto">{fmtINR(atRiskMrr)}/mo at risk</span>
          )}
        </div>
        {hospitals.map((h) => (
          <div
            key={h.id}
            className="bg-slate-900 border border-slate-800 rounded-xl p-4 hover:border-slate-700 transition-colors"
          >
            <div className="flex items-start justify-between gap-3">
              {/* Left: hospital info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-sm font-semibold text-white truncate">{h.name}</p>
                  <RiskBadge risk={h.risk} />
                  <span className="text-[10px] font-mono text-slate-500">Score {h.score}</span>
                </div>
                <p className="text-[11px] text-slate-500">
                  {h.plan_name} · {h.state || "India"} · {h.beds_count} beds ·{" "}
                  joined {formatDistanceToNow(new Date(h.created_at), { addSuffix: true })}
                </p>

                {/* Signals */}
                {h.signals.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {h.signals.map((sig, i) => (
                      <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                        {sig}
                      </span>
                    ))}
                  </div>
                )}

                {/* Action */}
                <div className="mt-2 flex items-center gap-1.5">
                  {h.risk === "high" ? (
                    <AlertTriangle size={11} className="text-red-400 shrink-0" />
                  ) : h.risk === "medium" ? (
                    <Mail size={11} className="text-amber-400 shrink-0" />
                  ) : (
                    <CheckCircle2 size={11} className="text-emerald-400 shrink-0" />
                  )}
                  <p className={`text-[11px] font-medium ${
                    h.risk === "high" ? "text-red-400" : h.risk === "medium" ? "text-amber-400" : "text-emerald-400"
                  }`}>
                    {h.action}
                  </p>
                </div>
              </div>

              {/* Right: MRR at stake + actions */}
              <div className="shrink-0 text-right space-y-2">
                {h.plan_price > 0 && (
                  <div>
                    <p className="text-[10px] text-slate-600">Monthly value</p>
                    <p className="text-sm font-mono font-bold text-white">{fmtINR(h.plan_price)}</p>
                  </div>
                )}
                {h.trial_ends_at && (
                  <div>
                    <p className="text-[10px] text-slate-600">Trial ends</p>
                    <p className={`text-[11px] font-mono ${
                      new Date(h.trial_ends_at) < new Date() ? "text-red-400" : "text-amber-400"
                    }`}>
                      {format(new Date(h.trial_ends_at), "dd MMM")}
                    </p>
                  </div>
                )}
                <button
                  onClick={() => navigate(`/platform/hospitals/${h.id}`)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-[11px] font-medium rounded-lg transition-colors"
                >
                  <Eye size={11} />
                  View
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full">
      <div className="h-14 border-b border-slate-800 flex items-center justify-between px-6 shrink-0">
        <div>
          <h1 className="text-[15px] font-semibold text-white">Churn Risk Radar</h1>
          <p className="text-[11px] text-slate-500 mt-0.5">Hospitals ranked by churn risk · act before they cancel</p>
        </div>
        <button onClick={() => refetch()} className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-white transition-colors">
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {/* Summary bar */}
      {!isLoading && data.length > 0 && (
        <div className="px-6 py-3 border-b border-slate-800 flex items-center gap-6 bg-slate-900/50 shrink-0">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-400" />
            <span className="text-xs text-slate-400">{highRisk.length} high risk</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            <span className="text-xs text-slate-400">{medRisk.length} monitor</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span className="text-xs text-slate-400">{healthy.length} healthy</span>
          </div>
          {atRiskMrr > 0 && (
            <div className="ml-auto flex items-center gap-1.5">
              <AlertTriangle size={13} className="text-red-400" />
              <span className="text-xs text-red-400 font-mono font-semibold">{fmtINR(atRiskMrr)}/month at immediate risk</span>
            </div>
          )}
        </div>
      )}

      <div className="flex-1 overflow-auto p-6 space-y-8">
        {isLoading ? (
          <div className="py-12 text-center text-xs text-slate-600">Analysing hospital health…</div>
        ) : data.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-600">No hospitals found</div>
        ) : (
          <>
            {renderGroup("🔴 High Risk — Call within 24 hours", highRisk, "text-red-400")}
            {renderGroup("🟡 Monitor — Check in this week", medRisk, "text-amber-400")}
            {renderGroup("🟢 Healthy — No action needed", healthy, "text-emerald-400")}
          </>
        )}
      </div>
    </div>
  );
}
