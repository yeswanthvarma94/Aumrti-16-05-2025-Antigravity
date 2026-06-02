import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { IndianRupee, TrendingUp, RefreshCw, Repeat2, Wallet, ArrowUpRight } from "lucide-react";
import { format, addDays, subMonths } from "date-fns";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, Legend,
  ResponsiveContainer, CartesianGrid,
} from "recharts";

// ─── types ────────────────────────────────────────────────────────────────────
interface SubRow {
  hospital_id: string;
  status: string;
  plan_id: string | null;
  created_at: string;
  trial_ends_at: string | null;
  current_period_end: string | null;
  subscription_plans: { name: string; price_monthly: number } | null;
  hospitals: { name: string } | null;
}

interface RevData {
  mrr: number;
  arr: number;
  nrr: number | null;
  ltv: number | null;
  conversionRate: number;
  activeCount: number;
  trialCount: number;
  atRiskMrr: number;
  byPlan: Array<{ name: string; count: number; revenue: number; pct: number }>;
  monthlyChart: Array<{ month: string; newMrr: number; totalMrr: number }>;
  upcoming: Array<{ hospital: string; plan: string; ends: string; amount: number }>;
  pastDue: Array<{ hospital: string; plan: string; since: string; amount: number }>;
}

// ─── data fetcher ─────────────────────────────────────────────────────────────
async function fetchRevenue(): Promise<RevData> {
  const { data: subs } = await (supabase as any)
    .from("hospital_subscriptions")
    .select(`
      hospital_id, status, plan_id, created_at, trial_ends_at, current_period_end,
      subscription_plans(name, price_monthly),
      hospitals(name)
    `);

  const rows: SubRow[] = subs || [];
  const price = (r: SubRow) => Number(r.subscription_plans?.price_monthly) || 0;

  const active    = rows.filter((r) => r.status === "active");
  const trial     = rows.filter((r) => r.status === "trial");
  const pastDueRows = rows.filter((r) => ["past_due", "suspended"].includes(r.status));

  const mrr = [...active, ...trial].reduce((s, r) => s + price(r), 0);
  const arr = mrr * 12;
  const activeCount = active.length;
  const trialCount  = trial.length;
  const atRiskMrr   = pastDueRows.reduce((s, r) => s + price(r), 0);

  // ── 12-month Retention (NRR proxy) ────────────────────────────────────────
  const twelveMonthsAgo = subMonths(new Date(), 12);
  const cohort12 = rows.filter((r) => new Date(r.created_at) < twelveMonthsAgo);
  const retained12 = cohort12.filter((r) => ["active", "trial"].includes(r.status));
  const nrr = cohort12.length > 0
    ? Math.round((retained12.length / cohort12.length) * 100)
    : null;

  // ── LTV ───────────────────────────────────────────────────────────────────
  const arpu = activeCount > 0 ? mrr / activeCount : 0;
  const avgAgeMonths = active.length > 0
    ? active.reduce((s, r) => {
        const ageDays = (Date.now() - new Date(r.created_at).getTime()) / 86400000;
        return s + ageDays / 30;
      }, 0) / active.length
    : 0;
  const ltv = arpu > 0 ? Math.round(arpu * Math.max(avgAgeMonths * 2, 12)) : null;

  // ── Trial → Paid Conversion ────────────────────────────────────────────────
  const olderTrials = trial.filter((r) => {
    const ageDays = (Date.now() - new Date(r.created_at).getTime()) / 86400000;
    return ageDays > 14;
  });
  const denominator = activeCount + olderTrials.length;
  const conversionRate = denominator > 0
    ? Math.round((activeCount / denominator) * 100)
    : 0;

  // ── Monthly MRR Growth Chart ───────────────────────────────────────────────
  const allPaying = [...active, ...trial];
  const signupRevByMonth = new Map<string, number>();
  for (const r of allPaying) {
    const key = format(new Date(r.created_at), "MMM yy");
    signupRevByMonth.set(key, (signupRevByMonth.get(key) || 0) + price(r));
  }

  const baseline = allPaying
    .filter((r) => new Date(r.created_at) < twelveMonthsAgo)
    .reduce((s, r) => s + price(r), 0);

  let running = baseline;
  const monthlyChart = Array.from({ length: 12 }, (_, i) => {
    const d = subMonths(new Date(), 11 - i);
    const month = format(d, "MMM yy");
    const newMrr = signupRevByMonth.get(month) || 0;
    running += newMrr;
    return { month, newMrr, totalMrr: running };
  });

  // ── Plan breakdown ─────────────────────────────────────────────────────────
  const planMap = new Map<string, { count: number; revenue: number }>();
  for (const r of allPaying) {
    const name = r.subscription_plans?.name || "Unknown";
    const cur = planMap.get(name) || { count: 0, revenue: 0 };
    planMap.set(name, { count: cur.count + 1, revenue: cur.revenue + price(r) });
  }
  const byPlan = [...planMap.entries()]
    .map(([name, v]) => ({ name, ...v, pct: mrr > 0 ? Math.round((v.revenue / mrr) * 100) : 0 }))
    .sort((a, b) => b.revenue - a.revenue);

  // ── Upcoming renewals ─────────────────────────────────────────────────────
  const now = new Date();
  const soon = addDays(now, 14);
  const upcoming = active
    .filter((r) => r.current_period_end && new Date(r.current_period_end) <= soon)
    .map((r) => ({
      hospital: (r.hospitals as any)?.name || "—",
      plan: r.subscription_plans?.name || "—",
      ends: r.current_period_end!,
      amount: price(r),
    }))
    .slice(0, 10);

  const pastDue = pastDueRows
    .map((r) => ({
      hospital: (r.hospitals as any)?.name || "—",
      plan: r.subscription_plans?.name || "—",
      since: r.current_period_end || "—",
      amount: price(r),
    }))
    .slice(0, 10);

  return { mrr, arr, nrr, ltv, conversionRate, activeCount, trialCount, atRiskMrr, byPlan, monthlyChart, upcoming, pastDue };
}

