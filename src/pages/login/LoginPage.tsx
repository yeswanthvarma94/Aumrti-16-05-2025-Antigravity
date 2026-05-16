import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Mail, Phone, Eye, EyeOff, ArrowRight, Loader2 } from "lucide-react";
import ForgotPasswordModal from "./ForgotPasswordModal";

const ROLE_ROUTES: Record<string, string> = {
  super_admin: "/dashboard",
  hospital_admin: "/dashboard",
  doctor: "/opd",
  nurse: "/nursing",
  accountant: "/billing",
  billing_executive: "/billing",
  billing_staff: "/billing",
  cfo: "/accounts",
  pharmacist: "/pharmacy",
  lab_tech: "/lab",
  lab_technician: "/lab",
  radiologist: "/radiology",
  hr_manager: "/hr",
  receptionist: "/opd",
};

function getShift() {
  const h = new Date().getHours();
  if (h >= 6 && h < 14) return { emoji: "🌅", label: "Morning Shift" };
  if (h >= 14 && h < 22) return { emoji: "🌆", label: "Evening Shift" };
  return { emoji: "🌙", label: "Night Shift" };
}

function useCurrentTime() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return time;
}

interface HospitalBrand {
  name: string;
  logo_url: string | null;
  primary_color: string | null;
}

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const now = useCurrentTime();
  const shift = useMemo(getShift, [now.getHours()]);

  // Hospital branding
  const [brand, setBrand] = useState<HospitalBrand | null>(null);

  // Form
  const mode = "email";
  const [credential, setCredential] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [failCount, setFailCount] = useState(0);
  const [forgotOpen, setForgotOpen] = useState(false);

  // Redirect if already authenticated
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) navigate("/dashboard", { replace: true });
    });
  }, []);

  // Load hospital branding from subdomain
  useEffect(() => {
    const hostname = window.location.hostname;
    const parts = hostname.split(".");
    // Subdomain detection: e.g. apollo.hms.app → subdomain = "apollo"
    const subdomain = parts.length >= 3 ? parts[0] : null;

    if (subdomain && subdomain !== "www" && subdomain !== "localhost") {
      (supabase
        .from("hospitals")
        .select("name, logo_url, primary_color")
        .eq("subdomain", subdomain as any)
        .eq("is_active", true)
        .maybeSingle() as any)
        .then(({ data }: { data: HospitalBrand | null }) => {
          if (data) setBrand(data);
        });
    }
  }, []);

  const panelColor = brand?.primary_color || "hsl(220, 54%, 23%)";

  const dateStr = now.toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const timeStr = now.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  const handleSignIn = async () => {
    if (!credential || !password) {
      setErrorMsg("Please fill in all fields.");
      return;
    }
    if (failCount >= 5) {
      setErrorMsg("Account locked for 15 minutes. Contact your admin.");
      return;
    }

    setLoading(true);
    setErrorMsg("");

    try {
      const email = mode === "email" ? credential : credential;

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;

      // Fetch user role for routing
      const { data: userRow } = await supabase
        .from("users")
        .select("full_name, role")
        .eq("auth_user_id", data.user.id)
        .maybeSingle();

      const fullName = userRow?.full_name || "there";
      const role = userRow?.role || "receptionist";

      toast({ title: `Welcome back, ${fullName}! 👋` });
      navigate(ROLE_ROUTES[role] || "/dashboard", { replace: true });
    } catch (err: any) {
      const newFails = failCount + 1;
      setFailCount(newFails);
      if (newFails >= 5) {
        setErrorMsg("Account locked for 15 minutes. Contact your admin.");
      } else {
        setErrorMsg("Invalid credentials. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      {/* LEFT PANEL — branding */}
      <div
        className="hidden md:flex md:w-[42%] flex-col justify-between p-14"
        style={{ backgroundColor: panelColor }}
      >
        {/* Top — logo */}
        <div>
          {brand?.logo_url ? (
            <img
              src={brand.logo_url}
              alt={`${brand.name} logo`}
              className="max-h-16 object-contain"
            />
          ) : (
            <div className="flex items-center gap-3">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5">
                <path d="M3 21h18M9 8h1M9 12h1M9 16h1M14 8h1M14 12h1M14 16h1M5 21V5a2 2 0 012-2h10a2 2 0 012 2v16" />
              </svg>
              <span className="text-white text-xl font-bold">Aumrti</span>
            </div>
          )}
        </div>

        {/* Middle — name, clock, shift */}
        <div className="flex-1 flex flex-col justify-center">
          <h1 className="text-[32px] font-bold text-white leading-tight">
            {brand?.name || "Aumrti"}
          </h1>
          <p className="text-[15px] mt-2" style={{ color: "rgba(255,255,255,0.65)" }}>
            {dateStr}
          </p>
          <p
            className="text-2xl font-light mt-1 tabular-nums"
            style={{ color: "rgba(255,255,255,0.85)" }}
          >
            {timeStr}
          </p>

          <div className="w-12 my-8" style={{ borderTop: "1px solid rgba(255,255,255,0.15)" }} />

          <p className="text-[13px]" style={{ color: "rgba(255,255,255,0.6)" }}>
            {shift.emoji} {shift.label}
          </p>
          <p
            className="text-sm mt-4 italic leading-relaxed"
            style={{ color: "rgba(255,255,255,0.5)" }}
          >
            Every login matters.
            <br />
            Every patient counts.
          </p>
        </div>

        {/* Bottom */}
        <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.3)" }}>
          Powered by Aumrti
        </p>
      </div>

      {/* MOBILE TOP STRIP */}
      <div
        className="md:hidden fixed top-0 left-0 right-0 h-40 flex flex-col items-center justify-center z-10"
        style={{ backgroundColor: panelColor }}
      >
        {brand?.logo_url ? (
          <img src={brand.logo_url} alt="logo" className="h-10 object-contain mb-2" />
        ) : (
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" className="mb-2">
            <path d="M3 21h18M9 8h1M9 12h1M9 16h1M14 8h1M14 12h1M14 16h1M5 21V5a2 2 0 012-2h10a2 2 0 012 2v16" />
          </svg>
        )}
        <h2 className="text-white font-bold text-lg">
          {brand?.name || "Aumrti"}
        </h2>
        <p className="text-[13px] mt-0.5" style={{ color: "rgba(255,255,255,0.65)" }}>
          {dateStr}
        </p>
      </div>

      {/* RIGHT PANEL — login form */}
      <div className="flex-1 bg-background flex flex-col justify-center items-center md:pt-0 pt-40">
        <div className="w-full max-w-[400px] px-6 md:px-16">
          <p className="text-[13px] text-muted-foreground">Welcome back</p>
          <h2 className="text-2xl font-bold text-foreground mt-1">Sign in to continue</h2>

          <div className="mt-8 flex flex-col gap-5">
            {/* Email input */}
            <div>
              <label className="text-[13px] font-medium text-foreground">
                Email Address
              </label>
              <div className="relative mt-1.5">
                <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="email"
                  value={credential}
                  onChange={(e) => setCredential(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSignIn()}
                  placeholder="Enter your email"
                  className="w-full h-12 pl-11 pr-4 text-[15px] bg-card border-[1.5px] border-border rounded-lg focus:outline-none focus:border-primary focus:ring-[3px] focus:ring-primary/10 text-foreground placeholder:text-muted-foreground"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="text-[13px] font-medium text-foreground">Password</label>
              <div className="relative mt-1.5">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSignIn()}
                  placeholder="Enter your password"
                  className="w-full h-12 pl-4 pr-11 text-[15px] bg-card border-[1.5px] border-border rounded-lg focus:outline-none focus:border-primary focus:ring-[3px] focus:ring-primary/10 text-foreground placeholder:text-muted-foreground"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Remember + Forgot */}
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="w-4 h-4 rounded border-border text-primary focus:ring-primary/20"
                />
                <span className="text-[13px] text-foreground">Remember me</span>
              </label>
              <button
                onClick={() => setForgotOpen(true)}
                className="text-[13px] text-secondary font-medium hover:underline"
              >
                Forgot password?
              </button>
            </div>

            {/* Error message */}
            {errorMsg && (
              <p className="text-[13px] text-destructive bg-destructive/10 px-3 py-2 rounded-lg">
                {errorMsg}
              </p>
            )}

            {/* Sign in button */}
            <button
              onClick={handleSignIn}
              disabled={loading || !credential || !password || failCount >= 5}
              className="w-full h-12 bg-primary text-primary-foreground rounded-lg text-[15px] font-semibold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-40 disabled:pointer-events-none active:scale-[0.97]"
            >
              {loading ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Signing in...
                </>
              ) : (
                <>
                  Sign In
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </div>

          {/* Bottom link */}
          <div className="mt-8 text-center">
            <p className="text-[13px] text-muted-foreground">
              Don't have an account?{" "}
              <button
                onClick={() => navigate("/register")}
                className="text-primary font-semibold hover:underline"
              >
                Register your hospital →
              </button>
            </p>
          </div>
        </div>
      </div>

      <ForgotPasswordModal open={forgotOpen} onClose={() => setForgotOpen(false)} />
    </div>
  );
};

export default LoginPage;
