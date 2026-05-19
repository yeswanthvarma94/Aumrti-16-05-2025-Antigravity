import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { autoPostJournalEntry } from "@/lib/accounting";
import { formatINR } from "@/lib/currency";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Lock, CheckCircle2, AlertTriangle, Clock, ChevronDown } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SystemTotals {
  cash: number;
  upi: number;
  card: number;
  cheque: number;
  net_banking: number;
  insurance: number;
  other: number;
  total: number;
}

interface PaymentRow {
  id: string;
  payment_mode: string;
  amount: number;
  payment_time: string;
  patient_name: string;
  bill_number: string;
  received_by_name: string;
}

interface ClosureRecord {
  closure_date: string;
  status: string;
  system_total: number;
  variance: number;
  closed_at: string | null;
}

const MODES = ["cash", "upi", "card", "cheque", "net_banking", "insurance"] as const;
const MODE_LABELS: Record<string, string> = {
  cash: "Cash", upi: "UPI", card: "Card",
  cheque: "Cheque", net_banking: "Net Banking", insurance: "Insurance / TPA",
};
const EMPTY_TOTALS: SystemTotals = { cash: 0, upi: 0, card: 0, cheque: 0, net_banking: 0, insurance: 0, other: 0, total: 0 };

// ─── Component ────────────────────────────────────────────────────────────────