// ─── helpers ──────────────────────────────────────────────────────────────────
const fmtINR = (n: number) => {
  if (n >= 10_00_000) return `₹${(n / 10_00_000).toFixed(1)}Cr`;
  if (n >= 1_00_000)  return `₹${(n / 1_00_000).toFixed(2)}L`;
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
};

const chartTooltipFormatter = (value: number, name: string) => [
  fmtINR(value),
  name === "newMrr" ? "New MRR" : "Total MRR",
];

// ─── component ────────────────────────────────────────────────────────────────
export default function RevenueDashboardPage() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["platform-revenue"],
    queryFn: fetchRevenue,
    staleTime: 60_000,
  });

  const topCard = (label: string, value: string, sub: string, icon: React.ReactNode, accent = "text-emerald-400") => (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-slate-500">{icon}</span>
        <span className="text-[10px] text-slate-600 uppercase tracking-wider font-bold">{sub}</span>
      </div>
      <p className={`text-2xl font-bold font-mono ${accent}`}>{isLoading ? "—" : value}</p>
      <p className="text-[11px] text-slate-500 mt-1">{label}</p>
    </div>
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="h-14 border-b border-slate-800 flex items-center justify-between px-6 shrink-0">
        <h1 className="text-[15px] font-semibold text-white">Revenue Intelligence</h1>
        <button onClick={() => refetch()} className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-white transition-colors">
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-6">

        {/* ── Top metric cards ── */}
        <div className="grid grid-cols-5 gap-4">
          {topCard("Monthly Recurring Revenue", data ? fmtINR(data.mrr) : "—", "Live MRR", <IndianRupee size={16} />)}
          {topCard("Annual Run Rate", data ? fmtINR(data.arr) : "—", "ARR", <TrendingUp size={16} />)}
          {topCard(
            "12-Month Retention",
            data?.nrr != null ? `${data.nrr}%` : "N/A",
            "NRR proxy",
            <Repeat2 size={16} />,
            data?.nrr != null && data.nrr >= 90 ? "text-emerald-400" : data?.nrr != null && data.nrr >= 70 ? "text-amber-400" : "text-red-400",
          )}
          {topCard(
            "Avg Customer LTV",
            data?.ltv ? fmtINR(data.ltv) : "N/A",
            "Est. lifetime value",
            <Wallet size={16} />,
          )}
          {topCard(
            "Trial → Paid Rate",
            data ? `${data.conversionRate}%` : "—",
            `${data?.activeCount ?? 0} paid / ${(data?.activeCount ?? 0) + (data?.trialCount ?? 0)} total`,
            <ArrowUpRight size={16} />,
            data?.conversionRate != null && data.conversionRate >= 50 ? "text-emerald-400" : "text-amber-400",
          )}
        </div>

        {/* ── Sub-metrics row ── */}
        {data && (
          <div className="flex items-center gap-6 px-1">
            <span className="text-xs text-slate-500">
              <span className="text-emerald-400 font-mono font-bold">{data.activeCount}</span> paid
            </span>
            <span className="text-[10px] text-slate-700">·</span>
            <span className="text-xs text-slate-500">
              <span className="text-blue-400 font-mono font-bold">{data.trialCount}</span> on trial
            </span>
            {data.atRiskMrr > 0 && (
              <>
                <span className="text-[10px] text-slate-700">·</span>
                <span className="text-xs text-slate-500">
                  <span className="text-red-400 font-mono font-bold">{fmtINR(data.atRiskMrr)}</span> at risk (past-due/suspended)
                </span>
              </>
            )}
          </div>
        )}

        {/* ── MRR Growth Chart ── */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-sm font-semibold text-white">MRR Growth Trajectory</p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Active subscriptions by signup month · bars = new MRR added · line = cumulative
              </p>
            </div>
          </div>
          {isLoading ? (
            <div className="h-52 flex items-center justify-center text-xs text-slate-600">Loading…</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <ComposedChart data={data?.monthlyChart || []} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#64748b" }} />
                <YAxis
                  yAxisId="left"
                  tick={{ fontSize: 10, fill: "#64748b" }}
                  tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fontSize: 10, fill: "#64748b" }}
                  tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`}
                />
                <Tooltip
                  contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8, fontSize: 11 }}
                  formatter={chartTooltipFormatter}
                />
                <Legend wrapperStyle={{ fontSize: 11, color: "#64748b" }} />
                <Bar yAxisId="left" dataKey="newMrr" name="New MRR" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                <Line yAxisId="right" type="monotone" dataKey="totalMrr" name="Total MRR" stroke="#10b981" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* ── Plan breakdown ── */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-800">
            <p className="text-sm font-semibold text-white">Revenue by Plan</p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase font-bold text-slate-500 border-b border-slate-800">
                {["Plan", "Hospitals", "Monthly Revenue", "Annual Revenue", "% of MRR"].map((h) => (
                  <th key={h} className="px-5 py-2.5 text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={5} className="px-5 py-6 text-center text-xs text-slate-600">Loading…</td></tr>
              ) : (data?.byPlan || []).length === 0 ? (
                <tr><td colSpan={5} className="px-5 py-6 text-center text-xs text-slate-600">No paid subscriptions yet</td></tr>
              ) : (data?.byPlan || []).map((r) => (
                <tr key={r.name} className="border-t border-slate-800/60">
                  <td className="px-5 py-3 text-xs font-medium text-white">{r.name}</td>
                  <td className="px-5 py-3 text-xs text-slate-400 font-mono">{r.count}</td>
                  <td className="px-5 py-3 text-xs text-emerald-400 font-mono">{fmtINR(r.revenue)}</td>
                  <td className="px-5 py-3 text-xs text-emerald-300 font-mono">{fmtINR(r.revenue * 12)}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 bg-slate-700 rounded-full w-20 overflow-hidden">
                        <div className="h-full bg-blue-500 rounded-full" style={{ width: `${r.pct}%` }} />
                      </div>
                      <span className="text-xs text-slate-400 font-mono w-8">{r.pct}%</span>
                    </div>
                  </td>
                </tr>
              ))}
              {data && (
                <tr className="border-t border-slate-700 bg-slate-800/30">
                  <td className="px-5 py-3 text-xs font-bold text-white">Total</td>
                  <td className="px-5 py-3 text-xs font-mono text-white">{data.byPlan.reduce((s, r) => s + r.count, 0)}</td>
                  <td className="px-5 py-3 text-xs font-bold text-emerald-400 font-mono">{fmtINR(data.mrr)}</td>
                  <td className="px-5 py-3 text-xs font-bold text-emerald-300 font-mono">{fmtINR(data.arr)}</td>
                  <td className="px-5 py-3 text-xs text-slate-500">100%</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* ── Upcoming renewals ── */}
        {(data?.upcoming.length ?? 0) > 0 && (
          <div className="bg-slate-900 border border-amber-800/40 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-800 bg-amber-500/5 flex items-center justify-between">
              <p className="text-sm font-semibold text-amber-300">Upcoming Renewals — next 14 days</p>
              <p className="text-xs text-amber-500 font-mono">
                {fmtINR((data?.upcoming || []).reduce((s, r) => s + r.amount, 0))} renewing
              </p>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] uppercase font-bold text-slate-500 border-b border-slate-800">
                  {["Hospital", "Plan", "Renewal Date", "Amount"].map((h) => (
                    <th key={h} className="px-5 py-2.5 text-left">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(data?.upcoming || []).map((r, i) => (
                  <tr key={i} className="border-t border-slate-800/60">
                    <td className="px-5 py-3 text-xs text-white">{r.hospital}</td>
                    <td className="px-5 py-3 text-xs text-slate-400">{r.plan}</td>
                    <td className="px-5 py-3 text-xs text-amber-400">
                      {r.ends ? format(new Date(r.ends), "dd MMM yyyy") : "—"}
                    </td>
                    <td className="px-5 py-3 text-xs text-emerald-400 font-mono">{fmtINR(r.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Past due ── */}
        {(data?.pastDue.length ?? 0) > 0 && (
          <div className="bg-slate-900 border border-red-800/40 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-800 bg-red-500/5 flex items-center justify-between">
              <p className="text-sm font-semibold text-red-400">Past Due / Suspended</p>
              <p className="text-xs text-red-500 font-mono">
                {fmtINR((data?.pastDue || []).reduce((s, r) => s + r.amount, 0))} at risk
              </p>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] uppercase font-bold text-slate-500 border-b border-slate-800">
                  {["Hospital", "Plan", "Period End", "Monthly Value"].map((h) => (
                    <th key={h} className="px-5 py-2.5 text-left">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(data?.pastDue || []).map((r, i) => (
                  <tr key={i} className="border-t border-slate-800/60">
                    <td className="px-5 py-3 text-xs text-red-300 font-medium">{r.hospital}</td>
                    <td className="px-5 py-3 text-xs text-slate-400">{r.plan}</td>
                    <td className="px-5 py-3 text-xs text-slate-500">
                      {r.since && r.since !== "—" ? format(new Date(r.since), "dd MMM yyyy") : "—"}
                    </td>
                    <td className="px-5 py-3 text-xs text-red-400 font-mono">{fmtINR(r.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      </div>
    </div>
  );
}
