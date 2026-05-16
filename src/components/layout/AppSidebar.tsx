import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Home, LayoutGrid, UserPlus, Stethoscope, BedDouble,
  FlaskConical, Pill, Receipt, BarChart3, Inbox, Settings,
  LogOut, HeartPulse, Activity, FolderOpen, X, CalendarDays, Package, Building2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSidebar } from "./SidebarContext";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useHospitalId } from "@/hooks/useHospitalId";
import { hasAccess } from "@/lib/routeRoles";

interface SidebarItem {
  label: string;
  path: string;
  icon: React.ElementType;
}

const topItems: SidebarItem[] = [
  { label: "Dashboard", path: "/dashboard", icon: Home },
  { label: "All Modules", path: "/modules", icon: LayoutGrid },
  { label: "Patients", path: "/patients", icon: UserPlus },
];

const quickAccessItems: SidebarItem[] = [
  { label: "Scheduling", path: "/schedule", icon: CalendarDays },
  { label: "OPD Queue", path: "/opd", icon: Stethoscope },
  { label: "IPD / Wards", path: "/ipd", icon: BedDouble },
  { label: "Billing", path: "/billing", icon: Receipt },
  { label: "Asset Management", path: "/assets", icon: Package },
  { label: "CEO Board", path: "/ceo-board", icon: Building2 },
  { label: "Govt Schemes", path: "/pmjay", icon: HeartPulse },
  { label: "Lab", path: "/lab", icon: FlaskConical },
  { label: "Analytics", path: "/analytics", icon: BarChart3 },
];

const recordsItems: SidebarItem[] = [
  { label: "Medical Records", path: "/mrd", icon: FolderOpen },
];

const bottomItems: SidebarItem[] = [
  { label: "Inbox", path: "/inbox", icon: Inbox },
  { label: "Settings", path: "/settings", icon: Settings },
];

interface AppSidebarProps {
  isMobileOverlay?: boolean;
  onClose?: () => void;
}

const AppSidebar: React.FC<AppSidebarProps> = ({ isMobileOverlay, onClose }) => {
  const { collapsed } = useSidebar();
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { hospitalId, role, permissions, loading } = useHospitalId();
  const [userName, setUserName] = useState("User");
  const [userInitials, setUserInitials] = useState("U");

  const isCollapsed = isMobileOverlay ? false : collapsed;

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase.from("users").select("full_name, role").eq("auth_user_id", user.id).maybeSingle()
        .then(({ data }) => {
          if (data) {
            setUserName(data.full_name || "User");
            const parts = (data.full_name || "U").split(" ");
            setUserInitials(parts.map((p: string) => p[0]).join("").toUpperCase().slice(0, 2));
          }
        });
    });
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    toast({ title: "Signed out successfully" });
    navigate("/login", { replace: true });
  };

  const handleNav = (path: string) => {
    navigate(path);
    if (onClose) onClose();
  };

  const renderItem = (item: SidebarItem) => {
    const Icon = item.icon;
    const active = location.pathname === item.path;
    const isModules = item.path === "/modules";

    return (
      <button
        key={item.path}
        onClick={() => handleNav(item.path)}
        className={cn(
          "flex items-center gap-3 min-h-[44px] w-full rounded-lg px-3 text-sm font-medium transition-colors text-left",
          active
            ? "bg-sidebar-accent text-white"
            : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-white",
          isModules && !active && "border border-sidebar-foreground/20"
        )}
      >
        <Icon size={18} className="shrink-0" />
        {!isCollapsed && <span>{item.label}</span>}
      </button>
    );
  };

  return (
    <div
      className={cn(
        "flex flex-col bg-sidebar text-sidebar-foreground",
        isMobileOverlay ? "w-full h-full" : "fixed left-0 top-[56px] bottom-0 z-40 transition-[width] duration-200",
        !isMobileOverlay && (isCollapsed ? "w-16" : "w-56")
      )}
    >
      {/* Mobile close button */}
      {isMobileOverlay && (
        <div className="flex items-center justify-between px-3 pt-3 pb-1">
          <span className="text-sm font-bold text-sidebar-foreground">Menu</span>
          <button onClick={onClose} className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-sidebar-accent/50 text-sidebar-foreground">
            <X size={20} />
          </button>
        </div>
      )}

      {/* Top items */}
      <nav className="flex-shrink-0 flex flex-col gap-1 px-2 pt-3">
        {topItems.filter(item => hasAccess(item.path, role, permissions)).map(renderItem)}
      </nav>

      {/* Scrollable middle */}
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-sidebar-border [&::-webkit-scrollbar-thumb]:rounded-full">
        {quickAccessItems.some(item => hasAccess(item.path, role, permissions)) && (
          <>
            <div className="px-4 pt-5 pb-1">
              {!isCollapsed && (
                <span className="text-[10px] font-bold uppercase tracking-wider text-sidebar-foreground/40">
                  Quick Access
                </span>
              )}
            </div>
            <nav className="flex flex-col gap-1 px-2">
              {quickAccessItems.filter(item => hasAccess(item.path, role, permissions)).map(renderItem)}
            </nav>
          </>
        )}

        {recordsItems.some(item => hasAccess(item.path, role, permissions)) && (
          <>
            <div className="px-4 pt-4 pb-1">
              {!isCollapsed && (
                <span className="text-[10px] font-bold uppercase tracking-wider text-sidebar-foreground/40">
                  Records
                </span>
              )}
            </div>
            <nav className="flex flex-col gap-1 px-2">
              {recordsItems.filter(item => hasAccess(item.path, role, permissions)).map(renderItem)}
            </nav>
          </>
        )}
      </div>

      {/* Bottom items */}
      <nav className="flex-shrink-0 flex flex-col gap-1 px-2 py-4 border-t border-sidebar-border">
        {bottomItems.filter(item => hasAccess(item.path, role, permissions)).map(renderItem)}
      </nav>

      {/* User section */}
      <div className="flex-shrink-0 border-t border-sidebar-border px-3 py-3 flex items-center gap-3">
        <Avatar className="h-8 w-8">
          <AvatarFallback className="bg-sidebar-accent text-white text-xs font-semibold">
            {userInitials}
          </AvatarFallback>
        </Avatar>
        {!isCollapsed && (
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-sidebar-foreground truncate">{userName}</p>
            <p className="text-[11px] text-sidebar-foreground/60 truncate">{(role || "").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</p>
          </div>
        )}
        <button
          onClick={handleSignOut}
          className="text-sidebar-foreground/60 hover:text-white transition-colors p-2 min-h-[44px] min-w-[44px] flex items-center justify-center active:scale-95"
          title="Sign out"
        >
          <LogOut size={16} />
        </button>
      </div>
    </div>
  );
};

export default AppSidebar;
