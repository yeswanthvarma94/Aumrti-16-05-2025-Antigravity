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

    const extractionPrompt = `This is a vendor invoice/delivery challan from an Indian medical/pharmaceutical supplier.

Extract ALL items and return ONLY a JSON object:
{
  "vendor_name": "supplier company name",
  "invoice_number": "invoice/challan number",
  "invoice_date": "YYYY-MM-DD format",
  "items": [
    {
      "name": "exact product name as written including strength",
      "batch_number": "batch no if visible",
      "expiry_date": "YYYY-MM-DD (convert from any format)",
      "quantity": number,
      "unit": "strips/boxes/vials/nos",
      "unit_rate": number (per unit price in INR),
      "total_amount": number,
      "gst_percent": number (5/12/18 if visible, else null),
      "mrp": number (if visible, else null)
    }
  ],
  "total_invoice_amount": number,
  "confidence": 0.0 to 1.0
}

Rules:
- Extract ALL line items visible on the invoice
- For drug names: include full name with strength (e.g. "Paracetamol 500mg Tab" not just "Paracetamol")
- Dates: convert to YYYY-MM-DD format
- If a field is not visible: use null
- confidence: your confidence in the extraction accuracy
- Return ONLY valid JSON, no other text or markdown`;

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
                image_url: {
                  url: `data:${mediaType || "image/jpeg"};base64,${base64Image}`,
                },
              },
              {
                type: "text",
                text: extractionPrompt,
              },
            ],
          },
        ],
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds in Settings > Workspace > Usage." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const aiData = await response.json();
    const rawText = aiData.choices?.[0]?.message?.content || "";

    // Clean and parse JSON
    const cleaned = rawText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    let extracted;
    try {
      extracted = JSON.parse(cleaned);
    } catch {
      console.error("Failed to parse AI response:", rawText);
      return new Response(JSON.stringify({ error: "Could not parse invoice data. Please fill manually.", rawText }), {
        status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(extracted), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("scan-invoice error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
