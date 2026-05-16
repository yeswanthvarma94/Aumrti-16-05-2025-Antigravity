import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useHospitalId } from "@/hooks/useHospitalId";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { differenceInDays, differenceInHours, addDays, isPast } from "date-fns";
import { cn } from "@/lib/utils";
import { Bot, Hand } from "lucide-react";

interface PreAuthInfo {
  admission_id: string;
  status: string | null;
  approved_amount: number | null;
  intimation_sent_at: string | null;
  intimation_method: string | null;
  is_emergency_admission: boolean;
  valid_until: string | null;
  pre_auth_id: string | null;
}

interface AdmissionRow {
  id: string;
  patient_name: string;
  patient_id: string;
  uhid: string;
  ward_name: string;
  bed_number: string;
  insurance_type: string;
  insurance_id: string | null;
  admitted_at: string;
  doctor_name: string;
  pre_auth_status: string | null;
  pre_auth_approved: number | null;
  intimation_sent_at: string | null;
  intimation_method: string | null;
  is_emergency_admission: boolean;
  valid_until: string | null;
  pre_auth_id: string | null;
  automation_mode: string;
}

interface AdmissionContext {
  admission_id: string;
  patient_id: string;
  patient_name: string;
  insurance_type: string;
}

interface Props {
  onNavigate?: (nav: string, admissionData?: AdmissionContext) => void;
}

function intimationStatus(row: AdmissionRow): string {
  if (row.intimation_sent_at) return "intimated";
  const hoursElapsed = differenceInHours(new Date(), new Date(row.admitted_at));
  const isEmergency = row.is_emergency_admission;
  const windowHours = isEmergency ? 24 : 48;
  if (hoursElapsed > windowHours) return "late_intimation";
  return "not_intimated";
}

function preAuthExpiryStatus(row: AdmissionRow): "expiring" | "expired" | null {
  if (row.pre_auth_status !== "approved" || !row.valid_until) return null;
  const expiry = new Date(row.valid_until);
  if (isPast(expiry)) return "expired";
  const daysLeft = differenceInDays(expiry, new Date());
  if (daysLeft <= 3) return "expiring";
  return null;
}

const IntimateNowPopover: React.FC<{
  row: AdmissionRow;
  onDone: () => void;
}> = ({ row, onDone }) => {
  const [open, setOpen] = useState(false);
  const [admType, setAdmType] = useState<"emergency" | "planned">(row.is_emergency_admission ? "emergency" : "planned");
  const [method, setMethod] = useState("phone");
  const [intimationTime, setIntimationTime] = useState(() => new Date().toISOString().slice(0, 16));
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const { hospitalId } = useHospitalId();

  const confirm = async () => {
    if (!hospitalId) return;
    setSaving(true);
    await (supabase as any)
      .from("insurance_pre_auth")
      .update({
        intimation_sent_at: new Date(intimationTime).toISOString(),
        intimation_method: method,
        is_emergency_admission: admType === "emergency",
      })
      .eq("admission_id", row.id)
      .eq("hospital_id", hospitalId);
    toast({ title: "Intimation recorded ✓" });
    setSaving(false);
    setOpen(false);
    onDone();
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" className="text-xs h-7 border-amber-400 text-amber-700 hover:bg-amber-50">
          Intimate Now
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-4 space-y-3" align="end">
        <p className="text-sm font-semibold">Record Intimation</p>

        <div>
          <Label className="text-sm font-medium">Admission Type</Label>
          <div className="flex gap-4 mt-1">
            {(["emergency", "planned"] as const).map(t => (
              <label key={t} className="flex items-center gap-1.5 text-sm cursor-pointer">
                <input type="radio" checked={admType === t} onChange={() => setAdmType(t)} />
                {t === "emergency" ? "Emergency (24h)" : "Planned (48h)"}
              </label>
            ))}
          </div>
        </div>

        <div>
          <Label className="text-sm font-medium">Date &amp; Time of Intimation</Label>
          <input
            type="datetime-local"
            className="mt-1 w-full text-sm border border-input rounded-md px-3 py-1.5 bg-background"
            value={intimationTime}
            onChange={e => setIntimationTime(e.target.value)}
          />
        </div>

        <div>
          <Label className="text-sm font-medium">Method</Label>
          <Select value={method} onValueChange={setMethod}>
            <SelectTrigger className="mt-1 h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="phone">Phone Call</SelectItem>
              <SelectItem value="email">Email</SelectItem>
              <SelectItem value="portal">TPA Portal</SelectItem>
              <SelectItem value="walk-in">Walk-in</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button size="sm" className="w-full" onClick={confirm} disabled={saving}>
          {saving ? "Saving…" : "Confirm Intimation"}
        </Button>
      </PopoverContent>
    </Popover>
  );
};

