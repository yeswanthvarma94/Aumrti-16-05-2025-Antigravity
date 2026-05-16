import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useHospitalId } from "@/hooks/useHospitalId";
import { Calendar, CheckSquare, Palmtree, DollarSign, Users, FileText, ShieldCheck, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import RosterTab from "@/components/hr/RosterTab";
import AttendanceTab from "@/components/hr/AttendanceTab";
import LeaveManagementTab from "@/components/hr/LeaveManagementTab";
import PayrollTab from "@/components/hr/PayrollTab";
import StaffDirectoryTab from "@/components/hr/StaffDirectoryTab";
import CredentialingTab from "@/components/hr/CredentialingTab";
import StaffInjuriesTab from "@/components/hr/StaffInjuriesTab";
import { Button } from "@/components/ui/button";

const navTabs = [
  { id: "roster", label: "Roster", icon: Calendar },
  { id: "attendance", label: "Attendance", icon: CheckSquare },
  { id: "leave", label: "Leave Management", icon: Palmtree },
  { id: "payroll", label: "Payroll", icon: DollarSign },
  { id: "directory", label: "Staff Directory", icon: Users },
  { id: "credentials", label: "Credentials", icon: ShieldCheck },
  { id: "injuries", label: "Injury Register", icon: AlertTriangle },
  { id: "reports", label: "Reports", icon: FileText },
];

const HRPage: React.FC = () => {
  const navigate = useNavigate();
  const { hospitalId } = useHospitalId();
  const [activeTab, setActiveTab] = useState("roster");
  const [kpis, setKpis] = useState({ total: 0, present: 0, onLeave: 0, licenseAlerts: 0 });

  useEffect(() => {
    const loadKpis = async () => {
      if (!hospitalId) return;
      const { data: userData } = await supabase.from("users").select("id").eq("is_active", true).eq("hospital_id", hospitalId);
      const total = userData?.length || 0;

      const today = new Date().toISOString().split("T")[0];
      const { data: attendance } = await supabase
        .from("staff_attendance")
        .select("status")
        .eq("attendance_date", today)
        .eq("hospital_id", hospitalId);

      const present = attendance?.filter((a) => a.status === "present" || a.status === "late").length || 0;
      const onLeave = attendance?.filter((a) => a.status === "on_leave").length || 0;

      const { count: licenseAlerts } = await (supabase as any)
        .from("staff_profiles")
        .select("id", { count: "exact", head: true })
        .eq("hospital_id", hospitalId)
        .not("license_expiry_date", "is", null)
        .lte("license_expiry_date", new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]);

      setKpis({ total, present, onLeave, licenseAlerts: licenseAlerts || 0 });
    };
    loadKpis();
  }, [activeTab, hospitalId]);

  const renderContent = () => {
    switch (activeTab) {
      case "roster": return <RosterTab />;
      case "attendance": return <AttendanceTab />;
      case "leave": return <LeaveManagementTab />;
      case "payroll": return <PayrollTab />;
      case "directory": return <StaffDirectoryTab />;
      case "credentials": return hospitalId ? <CredentialingTab hospitalId={hospitalId} /> : null;
      case "injuries": return <StaffInjuriesTab />;
      default:
        return (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <FileText className="h-12 w-12 mx-auto mb-3 opacity-40" />
              <p className="text-sm font-medium">Coming Soon</p>
              <p className="text-xs mt-1">This section is under development</p>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 56px)" }}>
      {/* Header */}
      <div className="h-[52px] flex-shrink-0 bg-card border-b border-border flex items-center justify-between px-5">
        <span className="text-base font-bold text-foreground">HR & Staff</span>
        <div className="flex items-center gap-3">
          <span className="text-xs px-3 py-1 rounded-full bg-primary/10 text-primary font-medium">
            👥 {kpis.total} Staff
          </span>
          <span className="text-xs px-3 py-1 rounded-full bg-success/10 text-success font-medium">
            ✓ {kpis.present} Present Today
          </span>
          <span className="text-xs px-3 py-1 rounded-full bg-accent/10 text-accent-foreground font-medium">
            🏖️ {kpis.onLeave} On Leave
          </span>
          {kpis.licenseAlerts > 0 && (
            <span className="text-xs px-3 py-1 rounded-full bg-destructive/10 text-destructive font-medium">
              ⚠️ {kpis.licenseAlerts} License Alerts
            </span>
          )}
        </div>
        <Button size="sm" variant="outline" onClick={() => navigate("/settings/staff")}>
          + Add Staff
        </Button>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Nav */}
        <div className="w-[220px] bg-card border-r border-border flex flex-col">
          {navTabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "h-11 flex items-center gap-3 px-4 text-sm transition-colors text-left",
                  activeTab === tab.id
                    ? "bg-primary/10 text-primary font-semibold border-r-2 border-primary"
                    : "text-muted-foreground hover:bg-muted/50"
                )}
              >
                <Icon className="h-4 w-4 flex-shrink-0" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {renderContent()}
        </div>
      </div>
    </div>
  );
};

export default HRPage;
