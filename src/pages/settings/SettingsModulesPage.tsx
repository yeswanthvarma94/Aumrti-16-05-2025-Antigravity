import React, { useState } from "react";
import SettingsPageWrapper from "@/components/settings/SettingsPageWrapper";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const moduleList = [
  { key: "opd", icon: "🏥", name: "OPD", desc: "Outpatient visits", on: true },
  { key: "ipd", icon: "🛏️", name: "IPD", desc: "Inpatient admissions", on: true },
  { key: "emergency", icon: "🚨", name: "Emergency / Casualty", desc: "ER management", on: true },
  { key: "ot", icon: "🔪", name: "Operation Theatre", desc: "Surgical scheduling", on: true },
  { key: "pharmacy", icon: "💊", name: "Pharmacy", desc: "Drug dispensing", on: true },
  { key: "lab", icon: "🔬", name: "Laboratory (LIS)", desc: "Lab orders & results", on: true },
  { key: "radiology", icon: "🩻", name: "Radiology (RIS)", desc: "Imaging worklist", on: true },
  { key: "billing", icon: "🧾", name: "Billing & Finance", desc: "Bills & payments", on: true },
  { key: "insurance", icon: "🏥", name: "Insurance / TPA", desc: "Claims management", on: true },
  { key: "hr", icon: "👥", name: "HR & Payroll", desc: "Staff management", on: true },
  { key: "inventory", icon: "📦", name: "Inventory & Stores", desc: "Stock management", on: true },
  { key: "quality", icon: "✅", name: "Quality & NABH", desc: "Audits & compliance", on: true },
  { key: "analytics", icon: "📊", name: "Analytics & BI", desc: "Reports & dashboards", on: true },
  { key: "portal", icon: "🌐", name: "Patient Portal", desc: "Patient self-service", on: true },
  { key: "telemedicine", icon: "📹", name: "Telemedicine", desc: "Video consultations", on: false },
  { key: "hod", icon: "🏢", name: "HOD Control Tower", desc: "Department head view", on: true },
  { key: "inbox", icon: "📬", name: "Communication Inbox", desc: "Unified messaging", on: true },
];

const SettingsModulesPage: React.FC = () => {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [modules, setModules] = useState(moduleList);
  const [confirm, setConfirm] = useState<string | null>(null);

  const toggle = (key: string, value: boolean) => {
    if (!value) {
      setConfirm(key);
    } else {
      setModules(modules.map((m) => (m.key === key ? { ...m, on: true } : m)));
    }
  };

  const confirmDisable = () => {
    if (confirm) {
      setModules(modules.map((m) => (m.key === confirm ? { ...m, on: false } : m)));
      setConfirm(null);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setTimeout(() => { toast({ title: "Module settings saved" }); setSaving(false); }, 500);
  };

  const mod = modules.find((m) => m.key === confirm);

  return (
    <SettingsPageWrapper title="Modules On/Off" onSave={handleSave} saving={saving}>
      <p className="text-sm text-muted-foreground mb-6">Enable or disable modules for this hospital branch. When disabled, the module disappears from the sidebar entirely.</p>
      <div className="grid grid-cols-2 gap-3">
        {modules.map((m) => (
          <div key={m.key} className="flex items-center justify-between bg-card border border-border rounded-lg px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="text-lg">{m.icon}</span>
              <div>
                <p className="text-sm font-medium text-foreground">{m.name}</p>
                <p className="text-xs text-muted-foreground">{m.desc}</p>
              </div>
            </div>
            <Switch checked={m.on} onCheckedChange={(v) => toggle(m.key, v)} />
          </div>
        ))}
      </div>

      <Dialog open={!!confirm} onOpenChange={() => setConfirm(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Disable {mod?.name}?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Disabling {mod?.name} will hide it from all staff. Existing data is preserved.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(null)}>Cancel</Button>
            <Button variant="destructive" onClick={confirmDisable}>Confirm Disable</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsPageWrapper>
  );
};

export default SettingsModulesPage;
