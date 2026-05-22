import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/fhir+json; charset=utf-8",
};

const sb = () => createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

function buildPatientResource(p: any) {
  return {
    resourceType: "Patient",
    id: p.id,
    identifier: [{ system: "urn:aumrti:uhid", value: p.uhid }],
    name: [{ use: "official", text: p.full_name }],
    gender: p.gender === "male" ? "male" : p.gender === "female" ? "female" : "unknown",
    birthDate: p.dob || undefined,
    telecom: p.phone ? [{ system: "phone", value: p.phone }] : [],
    address: p.address ? [{ text: p.address }] : [],
  };
}

function buildObservation(lab: any, patientId: string) {
  return {
    resourceType: "Observation",
    id: lab.id,
    status: lab.status === "resulted" ? "final" : "registered",
    category: [{ coding: [{ system: "http://terminology.hl7.org/CodeSystem/observation-category", code: "laboratory" }] }],
    code: { text: lab.test_name || "Laboratory Result" },
    subject: { reference: `Patient/${patientId}` },
    effectiveDateTime: lab.resulted_at || lab.created_at,
    valueString: lab.result_value ? String(lab.result_value) : undefined,
    referenceRange: lab.reference_range ? [{ text: lab.reference_range }] : undefined,
  };
}

function buildMedicationRequest(rx: any, patientId: string) {
  const items = rx.items || [];
  return items.map((item: any) => ({
    resourceType: "MedicationRequest",
    id: `${rx.id}-${item.drug_name}`,
    status: "active",
    intent: "order",
    medicationCodeableConcept: { text: item.drug_name },
    subject: { reference: `Patient/${patientId}` },
    authoredOn: rx.created_at,
    dosageInstruction: [{
      text: `${item.dose || ""} ${item.route || ""} ${item.frequency || ""}`.trim(),
    }],
  }));
}

function buildCondition(enc: any, patientId: string) {
  if (!enc.diagnosis) return null;
  return {
    resourceType: "Condition",
    id: `cond-${enc.id}`,
    clinicalStatus: { coding: [{ code: "active" }] },
    code: {
      coding: enc.icd10_code ? [{ system: "http://hl7.org/fhir/sid/icd-10", code: enc.icd10_code }] : [],
      text: enc.diagnosis,
    },
    subject: { reference: `Patient/${patientId}` },
    recordedDate: enc.created_at,
  };
}

