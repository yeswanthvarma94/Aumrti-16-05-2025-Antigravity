import { supabase } from "@/integrations/supabase/client";

/**
 * Safely parses a Fetch response as JSON, handling cases where the body might be empty, 
 * malformed, or an HTML error page.
 */
const safeParseJson = async (res: Response, provider: string): Promise<any> => {
  const text = await res.text();
  if (!text) {
    if (!res.ok) throw new Error(`${provider} error (${res.status} ${res.statusText})`);
    throw new Error(`${provider} returned an empty response`);
  }

  try {
    return JSON.parse(text);
  } catch (err) {
    console.debug(`Failed to parse ${provider} JSON response:`, text.substring(0, 500));
    if (!res.ok) throw new Error(`${provider} error (${res.status}): ${text.substring(0, 100)}...`);
    throw new Error(`${provider} returned malformed JSON: ${text.substring(0, 100)}...`);
  }
};

// Call the ai-proxy Edge Function — API keys stay server-side, never in the browser
const callViaProxy = async (
  provider: string,
  model: string,
  params: { prompt: string; systemPrompt?: string; maxTokens: number; temperature: number },
  hospitalId: string,
): Promise<AIResponse> => {
  const { data: { session } } = await supabase.auth.getSession();
  const supabaseUrl = (import.meta.env as Record<string, string>).VITE_SUPABASE_URL || "";
  const res = await fetch(`${supabaseUrl}/functions/v1/ai-proxy`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session?.access_token || ""}`,
      apikey: (import.meta.env as Record<string, string>).VITE_SUPABASE_ANON_KEY || "",
    },
    body: JSON.stringify({ provider, model, hospitalId, ...params }),
  });
  
  const data = await safeParseJson(res, "Proxy");
  if (data.error) return { text: "", provider, model, error: data.error };
  return { text: data.text || "", provider, model, tokens_used: data.tokens_used };
};

export interface AIRequest {
  featureKey: string;
  prompt: string;
  hospitalId: string;
  maxTokens?: number;
  systemPrompt?: string;
}

export interface AIResponse {
  text: string;
  provider: string;
  model: string;
  tokens_used?: number;
  error?: string;
}

interface ProviderCallParams {
  apiKey: string;
  model: string;
  prompt: string;
  systemPrompt?: string;
  maxTokens: number;
  temperature: number;
}

const PROVIDER_LABELS: Record<string, string> = {
  claude: "Anthropic (Claude)",
  openai: "OpenAI",
  gemini: "Google Gemini",
  perplexity: "Perplexity AI",
  ollama: "Ollama (Local)",
};

export const getProviderLabel = (provider: string) =>
  PROVIDER_LABELS[provider] || provider;

export const FEATURE_LABELS: Record<string, string> = {
  global_default: "Global Default",
  voice_scribe: "Voice Scribe (SOAP)",
  radiology_impression: "Radiology AI Impression",
  ai_digest: "AI Executive Digest",
  appeal_letter: "Appeal Letter Writer",
  discharge_summary: "Discharge Summary",
  icd_coding: "ICD-10 Code Suggester",
  document_ocr: "Document OCR (Vision)",
  discharge_instructions: "Discharge Instructions",
  voice_asr_engine: "Voice ASR Engine",
  revenue_leakage: "Revenue Leakage Detector",
  denial_predictor: "Denial Predictor",
  ot_optimizer: "OT Schedule Optimizer",
  no_show_predictor: "No-Show Predictor",
  sepsis_early_warning: "Sepsis Early Warning (NEWS2)",
  triage_classifier: "AI Triage Classifier",
  lab_anomaly: "Lab Anomaly Detector",
  vial_wastage: "Vial Wastage Optimizer",
  nabh_evidence: "NABH Auto-Evidence",
  financial_analysis: "Financial AI Analysis",
  prakriti_analysis: "Prakriti Analysis (AYUSH)",
  pre_auth_summary: "Pre-Auth Summary Generator",
  approval_predictor: "Pre-Auth Approval Predictor",
  meal_plan_ai: "Meal Plan Generator (Dietetics)",
  bed_demand_forecaster: "Bed Demand Forecaster",
  nabh_criteria_mapper: "NABH Criteria Mapper (AI)",
  drug_interaction_analysis: "Drug Interaction AI Analysis",
  care_plan_goal: "Nursing Care Plan Goal Suggester",
  pre_auth_ai_fill: "Pre-Auth Auto-Fill (AI)",
  tpa_query_reply: "TPA Query Reply Suggester",
  tpa_name_resolver: "TPA Name Auto-Resolver",
};

export const PROVIDER_TO_SERVICE_KEY: Record<string, string> = {
  claude: "anthropic",
  openai: "openai",
  azure_openai: "azure_openai",
  gemini: "gemini",
  perplexity: "perplexity",
};

export const PROVIDER_MODELS: Record<string, { label: string; value: string }[]> = {
  claude: [
    { label: "Claude Sonnet 4 (Recommended)", value: "claude-sonnet-4-20250514" },
    { label: "Claude Haiku 3.5 (Fastest)", value: "claude-3-5-haiku-20241022" },
    { label: "Claude Sonnet 3.5 v2", value: "claude-3-5-sonnet-20241022" },
    { label: "Claude Opus 3", value: "claude-3-opus-20240229" },
  ],
  openai: [
    { label: "GPT-4o (Recommended)", value: "gpt-4o" },
    { label: "GPT-4o Mini (Faster)", value: "gpt-4o-mini" },
    { label: "GPT-4 Turbo", value: "gpt-4-turbo" },
    { label: "o1 (Reasoning)", value: "o1" },
  ],
  gemini: [
    { label: "Gemini 2.0 Flash (Recommended)", value: "gemini-2.0-flash" },
    { label: "Gemini 2.0 Flash Lite (Fastest)", value: "gemini-2.0-flash-lite" },
    { label: "Gemini 2.5 Pro Preview", value: "gemini-2.5-pro-preview-06-05" },
    { label: "Gemini 2.5 Flash Preview", value: "gemini-2.5-flash-preview-05-20" },
    { label: "Gemini 1.5 Pro", value: "gemini-1.5-pro" },
    { label: "Gemini 1.5 Flash", value: "gemini-1.5-flash" },
  ],
  perplexity: [
    { label: "Sonar Large 128k Online", value: "llama-3.1-sonar-large-128k-online" },
    { label: "Sonar Small 128k Online", value: "llama-3.1-sonar-small-128k-online" },
    { label: "Llama 3.1 70B Instruct", value: "llama-3.1-70b-instruct" },
  ],
  ollama: [
    { label: "Llama 3", value: "llama3" },
    { label: "Mistral", value: "mistral" },
    { label: "CodeLlama", value: "codellama" },
    { label: "Phi 3", value: "phi3" },
  ],
};

const CUSTOM_MODELS_KEY = "aumrti_custom_models";

export function getCustomModels(provider: string): { label: string; value: string }[] {
  try {
    const stored = localStorage.getItem(CUSTOM_MODELS_KEY);
    if (!stored) return [];
    const all = JSON.parse(stored) as Record<string, { label: string; value: string }[]>;
    return all[provider] || [];
  } catch {
    return [];
  }
}

export function saveCustomModels(provider: string, models: { label: string; value: string }[]) {
  try {
    const stored = localStorage.getItem(CUSTOM_MODELS_KEY);
    const all = stored ? JSON.parse(stored) as Record<string, { label: string; value: string }[]> : {};
    all[provider] = models;
    localStorage.setItem(CUSTOM_MODELS_KEY, JSON.stringify(all));
  } catch { /* ignore */ }
}

export function getMergedModels(provider: string): { label: string; value: string; isCustom?: boolean }[] {
  const builtIn = (PROVIDER_MODELS[provider] || []).map(m => ({ ...m, isCustom: false }));
  const custom = getCustomModels(provider).map(m => ({ ...m, isCustom: true }));
  // Deduplicate by value, custom overrides built-in
  const seen = new Set<string>();
  const merged: { label: string; value: string; isCustom?: boolean }[] = [];
  for (const m of [...builtIn, ...custom]) {
    if (!seen.has(m.value)) {
      seen.add(m.value);
      merged.push(m);
    }
  }
  return merged;
}

export const KNOWN_SERVICES = [
  { service_key: "anthropic", service_name: "Anthropic (Claude)", emoji: "🤖", endpoint: "api.anthropic.com" },
  { service_key: "openai", service_name: "OpenAI", emoji: "💡", endpoint: "api.openai.com" },
  { service_key: "azure_openai", service_name: "Azure OpenAI (India Central — DPDP)", emoji: "🇮🇳", endpoint: "*.openai.azure.com" },
  { service_key: "gemini", service_name: "Google Gemini", emoji: "✨", endpoint: "generativelanguage.googleapis.com" },
  { service_key: "perplexity", service_name: "Perplexity AI", emoji: "🔍", endpoint: "api.perplexity.ai" },
  { service_key: "razorpay", service_name: "Razorpay", emoji: "💳", endpoint: "api.razorpay.com" },
  { service_key: "wati", service_name: "WATI (WhatsApp)", emoji: "📱", endpoint: "live-mt-server.wati.io" },
  { service_key: "sarvam", service_name: "Sarvam (Voice)", emoji: "🎙️", endpoint: "api.sarvam.ai" },
  { service_key: "bhashini", service_name: "Bhashini (MeitY)", emoji: "🇮🇳", endpoint: "meity-auth.ulcacontrib.org" },
  { service_key: "abdm", service_name: "ABDM / ABHA", emoji: "🏛️", endpoint: "abdm.gov.in" },
  { service_key: "nic_irp", service_name: "NIC IRP (GST e-Invoice)", emoji: "📄", endpoint: "einvoice1.gst.gov.in" },
  { service_key: "pmjay", service_name: "Ayushman Bharat / PM-JAY (NHA)", emoji: "🏥", endpoint: "bis.pmjay.gov.in" },
];

// ── Provider implementations ──────────────────────────

const callClaude = async (params: ProviderCallParams): Promise<AIResponse> => {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": params.apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: params.model,
      max_tokens: params.maxTokens,
      temperature: params.temperature,
      ...(params.systemPrompt ? { system: params.systemPrompt } : {}),
      messages: [{ role: "user", content: params.prompt }],
    }),
  });
  const data = await safeParseJson(response, "Claude");
  if (data.error) throw new Error(data.error.message);
  return {
    text: data.content?.[0]?.text || "",
    provider: "claude",
    model: params.model,
    tokens_used: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
  };
};

const callOpenAI = async (params: ProviderCallParams): Promise<AIResponse> => {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${params.apiKey}`,
    },
    body: JSON.stringify({
      model: params.model,
      max_tokens: params.maxTokens,
      temperature: params.temperature,
      messages: [
        ...(params.systemPrompt ? [{ role: "system" as const, content: params.systemPrompt }] : []),
        { role: "user" as const, content: params.prompt },
      ],
    }),
  });
  const data = await safeParseJson(response, "OpenAI");
  if (data.error) throw new Error(data.error.message);
  return {
    text: data.choices?.[0]?.message?.content || "",
    provider: "openai",
    model: params.model,
    tokens_used: data.usage?.total_tokens,
  };
};

