import { supabase } from "@/integrations/supabase/client";

export type PatientGender = "male" | "female" | "other";

export interface BasicPatientRecord {
  id: string;
  full_name: string;
  uhid: string;
  phone: string | null;
}

export const calculateDobFromAge = (age?: number | null) => {
  if (!age || Number.isNaN(age) || age <= 0) return null;

  const dob = new Date();
  dob.setFullYear(dob.getFullYear() - age);
  return dob.toISOString().slice(0, 10);
};

export async function generatePatientUhid(hospitalId: string) {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const { data, error } = await supabase.rpc("next_seq", { p_hospital_id: hospitalId, p_type: "uhid" });
  if (error) throw error;
  const seq = String(data ?? 1).padStart(4, "0");
  return `UHID-${dateStr}-${seq}`;
}

export async function findPatientByPhone(hospitalId: string, phone: string) {
  const normalizedPhone = phone.trim();
  if (normalizedPhone.length < 10) return null;

  const { data, error } = await supabase
    .from("patients")
    .select("id, full_name, uhid, phone")
    .eq("hospital_id", hospitalId)
    .eq("phone", normalizedPhone)
    .maybeSingle();

  if (error) throw error;
  return (data as BasicPatientRecord | null) ?? null;
}

interface CreatePatientParams {
  hospitalId: string;
  fullName: string;
  phone?: string;
  dob?: string | null;
  gender?: PatientGender | null;
}

export async function createPatientRecord({
  hospitalId,
  fullName,
  phone,
  dob,
  gender,
}: CreatePatientParams) {
  const uhid = await generatePatientUhid(hospitalId);

  const { data, error } = await supabase
    .from("patients")
    .insert({
      hospital_id: hospitalId,
      uhid,
      full_name: fullName.trim() || "Walk-in Customer",
      phone: phone?.trim() || null,
      dob: dob || null,
      gender: gender || null,
    })
    .select("id, full_name, uhid, phone")
    .maybeSingle();

  if (error) throw error;
  return data as BasicPatientRecord;
}