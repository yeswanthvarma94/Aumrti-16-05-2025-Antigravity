import React, { useState } from "react";
import SettingsPageWrapper from "@/components/settings/SettingsPageWrapper";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

const roleOptions = ["No approval needed", "Billing Manager", "CMO", "Medical Director", "CEO"];

const SettingsApprovalsPage: React.FC = () => {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [discountTiers, setDiscountTiers] = useState([
    { range: "0–5%", approver: "No approval needed" },
    { range: "5–10%", approver: "Billing Manager" },
    { range: "10–20%", approver: "CMO" },
    { range: "> 20%", approver: "Medical Director" },
    { range: "100% Waiver", approver: "CEO" },
  ]);
  const [restrictedAbx, setRestrictedAbx] = useState(true);
  const [bloodTx, setBloodTx] = useState(true);
  const [lama, setLama] = useState(true);

  const handleSave = () => { setSaving(true); setTimeout(() => { toast({ title: "Approval rules saved" }); setSaving(false); }, 500); };

  return (
    <SettingsPageWrapper title="Approval Rules" onSave={handleSave} saving={saving}>
      <div className="space-y-8">
        <section>
          <h2 className="text-sm font-semibold text-foreground mb-4">Discount Approvals</h2>
          <p className="text-xs text-muted-foreground mb-3">Who can approve discounts at each tier?</p>
          <div className="space-y-2">
            {discountTiers.map((tier, i) => (
              <div key={i} className="flex items-center gap-4">
                <span className="text-sm text-foreground w-28">{tier.range}</span>
                <Select value={tier.approver} onValueChange={(v) => { const n = [...discountTiers]; n[i].approver = v; setDiscountTiers(n); }}>
                  <SelectTrigger className="w-52 h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>{roleOptions.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-foreground mb-4">Clinical Approvals</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between bg-card border border-border rounded-lg px-4 py-3">
              <div>
                <Label>Restricted Antibiotics</Label>
                <p className="text-xs text-muted-foreground">Require Microbiologist approval for restricted antibiotics</p>
              </div>
              <Switch checked={restrictedAbx} onCheckedChange={setRestrictedAbx} />
            </div>
            <div className="flex items-center justify-between bg-card border border-border rounded-lg px-4 py-3">
              <div>
                <Label>Blood Transfusion</Label>
                <p className="text-xs text-muted-foreground">Require Blood Bank MO sign-off for unusual requests</p>
              </div>
              <Switch checked={bloodTx} onCheckedChange={setBloodTx} />
            </div>
            <div className="flex items-center justify-between bg-card border border-border rounded-lg px-4 py-3">
              <div>
                <Label>LAMA (Left Against Medical Advice)</Label>
                <p className="text-xs text-muted-foreground">Require CMO approval + witness documentation</p>
              </div>
              <Switch checked={lama} onCheckedChange={setLama} />
            </div>
          </div>
        </section>
      </div>
    </SettingsPageWrapper>
  );
};

export default SettingsApprovalsPage;
