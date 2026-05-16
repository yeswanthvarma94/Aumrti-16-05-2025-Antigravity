import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { visit_type, visit_id, hospital_id } = await req.json();
    if (!visit_type || !visit_id || !hospital_id) {
      return new Response(JSON.stringify({ error: "visit_type, visit_id, hospital_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    let clinicalText = "";

    if (visit_type === "opd") {
      const { data: enc } = await sb.from("opd_encounters")
        .select("chief_complaint, soap_notes, diagnosis, history_of_present_illness, soap_assessment, soap_plan, examination_notes")
        .eq("id", visit_id).maybeSingle();
      if (!enc) {
        console.warn("ai-icd-suggest: opd_encounters not found for visit_id", visit_id);
      }
      if (enc) {
        clinicalText = [
          enc.chief_complaint, enc.history_of_present_illness,
          enc.soap_assessment, enc.soap_plan,
          enc.examination_notes, enc.diagnosis, enc.soap_notes,
        ].filter(Boolean).join("\n");
      }
    } else if (visit_type === "ipd") {
      const { data: adm } = await sb.from("admissions")
        .select("admitting_diagnosis, discharge_type, status")
        .eq("id", visit_id).maybeSingle();
      if (!adm) {
        console.warn("ai-icd-suggest: admissions not found for visit_id", visit_id);
      }

      // Also fetch ward round notes for richer clinical context
      const { data: rounds } = await sb.from("ward_round_notes")
        .select("subjective, objective, assessment, plan")
        .eq("admission_id", visit_id)
        .order("created_at", { ascending: false })
        .limit(3);

      const roundText = (rounds || []).map((r: any) =>
        [r.subjective, r.objective, r.assessment, r.plan].filter(Boolean).join("\n")
      ).join("\n---\n");

      clinicalText = [
        adm?.admitting_diagnosis,
        roundText,
      ].filter(Boolean).join("\n");
    }

    if (!clinicalText) {
      return new Response(JSON.stringify({ error: "No clinical notes found for this visit" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: "You are a medical coding specialist trained in ICD-10-CM. Given clinical documentation, suggest the most appropriate primary ICD-10 code. Always respond with valid JSON only.",
          },
          {
            role: "user",
            content: `Based on this clinical documentation, suggest the most appropriate primary ICD-10 code.

Return ONLY a JSON object:
{
  "primary_code": "J18.9",
  "primary_description": "Pneumonia, unspecified organism",
  "confidence": 0.87,
  "secondary_suggestions": [
    {"code": "E11.9", "description": "Type 2 diabetes mellitus without complications"}
  ],
  "reasoning": "One sentence explaining why this code fits"
}

Clinical documentation:
${clinicalText}`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "suggest_icd_codes",
              description: "Return ICD-10 code suggestions for clinical documentation",
              parameters: {
                type: "object",
                properties: {
                  primary_code: { type: "string", description: "ICD-10 code e.g. J18.9" },
                  primary_description: { type: "string", description: "Description of the code" },
                  confidence: { type: "number", description: "Confidence 0-1" },
                  secondary_suggestions: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        code: { type: "string" },
                        description: { type: "string" },
                      },
                      required: ["code", "description"],
                    },
                  },
                  reasoning: { type: "string", description: "Why this code fits" },
                },
                required: ["primary_code", "primary_description", "confidence", "reasoning"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "suggest_icd_codes" } },
      }),
    });

    if (!aiResponse.ok) {
      const status = aiResponse.status;
      const errText = await aiResponse.text();
      console.error("AI gateway error:", status, errText);
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded, please try again later" }), {
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

    let suggestion;
    // Try tool_calls first
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      suggestion = typeof toolCall.function.arguments === "string"
        ? JSON.parse(toolCall.function.arguments)
        : toolCall.function.arguments;
    } else {
      // Fallback: parse from content
      const content = aiData.choices?.[0]?.message?.content || "";
      suggestion = JSON.parse(content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim());
    }

    return new Response(JSON.stringify(suggestion), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-icd-suggest error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
