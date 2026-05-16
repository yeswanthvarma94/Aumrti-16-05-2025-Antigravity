import React, { useState } from "react";
import SettingsPageWrapper from "@/components/settings/SettingsPageWrapper";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const defaults = {
  hrLow: 40, hrHigh: 150, spo2Critical: 90, tempLow: 35, tempHigh: 39,
  bpLow: 80, bpHigh: 180, glucoseLow: 70, glucoseHigh: 400,
  news2Alert: 5, news2Escalate: 7, dischargeTatAlert: 3, dischargeTatEscalate: 5,
};

const SettingsThresholdsPage: React.FC = () => {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState(defaults);

  const set = (key: keyof typeof defaults, value: string) => setConfig({ ...config, [key]: Number(value) || 0 });
  const handleSave = () => { setSaving(true); setTimeout(() => { toast({ title: "Thresholds saved" }); setSaving(false); }, 500); };
  const restore = () => setConfig(defaults);

  const Field = ({ label, k, unit }: { label: string; k: keyof typeof defaults; unit: string }) => (
    <div className="flex items-center gap-3">
      <Label className="w-48 text-sm">{label}</Label>
      <Input type="number" value={config[k]} onChange={(e) => set(k, e.target.value)} className="w-24 h-8" />
      <span className="text-xs text-muted-foreground">{unit}</span>
    </div>
  );

  return (
    <SettingsPageWrapper title="Alert Thresholds" onSave={handleSave} saving={saving}>
      <div className="space-y-8">
        <section>
          <h2 className="text-sm font-semibold text-foreground mb-4">Vital Signs Alerts</h2>
          <div className="space-y-3">
            <Field label="Heart Rate Low / High" k="hrLow" unit="bpm" />
            <Field label="Heart Rate High" k="hrHigh" unit="bpm" />
            <Field label="SpO₂ Critical (below)" k="spo2Critical" unit="%" />
            <Field label="Temperature Low" k="tempLow" unit="°C" />
            <Field label="Temperature High" k="tempHigh" unit="°C" />
            <Field label="Systolic BP Low" k="bpLow" unit="mmHg" />
            <Field label="Systolic BP High" k="bpHigh" unit="mmHg" />
            <Field label="Blood Glucose Low" k="glucoseLow" unit="mg/dL" />
            <Field label="Blood Glucose High" k="glucoseHigh" unit="mg/dL" />
          </div>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-foreground mb-4">NEWS2 Score</h2>
          <div className="space-y-3">
            <Field label="Alert at score ≥" k="news2Alert" unit="" />
            <Field label="Escalate at score ≥" k="news2Escalate" unit="" />
          </div>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-foreground mb-4">Discharge TAT</h2>
          <div className="space-y-3">
            <Field label="Alert if discharge >" k="dischargeTatAlert" unit="hours" />
            <Field label="Escalate if discharge >" k="dischargeTatEscalate" unit="hours" />
          </div>
        </section>

        <Button variant="link" onClick={restore} className="px-0 text-muted-foreground">Restore Defaults</Button>
      </div>
    </SettingsPageWrapper>
  );
};

export default SettingsThresholdsPage;
