import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useHospitalId } from "@/hooks/useHospitalId";
import { Building2, ClipboardList, Send, BarChart3, CalendarClock, Settings2, Layers, ShieldCheck, MessageSquare, Bot, SlidersHorizontal, TrendingUp, Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import ActiveAdmissions from "@/components/insurance/ActiveAdmissions";
import PreAuthQueue from "@/components/insurance/PreAuthQueue";
import ClaimsToSubmit from "@/components/insurance/ClaimsToSubmit";
import ClaimsStatus from "@/components/insurance/ClaimsStatus";
import TPAAgeing from "@/components/insurance/TPAAgeing";
import TPAConfiguration from "@/components/insurance/TPAConfiguration";
import UnifiedAgeingView from "@/components/insurance/UnifiedAgeingView";
import CGHSECHSTab from "@/components/insurance/CGHSECHSTab";
import ESISchemeTab from "@/components/insurance/ESISchemeTab";
import TPAQueriesTab from "@/components/insurance/TPAQueriesTab";
import AutomationStatusPipeline from "@/components/insurance/AutomationStatusPipeline";
import InsuranceAutomationSettings from "@/components/insurance/InsuranceAutomationSettings";
import EnhancementQueue from "@/components/insurance/EnhancementQueue";
import IntimationsTab from "@/components/insurance/IntimationsTab";

const ENHANCEMENT_ROLES = ["insurance_executive", "super_admin", "hospital_admin"];

const navItems = [
  { key: "admissions", label: "Active Admissions", icon: Building2, roles: null },
  { key: "intimations", label: "Intimations", icon: Bell, roles: null },
  { key: "preauth", label: "Pre-Auth Queue", icon: ClipboardList, roles: null },
  { key: "submit", label: "Claims to Submit", icon: Send, roles: null },
  { key: "status", label: "Claims Status", icon: BarChart3, roles: null },
  { key: "ageing", label: "TPA Ageing", icon: CalendarClock, roles: null },
  { key: "unified", label: "Unified View", icon: Layers, roles: null },
  { key: "cghs_echs", label: "CGHS / ECHS", icon: ShieldCheck, roles: null },
  { key: "esi", label: "ESI Scheme", icon: ShieldCheck, roles: null },
  { key: "queries", label: "TPA Queries", icon: MessageSquare, roles: null },
  { key: "config", label: "TPA Configuration", icon: Settings2, roles: null },
  { key: "automation", label: "Automation", icon: Bot, roles: null },
  { key: "auto_settings", label: "Auto Settings", icon: SlidersHorizontal, roles: null },
  // Enhancement Queue: visible only to insurance_executive and admins
  { key: "enhancement_queue", label: "Enhancement Queue", icon: TrendingUp, roles: ENHANCEMENT_ROLES },
];

interface AdmissionContext {
  admission_id: string;
  patient_id: string;
  patient_name: string;
  insurance_type: string;
}

const InsurancePage: React.FC = () => {
  const [activeNav, setActiveNav] = useState("admissions");
  const [kpis, setKpis] = useState({ pendingPreAuth: 0, outstandingClaims: 0, deniedThisMonth: 0, automationPct: 0 });
  const [pendingEnhancements, setPendingEnhancements] = useState(0);
  const [failedIntimations, setFailedIntimations] = useState(0);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [pendingAdmission, setPendingAdmission] = useState<AdmissionContext | null>(null);
  const { toast } = useToast();
  const { hospitalId } = useHospitalId();

  useEffect(() => {
    loadKPIs();
    // Fetch user role for tab visibility gating
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      (supabase as any)
        .from("users")
        .select("role")
        .eq("auth_user_id", user.id)
        .maybeSingle()
        .then(({ data }: { data: any }) => { if (data?.role) setUserRole(data.role); });
    });
  }, [hospitalId]);

  const loadKPIs = async () => {
    if (!hospitalId) return;
    try {
      const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

      // Get admission IDs where the physical bed is still occupied — used to
      // exclude pre-auths for stale/discharged admissions from the pending count.
      const { data: occupiedAdms } = await (supabase as any)
        .from("admissions")
        .select("id, beds!inner(status)")
        .eq("hospital_id", hospitalId)
        .eq("status", "active")
        .neq("insurance_type", "self_pay");
      const occupiedAdmIds: string[] = (occupiedAdms || [])
        .filter((a: any) => a.beds?.status === "occupied")
        .map((a: any) => a.id as string);

      // Count pending pre-auths only for occupied admissions OR pre-admission pre-auths (admission_id null)
      let pendingPreAuth = 0;
      if (occupiedAdmIds.length > 0) {
        const { count } = await (supabase as any).from("insurance_pre_auth")
          .select("id", { count: "exact", head: true })
          .eq("hospital_id", hospitalId)
          .in("status", ["pending", "submitted", "under_review"])
          .or(`admission_id.is.null,admission_id.in.(${occupiedAdmIds.join(",")})`);
        pendingPreAuth = count || 0;
      } else {
        const { count } = await (supabase as any).from("insurance_pre_auth")
          .select("id", { count: "exact", head: true })
          .eq("hospital_id", hospitalId)
          .in("status", ["pending", "submitted", "under_review"])
          .is("admission_id", null);
        pendingPreAuth = count || 0;
      }

      const [claimsRes, deniedRes, autoLogRes, totalAdmRes] = await Promise.all([
        supabase.from("insurance_claims").select("claimed_amount")
          .eq("hospital_id", hospitalId)
          .in("status", ["submitted", "under_review", "approved"]),
        supabase.from("insurance_claims").select("id", { count: "exact", head: true })
          .eq("hospital_id", hospitalId)
          .eq("status", "rejected")
          .gte("created_at", monthStart),
        (supabase as any).from("insurance_automation_log").select("admission_id", { count: "exact", head: true })
          .eq("hospital_id", hospitalId)
          .eq("event_type", "intimation_auto_sent")
          .gte("created_at", monthStart),
        supabase.from("admissions").select("id", { count: "exact", head: true })
          .eq("hospital_id", hospitalId)
          .neq("insurance_type", "self_pay")
          .gte("admitted_at", monthStart),
      ]);

      const outstanding = (claimsRes.data || []).reduce((s, c) => s + Number(c.claimed_amount || 0), 0);
      const autoHandled = autoLogRes?.count || 0;
      const totalIns = totalAdmRes?.count || 0;
      const automationPct = totalIns > 0 ? Math.round((autoHandled / totalIns) * 100) : 0;
      setKpis({
        pendingPreAuth,
        outstandingClaims: outstanding,
        deniedThisMonth: deniedRes.count || 0,
        automationPct,
      });

      // Enhancement queue badge (insurance_executive facing)
      const { count: enhCount } = await (supabase as any)
        .from("insurance_enhancement_requests")
        .select("id", { count: "exact", head: true })
        .eq("hospital_id", hospitalId)
        .eq("status", "pending");
      setPendingEnhancements(enhCount || 0);

      // Intimations failure badge
      const { count: intimFailCount } = await (supabase as any)
        .from("insurance_intimations")
        .select("id", { count: "exact", head: true })
        .eq("hospital_id", hospitalId)
        .in("status", ["failed", "pending"]);
      setFailedIntimations(intimFailCount || 0);
    } catch { /* ignore */ }
  };

  const handleNavigate = (nav: string, admissionData?: AdmissionContext) => {
    if (nav === "preauth" && admissionData) {
      setPendingAdmission(admissionData);
    } else {
      setPendingAdmission(null);
    }
    setActiveNav(nav);
  };

  const renderContent = () => {
    switch (activeNav) {
      case "admissions": return <ActiveAdmissions onNavigate={handleNavigate} />;
      case "intimations": return <IntimationsTab />;
      case "preauth": return <PreAuthQueue initialAdmission={pendingAdmission} onAdmissionHandled={() => setPendingAdmission(null)} />;
      case "submit": return <ClaimsToSubmit />;
      case "status": return <ClaimsStatus />;
      case "ageing": return <TPAAgeing />;
      case "unified": return <UnifiedAgeingView />;
      case "cghs_echs": return <CGHSECHSTab />;
      case "esi": return <ESISchemeTab />;
      case "queries": return <TPAQueriesTab />;
      case "config": return <TPAConfiguration />;
      case "automation": return <AutomationStatusPipeline />;
      case "auto_settings": return <InsuranceAutomationSettings />;
      case "enhancement_queue": return <EnhancementQueue />;
      default: return null;
    }
  };

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 56px)" }}>
      <div className="h-[52px] flex-shrink-0 bg-background border-b border-border px-5 flex items-center justify-between">
        <div>
          <h1 className="text-base font-bold text-foreground">Insurance & TPA</h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 font-medium">
            Pre-Auth: {kpis.pendingPreAuth} pending
          </span>
          <span className="text-xs px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 font-medium">
            Claims: ₹{(kpis.outstandingClaims / 100000).toFixed(1)}L outstanding
          </span>
          <span className="text-xs px-2.5 py-1 rounded-full bg-red-50 text-red-700 font-medium">
            Denied: {kpis.deniedThisMonth} this month
          </span>
          <span className="text-xs px-2.5 py-1 rounded-full bg-violet-50 text-violet-700 font-medium flex items-center gap-1">
            <Bot size={11} /> Auto: {kpis.automationPct}%
          </span>
          {pendingEnhancements > 0 && userRole && ENHANCEMENT_ROLES.includes(userRole) && (
            <button
              onClick={() => setActiveNav("enhancement_queue")}
              className="text-xs px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 font-semibold border border-amber-200 hover:bg-amber-200 transition-colors"
            >
              {pendingEnhancements} enhancement{pendingEnhancements > 1 ? "s" : ""} pending
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <nav className="w-[240px] bg-background border-r border-border flex-shrink-0 flex flex-col py-2">
          {navItems
            .filter((item) =>
              item.roles === null ||
              (userRole !== null && item.roles.includes(userRole))
            )
            .map((item) => {
              const Icon = item.icon;
              const isActive = activeNav === item.key;
              const badge =
                item.key === "enhancement_queue" && pendingEnhancements > 0 ? pendingEnhancements :
                item.key === "intimations" && failedIntimations > 0 ? failedIntimations :
                null;
              return (
                <button
                  key={item.key}
                  onClick={() => handleNavigate(item.key)}
                  className={cn(
                    "flex items-center gap-3 h-12 px-4 text-[13px] font-medium transition-colors text-left w-full",
                    isActive
                      ? "bg-primary/5 text-primary border-l-[3px] border-primary"
                      : "text-muted-foreground hover:bg-muted/50 border-l-[3px] border-transparent"
                  )}
                >
                  <Icon size={18} className="shrink-0" />
                  <span className="flex-1">{item.label}</span>
                  {badge !== null && (
                    <span className={cn(
                      "text-[10px] font-bold rounded-full px-1.5 py-0.5 leading-none",
                      item.key === "intimations"
                        ? "bg-red-100 text-red-700"
                        : "bg-amber-100 text-amber-700"
                    )}>
                      {badge}
                    </span>
                  )}
                </button>
              );
            })}
        </nav>

        <div className="flex-1 overflow-hidden bg-muted/30">
          {renderContent()}
        </div>
      </div>
    </div>
  );
};

export default InsurancePage;
