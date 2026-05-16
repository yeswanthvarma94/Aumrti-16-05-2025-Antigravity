import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { abha_number } = await req.json();
    if (!abha_number) {
      return new Response(
        JSON.stringify({ verified: false, error: "ABHA number required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const abdmClientId = Deno.env.get("ABDM_CLIENT_ID");
    const abdmClientSecret = Deno.env.get("ABDM_CLIENT_SECRET");
    const abdmBaseUrl =
      Deno.env.get("ABDM_BASE_URL") || "https://dev.abdm.gov.in";

    // Sandbox/format-only mode if creds not configured
    if (!abdmClientId || !abdmClientSecret) {
      const isValidFormat = /^\d{14}$/.test(String(abha_number).replace(/-/g, ""));
      return new Response(
        JSON.stringify({
          verified: isValidFormat,
          mode: "sandbox_format_only",
          message: isValidFormat
            ? "ABHA format valid (sandbox mode — live verification requires ABDM credentials)"
            : "Invalid ABHA format — must be 14 digits",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Live ABDM verification
    const tokenRes = await fetch(`${abdmBaseUrl}/gateway/v0.5/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CM-ID": "sbx" },
      body: JSON.stringify({
        clientId: abdmClientId,
        clientSecret: abdmClientSecret,
      }),
    });
    const tokenData = await tokenRes.json();
    const accessToken = tokenData.accessToken;

    if (!accessToken) {
      return new Response(
        JSON.stringify({ verified: false, error: "ABDM authentication failed" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const verifyRes = await fetch(
      `${abdmBaseUrl}/v1/search/existsByHealthId`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
          "X-CM-ID": "sbx",
        },
        body: JSON.stringify({ healthId: abha_number }),
      },
    );
    const verifyData = await verifyRes.json();

    return new Response(
      JSON.stringify({
        verified: verifyData.status === true,
        mode: "live",
        abha_number,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("abdm-abha-verify error:", error);
    return new Response(
      JSON.stringify({
        verified: false,
        error: "Verification service unavailable",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
