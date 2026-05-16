import React from "react";
import SettingsPageWrapper from "@/components/settings/SettingsPageWrapper";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, Mail } from "lucide-react";

const SettingsPlanPage: React.FC = () => {
  const usage = [
    { label: "Staff Accounts", used: 24, limit: 50, pct: 48 },
    { label: "Monthly OPD Visits", used: 1820, limit: 5000, pct: 36 },
    { label: "Data Storage", used: 2.1, limit: 10, pct: 21, unit: "GB" },
  ];

  const modules = ["OPD", "IPD", "Emergency", "OT", "Pharmacy", "Lab", "Radiology", "Billing", "Insurance", "HR", "Inventory", "Quality", "Analytics"];

  return (
    <SettingsPageWrapper title="Plan & Billing" hideSave>
      <div className="space-y-8">
        <div className="rounded-xl bg-accent/30 border border-border p-6">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Current Plan</p>
          <p className="text-2xl font-bold text-primary mt-1">GROWTH</p>
          <div className="flex gap-6 mt-2 text-sm text-muted-foreground">
            <span>Active since: 15 Jan 2026</span>
            <span>Next billing: 15 Apr 2026</span>
          </div>
          <p className="text-xl font-bold text-foreground mt-2">₹12,000/month</p>
        </div>

        <section>
          <h2 className="text-sm font-semibold text-foreground mb-4">Usage Statistics</h2>
          <div className="grid grid-cols-3 gap-4">
            {usage.map((u) => (
              <div key={u.label} className="bg-card border border-border rounded-lg p-4">
                <p className="text-xs text-muted-foreground">{u.label}</p>
                <p className="text-lg font-bold text-foreground mt-1">
                  {u.used}{u.unit ? ` ${u.unit}` : ""} <span className="text-sm font-normal text-muted-foreground">/ {u.limit}{u.unit ? ` ${u.unit}` : ""}</span>
                </p>
                <Progress value={u.pct} className="mt-2 h-2" />
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-foreground mb-3">Active Modules</h2>
          <div className="flex flex-wrap gap-2">
            {modules.map((m) => <Badge key={m} variant="secondary">{m}</Badge>)}
          </div>
        </section>

        <div className="flex gap-3">
          <Button variant="outline" className="gap-2"><Mail size={14} /> Contact Support to Upgrade</Button>
          <Button variant="outline" className="gap-2"><Download size={14} /> Download Invoice</Button>
        </div>
      </div>
    </SettingsPageWrapper>
  );
};

export default SettingsPlanPage;
