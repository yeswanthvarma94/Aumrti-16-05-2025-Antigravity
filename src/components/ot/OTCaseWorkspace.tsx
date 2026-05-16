import React, { useState } from "react";
import { Scissors } from "lucide-react";
import { cn } from "@/lib/utils";
import type { OTSchedule } from "@/pages/ot/OTPage";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import WHOChecklistTab from "./tabs/WHOChecklistTab";
import CaseDetailsTab from "./tabs/CaseDetailsTab";
import OTTeamTab from "./tabs/OTTeamTab";
import PACUTab from "./tabs/PACUTab";
import OTBillingTab from "./tabs/OTBillingTab";
import EndCaseModal from "./EndCaseModal";

interface Props {
  schedule: OTSchedule | null;
  hospitalId: string | null;
  onRefresh: () => void;
}

const BASE_TABS = ["WHO Checklist", "Case Details", "OT Team"] as const;
const PACU_TAB = "PACU" as const;
const BILLING_TAB = "Billing" as const;
type TabName = (typeof BASE_TABS)[number] | typeof PACU_TAB | typeof BILLING_TAB;

const OTCaseWorkspace: React.FC<Props> = ({ schedule, hospitalId, onRefresh }) => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<TabName>("WHO Checklist");
  const [endCaseOpen, setEndCaseOpen] = useState(false);

  const updateStatus = async (newStatus: string, extras: Record<string, any> = {}) => {
    if (!schedule) return;
    const { error } = await supabase
      .from("ot_schedules")
      .update({ status: newStatus, ...extras })
      .eq("id", schedule.id);
    if (error) {
      toast({ title: "Failed to update status", description: error.message, variant: "destructive" });
    } else {
      toast({ title: `Case ${newStatus === "confirmed" ? "confirmed" : newStatus === "in_progress" ? "started" : newStatus}` });
      onRefresh();
    }
  };

  if (!schedule) {
    return (
      <div className="flex-1 bg-muted/20 flex flex-col items-center justify-center gap-3">
        <Scissors size={48} className="text-muted-foreground/40" />
        <p className="text-base text-muted-foreground">Select a case from the schedule</p>
        <p className="text-[13px] text-muted-foreground/60">or book a new OT slot to begin</p>
      </div>
    );
  }

  const statusColors: Record<string, string> = {
    scheduled: "bg-blue-100 text-blue-700",
    confirmed: "bg-emerald-100 text-emerald-700",
    in_progress: "bg-red-100 text-red-700",
    completed: "bg-slate-100 text-slate-600",
    cancelled: "bg-rose-100 text-rose-600 border border-rose-300",
  };

  const categoryColors: Record<string, string> = {
    general: "bg-slate-100 text-slate-700",
    orthopaedic: "bg-blue-100 text-blue-700",
    gynaecology: "bg-pink-100 text-pink-700",
    neurosurgery: "bg-purple-100 text-purple-700",
    cardiothoracic: "bg-red-100 text-red-700",
    emergency: "bg-orange-100 text-orange-700",
  };

  return (
    <div className="flex-1 bg-muted/20 flex flex-col overflow-hidden">
      {/* Case Header */}
      <div className="bg-card border-b border-border px-5 py-3 flex items-center gap-4 flex-shrink-0">
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-bold text-foreground truncate">{schedule.surgery_name}</h2>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
              {schedule.patient?.full_name}
            </span>
            <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-medium capitalize", categoryColors[schedule.surgery_category] || categoryColors.general)}>
              {schedule.surgery_category}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Dr. {schedule.surgeon?.full_name} · {schedule.anaesthesia_type} anaesthesia
          </p>
        </div>

        <div className="text-center flex-shrink-0">
          <p className="text-xs text-muted-foreground">📅 {schedule.scheduled_date}</p>
          <p className="text-[13px] font-bold text-foreground">
            🕐 {schedule.scheduled_start_time.slice(0, 5)} — {schedule.scheduled_end_time.slice(0, 5)}
          </p>
          <p className="text-[11px] text-muted-foreground">{schedule.estimated_duration_minutes} min estimated</p>
        </div>

        <div className="flex flex-col items-end gap-2 flex-shrink-0">
          <span className={cn("text-xs px-3 py-1 rounded-full font-semibold", statusColors[schedule.status] || statusColors.scheduled)}>
            {schedule.status === "in_progress" && <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 mr-1 animate-pulse" />}
            {schedule.status === "in_progress" ? "🔴 LIVE" : schedule.status === "confirmed" ? "Confirmed ✓" : schedule.status === "completed" ? "Completed ✓" : schedule.status.charAt(0).toUpperCase() + schedule.status.slice(1)}
          </span>
          {schedule.status === "scheduled" && (
            <button onClick={() => updateStatus("confirmed")} className="text-[11px] bg-emerald-500 text-white px-3 py-1 rounded-md font-semibold hover:bg-emerald-600 active:scale-95 transition-all">
              Confirm Case
            </button>
          )}
          {schedule.status === "confirmed" && (
            <button onClick={() => updateStatus("in_progress", { actual_start_time: new Date().toISOString() })} className="text-[11px] bg-orange-500 text-white px-3 py-1 rounded-md font-semibold hover:bg-orange-600 active:scale-95 transition-all">
              Start Case ▶
            </button>
          )}
          {schedule.status === "in_progress" && (
            <button onClick={() => setEndCaseOpen(true)} className="text-[11px] bg-destructive text-white px-3 py-1 rounded-md font-semibold hover:bg-destructive/90 active:scale-95 transition-all">
              End Case ■
            </button>
          )}
        </div>
      </div>

      {/* Tab strip */}
      <div className="flex border-b border-border bg-card flex-shrink-0">
        {([...BASE_TABS, ...((schedule.status === "in_progress" || schedule.status === "completed") ? [PACU_TAB] : []), BILLING_TAB] as TabName[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "px-6 py-2.5 text-[13px] font-medium transition-colors relative",
              activeTab === tab
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {tab}
            {tab === PACU_TAB && schedule.status === "in_progress" && (
              <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            )}
            {activeTab === tab && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === "WHO Checklist" && <WHOChecklistTab schedule={schedule} onRefresh={onRefresh} />}
        {activeTab === "Case Details" && <CaseDetailsTab schedule={schedule} onRefresh={onRefresh} />}
        {activeTab === "OT Team" && <OTTeamTab schedule={schedule} />}
        {activeTab === PACU_TAB && (schedule.status === "in_progress" || schedule.status === "completed") && (
          <PACUTab schedule={schedule} />
        )}
        {activeTab === BILLING_TAB && (
          <OTBillingTab schedule={schedule} hospitalId={hospitalId} />
        )}
      </div>

      {endCaseOpen && (
        <EndCaseModal
          schedule={schedule}
          onClose={() => setEndCaseOpen(false)}
          onEnded={() => { setEndCaseOpen(false); onRefresh(); }}
        />
      )}
    </div>
  );
};

export default OTCaseWorkspace;
