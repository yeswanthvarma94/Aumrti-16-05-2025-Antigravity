import React from "react";
import { RegistrationData } from "./constants";
import { Check, X } from "lucide-react";

interface Props {
  data: RegistrationData;
  onChange: (d: Partial<RegistrationData>) => void;
}

const plans = [
  {
    id: "starter" as const,
    name: "Starter",
    price: "₹8,999",
    sub: "For clinics & small hospitals (up to 50 beds)",
    features: [
      { text: "OPD Management", included: true },
      { text: "IPD & Bed Management", included: true },
      { text: "Billing & GST Invoice", included: true },
      { text: "Pharmacy (IP Dispensing)", included: true },
      { text: "Lab (Basic LIS)", included: true },
      { text: "5 User Accounts", included: true },
      { text: "WhatsApp Notifications", included: true },
      { text: "AI Voice Scribe", included: false },
      { text: "ABDM Integration", included: false },
      { text: "Analytics Dashboard", included: false },
    ],
  },
  {
    id: "professional" as const,
    name: "Professional",
    price: "₹18,999",
    sub: "For hospitals 50–250 beds",
    popular: true,
    features: [
      { text: "Everything in Starter", included: true },
      { text: "All 39 Modules", included: true },
      { text: "AI Voice Scribe (Hindi, Telugu, Tamil, English)", included: true },
      { text: "ABDM / ABHA Integration", included: true },
      { text: "Analytics & BI Dashboard", included: true },
      { text: "Insurance / TPA / PMJAY", included: true },
      { text: "25 User Accounts", included: true },
      { text: "NABH Auto-Evidence", included: true },
      { text: "HOD Control Tower", included: true },
      { text: "Priority Support", included: true },
    ],
  },
  {
    id: "enterprise" as const,
    name: "Enterprise",
    price: "Custom Pricing",
    sub: "For chains & 250+ bed hospitals",
    features: [
      { text: "Everything in Professional", included: true },
      { text: "Multi-Branch Management", included: true },
      { text: "White-Label Branding", included: true },
      { text: "Custom Integrations", included: true },
      { text: "SLA-backed Support", included: true },
      { text: "On-site Training", included: true },
      { text: "Data Migration Assistance", included: true },
      { text: "Unlimited Users", included: true },
    ],
  },
];

const Step4ChoosePlan: React.FC<Props> = ({ data, onChange }) => {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-[22px] font-bold text-foreground">Choose your plan</h2>
        <p className="text-sm text-muted-foreground mt-1">Start free for 30 days. No credit card required.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
        {plans.map((plan) => {
          const selected = data.plan === plan.id;
          return (
            <div
              key={plan.id}
              className={`relative rounded-xl p-5 border-2 cursor-pointer transition-all active:scale-[0.98] ${
                plan.popular ? "-mt-1" : ""
              } ${
                selected
                  ? "border-primary shadow-[0_2px_12px_rgba(26,47,90,0.12)]"
                  : "border-border hover:border-primary/40"
              }`}
              onClick={() => onChange({ plan: plan.id })}
            >
              {plan.popular && (
                <div className="absolute -top-0 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-[11px] font-medium px-3 py-0.5 rounded-b-lg">
                  Most Popular
                </div>
              )}

              <p className="text-sm font-semibold text-foreground mt-2">{plan.name}</p>
              <div className="mt-2">
                {plan.price.startsWith("₹") ? (
                  <>
                    <span className="text-2xl font-bold text-foreground">{plan.price}</span>
                    <span className="text-sm text-muted-foreground"> /month</span>
                  </>
                ) : (
                  <span className="text-2xl font-bold text-foreground">{plan.price}</span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">{plan.sub}</p>

              <div className="border-t border-border my-3" />

              <ul className="space-y-1.5">
                {plan.features.map((f) => (
                  <li
                    key={f.text}
                    className={`flex items-start gap-2 text-[13px] ${
                      f.included ? "text-foreground" : "text-muted-foreground/50"
                    }`}
                  >
                    {f.included ? (
                      <Check size={14} className="text-[hsl(160,84%,39%)] mt-0.5 shrink-0" />
                    ) : (
                      <X size={14} className="mt-0.5 shrink-0" />
                    )}
                    {f.text}
                  </li>
                ))}
              </ul>

              <button
                className={`mt-4 w-full py-2.5 rounded-md text-sm font-medium transition-colors ${
                  plan.id === "enterprise"
                    ? "border border-secondary text-secondary hover:bg-secondary hover:text-white"
                    : selected
                    ? "bg-primary text-primary-foreground"
                    : "border border-primary text-primary hover:bg-primary hover:text-primary-foreground"
                }`}
              >
                {plan.id === "enterprise" ? "Contact Sales" : `Select ${plan.name}`}
              </button>
            </div>
          );
        })}
      </div>

      <p className="text-center text-[13px] text-muted-foreground mt-4">
        All plans include 30-day free trial · No credit card required · Cancel anytime
      </p>
    </div>
  );
};

export default Step4ChoosePlan;
