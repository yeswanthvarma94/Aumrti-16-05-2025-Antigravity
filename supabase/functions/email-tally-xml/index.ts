import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendKey = Deno.env.get("RESEND_API_KEY");
    const supabase = createClient(supabaseUrl, serviceKey);

    const { hospital_id, xml_content, date_start, date_end } = await req.json();

    if (!hospital_id || !xml_content) {
      return new Response(JSON.stringify({ error: "hospital_id and xml_content required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch hospital billing email
    const { data: hospital } = await supabase
      .from("hospitals")
      .select("name, billing_email, email")
      .eq("id", hospital_id)
      .maybeSingle();

    const toEmail = (hospital as any)?.billing_email || hospital?.email;
    if (!toEmail) {
      return new Response(JSON.stringify({ error: "No billing email configured for this hospital" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!resendKey) {
      return new Response(JSON.stringify({ error: "RESEND_API_KEY not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const filename = `HMS_Tally_Export_${date_start || "export"}_${date_end || ""}.xml`;
    const xmlBase64 = btoa(unescape(encodeURIComponent(xml_content)));

    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "HMS Accounts <accounts@aumrti.in>",
        to: [toEmail],
        subject: `Tally XML Export — ${hospital?.name} (${date_start} to ${date_end})`,
        html: `<p>Dear Team,</p><p>Please find attached the Tally Prime journal export for <strong>${hospital?.name}</strong> covering <strong>${date_start} to ${date_end}</strong>.</p><p>Import instructions:<br>1. Open Tally Prime<br>2. Gateway of Tally → Import → Data<br>3. Select the attached XML file</p><p>Regards,<br>HMS Accounts Module</p>`,
        attachments: [{
          filename,
          content: xmlBase64,
        }],
      }),
    });

    if (!emailRes.ok) {
      const errText = await emailRes.text();
      return new Response(JSON.stringify({ error: "Email send failed", detail: errText }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, sent_to: toEmail }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("email-tally-xml error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