const callGemini = async (params: ProviderCallParams): Promise<AIResponse> => {
  // Preview/experimental models live on v1beta; stable models use v1.
  const apiVersion = params.model.includes("preview") || params.model.includes("experimental")
    ? "v1beta"
    : "v1";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${params.model}:generateContent?key=${params.apiKey}`.replace("v1beta", apiVersion);
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: params.prompt }] }],
      generationConfig: {
        maxOutputTokens: params.maxTokens,
        temperature: params.temperature,
      },
    }),
  });
  const data = await safeParseJson(response, "Gemini");
  if (data.error) throw new Error(data.error.message);
  return {
    text: data.candidates?.[0]?.content?.parts?.[0]?.text || "",
    provider: "gemini",
    model: params.model,
    tokens_used: data.usageMetadata?.totalTokenCount,
  };
};

const callPerplexity = async (params: ProviderCallParams): Promise<AIResponse> => {
  const response = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${params.apiKey}`,
    },
    body: JSON.stringify({
      model: params.model,
      max_tokens: params.maxTokens,
      messages: [{ role: "user", content: params.prompt }],
    }),
  });
  const data = await safeParseJson(response, "Perplexity");
  if (data.error) throw new Error(data.error.message);
  return {
    text: data.choices?.[0]?.message?.content || "",
    provider: "perplexity",
    model: params.model,
  };
};

