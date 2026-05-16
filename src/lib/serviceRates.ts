import { supabase } from "@/integrations/supabase/client";

/**
 * Resolve a hospital-specific default rate for a billing item from
 * the `service_rates` table. Falls back to the supplied default if
 * the hospital has not configured a rate for that code yet.
 *
 * Used by modules that need to bill a fixed-fee item (anaesthesia,
 * surgery, dialysis, ward charges, etc.) without hardcoding amounts.
 */
export async function getRate(
  hospitalId: string,
  itemCode: string,
  fallback: number = 0
): Promise<number> {
  if (!hospitalId || !itemCode) return fallback;
  const { data, error } = await (supabase as any)
    .from("service_rates")
    .select("default_rate")
    .eq("hospital_id", hospitalId)
    .eq("item_code", itemCode)
    .eq("is_active", true)
    .maybeSingle();
  if (error || !data) return fallback;
  const rate = Number(data.default_rate);
  return Number.isFinite(rate) ? rate : fallback;
}

/** Same as getRate but returns rate + GST so callers can compute taxes. */
export async function getRateWithGst(
  hospitalId: string,
  itemCode: string,
  fallbackRate: number = 0,
  fallbackGst: number = 0
): Promise<{ rate: number; gst: number }> {
  if (!hospitalId || !itemCode) return { rate: fallbackRate, gst: fallbackGst };
  const { data, error } = await (supabase as any)
    .from("service_rates")
    .select("default_rate, gst_rate")
    .eq("hospital_id", hospitalId)
    .eq("item_code", itemCode)
    .eq("is_active", true)
    .maybeSingle();
  if (error || !data) return { rate: fallbackRate, gst: fallbackGst };
  return {
    rate: Number(data.default_rate) || fallbackRate,
    gst: Number(data.gst_rate) || fallbackGst,
  };
}

/** Common item codes used across modules. Keep in sync with the seed list in SettingsServicesPage. */
export const SERVICE_RATE_CODES = {
  CONSULTATION: "consultation",
  ANAESTHESIA_FEE: "anaesthesia_fee",
  SURGERY_FEE: "surgery_fee",
  DIALYSIS_SESSION: "dialysis_session",
  ICU_PER_DAY: "icu_per_day",
  WARD_PER_DAY: "ward_per_day",
} as const;
