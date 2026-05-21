// WARNING: Patient encounter data (PHI) is sent to ai.gateway.lovable.dev.
// Ensure a Data Processing Agreement (DPA) covering PHI is in place with Lovable before production use.
// @ts-ignore: Deno HTTP imports resolved by Supabase Edge Function runtime
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You are a senior hospital physician writing structured clinical notes for Indian hospitals.
Given the patient context, specialty, and raw notes provided, generate a professional, factual clinical note.
Do not invent clinical details not present in the input. Use standard medical terminology.
Always respond with valid JSON only.`;

// @ts-ignore: Deno is available in Supabase Edge Functions
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Auth verification
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // @ts-ignore: Deno is available in Supabase Edge Functions
    const anonClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: { user }, error: authError } = await anonClient.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { encounterId, specialty, rawNotes } = await req.json();

    if (!encounterId) {
      return new Response(JSON.stringify({ error: "encounterId required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // @ts-ignore: Deno is available in Supabase Edge Functions
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // @ts-ignore: Deno is available in Supabase Edge Functions
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Resolve hospital from authenticated user (ignore any hospitalId from request body)
    const { data: userData } = await sb
      .from("users")
      .select("hospital_id")
      .eq("auth_user_id", user.id)
      .maybeSingle();
    if (!userData) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const hospitalId = userData.hospital_id;

    const { data: encounter, error: encError } = await sb
      .from("opd_encounters")
      .select("id, patient_id, chief_complaint, soap_notes, diagnosis, history_of_present_illness, soap_assessment, soap_plan, examination_notes")
      .eq("id", encounterId)
      .eq("hospital_id", hospitalId)
      .maybeSingle();

    if (encError || !encounter) {
      return new Response(JSON.stringify({ error: "Encounter not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const clinicalContext = [
      encounter.chief_complaint && `Chief Complaint: ${encounter.chief_complaint}`,
      encounter.history_of_present_illness && `History: ${encounter.history_of_present_illness}`,
      encounter.examination_notes && `Examination: ${encounter.examination_notes}`,
      encounter.soap_assessment && `Assessment: ${encounter.soap_assessment}`,
      encounter.soap_plan && `Plan: ${encounter.soap_plan}`,
      encounter.diagnosis && `Diagnosis: ${encounter.diagnosis}`,
      encounter.soap_notes && `Notes: ${encounter.soap_notes}`,
      rawNotes && `Additional Notes: ${rawNotes}`,
    ].filter(Boolean).join("\n");

    const start = Date.now();

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: `Generate a structured clinical note for a ${specialty || "general"} OPD encounter.

Return ONLY a JSON object:
{
  "narrative": "Full clinical note text (3-5 paragraphs, professional medical language)",
  "structuredData": {
    "diagnoses": ["ICD-10 code if inferrable, else descriptive diagnosis"],
    "advised_procedures": ["procedure name if any"],
    "follow_up_days": 7
  }
}

Patient clinical context:
${clinicalContext || "No additional context provided."}`,
          },
        ],
      }),
    });

    const latencyMs = Date.now() - start;

    if (!aiResponse.ok) {
      const status = aiResponse.status;
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded, try again later" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "AI service error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content || "";
    const tokensUsed = aiData.usage?.total_tokens;

    let result;
    try {
      result = JSON.parse(content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim());
    } catch {
      result = { narrative: content, structuredData: { diagnoses: [], advised_procedures: [] } };
    }

    await sb.from("ai_feature_logs").insert({
      hospital_id: hospitalId,
      patient_id: encounter.patient_id,
      module: "opd",
      feature_key: "generate-clinical-note",
      success: true,
      input_summary: `Encounter ${encounterId} | Specialty: ${specialty || "general"}`,
      output_summary: `Generated ${result.narrative?.length || 0} chars`,
      latency_ms: latencyMs,
      tokens_used: tokensUsed ?? null,
    });

    return new Response(JSON.stringify({ success: true, ...result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("ai-generate-clinical-note error:", e);
    return new Response(JSON.stringify({ success: false, error: e.message || "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
