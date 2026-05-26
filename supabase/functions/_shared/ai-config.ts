// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PROVIDER_SERVICE_KEYS: Record<string, string> = {
  claude: "anthropic",
  openai: "openai",
  gemini: "gemini",
  perplexity: "perplexity",
};

const PROVIDER_ENV_KEYS: Record<string, string> = {
  claude: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  gemini: "GEMINI_API_KEY",
  perplexity: "PERPLEXITY_API_KEY",
};

export interface AiConfig {
  provider: string;
  model: string;
  apiKey: string;
  temperature: number;
  maxTokens: number;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * Resolve AI config for a hospital+feature from the API Configuration Hub.
 * Falls back to global_default if no feature-specific row found.
 * Returns null if no config or API key is available.
 */
export async function resolveAiConfig(
  hospitalId: string,
  featureKey: string,
  defaultMaxTokens = 1000,
): Promise<AiConfig | null> {
  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Feature-specific config first, then global_default
  let cfg: Record<string, unknown> | null = null;
  const { data: featureCfg } = await sb
    .from("ai_provider_config")
    .select("provider, model_name, temperature, max_tokens")
    .eq("hospital_id", hospitalId)
    .eq("feature_key", featureKey)
    .eq("is_active", true)
    .maybeSingle();

  cfg = featureCfg;

  if (!cfg) {
    const { data: defaultCfg } = await sb
      .from("ai_provider_config")
      .select("provider, model_name, temperature, max_tokens")
      .eq("hospital_id", hospitalId)
      .eq("feature_key", "global_default")
      .eq("is_active", true)
      .maybeSingle();
    cfg = defaultCfg;
  }

  if (!cfg) return null;

  // Get API key from api_configurations
  const serviceKey = PROVIDER_SERVICE_KEYS[cfg.provider as string];
  let apiKey: string | undefined;

  if (serviceKey) {
    const { data: keyCfg } = await sb
      .from("api_configurations")
      .select("config")
      .eq("hospital_id", hospitalId)
      .eq("service_key", serviceKey)
      .eq("is_active", true)
      .maybeSingle();
    apiKey = (keyCfg?.config as Record<string, string>)?.api_key;
  }

  // Env var fallback
  if (!apiKey) {
    const envKey = PROVIDER_ENV_KEYS[cfg.provider as string];
    apiKey = envKey ? (Deno.env.get(envKey) || undefined) : undefined;
  }

  if (!apiKey) return null;

  return {
    provider: cfg.provider as string,
    model: cfg.model_name as string,
    apiKey,
    temperature: Number(cfg.temperature) || 0.3,
    maxTokens: Number(cfg.max_tokens) || defaultMaxTokens,
  };
}

/**
 * Resolve AI config from env vars only (no hospitalId required).
 * Tries providers in order: openai → claude → gemini.
 */
export function resolveAiConfigFromEnv(defaultMaxTokens = 1000): AiConfig | null {
  const priorities = [
    { provider: "openai", envKey: "OPENAI_API_KEY", model: "gpt-4o" },
    { provider: "claude", envKey: "ANTHROPIC_API_KEY", model: "claude-sonnet-4-20250514" },
    { provider: "gemini", envKey: "GEMINI_API_KEY", model: "gemini-1.5-pro" },
  ];
  for (const { provider, envKey, model } of priorities) {
    const apiKey = Deno.env.get(envKey);
    if (apiKey) return { provider, model, apiKey, temperature: 0.3, maxTokens: defaultMaxTokens };
  }
  return null;
}

/**
 * Call the configured AI provider with chat messages. Returns the response text.
 */
export async function callAiChat(
  config: AiConfig,
  messages: ChatMessage[],
  maxTokens?: number,
  temperature?: number,
): Promise<string> {
  const maxTok = maxTokens ?? config.maxTokens;
  const temp = temperature ?? config.temperature;

  if (config.provider === "claude") {
    const systemMsg = messages.find((m) => m.role === "system");
    const chatMsgs = messages.filter((m) => m.role !== "system");
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": config.apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: maxTok,
        temperature: temp,
        ...(systemMsg ? { system: systemMsg.content } : {}),
        messages: chatMsgs.map((m) => ({ role: m.role, content: m.content })),
      }),
    });
    if (!res.ok) throw new Error(`Claude error ${res.status}: ${await res.text()}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    return data.content?.[0]?.text || "";
  }

  if (config.provider === "openai") {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: config.model,
        max_tokens: maxTok,
        temperature: temp,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
      }),
    });
    if (!res.ok) throw new Error(`OpenAI error ${res.status}: ${await res.text()}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    return data.choices?.[0]?.message?.content || "";
  }

  if (config.provider === "gemini") {
    const systemMsg = messages.find((m) => m.role === "system");
    const chatMsgs = messages.filter((m) => m.role !== "system");
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${config.apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(systemMsg ? { system_instruction: { parts: [{ text: systemMsg.content }] } } : {}),
        contents: chatMsgs.map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        })),
        generationConfig: { maxOutputTokens: maxTok, temperature: temp },
      }),
    });
    if (!res.ok) throw new Error(`Gemini error ${res.status}: ${await res.text()}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  }

  if (config.provider === "perplexity") {
    const res = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: config.model,
        max_tokens: maxTok,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
      }),
    });
    if (!res.ok) throw new Error(`Perplexity error ${res.status}: ${await res.text()}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    return data.choices?.[0]?.message?.content || "";
  }

  throw new Error(`Unsupported AI provider: ${config.provider}`);
}

/**
 * Call the configured AI provider with a vision (image + text) input.
 * Supports openai, gemini, and claude providers.
 */
export async function callAiVision(
  config: AiConfig,
  base64Image: string,
  mediaType: string,
  textPrompt: string,
  maxTokens?: number,
): Promise<string> {
  const maxTok = maxTokens ?? config.maxTokens;

  if (config.provider === "openai") {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: config.model,
        max_tokens: maxTok,
        messages: [{
          role: "user",
          content: [
            { type: "image_url", image_url: { url: `data:${mediaType};base64,${base64Image}` } },
            { type: "text", text: textPrompt },
          ],
        }],
      }),
    });
    if (!res.ok) throw new Error(`OpenAI vision error ${res.status}`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content || "";
  }

  if (config.provider === "gemini") {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${config.apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inline_data: { mime_type: mediaType, data: base64Image } },
            { text: textPrompt },
          ],
        }],
        generationConfig: { maxOutputTokens: maxTok },
      }),
    });
    if (!res.ok) throw new Error(`Gemini vision error ${res.status}`);
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  }

  if (config.provider === "claude") {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": config.apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: maxTok,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: base64Image } },
            { type: "text", text: textPrompt },
          ],
        }],
      }),
    });
    if (!res.ok) throw new Error(`Claude vision error ${res.status}`);
    const data = await res.json();
    return data.content?.[0]?.text || "";
  }

  throw new Error(`Provider ${config.provider} does not support vision input`);
}