// ── Azure OpenAI (India Central — DPDP compliant) ─────
interface AzureConfig {
  endpoint: string;
  deployment: string;
  apiKey: string;
  apiVersion: string;
}

const getAzureConfigFromEnv = (): AzureConfig | null => {
  const env = import.meta.env as Record<string, string | undefined>;
  const endpoint = env.VITE_AZURE_OPENAI_ENDPOINT;
  const deployment = env.VITE_AZURE_OPENAI_DEPLOYMENT;
  const apiKey = env.VITE_AZURE_OPENAI_API_KEY;
  const apiVersion = env.VITE_AZURE_OPENAI_API_VERSION || "2024-02-01";
  if (!endpoint || !deployment || !apiKey) return null;
  return { endpoint: endpoint.replace(/\/$/, ""), deployment, apiKey, apiVersion };
};

const getAzureConfigFromDB = async (hospitalId: string): Promise<AzureConfig | null> => {
  const { data } = await supabase
    .from("api_configurations")
    .select("config")
    .eq("hospital_id", hospitalId)
    .eq("service_key", "azure_openai")
    .eq("is_active", true)
    .maybeSingle();
  const cfg = data?.config as Record<string, string> | undefined;
  if (!cfg?.api_key || !cfg?.endpoint || !cfg?.deployment) return null;
  return {
    endpoint: cfg.endpoint.replace(/\/$/, ""),
    deployment: cfg.deployment,
    apiKey: cfg.api_key,
    apiVersion: cfg.api_version || "2024-02-01",
  };
};

