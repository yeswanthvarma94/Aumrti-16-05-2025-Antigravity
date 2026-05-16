import React, { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { UserPlus, Building2, FileBarChart, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface Alert {
  id: string;
  alert_type: string;
  alert_message: string;
  severity: string;
  created_at: string;
  is_acknowledged: boolean;
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr${hrs > 1 ? "s" : ""} ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function severityDotColor(s: string) {
  if (s === "critical") return "bg-destructive";
  if (s === "high") return "bg-[hsl(24,95%,53%)]";
  if (s === "medium") return "bg-[hsl(38,92%,50%)]";
  return "bg-[hsl(var(--success))]";
}

const AlertsPanel: React.FC<{ kpis?: any }> = ({ kpis }) => {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [digestOpen, setDigestOpen] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  const fetchAlerts = useCallback(async () => {
    const { data } = await supabase
      .from("clinical_alerts")
      .select("id, alert_type, alert_message, severity, created_at, is_acknowledged")
      .eq("is_acknowledged", false)
      .order("created_at", { ascending: false })
      .limit(10);
    setAlerts(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAlerts(); }, [fetchAlerts]);

  const acknowledge = async (id: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("clinical_alerts").update({
      is_acknowledged: true,
      acknowledged_by: user?.id,
      acknowledged_at: new Date().toISOString(),
    }).eq("id", id);

    if (error) {
      console.error("Acknowledge failed:", error);
      toast({ title: "Failed to acknowledge alert", description: error.message, variant: "destructive" });
      return;
    }
    setAlerts((prev) => prev.filter((a) => a.id !== id));
    toast({ title: "Alert acknowledged" });
  };

  const digestText = `🏥 Daily Digest\n📅 ${new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}\n👥 Patients: ${kpis?.totalPatients || 0}\n🛏️ Beds: ${kpis?.bedsOccupied || 0}/${kpis?.bedsTotal || 0} (${kpis?.bedsTotal ? Math.round((kpis.bedsOccupied / kpis.bedsTotal) * 100) : 0}%)\n🏃 OPD Today: ${kpis?.opdActive || 0}\n💰 Revenue: ₹${(kpis?.revenueMTD || 0).toLocaleString("en-IN")}\n🚨 Alerts: ${kpis?.criticalAlerts || 0}`;

  const copyDigest = () => {
    navigator.clipboard.writeText(digestText);
    toast({ title: "Copied! Paste into WhatsApp" });
    setDigestOpen(false);
  };

  if (loading) return <div className="h-full animate-pulse bg-muted rounded-xl" />;

  return (
    <>
      <div className="flex flex-col h-full bg-card rounded-xl border border-border overflow-hidden">
        {/* Top 60% - Alerts */}
        <div className="flex flex-col" style={{ flex: "3 1 0" }}>
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/50 shrink-0">
            <span className="text-[13px] font-bold text-foreground">🔔 Active Alerts</span>
            {alerts.length > 0 && (
              <span className="bg-destructive/10 text-destructive text-[11px] font-bold px-2 py-0.5 rounded-full">
                {alerts.length}
              </span>
            )}
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto">
            {alerts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-1 py-6">
                <span className="text-lg">✅</span>
                <span className="text-[13px] font-bold text-[hsl(var(--success))]">All clear</span>
                <span className="text-xs text-muted-foreground">No active alerts</span>
              </div>
            ) : (
              alerts.map((a) => (
                <div key={a.id} className="group px-3.5 py-2.5 border-b border-border/30 hover:bg-muted/40 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={cn("h-2 w-2 rounded-full shrink-0", severityDotColor(a.severity), a.severity === "critical" && "animate-pulse")} />
                      <span className="text-xs font-bold text-foreground">{a.alert_type.replace(/_/g, " ")}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-muted-foreground">{timeAgo(a.created_at)}</span>
                      <button
                        onClick={() => acknowledge(a.id)}
                        className="hidden group-hover:inline-flex items-center text-[10px] font-medium bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] px-2 py-0.5 rounded-full hover:bg-[hsl(var(--success))]/20 transition-colors"
                      >
                        ✓ Acknowledge
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-relaxed">{a.alert_message}</p>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Bottom 40% - Quick Actions */}
        <div className="flex flex-col border-t border-border/50" style={{ flex: "2 1 0" }}>
          <div className="px-3.5 py-2 shrink-0">
            <span className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider">Quick Actions</span>
          </div>
          <div className="grid grid-cols-2 gap-2 px-3.5 pb-3 flex-1 min-h-0">
            <button
              onClick={() => toast({ title: "Patient registration coming in Phase 3" })}
              className="flex items-center gap-2 bg-primary/5 text-primary rounded-lg px-3 py-2 text-xs font-medium hover:bg-primary/10 transition-colors active:scale-[0.97]"
            >
              <UserPlus size={14} /> New Patient
            </button>
            <button
              onClick={() => toast({ title: "IPD admission coming in Phase 3" })}
              className="flex items-center gap-2 bg-[hsl(var(--success))]/5 text-[hsl(152,68%,28%)] rounded-lg px-3 py-2 text-xs font-medium hover:bg-[hsl(var(--success))]/10 transition-colors active:scale-[0.97]"
            >
              <Building2 size={14} /> New Admission
            </button>
            <button
              onClick={() => {
                const { printDocument } = require("@/lib/printUtils");
                const rows = alerts.map(a => `<tr><td>${timeAgo(a.created_at)}</td><td>${a.alert_message}</td><td><span class="badge">${a.severity}</span></td></tr>`).join("");
                printDocument("Today's Alerts Report", `<h2 style="color:#1A2F5A">Today's Alerts</h2><table><tr><th>Time</th><th>Alert</th><th>Severity</th></tr>${rows}</table>`);
              }}
              className="flex items-center gap-2 bg-[hsl(38,92%,50%)]/5 text-[hsl(26,72%,29%)] rounded-lg px-3 py-2 text-xs font-medium hover:bg-[hsl(38,92%,50%)]/10 transition-colors active:scale-[0.97]"
            >
              <FileBarChart size={14} /> Today's Report
            </button>
            <button
              onClick={() => setDigestOpen(true)}
              className="flex items-center gap-2 bg-[hsl(142,72%,45%)]/5 text-[hsl(152,68%,28%)] rounded-lg px-3 py-2 text-xs font-medium hover:bg-[hsl(142,72%,45%)]/10 transition-colors active:scale-[0.97]"
            >
              <MessageCircle size={14} /> WhatsApp Digest
            </button>
          </div>
        </div>
      </div>

      {/* WhatsApp Digest Modal */}
      <Dialog open={digestOpen} onOpenChange={setDigestOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>WhatsApp Digest</DialogTitle>
          </DialogHeader>
          <pre className="text-sm bg-muted/50 p-4 rounded-lg whitespace-pre-wrap font-sans leading-relaxed">{digestText}</pre>
          <Button onClick={copyDigest} className="w-full">Copy to WhatsApp</Button>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default AlertsPanel;
