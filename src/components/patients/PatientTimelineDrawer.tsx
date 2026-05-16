import React, { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Stethoscope, BedDouble, FlaskConical, Scan, Pill, Scissors,
  AlertTriangle, Activity, Calendar, User, Loader2, Printer, ChevronDown, ChevronRight,
} from "lucide-react";

type Patient = {
  id: string;
  uhid: string;
  full_name: string;
  phone: string | null;
  gender: string | null;
  dob: string | null;
  blood_group: string | null;
  allergies: string | null;
  chronic_conditions: string[] | null;
  abha_id: string | null;
};

type EventType = "opd" | "ipd" | "lab" | "radiology" | "pharmacy" | "surgery";

type TimelineEvent = {
  id: string;
  type: EventType;
  date: string; // ISO
  title: string;
  subtitle?: string;
  details?: Record<string, any>;
};

const TYPE_META: Record<EventType, { color: string; bg: string; icon: React.ElementType; label: string }> = {
  opd:       { color: "border-l-blue-500",   bg: "bg-blue-50 dark:bg-blue-950/30",     icon: Stethoscope,  label: "OPD Visit" },
  ipd:       { color: "border-l-green-600",  bg: "bg-green-50 dark:bg-green-950/30",   icon: BedDouble,    label: "IPD Admission" },
  lab:       { color: "border-l-purple-500", bg: "bg-purple-50 dark:bg-purple-950/30", icon: FlaskConical, label: "Lab Order" },
  radiology: { color: "border-l-orange-500", bg: "bg-orange-50 dark:bg-orange-950/30", icon: Scan,         label: "Radiology" },
  pharmacy:  { color: "border-l-pink-500",   bg: "bg-pink-50 dark:bg-pink-950/30",     icon: Pill,         label: "Pharmacy" },
  surgery:   { color: "border-l-teal-600",   bg: "bg-teal-50 dark:bg-teal-950/30",     icon: Scissors,     label: "Surgery" },
};

function calcAge(dob: string | null): string {
  if (!dob) return "—";
  const y = Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 24 * 3600 * 1000));
  return `${y}y`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

interface Props {
  patient: Patient;
  onClose: () => void;
}

