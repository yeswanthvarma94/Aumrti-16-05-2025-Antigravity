import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { base64Image, mediaType } = await req.json();
    if (!base64Image) throw new Error("No image provided");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const extractionPrompt = `This is a lab test list or price list from a hospital or diagnostic laboratory.

Extract ALL tests and return ONLY a JSON array:
[
  {
    "test_name": "full test name as written",
    "test_code": "code or abbreviation if visible, else null",
    "category": "best match from: Haematology, Biochemistry, Pathology, Microbiology, Serology, Immunology",
    "sample_type": "best match from: Blood, Urine, Stool, Swab, CSF, Other",
    "unit": "unit of measurement if visible (e.g. mg/dL, g/L), else null",
    "normal_min": number or null,
    "normal_max": number or null,
    "tat_minutes": number (turnaround time in minutes, default 60 if not visible),
    "fee": number in INR (default 0 if not visible)
  }
]

Rules:
- Extract EVERY test row visible in the image
- category: pick the single closest match from the 6 options above
- sample_type: pick the single closest match from the 6 options above
- normal_min / normal_max: extract from ranges like "4-6", "3.5 - 5.0", "< 200" etc.
- If a field is not visible use null (except tat_minutes=60 and fee=0 as defaults)
- Return ONLY a valid JSON array — no markdown, no explanation, no other text`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: { url: `data:${mediaType || "image/jpeg"};base64,${base64Image}` },
              },
              { type: "text", text: extractionPrompt },
            ],
          },
        ],
        max_tokens: 4000,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds in Settings → API Hub." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const aiData = await response.json();
    const rawText = aiData.choices?.[0]?.message?.content || "";

    const cleaned = rawText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    let extracted;
    try {
      extracted = JSON.parse(cleaned);
    } catch {
      console.error("Failed to parse AI response:", rawText);
      return new Response(JSON.stringify({ error: "Could not parse test list. Please try a clearer image.", rawText }), {
        status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!Array.isArray(extracted)) {
      return new Response(JSON.stringify({ error: "AI returned unexpected format. Please try again." }), {
        status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(extracted), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("scan-lab-tests error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
