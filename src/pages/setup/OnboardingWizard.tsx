import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Check, ArrowLeft } from "lucide-react";
import Step1Branding from "./steps/Step1Branding";
import Step2Departments from "./steps/Step2Departments";
import Step3Wards from "./steps/Step3Wards";
import Step4Doctors from "./steps/Step4Doctors";
import Step5Fees from "./steps/Step5Fees";
import Step6Payments from "./steps/Step6Payments";
import Step7WhatsApp from "./steps/Step7WhatsApp";
import Step8GoLive from "./steps/Step8GoLive";

const stepNames = [
  "Branding",
  "Departments",
  "Wards",
  "Doctors",
  "Fees",
  "Payments",
  "WhatsApp",
  "Go Live",
];

const OnboardingWizard: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [hospitalId, setHospitalId] = useState<string | null>(null);
  const [hospitalName, setHospitalName] = useState("");
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  // Shared state for cross-step data
  const [selectedDepts, setSelectedDepts] = useState<string[]>([]);

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate("/", { replace: true }); return; }

      const { data: user } = await supabase
        .from("users")
        .select("hospital_id")
        .eq("auth_user_id", session.user.id)
        .maybeSingle();

      if (!user?.hospital_id) { navigate("/", { replace: true }); return; }

      const { data: hospital } = await supabase
        .from("hospitals")
        .select("id, name, setup_complete")
        .eq("id", user.hospital_id)
        .maybeSingle();

      if (!hospital) { navigate("/", { replace: true }); return; }
      if (hospital.setup_complete) { navigate("/dashboard", { replace: true }); return; }

      setHospitalId(hospital.id);
      setHospitalName(hospital.name);
      setLoading(false);
    };
    init();
  }, [navigate]);

  const markComplete = (s: number) => {
    setCompletedSteps((prev) => new Set([...prev, s]));
    if (s < 7) setStep(s + 1);
  };

  const handleSkipSetup = async () => {
    if (!hospitalId) return;
    const confirmed = window.confirm("Skip setup? You can always complete it from Settings.");
    if (!confirmed) return;
    await supabase.from("hospitals").update({ setup_complete: true } as any).eq("id", hospitalId);
    toast({ title: "Setup skipped", description: "You can complete setup from Settings anytime." });
    navigate("/dashboard", { replace: true });
  };

  const handleGoLive = async () => {
    if (!hospitalId) return;
    await supabase.from("hospitals").update({ setup_complete: true } as any).eq("id", hospitalId);
    navigate("/dashboard?welcome=true", { replace: true });
  };

  if (loading) return null;

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-background">
      {/* Header */}
      <header className="h-14 shrink-0 bg-card border-b border-border flex items-center px-6 gap-4">
        <div className="flex items-center gap-3 min-w-[160px]">
          {step > 0 && (
            <button onClick={() => setStep(step - 1)} className="text-muted-foreground hover:text-foreground">
              <ArrowLeft size={18} />
            </button>
          )}
          <span className="text-base font-bold text-primary">Hospital Setup</span>
        </div>

        {/* Progress dots */}
        <div className="flex-1 flex items-center justify-center gap-1">
          {stepNames.map((name, i) => {
            const done = completedSteps.has(i);
            const active = i === step;
            return (
              <React.Fragment key={name}>
                {i > 0 && <div className="w-4 h-px bg-border hidden sm:block" />}
                <div className="flex flex-col items-center gap-1">
                  <button
                    onClick={() => (done || i <= step) && setStep(i)}
                    className={`w-2.5 h-2.5 rounded-full transition-colors ${
                      done ? "bg-[hsl(160,84%,39%)]" : active ? "bg-primary" : "bg-border"
                    }`}
                  />
                  <span className="text-[10px] text-muted-foreground hidden lg:block">{name}</span>
                </div>
              </React.Fragment>
            );
          })}
        </div>

        <div className="flex items-center gap-3 min-w-[160px] justify-end">
          <span className="text-[13px] text-muted-foreground">Step {step + 1} of 8</span>
          <button
            onClick={handleSkipSetup}
            className="text-[12px] text-muted-foreground hover:text-foreground underline"
          >
            Skip setup
          </button>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto flex justify-center">
        <div className="w-full max-w-[720px] px-6 py-10">
          {step === 0 && <Step1Branding hospitalId={hospitalId!} hospitalName={hospitalName} onComplete={() => markComplete(0)} />}
          {step === 1 && <Step2Departments hospitalId={hospitalId!} onComplete={(depts) => { setSelectedDepts(depts); markComplete(1); }} />}
          {step === 2 && <Step3Wards hospitalId={hospitalId!} onComplete={() => markComplete(2)} />}
          {step === 3 && <Step4Doctors hospitalId={hospitalId!} onComplete={() => markComplete(3)} />}
          {step === 4 && <Step5Fees hospitalId={hospitalId!} selectedDepts={selectedDepts} onComplete={() => markComplete(4)} />}
          {step === 5 && <Step6Payments hospitalId={hospitalId!} onComplete={() => markComplete(5)} />}
          {step === 6 && <Step7WhatsApp hospitalId={hospitalId!} hospitalName={hospitalName} onComplete={() => markComplete(6)} />}
          {step === 7 && <Step8GoLive hospitalId={hospitalId!} hospitalName={hospitalName} completedSteps={completedSteps} selectedDepts={selectedDepts} onGoLive={handleGoLive} />}
        </div>
      </div>
    </div>
  );
};

export default OnboardingWizard;
