/**
 * LeakageDashboard — Real-time revenue leakage across all modules
 *
 * Shows services delivered but not yet billed, grouped by module.
 * Allows manual billing from the dashboard for any unbilled service.
 * Integrates with the daily-leakage-scan edge function.
 */

import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useHospitalId } from "@/hooks/useHospitalId";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  TrendingDown, RefreshCw, AlertTriangle, CheckCircle2,
  Loader2, Zap, ChevronDown, ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

interface LeakItem {
  id: string;
  patient_id: string | null;
  service_module: string;
  service_name: string;
  service_date: string;
  quantity: number;
  unit_rate: number;
  total_amount: number;
  billing_status: string;
  notes: string | null;
  created_at: string;
}

interface ModuleLeakSummary {
  module: string;
  count: number;
  amount: number;
  oldest: string;
  items: LeakItem[];
}

// Human-readable module labels
const MODULE_LABELS: Record<string, string> = {
  dialysis:       "Dialysis Sessions",
  physiotherapy:  "Physiotherapy",
  home_care:      "Home Care Visits",
  mental_health:  "Mental Health Sessions",
  ayush:          "AYUSH Treatments",
  mortuary:       "Mortuary Services",
  dietetics:      "Dietetics Consultations",
  ambulance:      "Ambulance Trips",
  cssd:           "CSSD Sterilization",
  opd_consult:    "OPD Consultations",
  ed:             "Emergency Dept.",
  oncology:       "Oncology/Chemo",
  other:          "Other Services",
};

const MODULE_COLORS: Record<string, string> = {
  dialysis:      "text-blue-700 bg-blue-50 border-blue-200",
  physiotherapy: "text-violet-700 bg-violet-50 border-violet-200",
  home_care:     "text-teal-700 bg-teal-50 border-teal-200",
  mental_health: "text-purple-700 bg-purple-50 border-purple-200",
  ayush:         "text-amber-700 bg-amber-50 border-amber-200",
  mortuary:      "text-slate-700 bg-slate-50 border-slate-200",
  dietetics:     "text-lime-700 bg-lime-50 border-lime-200",
  ambulance:     "text-orange-700 bg-orange-50 border-orange-200",
  cssd:          "text-cyan-700 bg-cyan-50 border-cyan-200",
  opd_consult:   "text-emerald-700 bg-emerald-50 border-emerald-200",
  ed:            "text-red-700 bg-red-50 border-red-200",
  oncology:      "text-rose-700 bg-rose-50 border-rose-200",
};

