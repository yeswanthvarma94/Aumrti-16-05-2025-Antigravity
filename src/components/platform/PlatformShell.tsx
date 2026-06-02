import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { LayoutDashboard, Building2, CreditCard, Tag, BarChart3, Settings, LogOut, Shield, Radar, Newspaper } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAumrtiAdmin } from "@/hooks/useAumrtiAdmin";
import PlatformGuard from "./PlatformGuard";

const NAV = [
  { to: "/platform",             label: "Overview",   icon: LayoutDashboard, exact: true },
  { to: "/platform/briefing",    label: "Briefing",   icon: Newspaper },
  { to: "/platform/churn-radar", label: "Churn Radar",icon: Radar },
  { to: "/platform/hospitals",   label: "Hospitals",  icon: Building2 },
  { to: "/platform/plans",       label: "Plans",      icon: CreditCard },
  { to: "/platform/discounts",   label: "Discounts",  icon: Tag },
  { to: "/platform/revenue",     label: "Revenue",    icon: BarChart3 },
  { to: "/platform/settings",    label: "Settings",   icon: Settings },
];

export default function PlatformShell() {
  const { admin } = useAumrtiAdmin();
  const navigate = useNavigate();

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate("/login", { replace: true });
  };

  return (
    <PlatformGuard>
      <div className="flex h-screen bg-slate-950 text-slate-100 overflow-hidden">
        {/* ── Sidebar ── */}
        <aside className="w-[200px] flex-shrink-0 flex flex-col bg-slate-900 border-r border-slate-800">
          {/* Logo */}
          <div className="h-14 flex items-center gap-2.5 px-4 border-b border-slate-800">
            <Shield size={18} className="text-blue-400 shrink-0" />
            <span className="text-[14px] font-bold text-white tracking-tight">Aumrti Platform</span>
          </div>

          {/* Nav links */}
          <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
            {NAV.map(({ to, label, icon: Icon, exact }) => (
              <NavLink
                key={to}
                to={to}
                end={exact}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-blue-600 text-white"
                      : "text-slate-400 hover:bg-slate-800 hover:text-slate-100"
                  }`
                }
              >
                <Icon size={14} />
                {label}
              </NavLink>
            ))}
          </nav>

          {/* Admin profile + sign out */}
          <div className="p-3 border-t border-slate-800">
            <div className="flex items-center gap-2 px-2 py-1.5">
              <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center text-[10px] font-bold text-white shrink-0">
                {admin?.full_name?.[0]?.toUpperCase() ?? "A"}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-medium text-white truncate">{admin?.full_name ?? "Admin"}</p>
                <p className="text-[10px] text-slate-500 truncate">{admin?.email}</p>
              </div>
              <button
                onClick={signOut}
                title="Sign out"
                className="text-slate-500 hover:text-red-400 transition-colors shrink-0"
              >
                <LogOut size={13} />
              </button>
            </div>
          </div>
        </aside>

        {/* ── Main content ── */}
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </PlatformGuard>
  );
}
