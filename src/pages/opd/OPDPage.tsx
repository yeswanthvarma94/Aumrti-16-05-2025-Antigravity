import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import TokenQueue from "@/components/opd/TokenQueue";
import ConsultationWorkspace from "@/components/opd/ConsultationWorkspace";
import PatientSummary from "@/components/opd/PatientSummary";

export interface OpdToken {
  id: string;
  token_number: string;
  token_prefix: string;
  status: string;
  priority: string;
  visit_date: string;
  visit_type?: string | null;
  is_mlc?: boolean | null;
  called_at: string | null;
  consultation_start_at: string | null;
  consultation_end_at: string | null;
  created_at: string;
  patient_id: string;
  doctor_id: string | null;
  department_id: string | null;
  hospital_id: string;
  patient?: { full_name: string; phone: string | null; uhid: string; gender: string | null; dob: string | null; blood_group: string | null; allergies: string | null; chronic_conditions: string[] | null; insurance_id: string | null; address: string | null };
  doctor?: { full_name: string } | null;
  department?: { name: string } | null;
}

const OPDPage: React.FC = () => {
  const [tokens, setTokens] = useState<OpdToken[]>([]);
  const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null);
  const [showPatientDetails, setShowPatientDetails] = useState(false);
  const [hospitalId, setHospitalId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchTokens = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    const { data: userData, error: userErr } = await supabase.from("users").select("id, hospital_id, role").eq("auth_user_id", user.id).maybeSingle();
    if (userErr || !userData) { console.error("OPD user fetch error:", userErr?.message); setLoading(false); return; }
    setUserId(userData.id);
    setHospitalId(userData.hospital_id);
    setUserRole(userData.role);

    const today = new Date().toISOString().split("T")[0];
    let query = supabase
      .from("opd_tokens")
      .select("*, patient:patients(full_name, phone, uhid, gender, dob, blood_group, allergies, chronic_conditions, insurance_id, address), doctor:users!opd_tokens_doctor_id_fkey(full_name), department:departments(name)")
      .eq("hospital_id", userData.hospital_id)
      .eq("visit_date", today)
      .order("created_at", { ascending: true });

    if (userData.role === "doctor") {
      query = query.eq("doctor_id", userData.id);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching tokens:", error);
      toast({ title: "Failed to load OPD queue", description: "Please try again.", variant: "destructive" });
      setLoading(false);
      return;
    }
    setTokens((data as unknown as OpdToken[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchTokens(); }, [fetchTokens]);

  useEffect(() => {
    if (!hospitalId) return;
    const channel = supabase
      .channel("opd-tokens-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "opd_tokens", filter: `hospital_id=eq.${hospitalId}` }, () => fetchTokens())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [hospitalId, fetchTokens]);

  const selectedToken = tokens.find((t) => t.id === selectedTokenId) || null;

  return (
    <div className="flex flex-row h-full overflow-hidden">
      <TokenQueue tokens={tokens} selectedTokenId={selectedTokenId} onSelectToken={(id) => { setSelectedTokenId(id); setShowPatientDetails(false); }} hospitalId={hospitalId} loading={loading} onTokenCreated={fetchTokens} />
      <ConsultationWorkspace token={selectedToken} hospitalId={hospitalId} userId={userId} onTokenUpdate={fetchTokens} showPatientDetails={showPatientDetails} onTogglePatientDetails={() => setShowPatientDetails((p) => !p)} />
      {showPatientDetails && <PatientSummary token={selectedToken} hospitalId={hospitalId} onClose={() => setShowPatientDetails(false)} />}
    </div>
  );
};

export default OPDPage;
