import React, { useEffect, useState } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { Menu, Search, Wifi, WifiOff, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSidebar } from "./SidebarContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import NotificationCentre from "./NotificationCentre";
import { useHospitalId } from "@/hooks/useHospitalId";
import { hasAccess } from "@/lib/routeRoles";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AlertTriangle } from "lucide-react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

const routeLabels: Record<string, string> = {
  "/": "Dashboard",
  "/opd": "OPD",
  "/ipd": "IPD",
  "/emergency": "Emergency",
  "/ot": "OT",
  "/nursing": "Nursing",
  "/lab": "Lab",
  "/radiology": "Radiology",
  "/pharmacy": "Pharmacy",
  "/billing": "Billing",
  "/insurance": "Insurance",
  "/payments": "Payments",
  "/hr": "HR",
  "/inventory": "Inventory",
  "/quality": "Quality",
  "/settings": "Settings",
};

const AppHeader: React.FC = () => {
  const { toggle, setMobileOpen } = useSidebar();
  const isMobile = useIsMobile();
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [online, setOnline] = useState(navigator.onLine);
  const { hospitalId: contextHospitalId, role, permissions, fullName } = useHospitalId();
  const showSettings = hasAccess("/settings", role, permissions);
  const [hospitalId, setHospitalId] = useState<string | null>(null);
  const userInitials = fullName
    ? fullName.split(" ").map((p: string) => p[0]).join("").toUpperCase().slice(0, 2)
    : "U";
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("hms_theme") === "dark";
    }
    return false;
  });

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("hms_theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("hms_theme", "light");
    }
  }, [darkMode]);

  useEffect(() => {
    if (contextHospitalId) setHospitalId(contextHospitalId);
  }, [contextHospitalId]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    toast({ title: "Signed out successfully" });
    navigate("/login", { replace: true });
  };

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  const handleMenuClick = () => {
    if (isMobile) {
      setMobileOpen(true);
    } else {
      toggle();
    }
  };

  const currentLabel = routeLabels[location.pathname] || "Page";
  const isHome = location.pathname === "/";

  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-14 bg-card border-b border-border flex items-center px-3 gap-2 sm:px-4 sm:gap-4">
      {/* Left: hamburger + breadcrumb */}
      <div className="flex items-center gap-2 min-w-0">
        <button
          onClick={handleMenuClick}
          className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-md hover:bg-muted transition-colors active:scale-95"
          aria-label="Toggle sidebar"
        >
          <Menu size={20} />
        </button>

        {!isMobile && (
          <Breadcrumb>
            <BreadcrumbList>
              {!isHome && (
                <>
                  <BreadcrumbItem>
                    <BreadcrumbLink asChild><Link to="/dashboard">Dashboard</Link></BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                </>
              )}
              <BreadcrumbItem>
                <BreadcrumbPage>{currentLabel}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        )}

        {isMobile && (
          <span className="text-sm font-semibold text-foreground truncate">{currentLabel}</span>
        )}
      </div>

      {/* Center: search — triggers Cmd+K palette (hidden on mobile) */}
      {!isMobile && (
        <div className="flex-1 flex justify-center max-w-md mx-auto">
          <button
            onClick={() => {
              window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true }));
            }}
            className="flex items-center gap-2 w-full max-w-sm h-9 rounded-md border border-input bg-background px-3 text-sm text-muted-foreground hover:bg-muted transition-colors"
          >
            <Search size={16} />
            <span className="flex-1 text-left">Search modules...</span>
            <kbd className="hidden sm:inline-flex h-5 items-center gap-1 rounded border border-border bg-muted px-1.5 text-[10px] font-medium text-muted-foreground">
              ⌘K
            </kbd>
          </button>
        </div>
      )}

      {/* Spacer on mobile */}
      {isMobile && <div className="flex-1" />}

      {/* Right: status + notifications + user */}
      <div className="flex items-center gap-1 sm:gap-2">
        <button
          onClick={() => setDarkMode((prev) => !prev)}
          className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-md hover:bg-muted transition-colors"
          aria-label="Toggle dark mode"
        >
          {darkMode ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        {!isMobile && (
          <div
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium",
              online
                ? "bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]"
                : "bg-destructive/10 text-destructive"
            )}
          >
            {online ? <Wifi size={12} /> : <WifiOff size={12} />}
            {online ? "Online" : "Offline"}
          </div>
        )}

        {/* Global Report Event trigger */}
        <button
          onClick={() => window.dispatchEvent(new CustomEvent("open-report-event"))}
          title="Report a safety event or complaint"
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 text-xs font-medium transition-colors border border-amber-500/20"
        >
          <AlertTriangle className="h-3.5 w-3.5" />
          {!isMobile && "Report Event"}
        </button>

        <NotificationCentre hospitalId={hospitalId} />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="p-1 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full hover:ring-2 hover:ring-ring/20 transition-shadow">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-primary text-primary-foreground text-xs font-semibold">
                  {userInitials}
                </AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={() => navigate("/settings/profile")}>
              Profile
            </DropdownMenuItem>
            {hasAccess("/settings", role, permissions) && (
              <DropdownMenuItem onClick={() => navigate("/settings")}>
                Hospital Settings
              </DropdownMenuItem>
            )}
            <DropdownMenuItem className="text-destructive" onClick={handleSignOut}>
              Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
};

export default AppHeader;
