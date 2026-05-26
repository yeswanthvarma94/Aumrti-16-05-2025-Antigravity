import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Bot, Loader2, FileText, AlertTriangle, Printer } from "lucide-react";
import { printDocument, printHeader } from "@/lib/printUtils";
import { supabase } from "@/integrations/supabase/client";
import { callAI } from "@/lib/aiProvider";
import { toast } from "sonner";
import { logNABHEvidence } from "@/lib/nabh-evidence";
import { logRecordAccess } from "@/lib/ims";
import { logAudit } from "@/lib/auditLog";
import { formatDateIST } from "@/lib/dateUtils";

interface Props {
  admissionId: string;
  hospitalId: string;
  billingCleared?: boolean;
  dischargeType?: string;
  onSummaryDone: () => void;
}

const DischargeSummaryGenerator: React.FC<Props> = ({ admissionId, hospitalId, billingCleared = true, dischargeType = "regular", onSummaryDone }) => {
  const [summary, setSummary] = useState("");
  const [generating, setGenerating] = useState(false);
  const [signing, setSigning] = useState(false);
  const [signed, setSigned] = useState(false);
  const [icdStatus, setIcdStatus] = useState<{
    status: string;
    primary_icd_code: string | null;
    primary_icd_desc: string | null;
    mrd_locked_at: string | null;
  } | null>(null);
  const [dischargeWarnings, setDischargeWarnings] = useState<string[]>([]);
  const [warningsAcknowledged, setWarningsAcknowledged] = useState(false);

  useEffect(() => {
    (supabase as any)
      .from("icd_codings")
      .select("status, primary_icd_code, primary_icd_desc, mrd_locked_at")
      .eq("visit_id", admissionId)
      .eq("visit_type", "ipd")
      .maybeSingle()
      .then(({ data }: any) => setIcdStatus(data || null));
  }, [admissionId]);

  const generate = async () => {
    setGenerating(true);
    setSummary("");

    try {
      // Gather admission + patient data
      const { data: admission } = await supabase.from("admissions")
        .select("*, patients(full_name, dob, gender, blood_group, allergies)")
        .eq("id", admissionId).maybeSingle();

      if (!admission) {
        toast.error("Admission not found");
        setGenerating(false);
        return;
      }

      // Get ward/bed names
      const [wardRes, bedRes] = await Promise.all([
        supabase.from("wards").select("name").eq("id", admission.ward_id).maybeSingle(),
        supabase.from("beds").select("bed_number").eq("id", admission.bed_id).maybeSingle(),
      ]);

      // Ward round notes as clinical notes
      const { data: rounds } = await (supabase as any).from("ward_round_notes")
        .select("subjective, objective, assessment, plan, created_at")
        .eq("admission_id", admissionId)
        .order("created_at", { ascending: false })
        .limit(5);

      const notesText = (rounds || []).map((r: any) =>
        [r.subjective, r.objective, r.assessment, r.plan].filter(Boolean).join(" | ")
      ).join("\n---\n") || "Not available";

      // Lab results
      const { data: labs } = await (supabase as any).from("lab_order_items")
        .select("test_name, result, unit, normal_range_low, normal_range_high")
        .eq("patient_id", admission.patient_id)
        .gte("created_at", admission.admitted_at || "2000-01-01")
        .order("created_at", { ascending: false })
        .limit(20);

      // Medications
      const { data: meds } = await (supabase as any).from("ipd_medications")
        .select("drug_name, dose, frequency, route")
        .eq("admission_id", admissionId)
        .eq("is_active", true);

      // OT
      const { data: ot } = await (supabase as any).from("ot_schedules")
        .select("surgery_type, procedure_notes")
        .eq("admission_id", admissionId)
        .maybeSingle();

      const patient = admission.patients as any;
      const admittedDate = admission.admitted_at ? formatDateIST(admission.admitted_at) : "Unknown";
      const los = admission.admitted_at
        ? Math.ceil((Date.now() - new Date(admission.admitted_at).getTime()) / 86400000)
        : 0;

      const response = await callAI({
        featureKey: "discharge_summary",
        hospitalId,
        prompt: `Generate a professional hospital discharge summary for an Indian hospital.

PATIENT:
Name: ${patient?.full_name || "Unknown"}
Age/Gender: ${patient?.dob ? Math.floor((Date.now() - new Date(patient.dob).getTime()) / 31557600000) : "—"}yrs / ${patient?.gender || "—"}
Blood Group: ${patient?.blood_group || "Not recorded"}
Allergies: ${Array.isArray(patient?.allergies) ? patient.allergies.join(", ") : patient?.allergies || "NKDA"}

ADMISSION:
Date: ${admittedDate}
Discharge: Today
Ward: ${(wardRes?.data as any)?.name || "—"} | Bed: ${(bedRes?.data as any)?.bed_number || "—"}
Diagnosis: ${admission.admitting_diagnosis || "As per treating doctor"}
Length of Stay: ${los} days

CLINICAL NOTES (most recent):
${notesText}

${ot ? `SURGICAL PROCEDURE: ${ot.surgery_type}\n${ot.procedure_notes ? "Notes: " + ot.procedure_notes.slice(0, 200) : ""}` : ""}

KEY LAB RESULTS:
${labs?.map((l: any) => `${l.test_name}: ${l.result} ${l.unit || ""}`).join(", ") || "Not available"}

CURRENT MEDICATIONS:
${meds?.map((m: any) => `${m.drug_name} ${m.dose} ${m.frequency}`).join("\n") || "None prescribed"}

Write a professional discharge summary with these sections:
1. Presenting Complaint & History
2. Examination Findings
3. Investigations
4. Hospital Course & Treatment
5. Discharge Condition
6. Medications at Discharge
7. Instructions to Patient
8. Follow-up Plan

Use formal medical language. Keep factual. Do not invent details not provided. Max 400 words.`,
        maxTokens: 600,
      });

      if (response.error) {
        toast.error(`AI unavailable: ${response.error}. Write summary manually in the text box.`);
        setGenerating(false);
        return;
      }

      setSummary(response.text);

      // Log to ai_feature_logs
      await (supabase as any).from("ai_feature_logs").insert({
        hospital_id: hospitalId,
        feature_key: "discharge_summary",
        module: "ipd",
        patient_id: admission.patient_id,
        success: true,
        input_summary: `Admission ${admissionId} | LOS: ${los}d`,
        output_summary: `Generated ${response.text.length} chars`,
        tokens_used: (response as any).tokens_used || null,
      });
    } catch (err) {
      console.error("Discharge summary generation failed:", err);
      toast.error("Failed to generate summary. Write manually.");
    }

    setGenerating(false);
  };

  const checkDischargeCompleteness = async (): Promise<string[]> => {
    const warnings: string[] = [];
    const now = new Date();
    const since24h = new Date(now.getTime() - 24 * 3600 * 1000).toISOString();
    const since2h = new Date(now.getTime() - 2 * 3600 * 1000).toISOString();

    // Check: at least 1 nursing vitals entry in last 24h
    const { count: vitalsCount } = await (supabase as any)
      .from("nursing_vitals")
      .select("id", { count: "exact", head: true })
      .eq("admission_id", admissionId)
      .gte("recorded_at", since24h);

    if ((vitalsCount ?? 0) === 0) {
      warnings.push("No nursing vitals recorded in the last 24 hours.");
    }

    // Check: no pending MAR entries older than 2 hours
    const { count: pendingMar } = await (supabase as any)
      .from("med_admin_records")
      .select("id", { count: "exact", head: true })
      .eq("admission_id", admissionId)
      .eq("status", "pending")
      .lt("scheduled_time", since2h);

    if ((pendingMar ?? 0) > 0) {
      warnings.push(`${pendingMar} medication dose(s) are overdue (pending for more than 2 hours).`);
    }

    return warnings;
  };

  const signSummary = async () => {
    if (!summary.trim()) {
      toast.error("Summary is empty");
      return;
    }
    if (!billingCleared) {
      toast.error("Cannot discharge — billing not cleared");
      return;
    }

    // Run completeness check (only once — skip if already acknowledged)
    if (!warningsAcknowledged) {
      const warnings = await checkDischargeCompleteness();
      if (warnings.length > 0) {
        setDischargeWarnings(warnings);
        return;
      }
    }

    setSigning(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSigning(false); return; }

    const { data: userData } = await (supabase as any).from("users")
      .select("id").eq("auth_user_id", user.id).maybeSingle();

    const { error } = await supabase.from("admissions").update({
      discharge_summary_done: true,
      discharge_notes: summary,
      status: "discharged",
      discharge_type: dischargeType,
      discharged_at: new Date().toISOString(),
    } as any).eq("id", admissionId);

    if (error) {
      toast.error(error.message);
      setSigning(false);
      return;
    }

    // Get bed for housekeeping + patient_id for ABHA linking
    const { data: adm } = await supabase.from("admissions")
      .select("bed_id, ward_id, patient_id").eq("id", admissionId).maybeSingle();

    if (adm?.bed_id) {
      await supabase.from("beds").update({ status: "cleaning" as any }).eq("id", adm.bed_id);
      const { data: bedData } = await supabase.from("beds").select("bed_number").eq("id", adm.bed_id).maybeSingle();

      await (supabase as any).from("housekeeping_tasks").insert({
        hospital_id: hospitalId,
        task_type: "bed_turnover",
        ward_id: adm.ward_id,
        bed_id: adm.bed_id,
        room_number: bedData?.bed_number || null,
        triggered_by: "discharge",
        trigger_ref_id: admissionId,
        priority: "high",
        status: "pending",
        checklist: [
          { item: "Remove soiled linen", done: false },
          { item: "Clean mattress with disinfectant", done: false },
          { item: "Fit fresh linen", done: false },
          { item: "Clean bedside table", done: false },
          { item: "Mop floor", done: false },
          { item: "Supervisor inspection", done: false },
        ],
      });

      toast.success(`Patient discharged — housekeeping task created for bed ${bedData?.bed_number || ""}`);
    } else {
      toast.success("Patient discharged");
    }

    setSigned(true);
    setSigning(false);
    logAudit({ action: "updated", module: "ipd", entityType: "admission", entityId: admissionId, details: { action: "discharged" } });

    // Fire-and-forget ABHA care context linking (non-blocking)
    if (adm?.patient_id) {
      supabase.functions.invoke("abdm-auto-link-care-context", {
        body: {
          hospital_id: hospitalId,
          patient_id: adm.patient_id,
          event_type: "ipd_discharged",
          source_id: admissionId,
        },
      }).catch(() => {});
    }

    // WhatsApp discharge summary (non-blocking)
    try {
      const { data: patient } = await supabase.from("patients")
        .select("full_name, uhid, phone")
        .eq("id", (await supabase.from("admissions").select("patient_id").eq("id", admissionId).maybeSingle()).data?.patient_id)
        .maybeSingle();

      const phone = patient?.phone;
      if (phone && summary) {
        const shortSummary = summary.slice(0, 300).replace(/\n/g, " ");
        const msg = `🏥 Discharge Summary\n\nPatient: ${patient.full_name} (${patient.uhid})\nDate: ${formatDateIST(new Date().toISOString())}\n\n${shortSummary}...\n\nPlease follow your doctor's instructions. For emergencies, contact the hospital.`;
        const clean = phone.replace(/\D/g, "");
        const intl = clean.startsWith("91") ? clean : `91${clean}`;
        window.open(`https://wa.me/${intl}?text=${encodeURIComponent(msg)}`, "_blank", "noopener,noreferrer");
        toast.success("Discharge summary sent via WhatsApp");
      }
    } catch (whatsErr) {
      console.error("WhatsApp discharge failed:", whatsErr);
    }

    logNABHEvidence(hospitalId, "COP.10",
      `Discharge summary completed: Patient ${admissionId}, AI-assisted: ${summary ? "Yes" : "No"}`);

    onSummaryDone();
  };

  const handlePrint = async () => {
    if (!summary) return;
    logRecordAccess({ hospitalId, recordType: "IPD_Record", recordId: admissionId, action: "print" });

    const { data: hospital } = await supabase.from("hospitals").select("name, address").eq("id", hospitalId).maybeSingle();
    const { data: patient } = await supabase.from("admissions")
      .select("patients(full_name, uhid, dob, gender)")
      .eq("id", admissionId).maybeSingle();

    const p = patient?.patients as any;
    const body = `
      ${printHeader(hospital?.name || "Hospital", "DISCHARGE SUMMARY")}
      <div style="display:flex;justify-content:space-between;border-bottom:1px solid #e2e8f0;padding-bottom:10px;margin-bottom:20px;">
        <div>
          <div><span class="label">Patient:</span> <b>${p?.full_name || "—"}</b></div>
          <div><span class="label">UHID:</span> <b>${p?.uhid || "—"}</b></div>
          <div><span class="label">Age/Sex:</span> <span>${p?.dob ? Math.floor((Date.now() - new Date(p.dob).getTime()) / 31557600000) : "—"}y / ${p?.gender || "—"}</span></div>
        </div>
        <div style="text-align:right">
          <div><span class="label">Discharge Date:</span> <b>${new Date().toLocaleDateString("en-IN")}</b></div>
          <div><span class="label">Type:</span> <span style="text-transform:capitalize"><b>${dischargeType}</b></span></div>
        </div>
      </div>
      <div style="white-space:pre-wrap;font-size:13px;line-height:1.6;color:#1e293b;">
        ${summary}
      </div>
      <div style="margin-top:60px;display:flex;justify-content:flex-end;">
        <div style="text-align:center;width:200px;border-top:1px solid #1e293b;padding-top:8px;">
          <p style="margin:0;font-weight:bold;">Treating Consultant</p>
          <p style="margin:0;font-size:10px;color:#64748b;">Hospital ID: ${hospitalId.slice(0, 8)}</p>
        </div>
      </div>
    `;

    printDocument(`DischargeSummary_${p?.uhid || "IPD"}`, body);
  };

  if (signed) {
    return (
      <div className="text-center py-6 space-y-2">
        <p className="text-sm font-semibold text-emerald-600">✅ Discharge summary signed — patient discharged</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {!summary ? (
        <div className="bg-muted/50 rounded-lg p-3 text-center">
          <p className="text-xs text-muted-foreground">Use AI to generate a draft, or type the summary manually below.</p>
        </div>
      ) : (
        <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-2 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
          <span className="text-xs text-amber-700 dark:text-amber-400 font-medium">
            AI-Generated — Doctor must review and sign before discharge
          </span>
        </div>
      )}
      <Textarea
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
        placeholder="Type discharge summary here, or click 'Generate with AI' to auto-fill..."
        className="min-h-[250px] text-sm font-sans leading-relaxed"
      />
      {/* ICD Coding Status — read-only indicator for discharge workflow */}
      <div className={`flex items-start gap-2 rounded-lg px-3 py-2 text-xs border ${
        icdStatus?.status === "mrd_locked"
          ? "bg-violet-50 border-violet-200 text-violet-700"
          : icdStatus?.status === "validated"
            ? "bg-blue-50 border-blue-200 text-blue-700"
            : icdStatus?.status === "coded"
              ? "bg-amber-50 border-amber-200 text-amber-700"
              : "bg-muted border-border text-muted-foreground"
      }`}>
        <div className="flex-1 min-w-0">
          <span className="font-semibold">ICD: </span>
          {icdStatus?.status === "mrd_locked" && (
            <>
              <span>ICD Locked ✓ (MRD) — </span>
              <span className="font-mono">{icdStatus.primary_icd_code}</span>
              {icdStatus.primary_icd_desc && <span className="opacity-80"> · {icdStatus.primary_icd_desc}</span>}
              {icdStatus.mrd_locked_at && (
                <span className="opacity-60 ml-1">
                  · {new Date(icdStatus.mrd_locked_at).toLocaleDateString("en-IN")}
                </span>
              )}
            </>
          )}
          {icdStatus?.status === "validated" && <span>MRD Validated — awaiting lock</span>}
          {icdStatus?.status === "coded" && <span>Doctor Suggested — awaiting MRD validation</span>}
          {(!icdStatus || icdStatus.status === "pending") && <span>ICD Coding Pending</span>}
        </div>
      </div>

      {/* Discharge completeness warnings */}
      {dischargeWarnings.length > 0 && !warningsAcknowledged && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
            <p className="text-xs font-bold text-amber-800">Discharge Checklist — Issues Found</p>
          </div>
          <ul className="text-xs text-amber-800 space-y-1 pl-5 list-disc">
            {dischargeWarnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
          <div className="flex gap-2 pt-1">
            <Button
              size="sm"
              variant="outline"
              className="flex-1 h-8 text-xs border-amber-400 text-amber-700"
              onClick={() => setDischargeWarnings([])}
            >
              Go Back
            </Button>
            <Button
              size="sm"
              className="flex-1 h-8 text-xs bg-amber-600 hover:bg-amber-700 text-white"
              onClick={() => { setWarningsAcknowledged(true); setDischargeWarnings([]); }}
            >
              Acknowledge & Proceed
            </Button>
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <Button variant="outline" onClick={generate} disabled={generating} size="sm">
          {generating ? <><Loader2 className="h-3 w-3 animate-spin mr-1" /> Analysing...</> : <><Bot className="h-4 w-4 mr-1" /> Generate with AI</>}
        </Button>
        <Button onClick={signSummary} disabled={signing} className="flex-1">
          {signing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <FileText className="h-4 w-4 mr-2" />}
          Sign Discharge Summary & Discharge
        </Button>
        {summary && (
          <Button variant="outline" onClick={handlePrint} size="sm">
            <Printer className="h-4 w-4 mr-1" /> Print
          </Button>
        )}
      </div>
    </div>
  );
};

export default DischargeSummaryGenerator;
