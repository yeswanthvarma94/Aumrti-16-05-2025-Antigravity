/**
 * WhatsApp Send Engine — Level 2 (WATI auto-send with wa.me fallback)
 * 
 * Usage:
 *   import { sendWhatsApp } from "@/lib/whatsapp-send";
 *   await sendWhatsApp({ hospitalId, phone, message, notificationId });
 */

import { supabase } from "@/integrations/supabase/client";

interface SendOpts {
  hospitalId: string;
  phone: string;
  message: string;
  notificationId?: string;
}

function cleanPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.startsWith("91") ? digits : `91${digits}`;
}

/**
 * Attempts WATI API send if configured, falls back to wa.me deeplink.
 * Returns { method: "wati" | "wame", success: boolean }
 */
export async function sendWhatsApp(opts: SendOpts): Promise<{ method: "wati" | "wame"; success: boolean }> {
  const cleanedPhone = cleanPhone(opts.phone);

  // Check if WATI is configured for this hospital
  const { data: hospital } = await supabase
    .from("hospitals")
    .select("wati_api_url, wati_api_key, whatsapp_enabled")
    .eq("id", opts.hospitalId)
    .maybeSingle();

  const watiUrl = hospital?.wati_api_url;
  const watiKey = (hospital as any)?.wati_api_key;

  if (watiUrl && hospital?.whatsapp_enabled) {
    // ── WATI API path ──
    try {
      const response = await fetch(
        `${watiUrl}/api/v1/sendSessionMessage/${cleanedPhone}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(watiKey ? { "Authorization": `Bearer ${watiKey}` } : {}),
          },
          body: JSON.stringify({ messageText: opts.message }),
        }
      );

      if (response.ok) {
        // Update notification record
        if (opts.notificationId) {
          await supabase
            .from("whatsapp_notifications")
            .update({ sent_at: new Date().toISOString() } as any)
            .eq("id", opts.notificationId);
        }
        return { method: "wati", success: true };
      }

      // WATI failed — fall through to wa.me
      console.warn("WATI send failed, falling back to wa.me", response.status);
    } catch (err) {
      console.warn("WATI error, falling back to wa.me", err);
    }
  }

  // ── wa.me fallback ──
  const waUrl = `https://wa.me/${cleanedPhone}?text=${encodeURIComponent(opts.message)}`;
  window.open(waUrl, "_blank", "noopener,noreferrer");
  return { method: "wame", success: true };
}

/**
 * Attempts WATI API template send if configured, falls back to wa.me deeplink with a generic message.
 */
export async function sendWATITemplate(opts: {
  hospitalId: string;
  phone: string;
  templateName: string;
  broadcastName: string;
  parameters: { name: string; value: string }[];
}): Promise<{ method: "wati" | "wame"; success: boolean }> {
  const cleanedPhone = cleanPhone(opts.phone);

  const { data: hospital } = await supabase
    .from("hospitals")
    .select("wati_api_url, wati_api_key, whatsapp_enabled")
    .eq("id", opts.hospitalId)
    .maybeSingle();

  const watiUrl = hospital?.wati_api_url;
  const watiKey = (hospital as any)?.wati_api_key;

  if (watiUrl && hospital?.whatsapp_enabled) {
    try {
      const response = await fetch(
        `${watiUrl}/api/v1/sendTemplateMessage/${cleanedPhone}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(watiKey ? { "Authorization": `Bearer ${watiKey}` } : {}),
          },
          body: JSON.stringify({
            template_name: opts.templateName,
            broadcast_name: opts.broadcastName,
            parameters: opts.parameters,
          }),
        }
      );

      if (response.ok) {
        return { method: "wati", success: true };
      }
      console.warn("WATI template send failed, falling back to wa.me", response.status);
    } catch (err) {
      console.warn("WATI template error, falling back to wa.me", err);
    }
  }

  // Fallback if no WATI: construct a generic fallback message since we can't send templates via wa.me directly
  const fallbackMessage = `Hello! This is a message from the hospital regarding ${opts.broadcastName.replace(/_/g, " ")}. Please check your portal for details.`;
  const waUrl = `https://wa.me/${cleanedPhone}?text=${encodeURIComponent(fallbackMessage)}`;
  window.open(waUrl, "_blank", "noopener,noreferrer");
  return { method: "wame", success: true };
}

/**
 * Check if a hospital has auto-send enabled for a trigger event.
 * Returns the wati_template_name if enabled, else false.
 */
export async function shouldAutoSend(hospitalId: string, triggerEvent: string): Promise<string | false> {
  const { data: hospital } = await supabase
    .from("hospitals")
    .select("wati_api_url, whatsapp_enabled")
    .eq("id", hospitalId)
    .maybeSingle();

  if (!hospital?.wati_api_url || !hospital?.whatsapp_enabled) return false;

  const { data: template } = await supabase
    .from("whatsapp_templates")
    .select("auto_send, is_active, wati_template_name")
    .eq("hospital_id", hospitalId)
    .eq("trigger_event", triggerEvent)
    .maybeSingle();

  if (template?.is_active && template?.auto_send) {
    return template.wati_template_name || triggerEvent;
  }
  return false;
}