const inr = (n: number) =>
  `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const LeakageDashboard: React.FC = () => {
  const { hospitalId } = useHospitalId();
  const { toast }      = useToast();

  const [items, setItems]         = useState<LeakItem[]>([]);
  const [loading, setLoading]     = useState(true);
  const [scanning, setScanning]   = useState(false);
  const [expanded, setExpanded]   = useState<Set<string>>(new Set());
  const [dateFrom, setDateFrom]   = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split("T")[0];
  });
  const [dateTo, setDateTo]       = useState(() => new Date().toISOString().split("T")[0]);

  const fetchLeaks = useCallback(async () => {
    if (!hospitalId) return;
    setLoading(true);

    const { data } = await (supabase as any)
      .from("service_charges")
      .select("*")
      .eq("hospital_id", hospitalId)
      .eq("billing_status", "unbilled")
      .gte("service_date", dateFrom)
      .lte("service_date", dateTo)
      .order("service_date", { ascending: false })
      .limit(500);

    setItems(data ?? []);
    setLoading(false);
  }, [hospitalId, dateFrom, dateTo]);

  useEffect(() => { fetchLeaks(); }, [fetchLeaks]);

  // Group by module
  const grouped: ModuleLeakSummary[] = [];
  const moduleMap: Record<string, ModuleLeakSummary> = {};

  for (const item of items) {
    if (!moduleMap[item.service_module]) {
      moduleMap[item.service_module] = {
        module: item.service_module,
        count: 0,
        amount: 0,
        oldest: item.service_date,
        items: [],
      };
    }
    const g = moduleMap[item.service_module];
    g.count++;
    g.amount += item.total_amount;
    if (item.service_date < g.oldest) g.oldest = item.service_date;
    g.items.push(item);
  }
  Object.values(moduleMap).sort((a, b) => b.amount - a.amount).forEach(g => grouped.push(g));

  const totalUnbilled = items.reduce((s, i) => s + i.total_amount, 0);
  const totalCount    = items.length;

  // Run the daily-leakage-scan edge function
  const runAiScan = async () => {
    if (!hospitalId) return;
    setScanning(true);
    try {
      const { data, error } = await supabase.functions.invoke("daily-leakage-scan", {
        body: { hospital_id: hospitalId },
      });
      if (error) throw error;
      toast({
        title: "Revenue scan complete",
        description: `Found ${data?.leakage_count ?? 0} unbilled items across ${data?.modules_scanned ?? 0} modules`,
      });
      fetchLeaks();
    } catch (err: any) {
      toast({ title: "Scan failed", description: err.message, variant: "destructive" });
    }
    setScanning(false);
  };

  const markWaived = async (itemId: string) => {
    await (supabase as any).from("service_charges")
      .update({ billing_status: "waived" })
      .eq("id", itemId);
    setItems(prev => prev.filter(i => i.id !== itemId));
    toast({ title: "Marked as waived" });
  };

  const toggleExpand = (module: string) => {
    setExpanded(prev => {
      const n = new Set(prev);
      n.has(module) ? n.delete(module) : n.add(module);
      return n;
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="animate-spin text-muted-foreground" size={22} />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-5">
      {/* Header + controls */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <TrendingDown size={18} className="text-red-500" />
          <h2 className="text-[15px] font-bold">Revenue Leakage Dashboard</h2>
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <label className="text-[11px] text-muted-foreground">From</label>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="h-7 text-xs border border-border rounded px-2 bg-background" />
          <label className="text-[11px] text-muted-foreground">To</label>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="h-7 text-xs border border-border rounded px-2 bg-background" />
          <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1" onClick={fetchLeaks}>
            <RefreshCw size={11} /> Refresh
          </Button>
          <Button
            size="sm"
            className="h-7 text-[11px] gap-1 bg-red-600 hover:bg-red-700"
            onClick={runAiScan}
            disabled={scanning}
          >
            {scanning
              ? <><Loader2 size={11} className="animate-spin" /> Scanning...</>
              : <><Zap size={11} /> Run AI Scan</>}
          </Button>
        </div>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-3 gap-3">
        {[
          {
            label: "Unbilled Revenue",
            value: inr(totalUnbilled),
            sub: `${totalCount} services`,
            color: totalUnbilled > 50000 ? "text-red-700 font-bold" : "text-amber-700",
            icon: <AlertTriangle size={16} className="text-red-500" />,
          },
          {
            label: "Modules with leaks",
            value: String(grouped.length),
            sub: grouped.length > 0 ? grouped.map(g => MODULE_LABELS[g.module] || g.module).slice(0, 3).join(", ") : "None",
            color: "text-foreground",
            icon: <TrendingDown size={16} className="text-muted-foreground" />,
          },
          {
            label: "Oldest unbilled",
            value: items.length > 0
              ? formatDistanceToNow(new Date(Math.min(...items.map(i => new Date(i.service_date).getTime()))), { addSuffix: true })
              : "—",
            sub: items.length > 0 ? `${items.reduce((s, i) => i.service_date < s ? i.service_date : s, "9999-99-99")}` : "",
            color: "text-foreground",
            icon: <CheckCircle2 size={16} className="text-muted-foreground" />,
          },
        ].map(k => (
          <div key={k.label} className="border border-border rounded-lg p-3 bg-card flex items-start gap-2">
            <div className="mt-0.5">{k.icon}</div>
            <div>
              <p className="text-[11px] text-muted-foreground">{k.label}</p>
              <p className={cn("text-[20px] mt-0.5", k.color)}>{k.value}</p>
              {k.sub && <p className="text-[10px] text-muted-foreground mt-0.5 truncate max-w-[180px]">{k.sub}</p>}
            </div>
          </div>
        ))}
      </div>

      {/* Empty state */}
      {grouped.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 border border-border rounded-lg bg-emerald-50">
          <CheckCircle2 size={40} className="text-emerald-500 mb-3" />
          <p className="text-[15px] font-bold text-emerald-800">No revenue leakage detected</p>
          <p className="text-[12px] text-emerald-600 mt-1">
            All services in this date range are billed or waived.
          </p>
        </div>
      )}

      {/* Leakage by module */}
      {grouped.map(g => {
        const isExpanded = expanded.has(g.module);
        const colorClass = MODULE_COLORS[g.module] || "text-slate-700 bg-slate-50 border-slate-200";

        return (
          <div key={g.module} className="border border-border rounded-lg overflow-hidden">
            {/* Module header */}
            <button
              onClick={() => toggleExpand(g.module)}
              className="w-full flex items-center gap-3 px-4 py-3 bg-card hover:bg-muted/40 transition-colors text-left"
            >
              {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <Badge variant="outline" className={cn("text-[10px]", colorClass)}>
                {MODULE_LABELS[g.module] || g.module}
              </Badge>
              <div className="flex-1 flex items-center gap-4">
                <span className="text-[13px] font-semibold text-red-700">{inr(g.amount)}</span>
                <span className="text-[11px] text-muted-foreground">{g.count} unbilled service{g.count > 1 ? "s" : ""}</span>
                <span className="text-[10px] text-muted-foreground">
                  Oldest: {g.oldest}
                </span>
              </div>
              <span className="text-[10px] text-red-500 font-medium">REVENUE LEAK</span>
            </button>

            {/* Item rows */}
            {isExpanded && (
              <div className="border-t border-border divide-y divide-border">
                <div className="px-4 py-2 bg-muted/30 grid grid-cols-5 text-[10px] font-bold text-muted-foreground uppercase tracking-wide gap-2">
                  <span>Service Date</span>
                  <span className="col-span-2">Service Name</span>
                  <span className="text-right">Amount</span>
                  <span className="text-right">Actions</span>
                </div>
                {g.items.map(item => (
                  <div key={item.id} className="px-4 py-2.5 grid grid-cols-5 gap-2 items-center text-[12px] hover:bg-muted/20">
                    <span className="text-muted-foreground">{item.service_date}</span>
                    <div className="col-span-2">
                      <p className="font-medium">{item.service_name}</p>
                      {item.notes && (
                        <p className="text-[10px] text-muted-foreground truncate">{item.notes}</p>
                      )}
                    </div>
                    <span className="text-right font-medium text-red-700">
                      {item.unit_rate > 0 ? inr(item.total_amount) : (
                        <span className="text-amber-600">Rate not set</span>
                      )}
                    </span>
                    <div className="flex justify-end gap-1.5">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 text-[10px] text-muted-foreground"
                        onClick={() => markWaived(item.id)}
                      >
                        Waive
                      </Button>
                    </div>
                  </div>
                ))}

                {/* Module subtotal */}
                <div className="px-4 py-2 bg-red-50 flex items-center justify-between">
                  <span className="text-[11px] font-bold text-red-700">
                    Total unbilled — {MODULE_LABELS[g.module] || g.module}
                  </span>
                  <span className="text-[14px] font-bold text-red-700">{inr(g.amount)}</span>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Footer note */}
      {grouped.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-[12px] text-amber-800">
          <p className="font-bold mb-1 flex items-center gap-1.5">
            <AlertTriangle size={13} /> How to eliminate leakage
          </p>
          <ul className="list-disc list-inside space-y-0.5">
            <li>Configure service rates in <strong>Settings → Services</strong> for each module</li>
            <li>Services with "Rate not set" will appear here but cannot be auto-billed until rate is configured</li>
            <li>Click <strong>Run AI Scan</strong> to detect newly delivered but unbilled services across all modules</li>
            <li>Use <strong>Waive</strong> to intentionally mark a service as not chargeable (removes from dashboard)</li>
          </ul>
        </div>
      )}
    </div>
  );
};

export default LeakageDashboard;
