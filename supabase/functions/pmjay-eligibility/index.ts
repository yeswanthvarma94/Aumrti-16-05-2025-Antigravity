import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { pmjay_card_number, patient_name } = await req.json();

    if (!pmjay_card_number) {
      return new Response(
        JSON.stringify({ eligible: false, error: "PMJAY card number required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const nhaApiKey = Deno.env.get("NHA_BIS_API_KEY");

    // Sandbox mode — no NHA credentials configured
    if (!nhaApiKey) {
      const cardStr = String(pmjay_card_number).replace(/-/g, "");
      const looksValid = /^\d{8,14}$/.test(cardStr);
      return new Response(
        JSON.stringify({
          eligible: looksValid,
          mode: "sandbox",
          beneficiary: looksValid
            ? {
                name: patient_name || "Test Patient",
                pmjay_id: pmjay_card_number,
                scheme: "PMJAY (Ayushman Bharat)",
                family_id: "FAM" + cardStr.slice(-6),
                balance_amount: 500000,
                used_amount: 0,
                state: "Andhra Pradesh",
              }
            : null,
          message: looksValid
            ? "Sandbox eligibility check — configure NHA_BIS_API_KEY for live verification"
            : "Invalid PMJAY card format — must be 8-14 digits",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Live NHA BIS call
    const res = await fetch(
      "https://bis.pmjay.gov.in/BIS/restservice/getBeneficiaryDetails",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${nhaApiKey}`,
        },
        body: JSON.stringify({ beneficiaryId: pmjay_card_number }),
      }
    );
    const data = await res.json();
    return new Response(
      JSON.stringify({
        eligible: data.isEligible === "Y",
        beneficiary: data,
        mode: "live",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ eligible: false, error: err.message || "Verification service unavailable" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