const callAzureOpenAI = async (
  cfg: AzureConfig,
  request: AIRequest,
  temperature = 0.3,
): Promise<AIResponse> => {
  const url = `${cfg.endpoint}/openai/deployments/${cfg.deployment}/chat/completions?api-version=${cfg.apiVersion}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "api-key": cfg.apiKey },
    body: JSON.stringify({
      messages: [
        ...(request.systemPrompt ? [{ role: "system", content: request.systemPrompt }] : []),
        { role: "user", content: request.prompt },
      ],
      max_tokens: request.maxTokens || 500,
      temperature,
    }),
  });
  const data = await safeParseJson(res, "Azure OpenAI");
  if (!res.ok) {
    return {
      text: "",
      provider: "azure_openai",
      model: cfg.deployment,
      error: data?.error?.message || "Azure OpenAI error",
    };
  }
  return {
    text: data.choices?.[0]?.message?.content || "",
    provider: "azure_openai",
    model: cfg.deployment,
    tokens_used: data.usage?.total_tokens,
  };
};

// ── ENV fallback keys ──────────────────────────

const ENV_KEYS: Record<string, string> = {
  claude: "VITE_ANTHROPIC_KEY",
  openai: "VITE_OPENAI_KEY",
  azure_openai: "VITE_AZURE_OPENAI_API_KEY",
  gemini: "VITE_GEMINI_KEY",
  perplexity: "VITE_PERPLEXITY_KEY",
  sarvam: "VITE_SARVAM_KEY",
  bhashini: "VITE_BHASHINI_KEY",
};

const getEnvKey = (provider: string): string | undefined => {
  const envVar = ENV_KEYS[provider];
  if (!envVar) return undefined;
  return (import.meta.env as Record<string, string>)[envVar] || undefined;
};

// ── Main callAI function ──────────────────────────

export const callAI = async (request: AIRequest): Promise<AIResponse> => {
  try {
    // Step 0: Azure OpenAI takes priority for DPDP data residency (called directly — uses env keys).
    const azureCfg =
      (await getAzureConfigFromDB(request.hospitalId)) || getAzureConfigFromEnv();

    // Step 1: Look up feature-specific config, fall back to global_default
    const { data: featureConfig } = await supabase
      .from("ai_provider_config")
      .select("*")
      .eq("hospital_id", request.hospitalId)
      .eq("feature_key", request.featureKey)
      .eq("is_active", true)
      .maybeSingle();

    let activeConfig = featureConfig;
    if (!activeConfig) {
      const { data: defaultConfig } = await supabase
        .from("ai_provider_config")
        .select("*")
        .eq("hospital_id", request.hospitalId)
        .eq("feature_key", "global_default")
        .eq("is_active", true)
        .maybeSingle();
      activeConfig = defaultConfig;
    }

    // Azure takes priority when available
    if (azureCfg && (!activeConfig || activeConfig.provider === "azure_openai" || activeConfig.provider === "openai")) {
      const temp = Number(activeConfig?.temperature) || 0.3;
      return await callAzureOpenAI(azureCfg, request, temp);
    }

    if (!activeConfig) {
      return { text: "", provider: "none", model: "none", error: "No AI provider configured. Go to Settings → API Hub." };
    }

    const { provider, model_name, temperature, max_tokens } = activeConfig;

    if (provider === "azure_openai") {
      return {
        text: "", provider, model: model_name,
        error: "Azure OpenAI selected but endpoint/deployment/key not configured. Set in Settings → API Hub.",
      };
    }

    const callParams = {
      prompt: request.prompt,
      systemPrompt: request.systemPrompt,
      maxTokens: request.maxTokens || max_tokens || 1000,
      temperature: Number(temperature) || 0.3,
    };

    // Route through the ai-proxy Edge Function — API key stays server-side, never in the browser
    if (["claude", "openai", "gemini", "perplexity"].includes(provider)) {
      return await callViaProxy(provider, model_name, callParams, request.hospitalId);
    }

    return { text: "", provider, model: model_name, error: `Unknown provider: ${provider}` };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown AI error";
    return { text: "", provider: "unknown", model: "unknown", error: message };
  }
};
