import React, { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, addDays, subDays, parseISO } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useHospitalId } from "@/hooks/useHospitalId";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight, CalendarDays, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import PatientSearchPicker from "@/components/shared/PatientSearchPicker";
import { sendWhatsApp } from "@/lib/whatsapp-send";
import { cn } from "@/lib/utils";

type DocSchedule = {
  id: string;
  doctor_id: string;
  day_of_week: string;
  session_start: string;
  session_end: string;
  slot_duration_minutes: number;
  doctor?: { full_name: string };
};

type Appt = {
  id: string;
  doctor_id: string;
  patient_id: string;
  appointment_date: string;
  slot_time: string;
  slot_end_time: string;
  status: string;
  visit_type: string;
  chief_complaint: string | null;
  consultation_fee: number;
  patient?: { full_name: string; uhid: string; phone: string | null };
};

type DoctorGroup = {
  doctor_id: string;
  doctor_name: string;
  sessions: DocSchedule[];
};

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}
function minutesToTime(m: number): string {
  const h = Math.floor(m / 60).toString().padStart(2, "0");
  const mm = (m % 60).toString().padStart(2, "0");
  return `${h}:${mm}:00`;
}
function fmtTime(t: string): string {
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hr = h % 12 || 12;
  return `${hr}:${m.toString().padStart(2, "0")} ${ampm}`;
}

