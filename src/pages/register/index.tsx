import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Check } from "lucide-react";
import { RegistrationData, initialData } from "./constants";
import Step1HospitalIdentity from "./Step1HospitalIdentity";
import Step2AdminAccount from "./Step2AdminAccount";
import Step3HospitalDetails from "./Step3HospitalDetails";
import Step4ChoosePlan from "./Step4ChoosePlan";
import Step5Confirm from "./Step5Confirm";

const steps = [
  "Hospital Identity",
  "Admin Account",
  "Hospital Details",
  "Choose Plan",
  "Confirm & Launch",
];

const Register: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [step, setStep] = useState(0);
  const [data, setData] = useState<RegistrationData>(initialData);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) navigate("/dashboard", { replace: true });
      else setChecking(false);
    });
  }, [navigate]);

  const update = (partial: Partial<RegistrationData>) =>
    setData((prev) => ({ ...prev, ...partial }));

  const canProceed = (s: number): boolean => {
    switch (s) {
      case 0:
        return !!(data.hospitalName && data.hospitalType && data.state && data.bedCount && data.phone);
      case 1:
        return !!(
          data.fullName &&
          data.email &&
          /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email) &&
          data.designation &&
          data.password.length >= 8 &&
          data.password === data.confirmPassword
        );
      case 2:
        return !!(data.address1 && data.pincode?.length === 6 && data.city);
      case 3:
        return !!data.plan;
      case 4:
        return data.termsAccepted;
      default:
        return false;
    }
  };

  const nextLabels = [
    "Next: Admin Account →",
    "Next: Hospital Details →",
    "Next: Choose Plan →",
    "Next: Confirm →",
  ];

  const handleLaunch = async () => {
    if (!data.termsAccepted) return;
    setLoading(true);
    try {
      // Use register-hospital edge function which creates auth user + hospital server-side
      const res = await supabase.functions.invoke("register-hospital", {
        body: {
          hospital: {
            name: data.hospitalName,
            type: data.hospitalType,
            state: data.state,
            bedCount: data.bedCount,
            address1: data.address1,
            address2: data.address2,
            pincode: data.pincode,
            gstin: data.gstin || null,
            nabhNumber: data.nabhAccredited ? data.nabhNumber : null,
            plan: data.plan,
          },
          admin: {
            full_name: data.fullName,
            email: data.email,
            password: data.password,
            phone: data.phone,
          },
        },
      });

      if (res.error || res.data?.error) {
        const errMsg = res.data?.error || res.error?.message || "Registration failed";
        if (errMsg.toLowerCase().includes("already been registered")) {
          throw new Error("This email is already registered. Please use a different email address or sign in to your existing account.");
        }
        throw new Error(errMsg);
      }

      // Sign in with the newly created account
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      });
      if (signInError) throw signInError;

      toast({ title: "Welcome! 🎉", description: "Let's set up your hospital." });
      navigate("/setup/onboarding", { replace: true });
    } catch (err: any) {
      toast({ title: "Registration failed", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  if (checking) return null;

  return (
    <div className="h-screen w-screen overflow-hidden flex bg-background">
      {/* LEFT PANEL */}
      <div className="hidden lg:flex w-[40%] shrink-0 bg-primary flex-col p-10 text-primary-foreground">
        <div className="flex items-center gap-2.5">
          <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
            <rect x="2" y="2" width="28" height="28" rx="6" fill="white" fillOpacity="0.15" />
            <path d="M14 9h4v14h-4z" fill="white" />
            <path d="M9 14h14v4H9z" fill="white" />
          </svg>
          <span className="font-bold text-lg">Aumrti</span>
        </div>

        <div className="flex-1 flex flex-col justify-center">
          <h2 className="text-[28px] font-bold leading-[1.3]">
            Your hospital.
            <br />
            Your system.
          </h2>
          <p className="text-sm text-[hsl(215,20%,65%)] mt-3 leading-relaxed">
            Join 200+ hospitals already running on Aumrti.
            <br />
            Get live in under 30 minutes.
          </p>

          <div className="mt-12 space-y-5">
            {steps.map((label, i) => {
              const done = i < step;
              const active = i === step;
              return (
                <div key={label} className="flex items-center gap-3">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-colors ${
                      done
                        ? "bg-[hsl(160,84%,39%)] text-white"
                        : active
                        ? "bg-white text-primary"
                        : "bg-[hsl(220,40%,32%)] text-[hsl(215,20%,65%)]"
                    }`}
                  >
                    {done ? <Check size={14} /> : i + 1}
                  </div>
                  <span
                    className={`text-sm transition-colors ${
                      active ? "text-white font-semibold" : "text-[hsl(215,20%,65%)]"
                    }`}
                  >
                    {label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="text-[13px] text-muted-foreground">
          Already registered?{" "}
          <button onClick={() => navigate("/")} className="text-secondary font-medium hover:underline">
            Sign In →
          </button>
        </div>
      </div>

      {/* RIGHT PANEL */}
      <div className="flex-1 bg-card flex flex-col overflow-hidden">
        <div className="h-1 bg-border shrink-0">
          <div
            className="h-full bg-primary transition-[width] duration-400 ease-out rounded-r-sm"
            style={{ width: `${((step + 1) / steps.length) * 100}%` }}
          />
        </div>

        <div className="flex-1 overflow-y-auto px-8 md:px-14 py-8">
          {step === 0 && <Step1HospitalIdentity data={data} onChange={update} />}
          {step === 1 && <Step2AdminAccount data={data} onChange={update} />}
          {step === 2 && <Step3HospitalDetails data={data} onChange={update} />}
          {step === 3 && <Step4ChoosePlan data={data} onChange={update} />}
          {step === 4 && (
            <Step5Confirm
              data={data}
              onChange={update}
              onEditStep={setStep}
              loading={loading}
              onLaunch={handleLaunch}
            />
          )}
        </div>

        {step < 4 && (
          <div className="shrink-0 flex items-center justify-between px-8 md:px-14 py-4 border-t border-border">
            {step > 0 ? (
              <button
                onClick={() => setStep(step - 1)}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                ← Back
              </button>
            ) : (
              <div />
            )}
            <button
              onClick={() => setStep(step + 1)}
              disabled={!canProceed(step)}
              className="bg-primary text-primary-foreground px-7 py-2.5 rounded-lg text-sm font-semibold hover:bg-[hsl(220,54%,16%)] transition-colors disabled:opacity-40 disabled:pointer-events-none active:scale-[0.97]"
            >
              {nextLabels[step]}
            </button>
          </div>
        )}
        {step === 4 && (
          <div className="shrink-0 flex items-center px-8 md:px-14 py-4 border-t border-border">
            <button
              onClick={() => setStep(3)}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              ← Back
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Register;
