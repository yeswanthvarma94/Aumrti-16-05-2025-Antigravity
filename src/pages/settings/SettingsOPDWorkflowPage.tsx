import React, { useState } from "react";
import SettingsPageWrapper from "@/components/settings/SettingsPageWrapper";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

const SettingsOPDWorkflowPage: React.FC = () => {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState({
    queueType: "token",
    tokenPrefix: "A",
    tokenStart: 1,
    resetDaily: true,
    feeTimimg: "before",
    followUpDays: 14,
    nameFormat: "full",
    audioAnnounce: true,
    lateArrival: "wait",
  });

  const handleSave = () => { setSaving(true); setTimeout(() => { toast({ title: "OPD config saved" }); setSaving(false); }, 500); };

  return (
    <SettingsPageWrapper title="OPD Queue Config" onSave={handleSave} saving={saving}>
      <div className="space-y-8">
        <section>
          <h2 className="text-sm font-semibold text-foreground mb-3">Queue Type</h2>
          <RadioGroup value={config.queueType} onValueChange={(v) => setConfig({ ...config, queueType: v })} className="space-y-2">
            {[{ v: "token", l: "Token-based" }, { v: "appointment", l: "Appointment-first" }, { v: "walkin", l: "Walk-in only" }].map((o) => (
              <div key={o.v} className="flex items-center gap-2"><RadioGroupItem value={o.v} id={`qt-${o.v}`} /><Label htmlFor={`qt-${o.v}`} className="font-normal">{o.l}</Label></div>
            ))}
          </RadioGroup>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-foreground mb-3">Token Format</h2>
          <div className="grid grid-cols-3 gap-4">
            <div><Label>Prefix</Label><Input value={config.tokenPrefix} onChange={(e) => setConfig({ ...config, tokenPrefix: e.target.value })} className="mt-1" /></div>
            <div><Label>Starting Number</Label><Input type="number" value={config.tokenStart} onChange={(e) => setConfig({ ...config, tokenStart: +e.target.value })} className="mt-1" /></div>
            <div className="flex items-end gap-2 pb-1"><Switch checked={config.resetDaily} onCheckedChange={(v) => setConfig({ ...config, resetDaily: v })} /><span className="text-sm">Reset daily</span></div>
          </div>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-foreground mb-3">Consultation Fee Timing</h2>
          <RadioGroup value={config.feeTimimg} onValueChange={(v) => setConfig({ ...config, feeTimimg: v })} className="space-y-2">
            {[{ v: "before", l: "Collect before consultation" }, { v: "after", l: "Collect after consultation" }, { v: "choice", l: "Patient's choice" }].map((o) => (
              <div key={o.v} className="flex items-center gap-2"><RadioGroupItem value={o.v} id={`ft-${o.v}`} /><Label htmlFor={`ft-${o.v}`} className="font-normal">{o.l}</Label></div>
            ))}
          </RadioGroup>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-foreground mb-3">Free Follow-up</h2>
          <div className="flex items-center gap-2">
            <span className="text-sm">Free follow-up within</span>
            <Input type="number" value={config.followUpDays} onChange={(e) => setConfig({ ...config, followUpDays: +e.target.value })} className="w-20 h-8" />
            <span className="text-sm">days</span>
          </div>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-foreground mb-3">OPD TV Display</h2>
          <div className="space-y-3">
            <div>
              <Label>Patient Name Format</Label>
              <RadioGroup value={config.nameFormat} onValueChange={(v) => setConfig({ ...config, nameFormat: v })} className="flex gap-4 mt-1">
                {[{ v: "full", l: "Full name" }, { v: "initial", l: "First name + initial" }, { v: "token", l: "Token only" }].map((o) => (
                  <div key={o.v} className="flex items-center gap-2"><RadioGroupItem value={o.v} id={`nf-${o.v}`} /><Label htmlFor={`nf-${o.v}`} className="font-normal">{o.l}</Label></div>
                ))}
              </RadioGroup>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={config.audioAnnounce} onCheckedChange={(v) => setConfig({ ...config, audioAnnounce: v })} />
              <span className="text-sm">Audio announcement</span>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-foreground mb-3">Walk-in Late Arrival</h2>
          <RadioGroup value={config.lateArrival} onValueChange={(v) => setConfig({ ...config, lateArrival: v })} className="space-y-2">
            {[{ v: "wait", l: "Wait in queue" }, { v: "end", l: "Move to end" }, { v: "cancel", l: "Cancel" }].map((o) => (
              <div key={o.v} className="flex items-center gap-2"><RadioGroupItem value={o.v} id={`la-${o.v}`} /><Label htmlFor={`la-${o.v}`} className="font-normal">{o.l}</Label></div>
            ))}
          </RadioGroup>
        </section>
      </div>
    </SettingsPageWrapper>
  );
};

export default SettingsOPDWorkflowPage;
