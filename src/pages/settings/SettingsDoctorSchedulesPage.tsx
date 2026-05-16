import React, { useState, useEffect } from "react";
import SettingsPageWrapper from "@/components/settings/SettingsPageWrapper";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, Search, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useHospitalId } from "@/hooks/useHospitalId";

const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

interface Session { start: string; end: string; maxPatients: number; slotDuration: number; }
interface Doctor { id: string; full_name: string; department_name: string | null; role: string; hasSchedule?: boolean; }

const SettingsDoctorSchedulesPage: React.FC = () => {
  const { toast } = useToast();
  const { hospitalId } = useHospitalId();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loadingDoctors, setLoadingDoctors] = useState(true);
  const [loadingSchedule, setLoadingSchedule] = useState(false);
  const [saving, setSaving] = useState(false);
  const [workingDays, setWorkingDays] = useState<string[]>(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);
  const [sessions, setSessions] = useState<Session[]>([
    { start: "09:00", end: "13:00", maxPatients: 30, slotDuration: 15 },
    { start: "17:00", end: "20:00", maxPatients: 20, slotDuration: 15 },
  ]);
  const [fee, setFee] = useState("500");
  const [advanceDays, setAdvanceDays] = useState("30");

  // Load doctors
  useEffect(() => {
    if (!hospitalId) return;
    const fetchDoctors = async () => {
      setLoadingDoctors(true);
      try {
        const { data, error } = await supabase
          .from("users")
          .select("id, full_name, role, departments(name)")
          .eq("hospital_id", hospitalId)
          .eq("role", "doctor")
          .order("full_name");
        if (error) throw error;

        // Check which have schedules
        const ids = (data || []).map((d: any) => d.id);
        let scheduleSet = new Set<string>();
        if (ids.length) {
          const { data: scheds } = await supabase
            .from("doctor_schedules")
            .select("doctor_id")
            .eq("hospital_id", hospitalId)
            .in("doctor_id", ids);
          scheduleSet = new Set((scheds || []).map((s: any) => s.doctor_id));
        }
        setDoctors((data || []).map((d: any) => ({
          id: d.id,
          full_name: d.full_name,
          role: d.role,
          department_name: d.departments?.name || null,
          hasSchedule: scheduleSet.has(d.id),
        })));
      } catch (e: any) {
        console.error("Failed to load doctors:", e);
        toast({ title: "Failed to load doctors", description: e.message, variant: "destructive" });
      } finally {
        setLoadingDoctors(false);
      }
    };
    fetchDoctors();
  }, [hospitalId, toast]);

  // Load schedule when doctor selected
  useEffect(() => {
    if (!selected || !hospitalId) return;
    const loadSchedule = async () => {
      setLoadingSchedule(true);
      try {
        const { data, error } = await supabase
          .from("doctor_schedules")
          .select("*")
          .eq("hospital_id", hospitalId)
          .eq("doctor_id", selected)
          .eq("is_active", true)
          .order("session_start");
        if (error) throw error;
        if (data && data.length > 0) {
          const uniqueDays = Array.from(new Set(data.map((r: any) => r.day_of_week)));
          setWorkingDays(uniqueDays);
          const uniqueSessions = new Map<string, Session>();
          data.forEach((r: any) => {
            const key = `${r.session_start}-${r.session_end}`;
            if (!uniqueSessions.has(key)) {
              uniqueSessions.set(key, {
                start: (r.session_start || "").slice(0, 5),
                end: (r.session_end || "").slice(0, 5),
                maxPatients: r.max_patients || 30,
                slotDuration: r.slot_duration_minutes || 15,
              });
            }
          });
          setSessions(Array.from(uniqueSessions.values()));
        } else {
          setWorkingDays(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);
          setSessions([
            { start: "09:00", end: "13:00", maxPatients: 30, slotDuration: 15 },
            { start: "17:00", end: "20:00", maxPatients: 20, slotDuration: 15 },
          ]);
        }
      } catch (e: any) {
        console.error("Failed to load schedule:", e);
        toast({ title: "Failed to load schedule", description: e.message, variant: "destructive" });
      } finally {
        setLoadingSchedule(false);
      }
    };
    loadSchedule();
  }, [selected, hospitalId, toast]);

  const doctor = doctors.find((d) => d.id === selected);
  const filtered = doctors.filter((d) => (d.full_name || "").toLowerCase().includes(search.toLowerCase()));

  const handleSave = async () => {
    if (!hospitalId || !selected) return;
    if (sessions.some((s) => !s.start || !s.end)) {
      toast({ title: "Invalid session times", description: "Please fill all session start/end times.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      // Delete existing schedules for this doctor, then insert fresh
      const { error: delErr } = await supabase
        .from("doctor_schedules")
        .delete()
        .eq("hospital_id", hospitalId)
        .eq("doctor_id", selected);
      if (delErr) throw delErr;

      const rows = workingDays.flatMap((day) =>
        sessions.map((s) => ({
          hospital_id: hospitalId,
          doctor_id: selected,
          day_of_week: day,
          session_start: s.start,
          session_end: s.end,
          max_patients: s.maxPatients,
          slot_duration_minutes: s.slotDuration,
          is_active: true,
        }))
      );

      if (rows.length > 0) {
        const { error: insErr } = await supabase
          .from("doctor_schedules")
          .upsert(rows, { onConflict: "hospital_id,doctor_id,day_of_week,session_start" });
        if (insErr) throw insErr;
      }

      setDoctors((prev) => prev.map((d) => (d.id === selected ? { ...d, hasSchedule: rows.length > 0 } : d)));
      toast({ title: `Schedule saved for ${doctor?.full_name}` });
    } catch (e: any) {
      console.error("Save schedule failed:", e);
      toast({ title: "Failed to save schedule", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <SettingsPageWrapper title="Doctor Schedules" hideSave>
      <div className="flex gap-6 -mx-4">
        <div className="w-[260px] flex-shrink-0 border-r border-border pr-4">
          <div className="relative mb-3">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search doctors..." className="pl-9 h-9" />
          </div>
          <div className="space-y-1">
            {loadingDoctors ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground text-sm gap-2">
                <Loader2 size={14} className="animate-spin" /> Loading doctors...
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm px-2">
                No doctors found. Add staff in Settings → Staff.
              </div>
            ) : (
              filtered.map((d) => (
                <button key={d.id} onClick={() => setSelected(d.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors ${selected === d.id ? "bg-accent text-accent-foreground" : "hover:bg-muted"}`}>
                  <p className="text-sm font-medium text-foreground">{d.full_name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-muted-foreground">{d.department_name || d.role}</span>
                    <Badge variant={d.hasSchedule ? "default" : "destructive"} className="text-[10px] h-4">{d.hasSchedule ? "Set" : "Not set"}</Badge>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="flex-1">
          {!doctor ? (
            <div className="text-center py-20 text-muted-foreground text-sm">Select a doctor to edit their schedule</div>
          ) : loadingSchedule ? (
            <div className="flex items-center justify-center py-20 text-muted-foreground text-sm gap-2">
              <Loader2 size={14} className="animate-spin" /> Loading schedule...
            </div>
          ) : (
            <div className="space-y-6">
              <h2 className="text-base font-semibold text-foreground">{doctor.full_name} — Schedule</h2>

              <section>
                <Label className="mb-2 block">Working Days</Label>
                <div className="flex gap-2">
                  {days.map((d) => (
                    <label key={d} className="flex items-center gap-1.5 text-sm">
                      <Checkbox checked={workingDays.includes(d)} onCheckedChange={(v) => setWorkingDays(v ? [...workingDays, d] : workingDays.filter((x) => x !== d))} />
                      {d}
                    </label>
                  ))}
                </div>
              </section>

              <section>
                <div className="flex items-center justify-between mb-2">
                  <Label>OPD Sessions</Label>
                  <Button size="sm" variant="outline" onClick={() => setSessions([...sessions, { start: "", end: "", maxPatients: 20, slotDuration: 15 }])} className="gap-1 h-7"><Plus size={12} /> Add Session</Button>
                </div>
                {sessions.map((s, i) => (
                  <div key={i} className="flex gap-3 items-center mb-2">
                    <Input type="time" value={s.start} onChange={(e) => { const n = [...sessions]; n[i].start = e.target.value; setSessions(n); }} className="h-8 w-28" />
                    <span className="text-xs text-muted-foreground">to</span>
                    <Input type="time" value={s.end} onChange={(e) => { const n = [...sessions]; n[i].end = e.target.value; setSessions(n); }} className="h-8 w-28" />
                    <Input type="number" value={s.maxPatients} onChange={(e) => { const n = [...sessions]; n[i].maxPatients = +e.target.value; setSessions(n); }} className="h-8 w-20" placeholder="Max" />
                    <Input type="number" value={s.slotDuration} onChange={(e) => { const n = [...sessions]; n[i].slotDuration = +e.target.value; setSessions(n); }} className="h-8 w-20" placeholder="Min" />
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setSessions(sessions.filter((_, j) => j !== i))}><Trash2 size={13} /></Button>
                  </div>
                ))}
              </section>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Consultation Fee (₹)</Label>
                  <Input type="number" value={fee} onChange={(e) => setFee(e.target.value)} className="mt-1.5" />
                </div>
                <div>
                  <Label>Advance Booking (days)</Label>
                  <Input type="number" value={advanceDays} onChange={(e) => setAdvanceDays(e.target.value)} className="mt-1.5" />
                </div>
              </div>

              <Button onClick={handleSave} disabled={saving} className="bg-primary text-primary-foreground">
                {saving ? <><Loader2 size={14} className="animate-spin mr-2" />Saving...</> : "Save Schedule"}
              </Button>
            </div>
          )}
        </div>
      </div>
    </SettingsPageWrapper>
  );
};

export default SettingsDoctorSchedulesPage;
