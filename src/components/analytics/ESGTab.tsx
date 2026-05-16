import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useHospitalId } from "@/hooks/useHospitalId";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import AnalyticsKPICard from "./AnalyticsKPICard";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { logNABHEvidence } from "@/lib/nabh-evidence";
import { Leaf, Plus } from "lucide-react";

interface Metric {
  id: string; month_year: string;
  electricity_kwh: number | null; solar_kwh: number | null; diesel_litres: number | null;
  water_kl: number | null; water_recycled_kl: number | null;
  bmw_kg_red: number | null; bmw_kg_yellow: number | null; bmw_kg_blue: number | null; bmw_kg_black: number | null;
  carbon_offset_kg: number | null;
  electricity_target: number | null; water_target: number | null; bmw_target: number | null;
}

const ESGTab: React.FC = () => {
  const { hospitalId } = useHospitalId();
  const { toast } = useToast();
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().toISOString().substring(0, 7));

  const [form, setForm] = useState({
    electricity_kwh: "", solar_kwh: "", diesel_litres: "",
    water_kl: "", water_recycled_kl: "",
    bmw_kg_red: "", bmw_kg_yellow: "", bmw_kg_blue: "", bmw_kg_black: "",
    carbon_offset_kg: "", initiatives_text: "",
    electricity_target: "", water_target: "", bmw_target: "",
  });

  const load = useCallback(async () => {
    if (!hospitalId) return;
    setLoading(true);
    const { data } = await (supabase as any).from("esg_monthly_metrics")
      .select("*").eq("hospital_id", hospitalId).eq("is_deleted", false)
      .order("month_year", { ascending: true }).limit(24);
    setMetrics(data || []);
    setLoading(false);
  }, [hospitalId]);

  useEffect(() => { load(); }, [load]);

  const n = (v: string) => v ? Number(v) : null;

  const saveMetrics = async () => {
    if (!hospitalId) return;
    setSaving(true);
    const { data: userData } = await supabase.auth.getUser();
    const monthDate = `${selectedMonth}-01`;
    const payload = {
      hospital_id: hospitalId,
      month_year: monthDate,
      electricity_kwh: n(form.electricity_kwh),
      solar_kwh: n(form.solar_kwh),
      diesel_litres: n(form.diesel_litres),
      water_kl: n(form.water_kl),
      water_recycled_kl: n(form.water_recycled_kl),
      bmw_kg_red: n(form.bmw_kg_red),
      bmw_kg_yellow: n(form.bmw_kg_yellow),
      bmw_kg_blue: n(form.bmw_kg_blue),
      bmw_kg_black: n(form.bmw_kg_black),
      carbon_offset_kg: n(form.carbon_offset_kg),
      electricity_target: n(form.electricity_target),
      water_target: n(form.water_target),
      bmw_target: n(form.bmw_target),
      initiatives_text: form.initiatives_text || null,
      entered_by: userData.user?.id,
    };
    const { error } = await (supabase as any).from("esg_monthly_metrics")
      .upsert(payload, { onConflict: "hospital_id,month_year" });
    if (error) { toast({ title: "Save failed", description: error.message, variant: "destructive" }); }
    else {
      await logNABHEvidence(hospitalId, "ROM.3", `ESG metrics entered for ${selectedMonth}`);
      toast({ title: "ESG metrics saved ✓" });
      setShowForm(false);
      load();
    }
    setSaving(false);
  };

  const energyData = metrics.map(m => ({
    month: m.month_year.substring(0, 7),
    electricity: m.electricity_kwh || 0,
    solar: m.solar_kwh || 0,
    target: m.electricity_target || 0,
  }));

  const waterData = metrics.map(m => ({
    month: m.month_year.substring(0, 7),
    consumed: m.water_kl || 0,
    recycled: m.water_recycled_kl || 0,
    target: m.water_target || 0,
  }));

  const bmwData = metrics.map(m => ({
    month: m.month_year.substring(0, 7),
    red: m.bmw_kg_red || 0,
    yellow: m.bmw_kg_yellow || 0,
    blue: m.bmw_kg_blue || 0,
    black: m.bmw_kg_black || 0,
  }));

  const latest = metrics[metrics.length - 1];
  const totalBMW = latest ? ((latest.bmw_kg_red || 0) + (latest.bmw_kg_yellow || 0) + (latest.bmw_kg_blue || 0) + (latest.bmw_kg_black || 0)) : 0;

  return (
    <div className="p-4 space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Leaf className="h-4 w-4 text-green-600" />
          <span className="text-sm font-semibold">ESG Sustainability Dashboard</span>
        </div>
        <Button size="sm" onClick={() => setShowForm(true)}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Enter Monthly Data
        </Button>
      </div>

      {latest && (
        <div className="grid grid-cols-4 gap-3">
          <AnalyticsKPICard icon="⚡" iconBg="bg-yellow-100"
            value={`${(latest.electricity_kwh || 0).toLocaleString()} kWh`} label="Electricity (latest month)"
            subtitle={latest.solar_kwh ? `Solar: ${latest.solar_kwh} kWh` : undefined} />
          <AnalyticsKPICard icon="💧" iconBg="bg-blue-100"
            value={`${(latest.water_kl || 0).toLocaleString()} KL`} label="Water Consumed"
            subtitle={latest.water_recycled_kl ? `Recycled: ${latest.water_recycled_kl} KL` : undefined} />
          <AnalyticsKPICard icon="🗑️" iconBg="bg-green-100"
            value={`${totalBMW.toLocaleString()} kg`} label="BMW Waste (latest month)" />
          <AnalyticsKPICard icon="🌿" iconBg="bg-emerald-100"
            value={`${(latest.carbon_offset_kg || 0).toLocaleString()} kg`} label="Carbon Offset" />
        </div>
      )}

      {energyData.length > 0 && (
        <div className="bg-card border rounded-xl p-4">
          <p className="text-sm font-semibold mb-3">Energy Usage (kWh)</p>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={energyData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="month" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Area type="monotone" dataKey="electricity" stroke="#f59e0b" fill="#fef3c7" name="Electricity" />
              <Area type="monotone" dataKey="solar" stroke="#22c55e" fill="#dcfce7" name="Solar" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {bmwData.length > 0 && (
        <div className="bg-card border rounded-xl p-4">
          <p className="text-sm font-semibold mb-3">BMW Waste by Category (kg)</p>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={bmwData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="month" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="red" stackId="a" fill="#ef4444" name="Red (infectious)" />
              <Bar dataKey="yellow" stackId="a" fill="#f59e0b" name="Yellow (cytotoxic)" />
              <Bar dataKey="blue" stackId="a" fill="#3b82f6" name="Blue (glass)" />
              <Bar dataKey="black" stackId="a" fill="#6b7280" name="Black (general)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {!loading && metrics.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-8">No ESG data yet. Click "Enter Monthly Data" to begin.</p>
      )}

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Leaf className="h-4 w-4 text-green-600" />Enter Monthly ESG Data</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium">Month *</label>
              <Input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} />
            </div>

            <p className="text-xs font-bold text-muted-foreground uppercase">Energy</p>
            <div className="grid grid-cols-3 gap-2">
              {[["electricity_kwh","Electricity (kWh)"],["solar_kwh","Solar (kWh)"],["diesel_litres","Diesel (L)"]].map(([k,l]) => (
                <div key={k}>
                  <label className="text-xs font-medium">{l}</label>
                  <Input type="number" placeholder="0" value={(form as any)[k]}
                    onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))} />
                </div>
              ))}
            </div>

            <p className="text-xs font-bold text-muted-foreground uppercase">Water</p>
            <div className="grid grid-cols-2 gap-2">
              {[["water_kl","Consumed (KL)"],["water_recycled_kl","Recycled (KL)"]].map(([k,l]) => (
                <div key={k}>
                  <label className="text-xs font-medium">{l}</label>
                  <Input type="number" placeholder="0" value={(form as any)[k]}
                    onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))} />
                </div>
              ))}
            </div>

            <p className="text-xs font-bold text-muted-foreground uppercase">BMW Waste (kg)</p>
            <div className="grid grid-cols-4 gap-2">
              {[["bmw_kg_red","Red"],["bmw_kg_yellow","Yellow"],["bmw_kg_blue","Blue"],["bmw_kg_black","Black"]].map(([k,l]) => (
                <div key={k}>
                  <label className="text-xs font-medium">{l}</label>
                  <Input type="number" placeholder="0" value={(form as any)[k]}
                    onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))} />
                </div>
              ))}
            </div>

            <div>
              <label className="text-xs font-medium">Carbon Offset (kg)</label>
              <Input type="number" placeholder="0" value={form.carbon_offset_kg}
                onChange={e => setForm(f => ({ ...f, carbon_offset_kg: e.target.value }))} />
            </div>

            <div>
              <label className="text-xs font-medium">Green Initiatives (optional)</label>
              <textarea className="w-full mt-1 border rounded-md px-3 py-2 text-sm bg-background resize-none" rows={2}
                placeholder="Solar panels installed, rainwater harvesting…"
                value={form.initiatives_text} onChange={e => setForm(f => ({ ...f, initiatives_text: e.target.value }))} />
            </div>

            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button size="sm" onClick={saveMetrics} disabled={saving}>{saving ? "Saving…" : "Save ESG Data"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ESGTab;