const SchedulingPage: React.FC = () => {
  const { hospitalId } = useHospitalId();
  const qc = useQueryClient();
  const [date, setDate] = useState<Date>(new Date());
  const [selectedDoctor, setSelectedDoctor] = useState<string | null>(null);
  const [bookingSlot, setBookingSlot] = useState<{ start: string; end: string; session: DocSchedule } | null>(null);
  const [viewingAppt, setViewingAppt] = useState<Appt | null>(null);

  const dateStr = format(date, "yyyy-MM-dd");
  const dow = DOW[date.getDay()];

  // Doctor schedules for the selected day — only select fields that exist on users
  const { data: schedules = [], isLoading: loadingSchedules, error: schedError } = useQuery({
    queryKey: ["doctor-schedules", hospitalId, dow],
    enabled: !!hospitalId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("doctor_schedules")
        .select("id, doctor_id, day_of_week, session_start, session_end, slot_duration_minutes, doctor:users!doctor_schedules_doctor_id_fkey(full_name)")
        .eq("hospital_id", hospitalId)
        .eq("day_of_week", dow)
        .eq("is_active", true)
        .order("session_start", { ascending: true });
      if (error) throw error;
      return (data as any[]) as DocSchedule[];
    },
  });

  // Appointments for selected date
  const { data: appointments = [] } = useQuery({
    queryKey: ["appointments", hospitalId, dateStr],
    enabled: !!hospitalId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments" as any)
        .select("id, doctor_id, patient_id, appointment_date, slot_time, slot_end_time, status, visit_type, chief_complaint, consultation_fee, patient:patients!appointments_patient_id_fkey(full_name, uhid, phone)")
        .eq("hospital_id", hospitalId)
        .eq("appointment_date", dateStr)
        .neq("status", "cancelled");
      if (error) throw error;
      return (data as any[]) as Appt[];
    },
  });

  const apptsByDoctor = useMemo(() => {
    const m: Record<string, Appt[]> = {};
    for (const a of appointments) {
      (m[a.doctor_id] ||= []).push(a);
    }
    return m;
  }, [appointments]);

  // Group schedules by doctor (multi-session support)
  const doctorGroups = useMemo<DoctorGroup[]>(() => {
    const map = new Map<string, DoctorGroup>();
    for (const s of schedules) {
      if (!map.has(s.doctor_id)) {
        map.set(s.doctor_id, {
          doctor_id: s.doctor_id,
          doctor_name: s.doctor?.full_name || "Doctor",
          sessions: [],
        });
      }
      map.get(s.doctor_id)!.sessions.push(s);
    }
    return Array.from(map.values());
  }, [schedules]);

  const selectedGroup = doctorGroups.find(g => g.doctor_id === selectedDoctor);

  // Build slot list for the selected doctor across ALL sessions
  const sessionsWithSlots = useMemo(() => {
    if (!selectedGroup) return [];
    const docAppts = apptsByDoctor[selectedGroup.doctor_id] || [];
    return selectedGroup.sessions.map(sess => {
      const start = timeToMinutes(sess.session_start);
      const end = timeToMinutes(sess.session_end);
      const dur = sess.slot_duration_minutes || 15;
      const slots: { start: string; end: string; appt?: Appt }[] = [];
      for (let m = start; m + dur <= end; m += dur) {
        const s = minutesToTime(m);
        const e = minutesToTime(m + dur);
        const appt = docAppts.find(a => a.slot_time === s || a.slot_time === s.slice(0, 5));
        slots.push({ start: s, end: e, appt });
      }
      return { session: sess, slots };
    });
  }, [selectedGroup, apptsByDoctor]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["appointments", hospitalId, dateStr] });
  };

  return (
    <div className="h-[calc(100vh-56px)] flex flex-col bg-background">
      {/* Header */}
      <div className="flex-shrink-0 border-b bg-card px-4 py-3 flex items-center gap-3">
        <CalendarDays className="text-primary" size={20} />
        <h1 className="text-lg font-semibold">Appointment Scheduling</h1>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setDate(subDays(date, 1))}>
            <ChevronLeft size={16} />
          </Button>
          <Input
            type="date"
            value={dateStr}
            onChange={(e) => setDate(parseISO(e.target.value))}
            className="w-44 h-9"
          />
          <Button variant="outline" size="sm" onClick={() => setDate(addDays(date, 1))}>
            <ChevronRight size={16} />
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setDate(new Date())}>Today</Button>
        </div>
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-[30%_70%]">
        {/* LEFT: doctor list */}
        <div className="border-r overflow-y-auto p-3 space-y-2 bg-muted/20">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Doctors — {format(date, "EEE, dd MMM yyyy")}
          </div>
          {loadingSchedules && (
            <div className="flex items-center justify-center p-6 text-muted-foreground">
              <Loader2 className="animate-spin mr-2" size={16} /> Loading…
            </div>
          )}
          {schedError && (
            <div className="text-sm text-destructive p-3 bg-destructive/10 rounded">
              Failed to load schedules: {(schedError as Error).message}
            </div>
          )}
          {!loadingSchedules && !schedError && doctorGroups.length === 0 && (
            <div className="text-sm text-muted-foreground p-6 text-center">
              No doctors scheduled for {dow}.
            </div>
          )}
          {doctorGroups.map(g => {
            const docAppts = apptsByDoctor[g.doctor_id] || [];
            const totalSlots = g.sessions.reduce((sum, s) =>
              sum + Math.floor((timeToMinutes(s.session_end) - timeToMinutes(s.session_start)) / (s.slot_duration_minutes || 15)), 0);
            const booked = docAppts.length;
            const available = Math.max(0, totalSlots - booked);
            const active = selectedDoctor === g.doctor_id;
            return (
              <Card
                key={g.doctor_id}
                onClick={() => setSelectedDoctor(g.doctor_id)}
                className={cn(
                  "p-3 cursor-pointer transition-colors hover:border-primary",
                  active && "border-primary bg-primary/5"
                )}
              >
                <div className="font-medium text-sm">{g.doctor_name}</div>
                <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                  {g.sessions.map(s => (
                    <div key={s.id}>
                      {fmtTime(s.session_start)} – {fmtTime(s.session_end)} · {s.slot_duration_minutes}m
                    </div>
                  ))}
                </div>
                <div className="flex gap-1.5 mt-2 flex-wrap">
                  <Badge variant="outline" className="text-[10px]">Total {totalSlots}</Badge>
                  <Badge variant="secondary" className="text-[10px] bg-amber-100 text-amber-800">Booked {booked}</Badge>
                  <Badge variant="secondary" className="text-[10px] bg-emerald-100 text-emerald-800">Free {available}</Badge>
                </div>
              </Card>
            );
          })}
        </div>

        {/* RIGHT: slot grid */}
        <div className="overflow-y-auto p-4">
          {!selectedGroup && (
            <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
              Select a doctor to see available slots.
            </div>
          )}
          {selectedGroup && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold">{selectedGroup.doctor_name}</div>
                  <div className="text-xs text-muted-foreground">
                    {format(date, "dd MMM yyyy")} · {selectedGroup.sessions.length} session(s)
                  </div>
                </div>
                <div className="flex gap-3 text-xs">
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-emerald-500"></span>Available</span>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-muted-foreground/30"></span>Booked</span>
                </div>
              </div>

              {sessionsWithSlots.map(({ session, slots }) => (
                <div key={session.id}>
                  <div className="text-sm font-medium mb-2 pb-1 border-b">
                    Session: {fmtTime(session.session_start)} – {fmtTime(session.session_end)}
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {slots.map(slot => {
                      const isBooked = !!slot.appt;
                      return (
                        <button
                          key={slot.start}
                          onClick={() => isBooked
                            ? setViewingAppt(slot.appt!)
                            : setBookingSlot({ start: slot.start, end: slot.end, session })}
                          className={cn(
                            "p-3 rounded-md border text-left transition-all hover:shadow-sm",
                            isBooked
                              ? "bg-muted/40 border-muted hover:bg-muted/60"
                              : "bg-emerald-50 border-emerald-200 hover:bg-emerald-100"
                          )}
                        >
                          <div className="text-sm font-medium">{fmtTime(slot.start)}</div>
                          {isBooked ? (
                            <div className="text-[11px] text-muted-foreground truncate">
                              {slot.appt?.patient?.full_name || "Booked"}
                            </div>
                          ) : (
                            <div className="text-[11px] text-emerald-700">Available</div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  {slots.length === 0 && (
                    <div className="text-sm text-muted-foreground text-center p-4">No slots configured.</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Booking modal */}
      {bookingSlot && selectedGroup && (
        <BookingModal
          hospitalId={hospitalId!}
          doctorId={selectedGroup.doctor_id}
          doctorName={selectedGroup.doctor_name}
          date={dateStr}
          slot={bookingSlot}
          onClose={() => setBookingSlot(null)}
          onBooked={() => { setBookingSlot(null); refresh(); }}
        />
      )}

      {/* Appointment details / cancel */}
      {viewingAppt && (
        <ApptDetailModal
          appt={viewingAppt}
          onClose={() => setViewingAppt(null)}
          onCancelled={() => { setViewingAppt(null); refresh(); }}
        />
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────
const BookingModal: React.FC<{
  hospitalId: string;
  doctorId: string;
  doctorName: string;
  date: string;
  slot: { start: string; end: string };
  onClose: () => void;
  onBooked: () => void;
}> = ({ hospitalId, doctorId, doctorName, date, slot, onClose, onBooked }) => {
  const [patientId, setPatientId] = useState("");
  const [visitType, setVisitType] = useState<"new" | "follow_up" | "review">("new");
  const [chiefComplaint, setChiefComplaint] = useState("");
  const [fee, setFee] = useState<string>("0");
  const [saving, setSaving] = useState(false);

  // Auto-fill consultation fee
  React.useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("service_rates")
        .select("default_rate")
        .eq("hospital_id", hospitalId)
        .eq("item_code", "consultation")
        .eq("is_active", true)
        .maybeSingle();
      if (data?.default_rate != null) setFee(String(data.default_rate));
    })();
  }, [hospitalId]);

  const handleBook = async () => {
    if (!patientId) { toast.error("Please select a patient"); return; }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: userRow } = await supabase
        .from("users").select("id").eq("auth_user_id", user?.id).maybeSingle();
      const bookedBy = userRow?.id ?? null;

      // Insert appointment
      const { data: appt, error: aerr } = await supabase
        .from("appointments" as any)
        .insert({
          hospital_id: hospitalId,
          patient_id: patientId,
          doctor_id: doctorId,
          appointment_date: date,
          slot_time: slot.start,
          slot_end_time: slot.end,
          status: "scheduled",
          visit_type: visitType,
          chief_complaint: chiefComplaint || null,
          consultation_fee: Number(fee) || 0,
          booked_by: bookedBy,
          booked_via: "reception",
        } as any)
        .select("id")
        .single();
      if (aerr) throw aerr;
      const appointmentId = (appt as any)?.id;

      // Issue OPD token with APT prefix
      const { data: tokenNum } = await supabase.rpc("generate_token_number", {
        p_hospital_id: hospitalId, p_prefix: "APT",
      });

      const { error: terr } = await supabase.from("opd_tokens").insert({
        hospital_id: hospitalId,
        patient_id: patientId,
        doctor_id: doctorId,
        token_number: tokenNum as any,
        token_prefix: "APT",
        visit_date: date,
        status: "waiting",
      } as any);
      if (terr) console.warn("Token insert failed:", terr.message);
      void appointmentId;

      // WhatsApp confirmation
      try {
        const [{ data: pat }, { data: hosp }] = await Promise.all([
          supabase.from("patients").select("full_name, phone").eq("id", patientId).maybeSingle(),
          supabase.from("hospitals").select("name").eq("id", hospitalId).maybeSingle(),
        ]);
        if (pat?.phone) {
          const msg = `Dear ${pat.full_name}, your appointment with Dr. ${doctorName} on ${format(parseISO(date), "dd MMM yyyy")} at ${fmtTime(slot.start)} is confirmed. Token: APT-${tokenNum}. — ${hosp?.name || ""}`;
          await sendWhatsApp({ hospitalId, phone: pat.phone, message: msg });
        }
      } catch (e) { console.warn("WhatsApp send failed", e); }

      toast.success("Appointment booked successfully");
      onBooked();
    } catch (e: any) {
      toast.error(e.message || "Failed to book appointment");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Book Appointment</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="text-sm text-muted-foreground bg-muted/40 rounded p-2">
            <div><b>Dr.</b> {doctorName}</div>
            <div><b>Date:</b> {format(parseISO(date), "dd MMM yyyy")} · <b>Time:</b> {fmtTime(slot.start)}</div>
          </div>
          <div>
            <Label>Patient *</Label>
            <PatientSearchPicker hospitalId={hospitalId} value={patientId} onChange={setPatientId} />
          </div>
          <div>
            <Label>Visit Type</Label>
            <Select value={visitType} onValueChange={(v) => setVisitType(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="new">New</SelectItem>
                <SelectItem value="follow_up">Follow-up</SelectItem>
                <SelectItem value="review">Review</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Chief Complaint</Label>
            <Textarea value={chiefComplaint} onChange={e => setChiefComplaint(e.target.value)} rows={2} placeholder="Brief reason for visit" />
          </div>
          <div>
            <Label>Consultation Fee (₹)</Label>
            <Input type="number" value={fee} onChange={e => setFee(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleBook} disabled={saving}>
            {saving ? <Loader2 className="animate-spin mr-2" size={14} /> : null} Book Appointment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ─────────────────────────────────────────────────────────
const ApptDetailModal: React.FC<{
  appt: Appt;
  onClose: () => void;
  onCancelled: () => void;
}> = ({ appt, onClose, onCancelled }) => {
  const [cancelling, setCancelling] = useState(false);

  const handleCancel = async () => {
    if (!confirm("Cancel this appointment?")) return;
    setCancelling(true);
    try {
      const { error } = await supabase
        .from("appointments" as any)
        .update({ status: "cancelled" } as any)
        .eq("id", appt.id);
      if (error) throw error;

      // Cancel matching opd_token (best-effort match by patient/doctor/date)
      await supabase
        .from("opd_tokens")
        .update({ status: "cancelled" })
        .eq("patient_id", appt.patient_id)
        .eq("doctor_id", appt.doctor_id)
        .eq("visit_date", appt.appointment_date)
        .eq("token_prefix", "APT");

      // WhatsApp cancellation
      try {
        const { data: pat } = await supabase.from("patients").select("full_name, phone, hospital_id").eq("id", appt.patient_id).maybeSingle();
        if (pat?.phone && pat?.hospital_id) {
          const msg = `Dear ${pat.full_name}, your appointment on ${format(parseISO(appt.appointment_date), "dd MMM yyyy")} at ${fmtTime(appt.slot_time)} has been cancelled. Please contact us to reschedule.`;
          await sendWhatsApp({ hospitalId: pat.hospital_id, phone: pat.phone, message: msg });
        }
      } catch (e) { console.warn("WhatsApp cancel send failed", e); }

      toast.success("Appointment cancelled");
      onCancelled();
    } catch (e: any) {
      toast.error(e.message || "Failed to cancel");
    } finally {
      setCancelling(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Appointment Details</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 text-sm">
          <div><b>Patient:</b> {appt.patient?.full_name} ({appt.patient?.uhid})</div>
          {appt.patient?.phone && <div><b>Phone:</b> {appt.patient.phone}</div>}
          <div><b>Time:</b> {fmtTime(appt.slot_time)} – {fmtTime(appt.slot_end_time)}</div>
          <div><b>Visit:</b> <span className="capitalize">{appt.visit_type.replace("_", " ")}</span></div>
          {appt.chief_complaint && <div><b>Complaint:</b> {appt.chief_complaint}</div>}
          <div><b>Status:</b> <Badge variant="secondary" className="capitalize">{appt.status.replace("_", " ")}</Badge></div>
          <div><b>Fee:</b> ₹{Number(appt.consultation_fee || 0).toLocaleString("en-IN")}</div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button variant="destructive" onClick={handleCancel} disabled={cancelling}>
            {cancelling ? <Loader2 className="animate-spin mr-2" size={14} /> : <X size={14} className="mr-1" />}
            Cancel Appointment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SchedulingPage;
