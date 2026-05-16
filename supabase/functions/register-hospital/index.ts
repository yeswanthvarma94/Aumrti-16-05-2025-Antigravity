import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { hospital, admin } = await req.json();

    // Validate required fields
    if (!hospital?.name || !admin?.email || !admin?.password || !admin?.full_name) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Create auth user
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: admin.email,
      password: admin.password,
      email_confirm: true,
    });

    if (authError) {
      return new Response(
        JSON.stringify({ error: authError.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = authData.user.id;

    // Map bed count string to number
    const bedMap: Record<string, number> = {
      "under_30": 25,
      "30_50": 40,
      "51_100": 75,
      "101_200": 150,
      "201_500": 350,
      "500_plus": 600,
    };

    // Map hospital type to enum
    const typeMap: Record<string, string> = {
      "Private Hospital": "general",
      "Government Hospital": "general",
      "Trust / NGO Hospital": "general",
      "Corporate Hospital": "general",
      "Nursing Home": "nursing_home",
      "Clinic": "clinic",
      "Specialty Center": "specialty",
      "Dental Clinic": "clinic",
      "AYUSH Center": "clinic",
      "Other": "general",
    };

    // Map plan to subscription tier
    const planMap: Record<string, string> = {
      starter: "basic",
      professional: "professional",
      enterprise: "enterprise",
    };

    // 2. Insert hospital
    const { data: hospitalData, error: hospitalError } = await supabaseAdmin
      .from("hospitals")
      .insert({
        name: hospital.name,
        type: typeMap[hospital.type] || "general",
        state: hospital.state || null,
        beds_count: bedMap[hospital.bedCount] || 0,
        address: [hospital.address1, hospital.address2].filter(Boolean).join(", ") || null,
        pincode: hospital.pincode || null,
        gstin: hospital.gstin || null,
        nabh_number: hospital.nabhNumber || null,
        subscription_tier: planMap[hospital.plan] || "basic",
        country: "India",
        is_active: true,
      })
      .select("id")
      .maybeSingle();

    if (hospitalError || !hospitalData) {
      // Cleanup: delete auth user
      await supabaseAdmin.auth.admin.deleteUser(userId);
      return new Response(
        JSON.stringify({ error: hospitalError.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Insert user record
    const { error: userError } = await supabaseAdmin
      .from("users")
      .insert({
        auth_user_id: userId,
        hospital_id: hospitalData.id,
        full_name: admin.full_name,
        email: admin.email,
        phone: admin.phone || null,
        role: "super_admin",
        is_active: true,
        can_login: true,
      });

    // Seed default role permissions for the new hospital
    await supabaseAdmin.rpc("seed_default_roles_for_hospital", {
      p_hospital_id: hospitalData.id,
    });

    if (userError) {
      // Cleanup
      await supabaseAdmin.from("hospitals").delete().eq("id", hospitalData.id);
      await supabaseAdmin.auth.admin.deleteUser(userId);
      return new Response(
        JSON.stringify({ error: userError.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, hospitalId: hospitalData.id, userId }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