const PatientTimelineDrawer: React.FC<Props> = ({ patient, onClose }) => {
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [activeMedsCount, setActiveMedsCount] = useState(0);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const pid = patient.id;

      const [opdEnc, opdTok, adm, labOrders, radOrders, pharm, surg] = await Promise.all([
        supabase.from("opd_encounters")
          .select("id, visit_date, created_at, diagnosis, icd10_code, chief_complaint, doctor:users!opd_encounters_doctor_id_fkey(full_name)")
          .eq("patient_id", pid).order("created_at", { ascending: false }).limit(200),
        supabase.from("opd_tokens")
          .select("id, visit_date, created_at, token_number, status, doctor:users!opd_tokens_doctor_id_fkey(full_name)")
          .eq("patient_id", pid).order("created_at", { ascending: false }).limit(200),
        supabase.from("admissions")
          .select("id, admitted_at, discharged_at, admission_number, admitting_diagnosis, status, ward:wards(name), doctor:users!admissions_admitting_doctor_id_fkey(full_name)")
          .eq("patient_id", pid).order("admitted_at", { ascending: false }).limit(100),
        supabase.from("lab_orders")
          .select("id, order_date, order_time, created_at, status, clinical_notes, items:lab_order_items(id, result_value, result_unit, result_flag, status, test:lab_test_master(test_name))")
          .eq("patient_id", pid).order("created_at", { ascending: false }).limit(100),
        supabase.from("radiology_orders")
          .select("id, order_date, created_at, study_name, modality_type, body_part, status, indication")
          .eq("patient_id", pid).order("created_at", { ascending: false }).limit(100),
        supabase.from("pharmacy_dispensing")
          .select("id, dispensed_at, created_at, dispensing_number, status, total_amount, dispensing_type")
          .eq("patient_id", pid).order("created_at", { ascending: false }).limit(100),
        supabase.from("ot_schedules")
          .select("id, scheduled_date, scheduled_start_time, surgery_name, surgery_category, status, surgeon:users!ot_schedules_surgeon_id_fkey(full_name)")
          .eq("patient_id", pid).order("scheduled_date", { ascending: false }).limit(100),
      ]);

      if (cancelled) return;

      const evs: TimelineEvent[] = [];
      const encByToken = new Map<string, any>();
      (opdEnc.data || []).forEach((e: any) => { if (e.token_id) encByToken.set(e.token_id, e); });

      (opdEnc.data || []).forEach((e: any) => {
        const dt = e.visit_date || e.created_at;
        if (!dt) return;
        evs.push({
          id: `enc-${e.id}`, type: "opd", date: dt,
          title: e.diagnosis || e.chief_complaint || "OPD Consultation",
          subtitle: `${e.doctor?.full_name ? `Dr. ${e.doctor.full_name}` : "Doctor"}${e.icd10_code ? ` · ICD ${e.icd10_code}` : ""}`,
          details: { "Chief Complaint": e.chief_complaint, "Diagnosis": e.diagnosis, "ICD-10": e.icd10_code },
        });
      });

      (opdTok.data || []).forEach((t: any) => {
        // Skip if already represented by an encounter
        if ([...encByToken.values()].some((e: any) => e.token_id === t.id)) return;
        const dt = t.created_at || t.visit_date;
        if (!dt) return;
        evs.push({
          id: `tok-${t.id}`, type: "opd", date: dt,
          title: `OPD Token ${t.token_number}`,
          subtitle: `${t.doctor?.full_name ? `Dr. ${t.doctor.full_name}` : "—"} · ${t.status}`,
        });
      });

      (adm.data || []).forEach((a: any) => {
        const dt = a.admitted_at;
        if (!dt) return;
        evs.push({
          id: `adm-${a.id}`, type: "ipd", date: dt,
          title: `Admission ${a.admission_number || ""}`.trim(),
          subtitle: `${a.ward?.name || "Ward"} · ${a.admitting_diagnosis || a.status}`,
          details: {
            "Admitted": a.admitted_at && fmtDate(a.admitted_at),
            "Discharged": a.discharged_at ? fmtDate(a.discharged_at) : "Active",
            "Diagnosis": a.admitting_diagnosis,
            "Doctor": a.doctor?.full_name && `Dr. ${a.doctor.full_name}`,
          },
        });
      });

      (labOrders.data || []).forEach((o: any) => {
        const dt = o.created_at || `${o.order_date}T${o.order_time || "00:00:00"}`;
        const tests = (o.items || []).map((i: any) => i.test?.test_name).filter(Boolean);
        evs.push({
          id: `lab-${o.id}`, type: "lab", date: dt,
          title: tests.length ? tests.slice(0, 3).join(", ") + (tests.length > 3 ? ` +${tests.length - 3}` : "") : "Lab Order",
          subtitle: `${o.items?.length || 0} test(s) · ${o.status}`,
          details: {
            results: (o.items || []).map((i: any) => ({
              name: i.test?.test_name,
              value: i.result_value,
              unit: i.result_unit,
              flag: i.result_flag,
            })),
            notes: o.clinical_notes,
          },
        });
      });

      (radOrders.data || []).forEach((r: any) => {
        const dt = r.created_at || r.order_date;
        evs.push({
          id: `rad-${r.id}`, type: "radiology", date: dt,
          title: r.study_name || "Radiology Study",
          subtitle: `${r.modality_type || ""}${r.body_part ? ` · ${r.body_part}` : ""} · ${r.status}`,
          details: { "Indication": r.indication },
        });
      });

      (pharm.data || []).forEach((p: any) => {
        const dt = p.dispensed_at || p.created_at;
        if (!dt) return;
        evs.push({
          id: `ph-${p.id}`, type: "pharmacy", date: dt,
          title: `Pharmacy Dispense ${p.dispensing_number || ""}`.trim(),
          subtitle: `${p.dispensing_type || "—"} · ₹${Number(p.total_amount || 0).toFixed(2)} · ${p.status || ""}`,
        });
      });

      (surg.data || []).forEach((s: any) => {
        const dt = `${s.scheduled_date}T${s.scheduled_start_time || "00:00:00"}`;
        evs.push({
          id: `ot-${s.id}`, type: "surgery", date: dt,
          title: s.surgery_name || "Surgery",
          subtitle: `${s.surgery_category || ""} · ${s.surgeon?.full_name ? `Dr. ${s.surgeon.full_name}` : ""} · ${s.status}`,
        });
      });

      evs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setEvents(evs);

      // Active medications count: pharmacy dispenses in last 30 days
      const cutoff = Date.now() - 30 * 24 * 3600 * 1000;
      const activeMeds = (pharm.data || []).filter((p: any) => {
        const t = new Date(p.dispensed_at || p.created_at).getTime();
        return t >= cutoff;
      }).length;
      setActiveMedsCount(activeMeds);

      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [patient.id]);

  const stats = useMemo(() => {
    const opdVisits = events.filter(e => e.type === "opd").length;
    const admissions = events.filter(e => e.type === "ipd").length;
    const lastVisit = events[0]?.date;
    return { opdVisits, admissions, lastVisit };
  }, [events]);

  const toggle = (id: string) => {
    setExpanded(prev => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id); else s.add(id);
      return s;
    });
  };

  const exportPDF = () => {
    const w = window.open("", "_blank", "width=900,height=700");
    if (!w) return;
    const rows = events.map(e => `
      <tr>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;white-space:nowrap;font-family:monospace;font-size:11px;">${fmtDate(e.date)}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;font-size:11px;color:#555;">${TYPE_META[e.type].label}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;font-size:12px;"><b>${e.title || ""}</b>${e.subtitle ? `<br/><span style="color:#666;font-size:11px;">${e.subtitle}</span>` : ""}</td>
      </tr>`).join("");
    w.document.write(`<!doctype html><html><head><title>Medical Timeline - ${patient.full_name}</title>
      <style>body{font-family:Inter,system-ui,Arial;padding:24px;color:#0F172A;}h1{margin:0 0 4px;font-size:20px;}h2{margin:18px 0 8px;font-size:14px;color:#334155;}table{width:100%;border-collapse:collapse;}.meta{color:#475569;font-size:12px;}</style></head><body>
      <h1>Medical Timeline</h1>
      <div class="meta">${patient.full_name} · UHID ${patient.uhid} · ${calcAge(patient.dob)}${patient.gender ? ` / ${patient.gender}` : ""}${patient.blood_group ? ` · Blood ${patient.blood_group}` : ""}</div>
      ${patient.allergies ? `<div class="meta" style="color:#b91c1c;margin-top:6px;"><b>Allergies:</b> ${patient.allergies}</div>` : ""}
      ${patient.chronic_conditions?.length ? `<div class="meta" style="margin-top:4px;"><b>Chronic:</b> ${patient.chronic_conditions.join(", ")}</div>` : ""}
      <h2>Summary</h2>
      <div class="meta">OPD Visits: ${stats.opdVisits} · Admissions: ${stats.admissions} · Last activity: ${stats.lastVisit ? fmtDate(stats.lastVisit) : "—"}</div>
      <h2>Events (${events.length})</h2>
      <table>${rows || `<tr><td style="padding:12px;color:#666;">No events recorded.</td></tr>`}</table>
      <div style="margin-top:24px;color:#94a3b8;font-size:10px;">Generated ${new Date().toLocaleString("en-IN")} · Aumrti HMS</div>
      <script>window.onload=()=>{setTimeout(()=>window.print(),300);};</script>
      </body></html>`);
    w.document.close();
  };

  return (
    <Sheet open onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="p-0 w-full sm:max-w-none sm:w-[60vw] flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-border bg-card flex-shrink-0">
          <div className="flex items-start gap-4">
            <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <User size={26} className="text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-bold text-foreground">{patient.full_name}</h2>
                <Badge variant="outline" className="font-mono text-[10px]">{patient.uhid}</Badge>
                {patient.blood_group && (
                  <Badge variant="outline" className="text-[10px] border-destructive/40 text-destructive">{patient.blood_group}</Badge>
                )}
                {patient.abha_id && (
                  <Badge variant="secondary" className="text-[10px]">ABHA: {patient.abha_id}</Badge>
                )}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {calcAge(patient.dob)}{patient.gender ? ` · ${patient.gender}` : ""}{patient.phone ? ` · ${patient.phone}` : ""}
              </div>
              {patient.allergies && (
                <div className="mt-2 flex items-center gap-1.5 text-xs">
                  <AlertTriangle size={12} className="text-destructive" />
                  <span className="text-destructive font-medium">Allergies:</span>
                  <span className="text-foreground">{patient.allergies}</span>
                </div>
              )}
              {patient.chronic_conditions && patient.chronic_conditions.length > 0 && (
                <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                  {patient.chronic_conditions.map((c, i) => (
                    <Badge key={i} variant="outline" className="text-[10px] border-amber-400 text-amber-700 dark:text-amber-400">{c}</Badge>
                  ))}
                </div>
              )}
            </div>
            <Button size="sm" variant="outline" onClick={exportPDF} className="flex-shrink-0">
              <Printer size={14} /> Export PDF
            </Button>
          </div>
        </div>

        {/* Summary */}
        <div className="px-5 py-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 border-b border-border bg-muted/30 flex-shrink-0">
          <SummaryStat icon={Stethoscope} label="OPD Visits" value={stats.opdVisits} />
          <SummaryStat icon={BedDouble} label="Admissions" value={stats.admissions} />
          <SummaryStat icon={Calendar} label="Last Activity" value={stats.lastVisit ? new Date(stats.lastVisit).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : "—"} />
          <SummaryStat icon={Pill} label="Active Meds (30d)" value={activeMedsCount} />
          <SummaryStat icon={AlertTriangle} label="Allergies" value={patient.allergies ? "Yes" : "None"} />
          <SummaryStat icon={Activity} label="Chronic" value={patient.chronic_conditions?.length || 0} />
        </div>

        {/* Timeline feed */}
        <div className="flex-1 overflow-auto px-5 py-4 bg-background">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : events.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Calendar size={36} className="mx-auto opacity-40 mb-2" />
              <p className="text-sm">No medical history recorded yet.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {events.map((e) => {
                const meta = TYPE_META[e.type];
                const Icon = meta.icon;
                const isOpen = expanded.has(e.id);
                const hasDetails = !!e.details && Object.values(e.details).some(v => v != null && v !== "" && !(Array.isArray(v) && v.length === 0));
                return (
                  <div key={e.id} className={`border-l-4 ${meta.color} ${meta.bg} rounded-r-md`}>
                    <button
                      onClick={() => hasDetails && toggle(e.id)}
                      className={`w-full text-left px-3 py-2.5 flex items-start gap-3 ${hasDetails ? "cursor-pointer" : "cursor-default"}`}
                    >
                      <Icon size={16} className="mt-0.5 text-foreground/70 flex-shrink-0" />
                      <div className="flex-shrink-0 w-24 sm:w-28">
                        <div className="text-[10px] font-mono text-muted-foreground uppercase">{meta.label}</div>
                        <div className="text-[11px] text-foreground/80 font-medium">{fmtDate(e.date)}</div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-foreground truncate">{e.title}</div>
                        {e.subtitle && <div className="text-xs text-muted-foreground truncate">{e.subtitle}</div>}
                      </div>
                      {hasDetails && (
                        isOpen ? <ChevronDown size={14} className="mt-1 text-muted-foreground" /> : <ChevronRight size={14} className="mt-1 text-muted-foreground" />
                      )}
                    </button>
                    {isOpen && hasDetails && (
                      <div className="px-3 pb-3 pt-0 ml-[52px] sm:ml-[156px] text-xs space-y-1 text-foreground/80">
                        <EventDetails details={e.details!} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};

const SummaryStat: React.FC<{ icon: React.ElementType; label: string; value: React.ReactNode }> = ({ icon: Icon, label, value }) => (
  <div className="flex items-center gap-2 px-2 py-1.5 rounded bg-card border border-border">
    <Icon size={14} className="text-primary flex-shrink-0" />
    <div className="min-w-0">
      <div className="text-[9px] uppercase text-muted-foreground tracking-wide truncate">{label}</div>
      <div className="text-sm font-bold text-foreground truncate">{value}</div>
    </div>
  </div>
);

const EventDetails: React.FC<{ details: Record<string, any> }> = ({ details }) => {
  const entries = Object.entries(details).filter(([_, v]) => v != null && v !== "" && !(Array.isArray(v) && v.length === 0));
  return (
    <>
      {entries.map(([k, v]) => {
        if (k === "results" && Array.isArray(v)) {
          return (
            <div key={k}>
              <div className="font-medium text-foreground/70 mb-0.5">Results:</div>
              <div className="space-y-0.5 ml-2">
                {v.map((r: any, i: number) => (
                  <div key={i} className="flex gap-2">
                    <span className="text-muted-foreground">{r.name || "—"}:</span>
                    <span className={`font-mono ${r.flag === "high" || r.flag === "low" || r.flag === "critical" ? "text-destructive font-bold" : ""}`}>
                      {r.value ?? "—"} {r.unit || ""}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        }
        return (
          <div key={k}>
            <span className="text-muted-foreground capitalize">{k}:</span> <span className="text-foreground">{String(v)}</span>
          </div>
        );
      })}
    </>
  );
};

export default PatientTimelineDrawer;
