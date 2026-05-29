// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PROVIDER_TO_SERVICE_KEY: Record<string, string> = {
  claude: "anthropic",
  openai: "openai",
  gemini: "gemini",
  perplexity: "perplexity",
};

const ENV_KEY_NAMES: Record<string, string> = {
  claude: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  gemini: "GEMINI_API_KEY",
  perplexity: "PERPLEXITY_API_KEY",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  const safeParseJson = async (res: Response, provider: string): Promise<any> => {
    const text = await res.text();
    if (!text) {
      if (!res.ok) return { error: `${provider} error (${res.status} ${res.statusText})` };
      return { error: `${provider} returned an empty response` };
    }

    try {
      return JSON.parse(text);
    } catch (err) {
      console.error(`Failed to parse ${provider} JSON response:`, text.substring(0, 500));
      if (!res.ok) return { error: `${provider} error (${res.status}): ${text.substring(0, 100)}...` };
      return { error: `${provider} returned malformed JSON: ${text.substring(0, 100)}...` };
    }
  };

  try {
    // Verify the caller is authenticated
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user } } = await anonClient.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);

    const { provider, model, prompt, systemPrompt, maxTokens, temperature, hospitalId } =
      await req.json() as {
        provider: string;
        model: string;
        prompt: string;
        systemPrompt?: string;
        maxTokens?: number;
        temperature?: number;
        hospitalId: string;
      };

    // Use service role to fetch API key from DB — key never reaches the browser
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    let apiKey: string | undefined;
    const serviceKey = PROVIDER_TO_SERVICE_KEY[provider];
    if (serviceKey) {
      const { data } = await adminClient
        .from("api_configurations")
        .select("config")
        .eq("hospital_id", hospitalId)
        .eq("service_key", serviceKey)
        .eq("is_active", true)
        .maybeSingle();
      apiKey = (data?.config as Record<string, string>)?.api_key;
    }

    // Fall back to Supabase secrets (set via `supabase secrets set ANTHROPIC_API_KEY=...`)
    if (!apiKey) {
      apiKey = Deno.env.get(ENV_KEY_NAMES[provider] || "") || undefined;
    }

    if (!apiKey) {
      return json({
        error: `No API key configured for ${provider}. Add it in Settings → API Hub → ${provider.toUpperCase()}.`,
      }, 400);
    }

    const maxTok = maxTokens || 600;
    const temp = temperature ?? 0.3;
    let text = "";
    let tokens_used: number | undefined;

    if (provider === "claude") {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTok,
          temperature: temp,
          ...(systemPrompt ? { system: systemPrompt } : {}),
          messages: [{ role: "user", content: prompt }],
        }),
      });
      const data = await safeParseJson(res, "Claude");
      if (data.error) return json({ error: data.error }, 400);
      text = data.content?.[0]?.text || "";
      tokens_used = (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0);

    } else if (provider === "openai") {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          max_tokens: maxTok,
          temperature: temp,
          messages: [
            ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
            { role: "user", content: prompt },
          ],
        }),
      });
      const data = await safeParseJson(res, "OpenAI");
      if (data.error) return json({ error: data.error }, 400);
      text = data.choices?.[0]?.message?.content || "";
      tokens_used = data.usage?.total_tokens;

    } else if (provider === "gemini") {
      const apiVersion = (model.includes("preview") || model.includes("experimental")) ? "v1beta" : "v1";
      const url = `https://generativelanguage.googleapis.com/${apiVersion}/models/${model}:generateContent?key=${apiKey}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: maxTok, temperature: temp },
        }),
      });
      const data = await safeParseJson(res, "Gemini");
      if (data.error) return json({ error: data.error }, 400);
      text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
      tokens_used = data.usageMetadata?.totalTokenCount;

    } else if (provider === "perplexity") {
      const res = await fetch("https://api.perplexity.ai/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          max_tokens: maxTok,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      const data = await safeParseJson(res, "Perplexity");
      if (data.error) return json({ error: data.error }, 400);
      text = data.choices?.[0]?.message?.content || "";

    } else {
      return json({ error: `Unknown provider: ${provider}` }, 400);
    }

    return json({ text, tokens_used });

  } catch (err) {
    console.error("ai-proxy error:", err);
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
