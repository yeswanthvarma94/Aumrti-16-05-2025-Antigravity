import React, { useState, useEffect, useCallback } from "react";
import { Routes, Route, Navigate, useSearchParams, useNavigate, useLocation } from "react-router-dom";
import PortalLogin, { PortalSession } from "./PortalLogin";
import PortalLayout from "./PortalLayout";
import PortalDashboard from "./PortalDashboard";
import PortalAppointments from "./PortalAppointments";
import PortalReports from "./PortalReports";
import PortalBills from "./PortalBills";
import PortalPrescriptions from "./PortalPrescriptions";
import PortalFeedback from "./PortalFeedback";
import PortalTimeline from "./PortalTimeline";
import { supabase } from "@/integrations/supabase/client";

const PatientPortal: React.FC = () => {
  const [session, setSession] = useState<PortalSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();

  const hospitalId = searchParams.get("h") || null;

  // Try restoring session from localStorage
  useEffect(() => {
    const token = localStorage.getItem("portal_session_token");
    const pid = localStorage.getItem("portal_patient_id");
    if (!token || !pid) { setLoading(false); return; }

    (async () => {
      const { data: sess } = await supabase
        .from("patient_portal_sessions")
        .select("patient_id, hospital_id")
        .eq("session_token", token)
        .eq("otp_verified", true)
        .maybeSingle();

      if (!sess) {
        localStorage.removeItem("portal_session_token");
        localStorage.removeItem("portal_patient_id");
        setLoading(false);
        return;
      }

      const s = sess as any;
      const { data: patient } = await supabase
        .from("patients")
        .select("full_name, uhid, phone, blood_group")
        .eq("id", s.patient_id)
        .maybeSingle();

      const { data: hospital } = await supabase
        .from("hospitals")
        .select("name, logo_url")
        .eq("id", s.hospital_id)
        .maybeSingle();

      if (patient && hospital) {
        setSession({
          patientId: s.patient_id,
          hospitalId: s.hospital_id,
          fullName: patient.full_name,
          uhid: patient.uhid,
          phone: patient.phone || "",
          hospitalName: hospital.name,
          hospitalLogo: hospital.logo_url,
          bloodGroup: patient.blood_group || null,
        });
      }
      setLoading(false);
    })();
  }, []);

  const handleLogin = useCallback((s: PortalSession) => {
    setSession(s);
    navigate("/portal/dashboard");
  }, [navigate]);

  const handleLogout = useCallback(() => {
    localStorage.removeItem("portal_session_token");
    localStorage.removeItem("portal_patient_id");
    setSession(null);
    navigate("/portal/login");
  }, [navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#F8FAFC" }}>
        <div className="w-8 h-8 border-3 rounded-full animate-spin" style={{ borderColor: "#E2E8F0", borderTopColor: "#0E7B7B" }} />
      </div>
    );
  }

  // Not logged in — show login on any portal route
  if (!session) {
    return (
      <Routes>
        <Route path="login" element={<PortalLogin hospitalId={hospitalId} onLogin={handleLogin} />} />
        <Route path="*" element={<Navigate to={`/portal/login${hospitalId ? `?h=${hospitalId}` : ""}`} replace />} />
      </Routes>
    );
  }

  // Logged in — wrap in portal layout
  return (
    <PortalLayout
      hospitalName={session.hospitalName}
      hospitalLogo={session.hospitalLogo}
      patientName={session.fullName}
      onLogout={handleLogout}
    >
      <Routes>
        <Route path="dashboard" element={<PortalDashboard session={session} />} />
        <Route path="appointments" element={<PortalAppointments session={session} />} />
        <Route path="reports" element={<PortalReports session={session} />} />
        <Route path="bills" element={<PortalBills session={session} />} />
        <Route path="prescriptions" element={<PortalPrescriptions session={session} />} />
        <Route path="timeline" element={<PortalTimeline session={session} />} />
        <Route path="feedback" element={<PortalFeedback session={session} />} />
        <Route path="*" element={<Navigate to="/portal/dashboard" replace />} />
      </Routes>
    </PortalLayout>
  );
};

export default PatientPortal;
