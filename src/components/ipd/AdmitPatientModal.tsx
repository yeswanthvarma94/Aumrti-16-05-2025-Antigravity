import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { AlertTriangle, Info } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { logAudit } from "@/lib/auditLog";
import { generateBillNumber } from "@/hooks/useBillNumber";
import { printAdmissionSlip } from "@/lib/admissionSlip";

interface Props {
  open: boolean;
  onClose: () => void;
  hospitalId: string | null;
  preselectedBedId?: string | null;
  preselectedWardId?: string | null;
  preselectedBedNumber?: string | null;
  preselectedPatientId?: string;
  preselectedPatientName?: string;
  onAdmitted: () => void;
}

interface PatientResult {
  id: string;
  full_name: string;
  uhid: string;
  phone: string | null;
  dob: string | null;
  gender: string | null;
  blood_group: string | null;
  chronic_conditions: string[] | null;
  patient_category?: string | null;
}

const admissionTypes = ["elective", "emergency", "transfer", "daycare"] as const;
const insuranceTypes = ["self_pay", "insurance", "pmjay", "cghs", "echs"] as const;

const AdmitPatientModal: React.FC<Props> = ({ open, onClose, hospitalId, preselectedBedId, preselectedWardId, preselectedBedNumber, preselectedPatientId, preselectedPatientName, onAdmitted }) => {
  const [step, setStep] = useState(1);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<PatientResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchedTerm, setSearchedTerm] = useState("");
  const [selectedPatient, setSelectedPatient] = useState<PatientResult | null>(null);

  // Step 2 fields
  const [admissionType, setAdmissionType] = useState<string>("elective");
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [doctors, setDoctors] = useState<{ id: string; full_name: string; department_id: string | null }[]>([]);
  const [deptId, setDeptId] = useState("");
  const [doctorId, setDoctorId] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [insuranceType, setInsuranceType] = useState("self_pay");
  const [insuranceId, setInsuranceId] = useState("");
  const [expectedDischarge, setExpectedDischarge] = useState("");
  const [bedId, setBedId] = useState(preselectedBedId || "");
  const [wardId, setWardId] = useState(preselectedWardId || "");
  const [bedLabel, setBedLabel] = useState(preselectedBedNumber || "");

  // Wards + beds for selection
  const [availableBeds, setAvailableBeds] = useState<{ id: string; bed_number: string; ward_id: string; ward_name: string; bed_category?: string; oxygen_equipped?: boolean; has_monitor?: boolean }[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [admittedId, setAdmittedId] = useState<string | null>(null);
  const [allergyVerified, setAllergyVerified] = useState(false);
  const [patientAllergies, setPatientAllergies] = useState<string | null>(null);
  const [handoverNotes, setHandoverNotes] = useState("");
  const [handoverPrefilled, setHandoverPrefilled] = useState(false);

  // MLC
  const [isMlcAdm, setIsMlcAdm] = useState(false);
  const [mlcPoliceStation, setMlcPoliceStation] = useState("");

  // Diet order
  const [dietaryInstruction, setDietaryInstruction] = useState("regular");

  // New patient fields
  const [showNewPatient, setShowNewPatient] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newAge, setNewAge] = useState("");
  const [newGender, setNewGender] = useState("male");

  useEffect(() => {
    if (!open) { resetForm(); return; }
    if (!hospitalId) return;
    supabase.from("departments").select("id, name").eq("hospital_id", hospitalId).eq("is_active", true).order("name", { ascending: true })
      .then(({ data }) => setDepartments(data || []));
    supabase.from("users").select("id, full_name, department_id").eq("hospital_id", hospitalId).eq("role", "doctor").eq("is_active", true).order("full_name", { ascending: true })
      .then(({ data }) => setDoctors(data || []));

    if (!preselectedBedId) {
      (supabase as any).from("beds").select("id, bed_number, ward_id, bed_category, oxygen_equipped, has_monitor, ward:wards(name)")
        .eq("hospital_id", hospitalId).eq("status", "available").eq("is_active", true)
        .then(({ data }: any) => {
          setAvailableBeds((data || []).map((b: any) => ({
            id: b.id, bed_number: b.bed_number, ward_id: b.ward_id, ward_name: b.ward?.name || "—",
            bed_category: b.bed_category || "general", oxygen_equipped: b.oxygen_equipped, has_monitor: b.has_monitor,
          })));
        });
    }
  }, [open, hospitalId, preselectedBedId]);

  useEffect(() => {
    if (preselectedBedId) { setBedId(preselectedBedId); setWardId(preselectedWardId || ""); setBedLabel(preselectedBedNumber || ""); }
  }, [preselectedBedId, preselectedWardId, preselectedBedNumber]);

  // Auto-select patient when coming from OPD
  useEffect(() => {
    if (!open || !preselectedPatientId || !hospitalId) return;
    supabase.from("patients")
      .select("id, full_name, uhid, phone, dob, gender, blood_group, chronic_conditions")
      .eq("id", preselectedPatientId)
      .eq("hospital_id", hospitalId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          const p = data as unknown as PatientResult;
          setSelectedPatient(p);
          // Pre-fill insurance type from patient category
          const catToInsurance: Record<string, string> = { pmjay: "pmjay", cghs: "cghs", echs: "echs", esi: "insurance", insurance: "insurance" };
          if (p.patient_category && catToInsurance[p.patient_category]) setInsuranceType(catToInsurance[p.patient_category]);
          setStep(2);
        }
      });
  }, [open, preselectedPatientId, hospitalId]);

  const resetForm = () => {
    setStep(1); setSearch(""); setResults([]); setSearching(false); setSearchedTerm(""); setSelectedPatient(null);
    setAdmissionType("elective"); setDeptId(""); setDoctorId(""); setDiagnosis("");
    setInsuranceType("self_pay"); setInsuranceId(""); setExpectedDischarge("");
    setShowNewPatient(false); setNewName(""); setNewPhone(""); setNewAge(""); setNewGender("male");
    setAllergyVerified(false); setPatientAllergies(null);
    setHandoverNotes(""); setHandoverPrefilled(false);
    setIsMlcAdm(false); setMlcPoliceStation("");
    setDietaryInstruction("regular");
    setAdmittedId(null);
  };

  // Fetch patient allergies when selected
  useEffect(() => {
    if (!selectedPatient) { setPatientAllergies(null); setAllergyVerified(false); return; }
    (supabase as any).from("patients").select("allergies").eq("id", selectedPatient.id).maybeSingle()
      .then(({ data }: any) => setPatientAllergies(data?.allergies || null));
  }, [selectedPatient]);

  // Pre-fill nursing handover notes from most recent OPD encounter
  useEffect(() => {
    if (!selectedPatient || !hospitalId) {
      setHandoverNotes("");
      setHandoverPrefilled(false);
      return;
    }
    (supabase as any)
      .from("opd_encounters")
      .select("chief_complaint, diagnosis, icd10_code, soap_assessment, soap_plan, examination_notes, created_at")
      .eq("patient_id", selectedPatient.id)
      .eq("hospital_id", hospitalId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }: any) => {
        if (!data) {
          setHandoverNotes("");
          setHandoverPrefilled(false);
          return;
        }
        const today = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
        const lines: string[] = [`Referred from OPD — ${today}`];
        if (data.chief_complaint) lines.push(`Chief Complaint: ${data.chief_complaint}`);
        if (data.diagnosis || data.icd10_code) {
          lines.push(`Diagnosis: ${data.diagnosis || "—"}${data.icd10_code ? ` (${data.icd10_code})` : ""}`);
        }
        if (data.soap_assessment) lines.push(`Assessment: ${data.soap_assessment}`);
        if (data.soap_plan) lines.push(`Plan: ${data.soap_plan}`);
        if (data.examination_notes) lines.push(`Examination: ${data.examination_notes}`);
        setHandoverNotes(lines.join("\n"));
        setHandoverPrefilled(true);
      });
  }, [selectedPatient, hospitalId]);

  // Search patients
  useEffect(() => {
    if (search.length < 2 || !hospitalId) {
      setResults([]);
      setSearching(false);
      setSearchedTerm("");
      return;
    }
    setSearching(true);
    const t = setTimeout(() => {
      supabase.from("patients")
        .select("id, full_name, uhid, phone, dob, gender, blood_group, chronic_conditions")
        .eq("hospital_id", hospitalId)
        .or(`full_name.ilike.%${search}%,phone.ilike.%${search}%,uhid.ilike.%${search}%`)
        .limit(5)
        .then(({ data, error }) => {
          setResults(error ? [] : (data as unknown as PatientResult[]) || []);
          setSearchedTerm(search);
          setSearching(false);
        });
    }, 250);
    return () => { clearTimeout(t); setSearching(false); };
  }, [search, hospitalId]);

  const handleCreatePatient = async () => {
    if (!newName || !hospitalId) return;
    const dob = newAge ? new Date(Date.now() - parseInt(newAge) * 31557600000).toISOString().split("T")[0] : null;
    const uhid = `UHID-${Date.now().toString(36).toUpperCase()}`;
    const { data, error } = await supabase.from("patients").insert({
      hospital_id: hospitalId,
      full_name: newName,
      phone: newPhone || null,
      dob, gender: newGender as any, uhid,
    }).select().maybeSingle();
    if (error || !data) { toast({ title: "Error", description: error?.message || "Failed", variant: "destructive" }); return; }
    setSelectedPatient(data as unknown as PatientResult);
    setShowNewPatient(false);
    toast({ title: `Patient ${newName} registered` });
  };

  const handleAdmit = async () => {
    if (!selectedPatient || !doctorId || !bedId || !hospitalId) {
      toast({ title: "Missing fields", description: "Patient, doctor, and bed are required", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    const seq = Date.now().toString().slice(-4);
    const admNum = `IPD-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${seq}`;

    const { error } = await supabase.from("admissions").insert({
      hospital_id: hospitalId,
      patient_id: selectedPatient.id,
      bed_id: bedId,
      ward_id: wardId,
      admission_number: admNum,
      admission_type: admissionType,
      admitting_doctor_id: doctorId,
      department_id: deptId || null,
      admitting_diagnosis: diagnosis || null,
      insurance_type: insuranceType,
      insurance_id: insuranceType !== "self_pay" ? insuranceId : null,
      expected_discharge_date: expectedDischarge || null,
      nursing_handover_notes: handoverNotes.trim() || null,
      is_mlc: isMlcAdm,
      mlc_number: isMlcAdm ? `MLC-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}` : null,
      police_station: isMlcAdm && mlcPoliceStation.trim() ? mlcPoliceStation.trim() : null,
      police_informed_at: isMlcAdm ? new Date().toISOString() : null,
    } as any);

    if (error) {
      toast({ title: "Admission failed", description: error.message, variant: "destructive" });
      setSubmitting(false);
      return;
    }

    // Update bed status
    await supabase.from("beds").update({ status: "occupied" as any }).eq("id", bedId);

    // Upsert MRD records for this admission
    // We need the admission ID — fetch it
    const { data: newAdm } = await supabase.from("admissions")
      .select("id")
      .eq("hospital_id", hospitalId)
      .eq("admission_number", admNum)
      .maybeSingle();

    if (newAdm) {
      // Diet order at admission
      if (dietaryInstruction) {
        (supabase as any).from("diet_orders").insert({
          hospital_id: hospitalId,
          patient_id: selectedPatient.id,
          admission_id: newAdm.id,
          diet_type: dietaryInstruction,
          ordered_by: doctorId || null,
          order_date: new Date().toISOString(),
          status: "active",
        }).then(() => {});
      }

      (supabase as any).from("medical_records").upsert({
        hospital_id: hospitalId,
        patient_id: selectedPatient.id,
        record_type: "ipd",
        visit_id: newAdm.id,
        status: "active",
      }, { onConflict: "hospital_id,patient_id,record_type,visit_id" }).then(() => {});

      (supabase as any).from("icd_codings").upsert({
        hospital_id: hospitalId,
        visit_type: "ipd",
        visit_id: newAdm.id,
        status: "pending",
      }, { onConflict: "hospital_id,visit_type,visit_id" }).then(() => {});

      // Auto-create a draft IPD bill so the running tab is visible from Day 1
      try {
        const { data: existingIpdBill } = await supabase.from("bills")
          .select("id")
          .eq("hospital_id", hospitalId)
          .eq("admission_id", newAdm.id)
          .eq("bill_type", "ipd")
          .maybeSingle();
        if (!existingIpdBill) {
          const billNumber = await generateBillNumber(hospitalId, "BILL");
          await supabase.from("bills").insert({
            hospital_id: hospitalId,
            bill_number: billNumber,
            patient_id: selectedPatient.id,
            admission_id: newAdm.id,
            bill_type: "ipd",
            bill_status: "draft",
            payment_status: "unpaid",
          });
        }
      } catch (e: any) {
        console.error("Failed to auto-create draft IPD bill:", e?.message || e);
      }

      // Auto-create insurance pre-auth if insurance patient
      if (insuranceType !== "self_pay") {
        const isGovtScheme = ["pmjay", "cghs", "echs"].includes(insuranceType);

        if (isGovtScheme) {
          const { data: scheme } = await supabase
            .from("govt_schemes")
            .select("id")
            .eq("hospital_id", hospitalId)
            .ilike("scheme_code", `%${insuranceType}%`)
            .maybeSingle();

          if (scheme) {
            await (supabase as any).from("pre_auth_requests").insert({
              hospital_id: hospitalId,
              patient_id: selectedPatient.id,
              admission_id: newAdm.id,
              scheme_id: scheme.id,
              package_code: "PENDING",
              package_name: `Pre-auth pending — ${diagnosis || "diagnosis pending"}`,
              requested_amount: 0,
              submission_method: "manual",
              status: "draft",
            });
            toast({ title: "Govt scheme pre-auth created", description: "Visit /pmjay to complete" });
          }
        } else {
          // Estimate amount from service_master based on diagnosis
          let estimatedAmount = 0;
          if (diagnosis) {
            try {
              const { data: svcMatch } = await (supabase as any)
                .from("service_master")
                .select("fee")
                .eq("hospital_id", hospitalId)
                .ilike("name", `%${diagnosis.split(" ").slice(0, 2).join("%")}%`)
                .limit(1)
                .maybeSingle();
              if (svcMatch?.fee) estimatedAmount = Number(svcMatch.fee);
            } catch {}
          }
          await (supabase as any).from("insurance_pre_auth").insert({
            hospital_id: hospitalId,
            patient_id: selectedPatient.id,
            admission_id: newAdm.id,
            insurance_id: insuranceId || null,
            status: "draft",
            insurance_type: insuranceType,
            estimated_amount: estimatedAmount,
          });
          toast({ title: "Insurance pre-auth created", description: `Est. ₹${estimatedAmount.toLocaleString("en-IN")} · Visit /insurance to complete` });
        }
      }
    }

    setSubmitting(false);
    logAudit({ action: "created", module: "ipd", entityType: "admission", entityId: newAdm?.id, details: { patient: selectedPatient.full_name, bed: bedLabel } });
    toast({ title: `${selectedPatient.full_name} admitted`, description: `Bed ${bedLabel} · ${admNum}` });
    setAdmittedId(newAdm?.id || null);
    onAdmitted();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-[520px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg">New Admission</DialogTitle>
          {!admittedId && (
            <div className="flex gap-1 mt-2">
              {[1, 2, 3].map((s) => (
                <div key={s} className={cn("h-1.5 flex-1 rounded-full", step >= s ? "bg-[#1A2F5A]" : "bg-slate-200")} />
              ))}
            </div>
          )}
        </DialogHeader>

        {/* SUCCESS STATE */}
        {admittedId && hospitalId && (
          <div className="text-center py-6 space-y-4">
            <p className="text-2xl">✅</p>
            <p className="text-sm font-semibold text-emerald-600">{selectedPatient?.full_name || "Patient"} successfully admitted</p>
            <div className="flex gap-2 justify-center">
              <Button size="sm" variant="outline" onClick={() => printAdmissionSlip(admittedId, hospitalId)}>
                🖨️ Print Admission Slip
              </Button>
              <Button size="sm" onClick={() => { resetForm(); onClose(); }}>Close</Button>
            </div>
          </div>
        )}

        {/* STEP 1 — Patient */}
        {!admittedId && step === 1 && (
          <div className="space-y-3 mt-2">
            <Input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, phone, or UHID..." className="h-10" />

            {searching && (
              <p className="text-xs text-slate-400 animate-pulse">Searching...</p>
            )}

            {!searching && results.length > 0 && (
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                {results.map((p) => (
                  <button key={p.id} onClick={() => {
                    setSelectedPatient(p);
                    setResults([]);
                    setSearch(p.full_name);
                    const catToInsurance: Record<string, string> = { pmjay: "pmjay", cghs: "cghs", echs: "echs", esi: "insurance", insurance: "insurance" };
                    if (p.patient_category && catToInsurance[p.patient_category]) setInsuranceType(catToInsurance[p.patient_category]);
                  }}
                    className="w-full text-left px-3 py-2 hover:bg-slate-50 border-b border-slate-100 last:border-0 flex justify-between items-center">
                    <div>
                      <p className="text-sm font-medium text-slate-900">{p.full_name}</p>
                      <p className="text-[11px] text-slate-500">{p.uhid} · {p.phone || "No phone"}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {!searching && searchedTerm.length >= 2 && results.length === 0 && !selectedPatient && (
              <p className="text-xs text-slate-500">No patients found for &ldquo;<strong>{searchedTerm}</strong>&rdquo;</p>
            )}

            {selectedPatient && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                <p className="text-xs text-emerald-700 font-medium mb-1">✓ Patient selected</p>
                <p className="text-sm font-bold text-slate-900">{selectedPatient.full_name}</p>
                <p className="text-[11px] text-slate-600">{selectedPatient.uhid} · {selectedPatient.gender} · {selectedPatient.blood_group || "—"}</p>
              </div>
            )}

            {!showNewPatient && !selectedPatient && searchedTerm.length >= 2 && (
              <button onClick={() => setShowNewPatient(true)} className="text-xs text-blue-600 hover:underline">
                Not found? Register new patient →
              </button>
            )}

            {showNewPatient && (
              <div className="border border-slate-200 rounded-lg p-3 space-y-2">
                <p className="text-xs font-bold text-slate-600">New Patient</p>
                <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Full Name *" className="h-9 text-sm" />
                <Input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="Phone" className="h-9 text-sm" type="tel" />
                <div className="flex gap-2">
                  <Input value={newAge} onChange={(e) => setNewAge(e.target.value)} placeholder="Age" className="h-9 text-sm w-20" type="number" />
                  <div className="flex gap-1 flex-1">
                    {(["male", "female", "other"] as const).map((g) => (
                      <button key={g} onClick={() => setNewGender(g)}
                        className={cn("flex-1 h-9 rounded-md text-xs font-medium border transition-colors capitalize",
                          newGender === g ? "bg-[#1A2F5A] text-white border-[#1A2F5A]" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                        )}>{g}</button>
                    ))}
                  </div>
                </div>
                <Button size="sm" onClick={handleCreatePatient} disabled={!newName} className="w-full h-8 text-xs bg-emerald-600 hover:bg-emerald-700">
                  Register Patient
                </Button>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <Button onClick={() => setStep(2)} disabled={!selectedPatient} className="bg-[#1A2F5A] hover:bg-[#152647]">
                Next →
              </Button>
            </div>
          </div>
        )}

        {/* STEP 2 — Details */}
        {!admittedId && step === 2 && (
          <div className="space-y-3 mt-2">
            {/* Admission type */}
            <div>
              <label className="text-xs font-bold text-slate-600 uppercase tracking-wider block mb-1">Admission Type</label>
              <div className="flex gap-1.5">
                {admissionTypes.map((t) => (
                  <button key={t} onClick={() => setAdmissionType(t)}
                    className={cn("flex-1 h-9 rounded-md text-xs font-medium border capitalize transition-colors",
                      admissionType === t ? "bg-[#1A2F5A] text-white border-[#1A2F5A]" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                    )}>{t}</button>
                ))}
              </div>
            </div>

            {/* Dept + Doctor */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">Department</label>
                <select value={deptId} onChange={(e) => { setDeptId(e.target.value); const newDept = e.target.value; const currentDoc = doctors.find(d => d.id === doctorId); if (newDept && currentDoc?.department_id !== newDept) setDoctorId(""); }} className="w-full h-9 text-sm border rounded-md px-2 bg-white">
                  <option value="">Select...</option>
                  {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">Admitting Doctor *</label>
                <select value={doctorId} onChange={(e) => setDoctorId(e.target.value)} className="w-full h-9 text-sm border rounded-md px-2 bg-white">
                  <option value="">{deptId ? "Select doctor..." : "Select department first"}</option>
                  {(deptId ? doctors.filter(d => d.department_id === deptId) : doctors).map((d) => <option key={d.id} value={d.id}>{d.full_name}</option>)}
                </select>
                {doctors.length === 0 && (
                  <Link to="/settings/staff" className="text-[10px] text-amber-600 hover:underline mt-0.5 block">No doctors — add in Settings →</Link>
                )}
              </div>
            </div>

            {/* Diagnosis */}
            <div>
              <label className="text-xs font-bold text-slate-600 block mb-1">Primary Diagnosis</label>
              <Input value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} placeholder="Admitting diagnosis..." className="h-9 text-sm" />
            </div>

            {/* Bed selection */}
            {preselectedBedId ? (
              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">Bed</label>
                <span className="text-sm bg-blue-50 text-blue-700 px-2 py-1 rounded">{bedLabel}</span>
              </div>
            ) : (
              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">Select Bed *</label>
                <select value={bedId} onChange={(e) => {
                  setBedId(e.target.value);
                  const b = availableBeds.find((x) => x.id === e.target.value);
                  if (b) { setWardId(b.ward_id); setBedLabel(`${b.ward_name} - ${b.bed_number}`); }
                }} className="w-full h-9 text-sm border rounded-md px-2 bg-white">
                  <option value="">Select available bed...</option>
                  {availableBeds.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.ward_name} — {b.bed_number}
                      {b.bed_category && b.bed_category !== "general" ? ` [${b.bed_category.toUpperCase()}]` : ""}
                      {b.oxygen_equipped ? " O₂" : ""}
                      {b.has_monitor ? " Mon" : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Insurance */}
            <div>
              <label className="text-xs font-bold text-slate-600 block mb-1">Insurance</label>
              <div className="flex gap-1 flex-wrap">
                {insuranceTypes.map((t) => (
                  <button key={t} onClick={() => setInsuranceType(t)}
                    className={cn("h-8 px-3 rounded-md text-[11px] font-medium border capitalize transition-colors",
                      insuranceType === t ? "bg-[#1A2F5A] text-white border-[#1A2F5A]" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                    )}>{t.replace("_", " ")}</button>
                ))}
              </div>
              {insuranceType !== "self_pay" && (
                <Input value={insuranceId} onChange={(e) => setInsuranceId(e.target.value)}
                  placeholder={insuranceType === "pmjay" ? "PMJAY Card Number" : "Insurance ID"}
                  className="h-9 text-sm mt-2" />
              )}
            </div>

            {/* Allergy Verification — NABH COP Mandatory */}
            {selectedPatient && (
              <div className="p-3 bg-amber-50 border border-amber-300 rounded-lg">
                <div className="flex items-center gap-2 mb-1">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  <span className="text-xs font-bold text-amber-800 uppercase tracking-wider">Allergy Verification (Mandatory)</span>
                </div>
                <p className="text-sm font-medium text-amber-900 mb-2">
                  {patientAllergies && patientAllergies !== "NKDA"
                    ? patientAllergies
                    : patientAllergies === "NKDA"
                    ? "NKDA — No Known Drug Allergies"
                    : "⚠️ No allergies recorded — please ask patient"}
                </p>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={allergyVerified}
                    onChange={(e) => setAllergyVerified(e.target.checked)}
                    className="rounded border-amber-400 accent-amber-600" />
                  <span className="text-xs text-amber-800">
                    I have verified the patient's allergy status with the patient/attendant
                  </span>
                </label>
              </div>
            )}

            {/* Nursing Handover Notes (auto-filled from OPD if available) */}
            <div>
              <label className="text-xs font-bold text-slate-600 block mb-1">Handover Notes for Nursing</label>
              {handoverPrefilled && (
                <div className="flex items-start gap-2 p-2 mb-1.5 rounded-md bg-sky-50 border border-sky-200">
                  <Info className="h-3.5 w-3.5 text-sky-600 mt-0.5 flex-shrink-0" />
                  <span className="text-[11px] text-sky-800 leading-snug">
                    Pre-filled from OPD consultation — please review and update
                  </span>
                </div>
              )}
              <Textarea
                value={handoverNotes}
                onChange={(e) => setHandoverNotes(e.target.value)}
                placeholder="Clinical handover information for the nursing team..."
                className="text-sm min-h-[110px]"
              />
            </div>

            {/* Expected discharge */}
            <div>
              <label className="text-xs font-bold text-slate-600 block mb-1">Expected Discharge (optional)</label>
              <Input type="date" value={expectedDischarge} onChange={(e) => setExpectedDischarge(e.target.value)}
                min={new Date().toISOString().split("T")[0]} className="h-9 text-sm w-48" />
            </div>

            {/* Dietary Instruction */}
            <div>
              <label className="text-xs font-bold text-slate-600 block mb-1">Dietary Instruction</label>
              <select value={dietaryInstruction} onChange={e => setDietaryInstruction(e.target.value)}
                className="w-full h-9 text-sm border rounded-md px-2 bg-white">
                <option value="regular">Regular</option>
                <option value="soft">Soft</option>
                <option value="liquid">Liquid</option>
                <option value="semi_liquid">Semi-Liquid</option>
                <option value="npo">NPO (Nil Per Oral)</option>
                <option value="diabetic">Diabetic</option>
                <option value="low_sodium">Low-Sodium</option>
                <option value="high_protein">High-Protein</option>
                <option value="renal">Renal</option>
              </select>
            </div>

            {/* MLC Flag */}
            <div className="flex items-start gap-3">
              <label className="flex items-center gap-2 cursor-pointer mt-1">
                <input type="checkbox" checked={isMlcAdm} onChange={e => setIsMlcAdm(e.target.checked)}
                  className="rounded border-slate-300 accent-red-600" />
                <span className="text-xs font-bold text-slate-600">Medico-Legal Case (MLC)</span>
              </label>
              {isMlcAdm && (
                <Input value={mlcPoliceStation} onChange={e => setMlcPoliceStation(e.target.value)}
                  placeholder="Police station name" className="flex-1 h-8 text-xs border-red-300 focus:border-red-500" />
              )}
            </div>
            {isMlcAdm && (
              <div className="flex items-start gap-2 p-2 bg-red-50 border border-red-200 rounded-lg">
                <AlertTriangle className="h-3.5 w-3.5 text-red-600 mt-0.5 shrink-0" />
                <p className="text-[11px] text-red-700">MLC — Notify police within 24 hours. MLC number will be auto-generated. Maintain medico-legal register.</p>
              </div>
            )}

            <div className="flex justify-between pt-2">
              <Button variant="outline" onClick={() => setStep(1)}>← Back</Button>
              <Button onClick={() => setStep(3)} disabled={!doctorId || !bedId || !allergyVerified} className="bg-[#1A2F5A] hover:bg-[#152647]">Next →</Button>
            </div>
          </div>
        )}

        {/* STEP 3 — Confirm */}
        {!admittedId && step === 3 && (
          <div className="space-y-3 mt-2">
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-2">
              <p className="text-sm font-bold text-slate-900">{selectedPatient?.full_name}</p>
              <p className="text-xs text-slate-500">{selectedPatient?.uhid}</p>
              <div className="h-px bg-slate-200 my-2" />
              <Row label="Type" value={admissionType} />
              <Row label="Bed" value={bedLabel} />
              <Row label="Doctor" value={doctors.find((d) => d.id === doctorId)?.full_name || "—"} />
              <Row label="Diagnosis" value={diagnosis || "—"} />
              <Row label="Insurance" value={insuranceType.replace("_", " ")} />
              <Row label="Diet" value={dietaryInstruction.replace(/_/g, " ")} />
              {expectedDischarge && <Row label="Expected Discharge" value={expectedDischarge} />}
            </div>

            <div className="flex justify-between pt-2">
              <Button variant="outline" onClick={() => setStep(2)}>← Back</Button>
              <Button onClick={handleAdmit} disabled={submitting} className="bg-[#1A2F5A] hover:bg-[#152647] w-40">
                {submitting ? "Admitting..." : "✓ Confirm Admission"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

const Row = ({ label, value }: { label: string; value: string }) => (
  <div className="flex justify-between text-xs">
    <span className="text-slate-500">{label}</span>
    <span className="text-slate-800 font-medium capitalize">{value}</span>
  </div>
);

export default AdmitPatientModal;