const ActiveAdmissions: React.FC<Props> = ({ onNavigate }) => {
  const [rows, setRows] = useState<AdmissionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [manualModeRows, setManualModeRows] = useState<Set<string>>(new Set());
  const { hospitalId } = useHospitalId();
  const { toast } = useToast();

  const isManual = (row: AdmissionRow) =>
    row.automation_mode === "manual" || manualModeRows.has(row.id);

  const toggleManualMode = async (row: AdmissionRow) => {
    const newMode = isManual(row) ? "auto" : "manual";
    setManualModeRows(prev => {
      const next = new Set(prev);
      if (newMode === "manual") next.add(row.id);
      else next.delete(row.id);
      return next;
    });

    if (row.pre_auth_id) {
      await (supabase as any)
        .from("insurance_pre_auth")
        .update({ automation_mode: newMode })
        .eq("id", row.pre_auth_id);
    }

    if (hospitalId) {
      await (supabase as any).from("insurance_automation_log").insert({
        hospital_id: hospitalId,
        admission_id: row.id,
        pre_auth_id: row.pre_auth_id,
        event_type: "manual_override",
        status: "success",
        triggered_by: "staff",
        notes: `Switched to ${newMode} mode`,
      });
    }

    toast({
      title: newMode === "manual" ? "Manual mode enabled" : "Automation restored",
      description: newMode === "manual"
        ? "All manual action buttons are now visible for this patient."
        : "Automation will handle this patient's workflow again.",
    });
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    const { data: admissions } = await supabase
      .from("admissions")
      .select(`id, admitted_at, insurance_type, insurance_id, patient_id, ward_id, bed_id, admitting_doctor_id`)
      .eq("status", "active")
      .neq("insurance_type", "self_pay");

    if (!admissions?.length) { setRows([]); setLoading(false); return; }

    const patientIds = [...new Set(admissions.map(a => a.patient_id))];
    const wardIds = [...new Set(admissions.map(a => a.ward_id))];
    const bedIds = [...new Set(admissions.map(a => a.bed_id))];
    const doctorIds = [...new Set(admissions.map(a => a.admitting_doctor_id))];
    const admissionIds = admissions.map(a => a.id);

    const [pRes, wRes, bRes, dRes, paRes] = await Promise.all([
      supabase.from("patients").select("id, full_name, uhid").in("id", patientIds),
      supabase.from("wards").select("id, name").in("id", wardIds),
      supabase.from("beds").select("id, bed_number, status").in("id", bedIds),
      supabase.from("users").select("id, full_name").in("id", doctorIds),
      (supabase as any).from("insurance_pre_auth")
        .select("id, admission_id, status, approved_amount, intimation_sent_at, intimation_method, is_emergency_admission, valid_until, automation_mode")
        .in("admission_id", admissionIds),
    ]);

    const pMap = Object.fromEntries((pRes.data || []).map(p => [p.id, p]));
    const wMap = Object.fromEntries((wRes.data || []).map(w => [w.id, w]));
    const bMap = Object.fromEntries((bRes.data || []).map(b => [b.id, b]));
    const dMap = Object.fromEntries((dRes.data || []).map(d => [d.id, d]));
    const paMap = Object.fromEntries((paRes.data || []).map(pa => [pa.admission_id, pa]));

    // Only show admissions where the physical bed is still occupied.
    // Guards against stale 'active' admissions where the patient left but
    // billing clearance was never done so the discharge flow never completed.
    const activeAdmissions = admissions.filter(a => (bMap[a.bed_id] as any)?.status === "occupied");

    setRows(activeAdmissions.map(a => {
      const pa = paMap[a.id] as any;
      return {
        id: a.id,
        patient_name: pMap[a.patient_id]?.full_name || "Unknown",
        patient_id: a.patient_id,
        uhid: pMap[a.patient_id]?.uhid || "",
        ward_name: wMap[a.ward_id]?.name || "",
        bed_number: bMap[a.bed_id]?.bed_number || "",
        insurance_type: a.insurance_type,
        insurance_id: a.insurance_id,
        admitted_at: a.admitted_at,
        doctor_name: dMap[a.admitting_doctor_id]?.full_name || "",
        pre_auth_status: pa?.status || null,
        pre_auth_approved: pa?.approved_amount ? Number(pa.approved_amount) : null,
        intimation_sent_at: pa?.intimation_sent_at || null,
        intimation_method: pa?.intimation_method || null,
        is_emergency_admission: pa?.is_emergency_admission ?? false,
        valid_until: pa?.valid_until || null,
        pre_auth_id: pa?.id || null,
        automation_mode: pa?.automation_mode || "auto",
      };
    }));
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const preAuthBadge = (status: string | null) => {
    if (!status) return <Badge variant="outline" className="text-xs">Not Done</Badge>;
    const map: Record<string, string> = {
      approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
      pending: "bg-amber-50 text-amber-700 border-amber-200",
      submitted: "bg-blue-50 text-blue-700 border-blue-200",
      rejected: "bg-red-50 text-red-700 border-red-200",
    };
    return <Badge variant="outline" className={cn("text-xs capitalize", map[status] || "")}>{status}</Badge>;
  };

  if (loading) return <div className="flex items-center justify-center h-full text-muted-foreground text-sm">Loading...</div>;

  return (
    <div className="h-full overflow-auto p-4">
      <div className="bg-background rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Patient</TableHead>
              <TableHead className="text-xs">UHID</TableHead>
              <TableHead className="text-xs">Ward / Bed</TableHead>
              <TableHead className="text-xs">Insurance</TableHead>
              <TableHead className="text-xs">Pre-Auth</TableHead>
              <TableHead className="text-xs">Intimation</TableHead>
              <TableHead className="text-xs">Auth Validity</TableHead>
              <TableHead className="text-xs">Days</TableHead>
              <TableHead className="text-xs">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground text-sm py-8">
                  No active insurance admissions
                </TableCell>
              </TableRow>
            ) : rows.map(r => {
              const days = differenceInDays(new Date(), new Date(r.admitted_at));
              const intStatus = intimationStatus(r);
              const expiryStatus = preAuthExpiryStatus(r);

              return (
                <TableRow key={r.id}>
                  <TableCell className="text-sm font-medium">{r.patient_name}</TableCell>
                  <TableCell><Badge variant="secondary" className="text-xs font-mono">{r.uhid}</Badge></TableCell>
                  <TableCell className="text-xs text-muted-foreground">{r.ward_name} · Bed {r.bed_number}</TableCell>
                  <TableCell className="text-xs capitalize">{r.insurance_type.replace("_", " ")}</TableCell>
                  <TableCell>{preAuthBadge(r.pre_auth_status)}</TableCell>

                  <TableCell>
                    <StatusBadge status={intStatus} />
                  </TableCell>

                  <TableCell>
                    {expiryStatus === "expired" && <StatusBadge status="preauth_expired" />}
                    {expiryStatus === "expiring" && <StatusBadge status="preauth_expiring" />}
                  </TableCell>

                  <TableCell className={cn("text-xs font-medium tabular-nums", days > 45 ? "text-destructive" : "")}>{days}</TableCell>

                  <TableCell>
                    <div className="flex gap-1.5 flex-wrap items-center">
                      {/* Manual / Auto mode toggle */}
                      {r.pre_auth_id && (
                        <button
                          onClick={() => toggleManualMode(r)}
                          title={isManual(r) ? "Manual mode — click to restore automation" : "Auto mode — click to switch to manual"}
                          className={cn(
                            "h-6 w-6 rounded flex items-center justify-center border transition-colors shrink-0",
                            isManual(r)
                              ? "border-amber-400 bg-amber-50 text-amber-700 hover:bg-amber-100"
                              : "border-violet-200 bg-violet-50 text-violet-600 hover:bg-violet-100"
                          )}
                        >
                          {isManual(r) ? <Hand size={12} /> : <Bot size={12} />}
                        </button>
                      )}

                      {/* Intimate Now — shown when no intimation, OR in manual mode (re-record override) */}
                      {r.pre_auth_status && (!r.intimation_sent_at || isManual(r)) && (
                        <IntimateNowPopover row={r} onDone={loadData} />
                      )}

                      {/* Request Pre-Auth — shown when not started, or in manual mode */}
                      {(!r.pre_auth_status || isManual(r)) && (
                        <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => onNavigate?.("preauth", {
                          admission_id: r.id,
                          patient_id: r.patient_id,
                          patient_name: r.patient_name,
                          insurance_type: r.insurance_type,
                        })}>
                          {r.pre_auth_status && isManual(r) ? "Re-Submit Pre-Auth" : "Request Pre-Auth"}
                        </Button>
                      )}

                      {/* Request Extension — only if approved and expiring */}
                      {r.pre_auth_status === "approved" && expiryStatus && (
                        <Button size="sm" variant="outline" className="text-xs h-7 border-amber-400 text-amber-700 hover:bg-amber-50"
                          onClick={() => onNavigate?.("preauth", {
                            admission_id: r.id,
                            patient_id: r.patient_id,
                            patient_name: r.patient_name,
                            insurance_type: r.insurance_type,
                          })}>
                          Extend Auth
                        </Button>
                      )}

                      {/* View — fallback when automation has handled everything */}
                      {r.pre_auth_status && !expiryStatus && r.intimation_sent_at && !isManual(r) && (
                        <Button size="sm" variant="ghost" className="text-xs h-7">View</Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default ActiveAdmissions;
