import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { autoPostJournalEntry } from "@/lib/accounting";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Play } from "lucide-react";
import { format } from "date-fns";

interface DepLedgerRow {
  id: string;
  asset_id: string;
  asset_name: string;
  asset_code: string;
  period_year: number;
  period_month: number;
  depreciation_amount: number;
  net_book_value_after: number | null;
  posted_at: string;
}

interface Asset {
  id: string;
  asset_code: string;
  asset_name: string;
  acquisition_cost: number;
  residual_value: number;
  useful_life_years: number;
  depreciation_method: string;
  accumulated_depreciation: number;
}

interface Props {
  hospitalId: string;
  refreshKey: number;
  userId: string | null;
}

const fmt = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

const calcMonthlyDepreciation = (asset: Asset, currentNBV: number): number => {
  if (asset.depreciation_method === "wdv") {
    // WDV: annual rate based on useful life, applied monthly on declining balance
    const annualRate = 1 - Math.pow(asset.residual_value / asset.acquisition_cost, 1 / asset.useful_life_years);
    return Math.max(0, currentNBV * (annualRate / 12));
  }
  // SLM: (cost - residual) / (useful life in months)
  return Math.max(0, (asset.acquisition_cost - asset.residual_value) / (asset.useful_life_years * 12));
};

const DepreciationTab: React.FC<Props> = ({ hospitalId, refreshKey, userId }) => {
  const { toast } = useToast();
  const [ledger, setLedger] = useState<DepLedgerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await (supabase as any)
      .from("depreciation_ledger")
      .select("id, asset_id, period_year, period_month, depreciation_amount, net_book_value_after, posted_at, asset_register(asset_code, asset_name)")
      .eq("hospital_id", hospitalId)
      .order("posted_at", { ascending: false })
      .limit(100);

    const rows: DepLedgerRow[] = (data || []).map((r: any) => ({
      id: r.id,
      asset_id: r.asset_id,
      asset_name: r.asset_register?.asset_name || "Unknown",
      asset_code: r.asset_register?.asset_code || "",
      period_year: r.period_year,
      period_month: r.period_month,
      depreciation_amount: r.depreciation_amount,
      net_book_value_after: r.net_book_value_after,
      posted_at: r.posted_at,
    }));
    setLedger(rows);
    setLoading(false);
  }, [hospitalId]);

  useEffect(() => { load(); }, [load, refreshKey]);

  const runDepreciation = async () => {
    setRunning(true);

    const { data: assets } = await (supabase as any)
      .from("asset_register")
      .select("id, asset_code, asset_name, acquisition_cost, residual_value, useful_life_years, depreciation_method, accumulated_depreciation")
      .eq("hospital_id", hospitalId)
      .eq("is_active", true)
      .is("disposal_date", null);

    if (!assets || assets.length === 0) {
      toast({ title: "No active assets found" });
      setRunning(false);
      return;
    }

    let posted = 0;
    let skipped = 0;

    for (const asset of assets as Asset[]) {
      // Skip if already posted for current month
      const { data: existing } = await (supabase as any)
        .from("depreciation_ledger")
        .select("id")
        .eq("asset_id", asset.id)
        .eq("period_year", currentYear)
        .eq("period_month", currentMonth)
        .maybeSingle();

      if (existing) { skipped++; continue; }

      const currentNBV = asset.acquisition_cost - asset.accumulated_depreciation;
      if (currentNBV <= asset.residual_value) { skipped++; continue; }

      const depAmount = Math.min(calcMonthlyDepreciation(asset, currentNBV), currentNBV - asset.residual_value);
      const nbvAfter = currentNBV - depAmount;

      // Post journal entry
      const je = await autoPostJournalEntry({
        triggerEvent: "asset_depreciation",
        sourceModule: "assets",
        sourceId: asset.id,
        amount: depAmount,
        description: `Monthly depreciation — ${asset.asset_name} (${asset.asset_code}) ${currentYear}-${String(currentMonth).padStart(2, "0")}`,
        hospitalId,
        postedBy: userId || "",
      });

      const { error } = await (supabase as any).from("depreciation_ledger").insert({
        hospital_id: hospitalId,
        asset_id: asset.id,
        period_year: currentYear,
        period_month: currentMonth,
        depreciation_amount: depAmount,
        net_book_value_after: nbvAfter,
        journal_entry_id: je?.id || null,
        posted_by: userId,
      });

      if (!error) {
        await (supabase as any).from("asset_register").update({
          accumulated_depreciation: asset.accumulated_depreciation + depAmount,
        }).eq("id", asset.id);
        posted++;
      }
    }

    toast({ title: `Depreciation run complete: ${posted} posted, ${skipped} skipped` });
    setRunning(false);
    load();
  };

  const monthName = (m: number) => ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][m - 1];

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">Monthly Depreciation Run</p>
          <p className="text-xs text-muted-foreground">Posts depreciation for {monthName(currentMonth)} {currentYear} across all active assets</p>
        </div>
        <Button onClick={runDepreciation} disabled={running} className="gap-2">
          {running ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
          {running ? "Running..." : "Run Monthly Depreciation"}
        </Button>
      </div>

      {ledger.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">No depreciation entries yet. Run the monthly depreciation to get started.</div>
      ) : (
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="text-[10px] font-bold uppercase text-muted-foreground">
                <th className="px-3 py-2 text-left">Asset</th>
                <th className="px-3 py-2 text-center">Period</th>
                <th className="px-3 py-2 text-right">Depreciation</th>
                <th className="px-3 py-2 text-right">NBV After</th>
                <th className="px-3 py-2 text-left">Posted At</th>
              </tr>
            </thead>
            <tbody>
              {ledger.map((r) => (
                <tr key={r.id} className="border-t border-border hover:bg-muted/30">
                  <td className="px-3 py-2">
                    <div className="text-xs font-medium">{r.asset_name}</div>
                    <div className="text-[10px] text-muted-foreground font-mono">{r.asset_code}</div>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <Badge variant="outline" className="text-[10px]">{monthName(r.period_month)} {r.period_year}</Badge>
                  </td>
                  <td className="px-3 py-2 text-right text-xs font-mono text-destructive">{fmt(r.depreciation_amount)}</td>
                  <td className="px-3 py-2 text-right text-xs font-mono font-bold">{r.net_book_value_after != null ? fmt(r.net_book_value_after) : "—"}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{format(new Date(r.posted_at), "dd/MM/yyyy HH:mm")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default DepreciationTab;