function buildEncounter(enc: any, patientId: string) {
  return {
    resourceType: "Encounter",
    id: enc.id,
    status: enc.status || "finished",
    class: { code: "AMB", display: "ambulatory" },
    subject: { reference: `Patient/${patientId}` },
    period: { start: enc.created_at },
    reasonCode: enc.chief_complaint ? [{ text: enc.chief_complaint }] : [],
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/fhir-r4-server/, "");

  try {
    const db = sb();

    // GET /fhir/Patient/{id}
    const patientMatch = path.match(/^\/fhir\/Patient\/([^/$]+)$/);
    if (patientMatch && req.method === "GET") {
      const { data } = await db.from("patients").select("*").eq("id", patientMatch[1]).maybeSingle();
      if (!data) return new Response(JSON.stringify({ resourceType: "OperationOutcome", issue: [{ severity: "error", code: "not-found" }] }), { status: 404, headers: corsHeaders });
      return new Response(JSON.stringify(buildPatientResource(data)), { headers: corsHeaders });
    }

    // GET /fhir/Patient/{id}/$everything
    const everythingMatch = path.match(/^\/fhir\/Patient\/([^/$]+)\/\$everything$/);
    if (everythingMatch && req.method === "GET") {
      const patientId = everythingMatch[1];
      const [
        { data: patient },
        { data: encounters },
        { data: labOrders },
        { data: prescriptions },
        { data: admissions },
        { data: carePlans },
      ] = await Promise.all([
        db.from("patients").select("*").eq("id", patientId).maybeSingle(),
        db.from("opd_encounters").select("*").eq("patient_id", patientId).order("created_at", { ascending: false }).limit(20),
        db.from("lab_order_items").select("*, lab_orders!inner(patient_id, created_at, hospital_id)").eq("lab_orders.patient_id", patientId).limit(50),
        db.from("prescriptions").select("*").eq("patient_id", patientId).order("created_at", { ascending: false }).limit(10),
        db.from("admissions").select("*").eq("patient_id", patientId).order("admitted_at", { ascending: false }).limit(5),
        db.from("care_plans").select("*").eq("patient_id", patientId).limit(10),
      ]);

      if (!patient) return new Response(JSON.stringify({ resourceType: "OperationOutcome", issue: [{ severity: "error", code: "not-found" }] }), { status: 404, headers: corsHeaders });

      const entries: any[] = [
        { resource: buildPatientResource(patient) },
        ...(encounters || []).map((e: any) => ({ resource: buildEncounter(e, patientId) })),
        ...(encounters || []).map((e: any) => buildCondition(e, patientId)).filter(Boolean).map((r: any) => ({ resource: r })),
        ...(labOrders || []).flatMap((l: any) => [{ resource: buildObservation(l, patientId) }]),
        ...(prescriptions || []).flatMap((rx: any) => buildMedicationRequest(rx, patientId).map((r: any) => ({ resource: r }))),
      ];

      return new Response(JSON.stringify({
        resourceType: "Bundle",
        type: "searchset",
        total: entries.length,
        entry: entries,
      }), { headers: corsHeaders });
    }

    // GET /fhir/Condition?patient={id}
    if (path.startsWith("/fhir/Condition") && req.method === "GET") {
      const patientId = url.searchParams.get("patient");
      if (!patientId) return new Response(JSON.stringify({ error: "patient param required" }), { status: 400, headers: corsHeaders });
      const { data } = await db.from("opd_encounters").select("*").eq("patient_id", patientId).not("diagnosis", "is", null).limit(30);
      const resources = (data || []).map((e: any) => buildCondition(e, patientId)).filter(Boolean);
      return new Response(JSON.stringify({ resourceType: "Bundle", type: "searchset", total: resources.length, entry: resources.map((r: any) => ({ resource: r })) }), { headers: corsHeaders });
    }

    // GET /fhir/Observation?patient={id}
    if (path.startsWith("/fhir/Observation") && req.method === "GET") {
      const patientId = url.searchParams.get("patient");
      if (!patientId) return new Response(JSON.stringify({ error: "patient param required" }), { status: 400, headers: corsHeaders });
      const { data } = await db.from("lab_order_items").select("*, lab_orders!inner(patient_id)").eq("lab_orders.patient_id", patientId).limit(50);
      const resources = (data || []).map((l: any) => buildObservation(l, patientId));
      return new Response(JSON.stringify({ resourceType: "Bundle", type: "searchset", total: resources.length, entry: resources.map((r: any) => ({ resource: r })) }), { headers: corsHeaders });
    }

    // GET /fhir/MedicationRequest?patient={id}
    if (path.startsWith("/fhir/MedicationRequest") && req.method === "GET") {
      const patientId = url.searchParams.get("patient");
      if (!patientId) return new Response(JSON.stringify({ error: "patient param required" }), { status: 400, headers: corsHeaders });
      const { data } = await db.from("prescriptions").select("*").eq("patient_id", patientId).limit(20);
      const resources = (data || []).flatMap((rx: any) => buildMedicationRequest(rx, patientId));
      return new Response(JSON.stringify({ resourceType: "Bundle", type: "searchset", total: resources.length, entry: resources.map((r: any) => ({ resource: r })) }), { headers: corsHeaders });
    }

    // GET /fhir/Encounter?patient={id}
    if (path.startsWith("/fhir/Encounter") && req.method === "GET") {
      const patientId = url.searchParams.get("patient");
      if (!patientId) return new Response(JSON.stringify({ error: "patient param required" }), { status: 400, headers: corsHeaders });
      const { data } = await db.from("opd_encounters").select("*").eq("patient_id", patientId).order("created_at", { ascending: false }).limit(30);
      const resources = (data || []).map((e: any) => buildEncounter(e, patientId));
      return new Response(JSON.stringify({ resourceType: "Bundle", type: "searchset", total: resources.length, entry: resources.map((r: any) => ({ resource: r })) }), { headers: corsHeaders });
    }

    return new Response(JSON.stringify({ resourceType: "OperationOutcome", issue: [{ severity: "error", code: "not-supported", diagnostics: `Path ${path} not supported` }] }), {
      status: 404, headers: corsHeaders,
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: corsHeaders,
    });
  }
});
