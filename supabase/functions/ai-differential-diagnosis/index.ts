import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("LOVABLE_API_KEY") || Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "AI API key not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { chief_complaint, vitals, examination, age, gender, history, patient_context } = await req.json();

    if (!chief_complaint) {
      return new Response(JSON.stringify({ error: "chief_complaint is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const patientContextStr = patient_context
      ? `\nPatient AI Context: ${patient_context}`
      : "";

    const systemPrompt = `You are an expert clinical decision support AI trained on evidence-based medicine.
Generate a ranked differential diagnosis based on the clinical presentation.
Always respond with valid JSON only — no markdown, no code blocks.${patientContextStr}`;

    const userPrompt = `Clinical Presentation:
- Chief Complaint: ${chief_complaint}
- Age: ${age || "unknown"}, Gender: ${gender || "unknown"}
- Vitals: ${JSON.stringify(vitals || {})}
- Examination: ${examination || "not provided"}
- History: ${history || "not provided"}

Generate top 4 differential diagnoses ranked by likelihood. Return JSON:
{
  "differentials": [
    {
      "rank": 1,
      "diagnosis": "string",
      "icd10": "string",
      "confidence": 0.0-1.0,
      "supporting_features": ["string"],
      "against_features": ["string"],
      "recommended_investigations": ["string"],
      "urgency": "emergent|urgent|routine"
    }
  ],
  "red_flags_detected": ["string"],
  "suggested_referral": "string or null",
  "overall_urgency": "emergent|urgent|routine"
}`;

    const response = await fetch("https://ai.gateway.lovable.dev/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        max_tokens: 1000,
        temperature: 0.2,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`AI API error: ${err}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "{}";
    const parsed = JSON.parse(content);

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
