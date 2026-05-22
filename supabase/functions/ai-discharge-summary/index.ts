import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const anonClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: { user }, error: authError } = await anonClient.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { admission_id } = await req.json();
    if (!admission_id) {
      return new Response(JSON.stringify({ error: "admission_id is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch all clinical data for the admission
    const [admRes, roundsRes, labsRes, medsRes, otRes, radRes] = await Promise.all([
      sb.from("admissions").select("*, patients(full_name, dob, gender, blood_group, allergies, phone)").eq("id", admission_id).maybeSingle(),
      (sb as any).from("ward_round_notes").select("subjective, objective, assessment, plan, created_at").eq("admission_id", admission_id).order("created_at", { ascending: false }).limit(10),
      (sb as any).from("lab_order_items").select("test_name, result, unit, normal_range_low, normal_range_high, created_at").eq("admission_id", admission_id).order("created_at", { ascending: false }).limit(30),
      (sb as any).from("ipd_medications").select("drug_name, dose, frequency, route, is_active").eq("admission_id", admission_id),
      (sb as any).from("ot_schedules").select("surgery_type, procedure_notes, scheduled_time").eq("admission_id", admission_id).maybeSingle(),
      (sb as any).from("radiology_reports").select("impression, radiology_orders(study_name)").eq("admission_id", admission_id).limit(5),
    ]);

    const admission = admRes.data;
    if (!admission) {
      return new Response(JSON.stringify({ error: "Admission not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const patient = admission.patients as any;
    const rounds = roundsRes.data || [];
    const labs = labsRes.data || [];
    const meds = medsRes.data || [];
    const ot = otRes.data;
    const radReports = radRes.data || [];

    const los = admission.admitted_at
      ? Math.ceil((Date.now() - new Date(admission.admitted_at).getTime()) / 86400000)
      : 0;

    const ageYrs = patient?.dob
      ? Math.floor((Date.now() - new Date(patient.dob).getTime()) / 31557600000)
      : null;

    const notesText = rounds.map((r: any) =>
      [r.assessment, r.plan, r.subjective, r.objective].filter(Boolean).join(" | ")
    ).join("\n") || "No ward round notes.";

    const labText = labs.map((l: any) => `${l.test_name}: ${l.result} ${l.unit || ""}`).join(", ") || "None";
    const activeMeds = meds.filter((m: any) => m.is_active !== false);
    const medsText = activeMeds.map((m: any) => `${m.drug_name} ${m.dose} ${m.frequency} ${m.route || ""}`.trim()).join(", ") || "None";

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const prompt = `You are a clinical documentation AI for an Indian hospital. Generate a structured discharge summary.

PATIENT:
Name: ${patient?.full_name || "Unknown"}
Age/Gender: ${ageYrs ?? "—"}yrs / ${patient?.gender || "—"}
Blood Group: ${patient?.blood_group || "Not recorded"}
Allergies: ${patient?.allergies || "NKDA"}

ADMISSION:
Diagnosis: ${admission.admitting_diagnosis || "Not recorded"}
LOS: ${los} days
${ot ? `Procedure: ${ot.surgery_type}` : ""}

CLINICAL COURSE:
${notesText.slice(0, 800)}

KEY INVESTIGATIONS:
${labText.slice(0, 400)}

${radReports.length > 0 ? "RADIOLOGY:\n" + radReports.map((r: any) => `${(r as any).radiology_orders?.study_name}: ${r.impression}`).join("\n").slice(0, 300) : ""}

CURRENT MEDICATIONS:
${medsText.slice(0, 400)}

Return ONLY valid JSON (no markdown):
{
  "final_diagnosis": "primary diagnosis, max 2 sentences",
  "procedures_performed": ["procedure 1", "procedure 2"],
  "hospital_course": "3-4 sentence summary of clinical course",
  "discharge_medications": [
    { "drug": "name + strength", "dose": "dose", "frequency": "OD/BD/TDS/SOS", "duration": "days", "instructions": "with food etc" }
  ],
  "diet_instructions": "specific diet advice",
  "activity_restrictions": "rest, no lifting, etc.",
  "follow_up_appointments": ["OPD Dr. X in 7 days", "HbA1c in 3 months"],
  "red_flag_symptoms": ["fever >38.5", "chest pain", "wound discharge"],
  "emergency_contact_note": "For emergencies call hospital on 24/7 helpline",
  "patient_friendly_summary": "2-3 sentence summary in simple English a patient can understand",
  "confidence": 0.85,
  "reasoning": "One sentence explaining confidence"
}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "You are a clinical documentation AI for Indian hospitals. Always return valid JSON only, no markdown." },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!response.ok) {
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      if (response.status === 429) return new Response(JSON.stringify({ error: "Rate limited, try again later." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (response.status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content || "{}";
    const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

    let structured: Record<string, unknown>;
    try {
      structured = JSON.parse(cleaned);
    } catch {
      throw new Error("Failed to parse AI response as JSON");
    }

    return new Response(JSON.stringify({ structured, patient_name: patient?.full_name, admission_id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-discharge-summary error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
