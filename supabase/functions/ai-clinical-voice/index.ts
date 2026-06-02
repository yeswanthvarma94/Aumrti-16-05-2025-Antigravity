import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveAiConfig, resolveAiConfigFromEnv, callAiChat } from "../_shared/ai-config.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CONTEXT_PROMPTS: Record<string, string> = {
  opd_consultation: `You are a clinical documentation AI for an Indian hospital. A doctor dictated the following during an OPD consultation. Extract and structure the clinical information.

Return ONLY a JSON object with this exact structure:
{
  "chief_complaint": "main reason for visit in 1-2 sentences",
  "history_of_present_illness": "detailed history",
  "examination_findings": "clinical examination findings",
  "diagnosis": "primary diagnosis or working diagnosis",
  "icd_suggestion": "suggested ICD-10 code if identifiable",
  "plan": "management plan",
  "prescription": [
    {
      "drug_name": "drug name with strength",
      "dose": "dose",
      "route": "oral/iv/im etc",
      "frequency": "OD/BD/TDS/QID/SOS/STAT/HS",
      "duration": "number of days",
      "instructions": "special instructions if any"
    }
  ],
  "follow_up": "follow-up instructions",
  "investigations": ["test 1", "test 2"],
  "confidence": 0.85,
  "reasoning": "One sentence explaining the confidence level and key structuring decisions made"
}

If a field cannot be extracted, use empty string or empty array.
Prescription array should only include items clearly mentioned.
confidence should be 0-1 based on transcript clarity.`,

  ward_round: `You are a senior clinical documentation AI for an Indian hospital IPD ward round. The doctor's dictation may use a mix of English and an Indian language. Parse carefully.

IMPORTANT ABBREVIATIONS (Indian clinical shorthand):
- S/O = Subjective/Objective, SOAP = clinical note format
- BD/BID = twice daily, TDS = three times daily, QID = four times, OD = once daily, HS = night, SOS = as needed, STAT = immediately, AC = before meals, PC = after meals
- C/O = complaining of, H/O = history of, K/C/O = known case of
- BP = blood pressure (format: systolic/diastolic e.g. 120/80), PR/HR = pulse rate, RR = respiratory rate, SpO2/O2 sat = oxygen saturation, Temp = temperature
- Afebrile = no fever, Tachycardia/bradycardia = fast/slow pulse, Hypo/hypertension = low/high BP
- NBM = nil by mouth, NPO = nothing per oral, IV = intravenous, IM = intramuscular, PO = oral
- FBS/RBS/PPBS = fasting/random/post-prandial blood sugar, HbA1c = glycated haemoglobin
- USG = ultrasound, CECT = contrast CT, HRCT = high resolution CT, 2D Echo = echocardiogram
- Tab = tablet, Cap = capsule, Inj = injection, Syp = syrup, Oint = ointment, Susp = suspension

VITALS: Extract numeric values separately. If doctor says "BP 130 by 80" → bp_sys:130, bp_dia:80. Temperature in °F unless stated otherwise.

Return ONLY a valid JSON object — no markdown, no explanation:
{
  "subjective": "patient's complaints, symptoms today in 1-3 sentences",
  "objective": "general examination findings and clinical status (NOT vitals — those go in vitals_detected)",
  "assessment": "diagnosis status, clinical impression for today",
  "plan": "management plan for the day — medications, nursing, activity, diet, follow-up investigations",
  "vitals_detected": {
    "bp_sys": "",
    "bp_dia": "",
    "pulse": "",
    "temp": "",
    "spo2": "",
    "rr": "",
    "pain_score": ""
  },
  "medication_changes": [
    { "action": "add", "drug": "drug name dose route frequency duration", "note": "reason if mentioned" },
    { "action": "stop", "drug": "drug name", "note": "reason" },
    { "action": "change", "drug": "old → new", "note": "what changed" }
  ],
  "investigations_ordered": ["exact test name as would appear on lab requisition"],
  "consultant_to_call": "specialty and doctor name if referral mentioned",
  "discharge_plan": "expected discharge date or criteria if mentioned, else empty string",
  "confidence": 0.85,
  "reasoning": "One sentence: key clinical decisions in this dictation and any ambiguities"
}

Rules:
- vitals_detected: use numeric strings only (e.g. "120", "80", "98.6"). Leave empty string if not clearly stated.
- investigations_ordered: use exact Indian lab names (e.g. "CBC", "LFT", "KFT", "HbA1c", "Urine R/M", "Blood Culture & Sensitivity")
- medication_changes: only include explicitly mentioned changes, not routine medications continuing unchanged
- If the doctor says patient is "better", "improving", "stable" — capture in subjective/assessment
- If confidence < 0.6, add a note in reasoning about what was unclear`,

  emergency: `You are a clinical documentation AI. This is an emergency department case.
Extract vitals as numbers. Split history into AMPLE categories (Allergies, Medications, Past history, Last meal, Events) when possible.

Return ONLY a JSON object:
{
  "presenting_complaint": "",
  "vitals_detected": {
    "bp_systolic": "",
    "bp_diastolic": "",
    "pulse": "",
    "spo2": "",
    "gcs": ""
  },
  "ample": {
    "allergies": "",
    "medications": "",
    "past_history": "",
    "last_meal": "",
    "events": ""
  },
  "examination": "",
  "working_diagnosis": "",
  "immediate_management": "",
  "triage_category": "P1/P2/P3/P4 if mentioned",
  "investigations_ordered": [],
  "disposition": "admit/discharge/observe/refer",
  "confidence": 0.85
}

For vitals_detected, extract numeric values only (e.g. from "BP 120/80" extract bp_systolic:"120", bp_diastolic:"80").
If a field cannot be extracted, use empty string or empty array.`,

  nursing_note: `You are a clinical documentation AI. This is a nursing note dictated by a nurse.

Return ONLY a JSON object:
{
  "observation": "patient observation",
  "vitals_mentioned": { "bp": "", "pulse": "", "temp": "", "spo2": "" },
  "interventions": "nursing interventions done",
  "medications_given": [{ "drug": "", "dose": "", "time": "" }],
  "patient_response": "patient response to treatment",
  "handover_note": "important notes for next shift",
  "confidence": 0.85
}`,
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Auth verification
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const anonClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: { user }, error: authError } = await anonClient.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: userData } = await sb.from("users").select("hospital_id").eq("auth_user_id", user.id).maybeSingle();
    const hospitalId = userData?.hospital_id as string | null;

    const { transcript, context_type, existing_data, language_code } = await req.json();

    if (!transcript?.trim()) {
      return new Response(JSON.stringify({ error: "Transcript is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const config = hospitalId
      ? (await resolveAiConfig(hospitalId, "voice_scribe", 1200)) ?? resolveAiConfigFromEnv(1200)
      : resolveAiConfigFromEnv(1200);

    if (!config) {
      return new Response(JSON.stringify({ error: "No AI provider configured. Go to Settings → API Hub." }), {
        status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const contextPrompt = CONTEXT_PROMPTS[context_type] || CONTEXT_PROMPTS.opd_consultation;

    const existingContext = existing_data
      ? `\n\nExisting data already in the form (merge with, don't overwrite unless corrected):\n${JSON.stringify(existing_data)}`
      : "";

    // Language instruction: when the doctor dictates in a regional language, instruct the
    // model to return field VALUES in that language while keeping JSON keys in English.
    const LANG_LABELS: Record<string, string> = {
      "hi-IN": "Hindi (हिन्दी)",
      "te-IN": "Telugu (తెలుగు)",
      "ta-IN": "Tamil (தமிழ்)",
      "kn-IN": "Kannada (ಕನ್ನಡ)",
      "ml-IN": "Malayalam (മലയാളം)",
      "mr-IN": "Marathi (मराठी)",
      "bn-IN": "Bengali (বাংলা)",
      "gu-IN": "Gujarati (ગુજરાતી)",
      "pa-IN": "Punjabi (ਪੰਜਾਬੀ)",
    };
    const langLabel = language_code ? LANG_LABELS[language_code] : null;
    const langNote = langLabel
      ? `\n\nIMPORTANT: The doctor dictated in ${langLabel}. Return all text field VALUES in ${langLabel}. Keep JSON keys in English. Medical drug names and ICD codes may remain in English.`
      : "";

    const prompt = `${contextPrompt}${existingContext}${langNote}

Dictation transcript:
"${transcript}"`;

    const messages = [
      {
        role: "system" as const,
        content: "You are a clinical documentation assistant for Indian hospitals. Parse doctor voice dictations into structured medical data. Use standard Indian medical terminology and drug names. Always return valid JSON only, no markdown wrapping. Do not include any explanation or text outside the JSON object.",
      },
      { role: "user" as const, content: prompt },
    ];

    const rawContent = await callAiChat(config, messages, 1200, 0.3);
    console.log("AI raw response (first 500):", rawContent.substring(0, 500));

    const cleaned = rawContent.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    console.log("Cleaned content:", cleaned.substring(0, 300));

    let structured: Record<string, unknown>;
    try {
      structured = JSON.parse(cleaned);
    } catch (parseErr) {
      console.error("JSON parse error:", parseErr, "Content was:", cleaned.substring(0, 200));
      throw new Error("Failed to parse AI response as JSON");
    }

    return new Response(JSON.stringify({ structured, context_type }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-clinical-voice error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