const DailyCashClosurePage: React.FC = () => {
  const { toast } = useToast();
  const [hospitalId, setHospitalId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  const [closureDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [systemTotals, setSystemTotals] = useState<SystemTotals>(EMPTY_TOTALS);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [locking, setLocking] = useState(false);

  // Existing closure for today (if already closed)
  const [existing, setExisting] = useState<{ status: string; closed_at: string | null } | null>(null);

  // Manual count inputs
  const [manual, setManual] = useState<Record<string, string>>({
    cash: "", upi: "", card: "", cheque: "", net_banking: "", insurance: "",
  });
  const [varianceReason, setVarianceReason] = useState("");

  // Recent history
  const [history, setHistory] = useState<ClosureRecord[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  // ── Init ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase.from("users").select("id, hospital_id").eq("auth_user_id", user.id).maybeSingle()
        .then(({ data }) => {
          if (data?.hospital_id) setHospitalId(data.hospital_id);
          if (data?.id) setUserId(data.id);
        });
    });
  }, []);

  // ── Fetch day's payments and existing closure ─────────────────────────────

  const loadDay = useCallback(async () => {
    if (!hospitalId) return;
    setLoading(true);

    // Fetch all payments for closure_date
    const { data: pData } = await (supabase as any)
      .from("bill_payments")
      .select("id, payment_mode, amount, payment_time, bill_id, received_by, bills!inner(bill_number, patients!inner(full_name))")
      .eq("hospital_id", hospitalId)
      .eq("payment_date", closureDate)
      .order("payment_time", { ascending: false });

    const rows: PaymentRow[] = (pData || []).map((p: any) => ({
      id: p.id,
      payment_mode: p.payment_mode,
      amount: Number(p.amount),
      payment_time: p.payment_time,
      patient_name: p.bills?.patients?.full_name || "—",
      bill_number: p.bills?.bill_number || "—",
      received_by_name: "",
    }));
    setPayments(rows);

    // Aggregate by mode
    const totals = { ...EMPTY_TOTALS };
    for (const r of rows) {
      const m = r.payment_mode;
      if (m === "cash")        totals.cash        += r.amount;
      else if (m === "upi")    totals.upi         += r.amount;
      else if (m === "card")   totals.card        += r.amount;
      else if (m === "cheque") totals.cheque      += r.amount;
      else if (m === "net_banking") totals.net_banking += r.amount;
      else if (m === "insurance" || m === "pmjay" || m === "cghs" || m === "echs")
        totals.insurance += r.amount;
      else totals.other += r.amount;
    }
    totals.total = totals.cash + totals.upi + totals.card + totals.cheque + totals.net_banking + totals.insurance + totals.other;
    setSystemTotals(totals);

    // Check for existing closure record
    const { data: cls } = await (supabase as any)
      .from("daily_cash_closure")
      .select("status, closed_at, manual_cash, manual_upi, manual_card, manual_cheque, manual_net_banking, variance_reason")
      .eq("hospital_id", hospitalId)
      .eq("closure_date", closureDate)
      .maybeSingle();

    if (cls) {
      setExisting({ status: cls.status, closed_at: cls.closed_at });
      if (cls.status !== "open") {
        setManual({
          cash: String(cls.manual_cash ?? ""),
          upi: String(cls.manual_upi ?? ""),
          card: String(cls.manual_card ?? ""),
          cheque: String(cls.manual_cheque ?? ""),
          net_banking: String(cls.manual_net_banking ?? ""),
          insurance: "",
        });
        setVarianceReason(cls.variance_reason || "");
      }
    } else {
      setExisting(null);
    }

    // Load last 7 closure records for history
    const { data: hist } = await (supabase as any)
      .from("daily_cash_closure")
      .select("closure_date, status, system_total, variance, closed_at")
      .eq("hospital_id", hospitalId)
      .order("closure_date", { ascending: false })
      .limit(7);
    setHistory(hist || []);

    setLoading(false);
  }, [hospitalId, closureDate]);

  useEffect(() => { loadDay(); }, [loadDay]);

  // ── Computed values ───────────────────────────────────────────────────────

  const manualTotal = MODES.reduce((s, m) => s + (parseFloat(manual[m]) || 0), 0);
  const variance = manualTotal - systemTotals.total;
  const varianceZero = Math.abs(variance) < 0.005;
  const allManualFilled = MODES.every(m => manual[m] !== "");
  const canLock = allManualFilled && (varianceZero || varianceReason.trim().length > 0);
  const isLocked = existing?.status === "locked";

  // ── Lock Day ──────────────────────────────────────────────────────────────

  const lockDay = async () => {
    if (!hospitalId || !userId || !canLock) return;
    if (!confirm(`Lock ${new Date(closureDate + "T00:00:00").toLocaleDateString("en-IN")}? This cannot be undone without CFO approval.`)) return;

    setLocking(true);
    try {
      const payload = {
        hospital_id:      hospitalId,
        closure_date:     closureDate,
        sys_cash:         systemTotals.cash,
        sys_upi:          systemTotals.upi,
        sys_card:         systemTotals.card,
        sys_cheque:       systemTotals.cheque,
        sys_net_banking:  systemTotals.net_banking,
        sys_insurance:    systemTotals.insurance,
        sys_other:        systemTotals.other,
        system_total:     systemTotals.total,
        manual_cash:      parseFloat(manual.cash) || 0,
        manual_upi:       parseFloat(manual.upi) || 0,
        manual_card:      parseFloat(manual.card) || 0,
        manual_cheque:    parseFloat(manual.cheque) || 0,
        manual_net_banking: parseFloat(manual.net_banking) || 0,
        manual_count:     manualTotal,
        variance:         variance,
        variance_reason:  varianceReason.trim() || null,
        status:           "locked",
        closed_by:        userId,
        closed_at:        new Date().toISOString(),
      };

      const { data: saved, error } = await (supabase as any)
        .from("daily_cash_closure")
        .upsert(payload, { onConflict: "hospital_id,closure_date" })
        .select("id")
        .maybeSingle();

      if (error) throw error;

      // Post journal entry for day-close (best-effort; no rule = no-op)
      if (saved?.id) {
        await autoPostJournalEntry({
          triggerEvent:  "daily_cash_closure",
          sourceModule:  "billing",
          sourceId:      saved.id,
          amount:        systemTotals.total,
          description:   `Daily Cash Closure — ${new Date(closureDate + "T00:00:00").toLocaleDateString("en-IN")}`,
          entryDate:     closureDate,
          hospitalId,
          postedBy:      userId,
        });
      }

      toast({ title: `Day ${new Date(closureDate + "T00:00:00").toLocaleDateString("en-IN")} locked successfully` });
      loadDay();
    } catch (err: any) {
      toast({ title: "Lock failed", description: err.message, variant: "destructive" });
    } finally {
      setLocking(false);
    }
  };

  // ── Helpers ───────────────────────────────────────────────────────────────

  const fmt = (n: number) => formatINR(n);
  const fmtTime = (ts: string) =>
    new Date(ts).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
  const dateLabel = new Date(closureDate + "T00:00:00").toLocaleDateString("en-IN", {
    day: "2-digit", month: "long", year: "numeric",
  });

  // ─────────────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex h-[calc(100vh-56px)] items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading day summary…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-56px)] overflow-hidden bg-muted/20">

      {/* ── Header ── */}
      <div className="h-12 flex-shrink-0 bg-card border-b border-border px-5 flex items-center gap-3">
        <Lock size={16} className={isLocked ? "text-green-600" : "text-amber-600"} />
        <span className="text-[15px] font-bold text-foreground">End of Day Closure — {dateLabel}</span>
        {isLocked && (
          <Badge className="bg-green-100 text-green-700 text-[11px]">
            <CheckCircle2 size={11} className="mr-1" /> Locked
          </Badge>
        )}
        {!isLocked && (
          <Badge className="bg-amber-100 text-amber-700 text-[11px]">
            <Clock size={11} className="mr-1" /> Open
          </Badge>
        )}
        <div className="flex-1" />
        <button
          className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
          onClick={() => setShowHistory(v => !v)}
        >
          Recent Closures <ChevronDown size={12} className={showHistory ? "rotate-180" : ""} />
        </button>
      </div>

      {/* ── History dropdown ── */}
      {showHistory && (
        <div className="flex-shrink-0 bg-card border-b border-border px-5 py-2">
          <div className="flex gap-3 overflow-x-auto">
            {history.length === 0 && <p className="text-[11px] text-muted-foreground">No previous closures.</p>}
            {history.map(h => (
              <div key={h.closure_date} className="flex-shrink-0 border border-border rounded-lg px-3 py-2 text-[11px] min-w-[130px]">
                <p className="font-semibold">
                  {new Date(h.closure_date + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                </p>
                <p className="text-muted-foreground">{fmt(h.system_total)}</p>
                <span className={`font-bold ${h.status === "locked" ? "text-green-600" : "text-amber-600"}`}>
                  {h.status}
                </span>
                {h.variance !== 0 && (
                  <p className="text-destructive">Var: {fmt(h.variance)}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Reconciliation grid ── */}
      <div className="flex-shrink-0 grid grid-cols-2 gap-0 border-b border-border">
        {/* System totals */}
        <div className="bg-card border-r border-border px-5 py-3">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">System Totals (from transactions)</p>
          <div className="space-y-1.5">
            {MODES.map(m => (
              <div key={m} className="flex justify-between items-center text-[12px]">
                <span className="text-muted-foreground w-32">{MODE_LABELS[m]}</span>
                <span className="font-mono font-semibold tabular-nums">{fmt(systemTotals[m as keyof SystemTotals] as number)}</span>
              </div>
            ))}
            {systemTotals.other > 0 && (
              <div className="flex justify-between items-center text-[12px]">
                <span className="text-muted-foreground w-32">Other</span>
                <span className="font-mono font-semibold tabular-nums">{fmt(systemTotals.other)}</span>
              </div>
            )}
          </div>
          <div className="mt-2 pt-2 border-t border-border flex justify-between items-center">
            <span className="text-[12px] font-bold">System Total</span>
            <span className="text-[14px] font-bold tabular-nums">{fmt(systemTotals.total)}</span>
          </div>
        </div>

        {/* Manual counts */}
        <div className="bg-muted/10 px-5 py-3">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Supervisor Physical Count</p>
          <div className="space-y-1">
            {MODES.map(m => (
              <div key={m} className="flex items-center gap-3 text-[12px]">
                <span className="text-muted-foreground w-32">{MODE_LABELS[m]}</span>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="0"
                  value={manual[m]}
                  onChange={e => setManual(prev => ({ ...prev, [m]: e.target.value }))}
                  disabled={isLocked}
                  className="h-7 w-32 text-right text-[12px] font-mono"
                />
              </div>
            ))}
          </div>
          <div className="mt-2 pt-2 border-t border-border flex justify-between items-center">
            <span className="text-[12px] font-bold">Manual Total</span>
            <span className="text-[14px] font-bold tabular-nums">{fmt(manualTotal)}</span>
          </div>
        </div>
      </div>

      {/* ── Variance bar ── */}
      <div className={`flex-shrink-0 px-5 py-2.5 border-b border-border flex items-center gap-4 ${
        varianceZero ? "bg-green-50" : "bg-red-50"
      }`}>
        {varianceZero ? (
          <CheckCircle2 size={16} className="text-green-600 shrink-0" />
        ) : (
          <AlertTriangle size={16} className="text-destructive shrink-0" />
        )}
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-semibold">Variance:</span>
          <span className={`text-[14px] font-bold tabular-nums ${varianceZero ? "text-green-700" : "text-destructive"}`}>
            {variance >= 0 ? "+" : ""}{fmt(variance)}
          </span>
          {varianceZero && <span className="text-[11px] text-green-600">— Balanced</span>}
        </div>
        {!varianceZero && !isLocked && (
          <Textarea
            placeholder="Reason for variance (required to lock)"
            value={varianceReason}
            onChange={e => setVarianceReason(e.target.value)}
            className="h-8 text-[11px] flex-1 min-h-0 py-1 resize-none"
          />
        )}
        {!varianceZero && isLocked && varianceReason && (
          <p className="text-[11px] text-muted-foreground flex-1">{varianceReason}</p>
        )}
        <div className="ml-auto shrink-0">
          {!isLocked ? (
            <Button
              size="sm"
              className="h-8 px-5 text-xs font-bold bg-destructive hover:bg-destructive/90"
              disabled={!canLock || locking}
              onClick={lockDay}
            >
              <Lock size={13} className="mr-1.5" />
              {locking ? "Locking…" : "Lock Day"}
            </Button>
          ) : (
            <div className="flex items-center gap-1.5 text-green-700 text-[12px] font-semibold">
              <CheckCircle2 size={14} />
              Locked {existing?.closed_at ? new Date(existing.closed_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true }) : ""}
            </div>
          )}
        </div>
      </div>

      {/* ── Transaction list ── */}
      <div className="flex-1 overflow-hidden flex flex-col">
        <div className="flex-shrink-0 px-5 py-1.5 bg-muted/50 border-b border-border/50 flex items-center">
          <span className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">
            {payments.length} Transaction{payments.length !== 1 ? "s" : ""} — {dateLabel}
          </span>
        </div>
        <div className="flex-1 overflow-auto">
          <table className="w-full text-[12px]">
            <thead className="sticky top-0 bg-muted/60 z-10">
              <tr>
                <th className="text-left px-5 py-1.5 text-[10px] font-bold uppercase text-muted-foreground">Time</th>
                <th className="text-left px-3 py-1.5 text-[10px] font-bold uppercase text-muted-foreground">Patient</th>
                <th className="text-left px-3 py-1.5 text-[10px] font-bold uppercase text-muted-foreground">Bill #</th>
                <th className="text-left px-3 py-1.5 text-[10px] font-bold uppercase text-muted-foreground">Mode</th>
                <th className="text-right px-5 py-1.5 text-[10px] font-bold uppercase text-muted-foreground">Amount</th>
              </tr>
            </thead>
            <tbody>
              {payments.map(p => (
                <tr key={p.id} className="border-b border-border/30 hover:bg-muted/20">
                  <td className="px-5 py-1.5 text-muted-foreground">{fmtTime(p.payment_time)}</td>
                  <td className="px-3 py-1.5 font-medium">{p.patient_name}</td>
                  <td className="px-3 py-1.5 text-muted-foreground font-mono">{p.bill_number}</td>
                  <td className="px-3 py-1.5">
                    <span className="px-2 py-0.5 rounded bg-muted text-muted-foreground text-[10px] font-semibold uppercase">
                      {p.payment_mode}
                    </span>
                  </td>
                  <td className="px-5 py-1.5 text-right font-semibold tabular-nums">{fmt(p.amount)}</td>
                </tr>
              ))}
              {payments.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-muted-foreground">No payments recorded for {dateLabel}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default DailyCashClosurePage;
