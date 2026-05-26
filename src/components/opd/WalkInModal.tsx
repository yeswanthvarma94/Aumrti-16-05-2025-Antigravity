import React, { useState, useEffect, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import { useDebounce } from "@/hooks/useDebounce";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { X, Search, CheckCircle2, ArrowLeft, CreditCard, Printer, UserPlus, AlertTriangle, ShieldCheck } from "lucide-react";
import ABHARegistrationPanel from "@/components/abdm/ABHARegistrationPanel";
import { autoPostJournalEntry } from "@/lib/accounting";
import { generateBillNumber } from "@/hooks/useBillNumber";
import { logAudit } from "@/lib/auditLog";
import AddReferralDoctorModal from "@/components/shared/AddReferralDoctorModal";
import { printDocument, printHeader } from "@/lib/printUtils";

interface Props {
  hospitalId: string;
  onClose: () => void;
  onCreated: () => void;
  defaultDeptId?: string;
}

interface FoundPatient {
  id: string;
  full_name: string;
  uhid: string;
  phone: string | null;
  abha_id?: string | null;
}

const genders = ["male", "female", "other"] as const;
const priorities = ["normal", "urgent", "elderly", "pregnant", "disabled"] as const;

const priorityLabels: Record<string, { label: string; active: string }> = {
  normal: { label: "Normal", active: "bg-slate-700 text-white" },
  urgent: { label: "Urgent", active: "bg-red-600 text-white" },
  elderly: { label: "Elderly", active: "bg-amber-600 text-white" },
  pregnant: { label: "Pregnant", active: "bg-pink-600 text-white" },
  disabled: { label: "Disabled", active: "bg-violet-600 text-white" },
};

const PAYMENT_MODES = [
  { value: "cash", label: "💵 Cash" },
  { value: "upi", label: "📱 UPI" },
  { value: "card", label: "💳 Card" },
];

const DEFAULT_CONSULTATION_FEE = 500;

const WalkInModal: React.FC<Props> = ({ hospitalId, onClose, onCreated, defaultDeptId }) => {
  const { toast } = useToast();
  const [step, setStep] = useState<"details" | "payment" | "receipt">("details");
  const receiptRef = useRef<HTMLDivElement>(null);
  // Search
  const [phone, setPhone] = useState("");
  const [foundPatient, setFoundPatient] = useState<FoundPatient | null>(null);
  const [searching, setSearching] = useState(false);
  const [useExisting, setUseExisting] = useState(false);
  const [searchResults, setSearchResults] = useState<FoundPatient[]>([]);

  // New patient fields
  const [fullName, setFullName] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState<string>("male");
  const [showOptional, setShowOptional] = useState(false);
  const [dob, setDob] = useState("");
  const [bloodGroup, setBloodGroup] = useState("");
  const [address, setAddress] = useState("");
  const [allergies, setAllergies] = useState("");

  // Token fields
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [doctors, setDoctors] = useState<{ id: string; full_name: string; department_id: string | null }[]>([]);
  const [deptId, setDeptId] = useState("");
  const [doctorId, setDoctorId] = useState("");
  const [priority, setPriority] = useState("normal");
  const [nextToken, setNextToken] = useState("A-1");
  const [submitting, setSubmitting] = useState(false);
  const [dpdpConsent, setDpdpConsent] = useState(false);

  // Duplicate detection state
  const [dupeCandidate, setDupeCandidate] = useState<FoundPatient | null>(null);
  const [showDupeConfirm, setShowDupeConfirm] = useState(false);
  const [dupeResolveCallback, setDupeResolveCallback] = useState<(() => void) | null>(null);
  const [referralSource, setReferralSource] = useState("");
  const [referralDoctorId, setReferralDoctorId] = useState<string | null>(null);
  const [showReferralModal, setShowReferralModal] = useState(false);

  // Visit type / purpose
  const [visitType, setVisitType] = useState<"new" | "revisit" | "followup" | "emergency">("new");
  const [visitPurpose, setVisitPurpose] = useState<"new" | "revisit" | "follow_up" | "review" | "procedure">("new");
  const [revisitOfTokenId, setRevisitOfTokenId] = useState<string | null>(null);
  const [revisitSuggestion, setRevisitSuggestion] = useState<{ tokenId: string; date: string; doctor: string } | null>(null);

  // Revisit discount
  const [revisitDiscount, setRevisitDiscount] = useState(0);
  const [revisitDiscountNote, setRevisitDiscountNote] = useState("");

  // 21-M MLC
  const [isMlc, setIsMlc] = useState(false);
  const [policeStation, setPoliceStation] = useState("");
  const [showAbhaLink, setShowAbhaLink] = useState(false);

  // Payer
  const [payerType, setPayerType] = useState("cash");
  const [payerId, setPayerId] = useState<string | null>(null);
  const [payerMasters, setPayerMasters] = useState<{ id: string; payer_name: string; payer_type: string }[]>([]);

  // Payment fields
  const [consultationFee, setConsultationFee] = useState(DEFAULT_CONSULTATION_FEE);
  const [baseFee, setBaseFee] = useState(DEFAULT_CONSULTATION_FEE);
  const [paymentMode, setPaymentMode] = useState("cash");
  const [paymentRef, setPaymentRef] = useState("");
  const [receiptData, setReceiptData] = useState<{
    billNumber: string;
    patientName: string;
    uhid: string;
    department: string;
    doctor: string;
    token: string;
    fee: number;
    paymentMode: string;
    date: string;
    paid: boolean;
    discountNote?: string;
  } | null>(null);
  const [hospitalInfo, setHospitalInfo] = useState<{ name: string; address: string | null } | null>(null);

  useEffect(() => {
    if (hospitalId) {
      supabase.from("hospitals").select("name, address").eq("id", hospitalId).maybeSingle().then(({ data }) => {
        setHospitalInfo(data);
      });
      (supabase as any).from("payer_masters").select("id, payer_name, payer_type").eq("hospital_id", hospitalId).eq("is_active", true).order("payer_name")
        .then(({ data }: any) => setPayerMasters(data || []));
    }
  }, [hospitalId]);

  // Fetch departments + doctors
  useEffect(() => {
    supabase.from("departments").select("id, name").eq("hospital_id", hospitalId).eq("is_active", true).order("name", { ascending: true })
      .then(({ data }) => setDepartments(data || []));
    supabase.from("users").select("id, full_name, department_id").eq("hospital_id", hospitalId).eq("role", "doctor").eq("is_active", true).order("full_name", { ascending: true })
      .then(({ data }) => setDoctors(data || []));
  }, [hospitalId]);

  // Auto-select department if defaultDeptId provided
  useEffect(() => {
    if (defaultDeptId) setDeptId(defaultDeptId);
  }, [defaultDeptId]);

  // Token preview only — actual token generated atomically at insert time
  useEffect(() => {
    const today = new Date().toISOString().split("T")[0];
    let query = supabase
      .from("opd_tokens")
      .select("token_number")
      .eq("hospital_id", hospitalId)
      .eq("visit_date", today)
      .eq("token_prefix", "A");

    if (doctorId) {
      query = query.eq("doctor_id", doctorId);
    } else {
      query = query.is("doctor_id", null);
    }

    query
      .order("created_at", { ascending: false })
      .limit(1)
      .then(({ data }) => {
        if (data && data.length > 0) {
          const last = parseInt(data[0].token_number.split("-")[1] || "0");
          setNextToken(`A-${last + 1}`);
        } else {
          setNextToken("A-1");
        }
      });
  }, [hospitalId, doctorId]);

  const [feeSource, setFeeSource] = useState<"doctor" | "dept" | "default" | "global">("default");

  // Smart consultation fee lookup: doctor_id FK → department_id FK → global → fallback
  useEffect(() => {
    if (!hospitalId) return;
    (async () => {
      // 1. Doctor-specific rate (by doctor_id FK)
      if (doctorId) {
        const { data } = await (supabase as any)
          .from("service_master")
          .select("fee, follow_up_fee")
          .eq("hospital_id", hospitalId)
          .eq("doctor_id", doctorId)
          .eq("item_type", "consultation")
          .eq("is_active", true)
          .limit(1);
        if (data?.[0]?.fee) {
          setConsultationFee(data[0].fee);
          setBaseFee(data[0].fee);
          setFeeSource("doctor");
          return;
        }
      }
      // 2. Department-specific rate (by department_id FK, no doctor)
      if (deptId) {
        const { data } = await (supabase as any)
          .from("service_master")
          .select("fee, follow_up_fee")
          .eq("hospital_id", hospitalId)
          .eq("department_id", deptId)
          .is("doctor_id", null)
          .eq("item_type", "consultation")
          .eq("is_active", true)
          .limit(1);
        if (data?.[0]?.fee) {
          setConsultationFee(data[0].fee);
          setBaseFee(data[0].fee);
          setFeeSource("dept");
          return;
        }
      }
      // 3. Global consultation rate (no doctor, no dept)
      const { data } = await (supabase as any)
        .from("service_master")
        .select("fee, follow_up_fee")
        .eq("hospital_id", hospitalId)
        .eq("item_type", "consultation")
        .is("doctor_id", null)
        .is("department_id", null)
        .eq("is_active", true)
        .limit(1);
      if (data?.[0]?.fee) {
        setConsultationFee(data[0].fee);
        setBaseFee(data[0].fee);
        setFeeSource("global");
        return;
      }
      // 4. Hardcoded fallback
      setConsultationFee(DEFAULT_CONSULTATION_FEE);
      setBaseFee(DEFAULT_CONSULTATION_FEE);
      setFeeSource("default");
    })();
  }, [hospitalId, doctorId, deptId]);

  // Auto-detect revisit when patient + doctor are selected
  useEffect(() => {
    if (!foundPatient || !useExisting || !doctorId || !hospitalId) {
      setRevisitSuggestion(null);
      return;
    }
    (async () => {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];
      const { data } = await (supabase as any)
        .from("opd_tokens")
        .select("id, visit_date, doctor_id, users!doctor_id(full_name)")
        .eq("patient_id", foundPatient.id)
        .eq("doctor_id", doctorId)
        .gte("visit_date", thirtyDaysAgo)
        .in("status", ["completed", "in_consultation"])
        .order("visit_date", { ascending: false })
        .limit(1);
      if (data && data[0]) {
        const t = data[0];
        setRevisitSuggestion({
          tokenId: t.id,
          date: t.visit_date,
          doctor: t.users?.full_name || "",
        });
      } else {
        setRevisitSuggestion(null);
      }
    })();
  }, [foundPatient, useExisting, doctorId, hospitalId]);

  // Apply revisit discount rules when purpose changes
  useEffect(() => {
    if (!hospitalId || !revisitSuggestion || !["revisit", "follow_up", "review"].includes(visitPurpose)) {
      setRevisitDiscount(0);
      setRevisitDiscountNote("");
      setConsultationFee(baseFee);
      return;
    }
    (async () => {
      const { data } = await (supabase as any)
        .from("hospital_settings")
        .select("value")
        .eq("hospital_id", hospitalId)
        .eq("key", "opd_revisit_rules")
        .maybeSingle();
      if (!data?.value?.enabled || !Array.isArray(data.value.rules)) return;
      const daysSince = Math.floor((Date.now() - new Date(revisitSuggestion.date).getTime()) / 86400000);
      for (const rule of data.value.rules as { within_days: number; same_doctor: boolean; discount_type: string; amount: number }[]) {
        if (daysSince <= rule.within_days) {
          let discounted = baseFee;
          let note = "";
          if (rule.discount_type === "free") {
            discounted = 0;
            note = `Revisit discount — free within ${rule.within_days} days`;
          } else if (rule.discount_type === "percent") {
            discounted = Math.round(baseFee * (1 - rule.amount / 100));
            note = `Revisit discount — ${rule.amount}% off (within ${rule.within_days} days)`;
          } else if (rule.discount_type === "fixed") {
            discounted = Math.max(0, baseFee - rule.amount);
            note = `Revisit discount — ₹${rule.amount} off (within ${rule.within_days} days)`;
          }
          setConsultationFee(discounted);
          setRevisitDiscount(baseFee - discounted);
          setRevisitDiscountNote(note);
          return;
        }
      }
      setConsultationFee(baseFee);
      setRevisitDiscount(0);
      setRevisitDiscountNote("");
    })();
  }, [visitPurpose, revisitSuggestion, hospitalId, baseFee]);

  // Phone/name/UHID search
  const searchPatient = useCallback(async (val: string) => {
    if (val.length < 3) { setFoundPatient(null); setSearchResults([]); return; }
    setSearching(true);
    const { data } = await supabase
      .from("patients")
      .select("id, full_name, uhid, phone, abha_id")
      .eq("hospital_id", hospitalId)
      .or(`phone.ilike.%${val}%,full_name.ilike.%${val}%,uhid.ilike.%${val}%`)
      .limit(5);
    const results = data || [];
    setSearchResults(results);
    setFoundPatient(results.length === 1 ? results[0] : null);
    setSearching(false);
  }, [hospitalId]);

  const debouncedPhone = useDebounce(phone, 300);
  useEffect(() => {
    searchPatient(debouncedPhone);
  }, [debouncedPhone, searchPatient]);

  const filteredDoctors = deptId ? doctors.filter((d) => d.department_id === deptId) : doctors;
  const selectedDeptName = departments.find(d => d.id === deptId)?.name || "—";
  const selectedDoctorName = doctors.find(d => d.id === doctorId)?.full_name || "—";
  const patientDisplayName = useExisting ? foundPatient?.full_name || "" : fullName;

  const handleProceedToPayment = () => {
    if (!useExisting && !fullName.trim()) {
      toast({ title: "Patient name is required", variant: "destructive" });
      return;
    }
    if (!useExisting && !dpdpConsent) {
      toast({ title: "DPDP consent required", description: "Patient must consent to data collection before registration", variant: "destructive" });
      return;
    }
    setStep("payment");
  };

  const createPatient = async (): Promise<string> => {
    if (useExisting && foundPatient) return foundPatient.id;

    // Duplicate detection — check for existing patients with same phone or name+gender
    const { data: potentialDupes } = await supabase
      .from("patients")
      .select("id, full_name, uhid, phone")
      .eq("hospital_id", hospitalId)
      .or(`phone.eq.${phone},full_name.ilike.%${fullName.trim()}%`)
      .limit(5);

    const matchedDupe = (potentialDupes || []).find(p => {
      if (phone && p.phone === phone) return true;
      if (p.full_name?.toLowerCase() === fullName.trim().toLowerCase() && p.phone) return true;
      return false;
    });

    if (matchedDupe) {
      // Show confirmation and wait for resolution
      return new Promise<string>((resolve, reject) => {
        setDupeCandidate(matchedDupe);
        setDupeResolveCallback(() => () => {
          // "Create New Anyway" was clicked — proceed with insert
          setShowDupeConfirm(false);
          setDupeCandidate(null);
          insertNewPatient().then(resolve).catch(reject);
        });
        setShowDupeConfirm(true);
      });
    }

    return insertNewPatient();
  };

  const handleUseDupePatient = () => {
    if (dupeCandidate) {
      setFoundPatient(dupeCandidate);
      setUseExisting(true);
      setShowDupeConfirm(false);
      setDupeCandidate(null);
      // Re-trigger payment flow with existing patient
      handlePayAndIssue(false);
    }
  };

  const insertNewPatient = async (): Promise<string> => {
    const dateStr = new Date().toISOString().split("T")[0].replace(/-/g, "");
    const { count } = await supabase.from("patients").select("id", { count: "exact", head: true }).eq("hospital_id", hospitalId);
    const seq = String((count || 0) + 1).padStart(4, "0");
    const uhid = `UHID-${dateStr}-${seq}`;

    const patientData: {
      hospital_id: string;
      full_name: string;
      uhid: string;
      phone: string | null;
      gender: "male" | "female" | "other";
      dob?: string;
      blood_group?: string;
      address?: string;
    } = {
      hospital_id: hospitalId,
      full_name: fullName.trim(),
      uhid,
      phone: phone || null,
      gender: gender as "male" | "female" | "other",
    };
    if (age) {
      const y = new Date().getFullYear() - parseInt(age);
      patientData.dob = `${y}-01-01`;
    }
    if (dob) patientData.dob = dob;
    if (bloodGroup) patientData.blood_group = bloodGroup;
    if (address) patientData.address = address;
    (patientData as any).allergies = allergies.trim() || "NKDA";
    if (referralSource) (patientData as any).referral_source = referralSource;

    const { data: newPatient, error } = await supabase.from("patients").insert([patientData]).select("id").maybeSingle();
    if (error) throw error;
    return newPatient.id;
  };

  const handlePayAndIssue = async (skipPayment = false) => {
    setSubmitting(true);
    try {
      const patientId = await createPatient();

      // Log DPDP consent for new patients
      if (!useExisting) {
        try {
          const { getDPDPConsentText } = await import("@/lib/compliance-checks");
          const { data: hospitalData } = await supabase.from("hospitals").select("name").eq("id", hospitalId).maybeSingle();
          const consentText = getDPDPConsentText(hospitalData?.name || "Hospital");
          await (supabase as any).from("patient_consents").insert({
            hospital_id: hospitalId,
            patient_id: patientId,
            consent_type: "data_collection",
            consent_given: true,
            consent_text: consentText,
          });
        } catch (e) {
          console.error("DPDP consent log failed:", e);
        }
      }

      const { data: { user } } = await supabase.auth.getUser();
      const { data: userData } = await supabase
        .from("users").select("id").eq("auth_user_id", user?.id || "").maybeSingle();
      const userId = userData?.id || null;

      const today = new Date().toISOString().split("T")[0];

      // Generate bill number
      const billNumber = await generateBillNumber(hospitalId, "OPD");

      const fee = consultationFee;
      const isPaid = !skipPayment && fee > 0;
      const discountNote = revisitDiscountNote;

      // Create bill
      const { data: bill, error: billErr } = await supabase.from("bills").insert({
        hospital_id: hospitalId,
        patient_id: patientId,
        bill_number: billNumber,
        bill_type: "opd",
        bill_date: today,
        subtotal: fee,
        total_amount: fee,
        patient_payable: fee,
        paid_amount: isPaid ? fee : 0,
        balance_due: isPaid ? 0 : fee,
        payment_status: isPaid ? "paid" : "unpaid",
        bill_status: "final",
        created_by: userId,
      }).select("id").maybeSingle();
      if (billErr) throw billErr;

      // Audit: patient + bill creation
      if (!useExisting) logAudit({ action: "created", module: "opd", entityType: "patient", entityId: patientId });
      logAudit({ action: "created", module: "billing", entityType: "bill", entityId: bill.id, details: { billNumber, amount: fee } });

      // Insert line item
      await supabase.from("bill_line_items").insert({
        hospital_id: hospitalId,
        bill_id: bill.id,
        description: discountNote ? `Consultation Fee (${discountNote})` : "Consultation Fee",
        item_type: "consultation",
        unit_rate: revisitDiscount > 0 ? baseFee : fee,
        quantity: 1,
        discount_amount: revisitDiscount > 0 ? revisitDiscount : undefined,
        total_amount: fee,
      } as any);

      // Insert payment if paid
      if (isPaid) {
        await supabase.from("bill_payments").insert({
          hospital_id: hospitalId,
          bill_id: bill.id,
          payment_mode: paymentMode,
          amount: fee,
          transaction_id: paymentRef || null,
          received_by: userId,
        });

        // Auto-post journal entry
        await autoPostJournalEntry({
          triggerEvent: `bill_payment_${paymentMode}`,
          sourceModule: "billing",
          sourceId: bill.id,
          amount: fee,
          description: `OPD Consultation - Bill ${billNumber} - ${paymentMode}`,
          hospitalId,
          postedBy: userId || "",
        });
      }

      // Revenue recognition journal entry
      await autoPostJournalEntry({
        triggerEvent: "bill_finalized_opd",
        sourceModule: "billing",
        sourceId: bill.id,
        amount: fee,
        description: `OPD Revenue - Bill ${billNumber}`,
        hospitalId,
        postedBy: userId || "",
      });

      // Generate atomic token number via RPC (fallback to preview value)
      let atomicToken = nextToken;
      try {
        const { data: rpcToken } = await (supabase as any).rpc("generate_token_number", {
          p_hospital_id: hospitalId, 
          p_prefix: "A",
          p_doctor_id: doctorId || null,
        });
        if (rpcToken) atomicToken = rpcToken;
      } catch { /* fallback to preview token */ }

      // Insert token
      const { error: tokenErr } = await (supabase as any).from("opd_tokens").insert({
        hospital_id: hospitalId,
        patient_id: patientId,
        doctor_id: doctorId || null,
        department_id: deptId || null,
        token_number: atomicToken,
        token_prefix: "A",
        visit_date: today,
        status: "waiting",
        priority,
        visit_type: visitType,
        visit_purpose: visitPurpose,
        revisit_of_token_id: revisitOfTokenId || null,
        is_mlc: isMlc,
        payer_type: payerType,
        payer_id: payerId || null,
      });
      if (tokenErr) throw tokenErr;

      // Sync referral to CRM: create patient_acquisition + increment referral_doctors counters
      if (referralDoctorId) {
        const today2 = new Date().toISOString().split("T")[0];
        await supabase.from("patient_acquisition").insert({
          hospital_id: hospitalId,
          patient_id: patientId,
          source: "referral_doctor",
          referral_doctor_id: referralDoctorId,
          first_visit_date: today2,
          first_visit_revenue: fee,
          is_new_patient: !useExisting,
        } as any);

        // Increment referral count and revenue on the referral doctor
        const { data: rd } = await supabase
          .from("referral_doctors")
          .select("total_referrals, total_revenue")
          .eq("id", referralDoctorId)
          .maybeSingle();
        if (rd) {
          await supabase.from("referral_doctors").update({
            total_referrals: (rd.total_referrals || 0) + 1,
            total_revenue: (rd.total_revenue || 0) + fee,
            last_referral_at: new Date().toISOString(),
          }).eq("id", referralDoctorId);
        }
      }
      const rData = {
        billNumber,
        patientName: patientDisplayName || "—",
        uhid: useExisting ? foundPatient?.uhid || "" : "New",
        department: selectedDeptName,
        doctor: doctorId ? `Dr. ${selectedDoctorName}` : "—",
        token: atomicToken,
        fee,
        paymentMode: isPaid ? paymentMode : "—",
        date: today,
        paid: isPaid,
        discountNote: discountNote || undefined,
      };
      setReceiptData(rData);
      setStep("receipt");

      const statusMsg = isPaid
        ? `Token ${atomicToken} issued · ₹${fee.toLocaleString("en-IN")} collected ✓`
        : `Token ${atomicToken} issued · Payment pending`;
      toast({ title: statusMsg });
    } catch (err: unknown) {
      toast({ title: "Registration failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handlePrintReceipt = () => {
    if (!receiptData) return;
    
    const hospitalName = hospitalInfo?.name || "Hospital Receipt";
    const hospitalAddress = hospitalInfo?.address || "";
    
    const paidLabel = receiptData.paid ? "Paid (" + receiptData.paymentMode + ")" : "Pending";
    const paidClass = receiptData.paid ? "paid" : "pending";
    
    const header = printHeader(hospitalName, hospitalAddress);
    
    const body = `
      ${header}
      <div style="text-align:center; border-bottom:1px dashed #cbd5e1; padding-bottom:10px; margin-bottom:10px;">
        <strong style="font-size:16px;">OPD CONSULTATION RECEIPT</strong><br/>
        <small>${receiptData.date}</small>
      </div>
      
      <div class="row"><span class="label">Bill No.</span><span class="amount">${receiptData.billNumber}</span></div>
      <div class="row"><span class="label">Patient</span><span class="value">${receiptData.patientName}</span></div>
      <div class="row"><span class="label">UHID</span><span class="amount">${receiptData.uhid}</span></div>
      <div class="row"><span class="label">Department</span><span class="value">${receiptData.department}</span></div>
      <div class="row"><span class="label">Doctor</span><span class="value">${receiptData.doctor}</span></div>
      
      <div style="border-top:1px dashed #cbd5e1; padding-top:10px; margin-top:10px;">
        <div class="row">
          <span class="label">Token</span>
          <span style="font-size:24px; font-weight:800; color:#1A2F5A;">${receiptData.token}</span>
        </div>
        <div class="row">
          <span class="label">Consultation Fee</span>
          <span class="amount" style="font-size:16px;">₹${receiptData.fee.toLocaleString("en-IN")}</span>
        </div>
        ${receiptData.discountNote ? `<div class="row"><span class="label" style="color:#059669;">Discount Applied</span><span style="color:#059669;font-size:11px;">${receiptData.discountNote}</span></div>` : ""}
        <div class="row">
          <span class="label">Payment</span>
          <span class="${paidClass}">${paidLabel}</span>
        </div>
      </div>
      
      <style>
        .row { display: flex; justify-content: space-between; margin-bottom: 6px; }
        .label { color: #64748b; font-size: 12px; }
        .value { font-weight: 600; color: #1e293b; text-align: right; }
        .paid { color: #059669; font-weight: 600; }
        .pending { color: #d97706; font-weight: 600; }
        .amount { font-family: 'JetBrains Mono', monospace; font-weight: 600; }
      </style>
      
      <div style="text-align:center; font-size:11px; color:#94a3b8; margin-top:20px; border-top:1px dashed #cbd5e1; padding-top:10px;">
        Thank you for visiting. Get well soon!
      </div>
    `;
    
    printDocument("OPD Receipt", body, { width: 450, height: 650 });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="bg-white rounded-2xl p-7 w-full max-w-[440px] shadow-xl relative max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>

        {step === "details" ? (
          <>
            <h2 className="text-lg font-bold text-slate-900">Quick Registration</h2>
            <p className="text-[13px] text-slate-500 mt-0.5">Register patient in under 30 seconds</p>

            {/* Search */}
            <div className="mt-5">
              <label className="text-xs font-medium text-slate-600">Search Patient (Name, Phone, or UHID)</label>
              <div className="relative mt-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => { setPhone(e.target.value); setUseExisting(false); setFoundPatient(null); }}
                  placeholder="Search by name, phone, or UHID..."
                  className="w-full h-10 pl-9 pr-3 border border-slate-200 rounded-lg text-sm focus:border-[#1A2F5A] focus:ring-2 focus:ring-[#1A2F5A]/10 outline-none"
                />
              </div>
              {searchResults.length > 0 && !useExisting && (
                <div className="mt-2 border border-slate-200 rounded-lg overflow-hidden">
                  {searchResults.map((p) => (
                    <button key={p.id} onClick={async () => {
                      setFoundPatient(p); setUseExisting(true); setSearchResults([]);
                      const { count } = await supabase.from("opd_tokens").select("id", { count: "exact", head: true }).eq("patient_id", p.id);
                      if (count && count > 0) setVisitType("revisit");
                    }}
                      className="w-full text-left px-3 py-2 hover:bg-emerald-50 border-b border-slate-100 last:border-0 flex items-center gap-2">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-slate-800">{p.full_name}</p>
                        <p className="text-[11px] text-slate-500">{p.uhid} · {p.phone || "No phone"}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {useExisting && foundPatient && (
                <div className="mt-2 space-y-2">
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        <span className="text-xs font-medium text-emerald-700">Patient selected</span>
                      </div>
                      {foundPatient.abha_id && (
                        <span className="text-[10px] flex items-center gap-1 text-emerald-700 font-semibold">
                          <ShieldCheck className="h-3 w-3" /> ABHA ✓
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-medium text-slate-800 mt-1">{foundPatient.full_name} · {foundPatient.uhid}</p>
                    <div className="flex items-center gap-3 mt-1">
                      <button onClick={() => { setUseExisting(false); setFoundPatient(null); setShowAbhaLink(false); }} className="text-[11px] text-slate-500 hover:underline">Change</button>
                      {!foundPatient.abha_id && (
                        <button
                          onClick={() => setShowAbhaLink(!showAbhaLink)}
                          className="text-[11px] text-blue-600 hover:underline font-medium flex items-center gap-1"
                        >
                          {showAbhaLink ? "Hide ABHA" : "+ Link / Create ABHA"}
                        </button>
                      )}
                    </div>
                  </div>
                  {showAbhaLink && !foundPatient.abha_id && (
                    <div className="p-3 border border-blue-200 rounded-lg bg-blue-50/30">
                      <ABHARegistrationPanel
                        patientId={foundPatient.id}
                        patientName={foundPatient.full_name}
                        patientMobile={foundPatient.phone || ""}
                        onComplete={(abhaNumber) => {
                          setFoundPatient((prev) => prev ? { ...prev, abha_id: abhaNumber } : prev);
                          setShowAbhaLink(false);
                        }}
                        onSkip={() => setShowAbhaLink(false)}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* New patient fields */}
            {!useExisting && (
              <div className="mt-4 space-y-3">
                <div>
                  <label className="text-xs font-medium text-slate-600">Full Name *</label>
                  <input value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full h-10 px-3 border border-slate-200 rounded-lg text-sm mt-1 focus:border-[#1A2F5A] focus:ring-2 focus:ring-[#1A2F5A]/10 outline-none" placeholder="Patient full name" />
                </div>
                <div className="flex gap-3">
                  <div className="w-24">
                    <label className="text-xs font-medium text-slate-600">Age</label>
                    <input type="number" value={age} onChange={(e) => setAge(e.target.value)} min={0} max={120} className="w-full h-10 px-3 border border-slate-200 rounded-lg text-sm mt-1 focus:border-[#1A2F5A] focus:ring-2 focus:ring-[#1A2F5A]/10 outline-none" placeholder="Age" />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs font-medium text-slate-600">Gender</label>
                    <div className="flex gap-1.5 mt-1">
                      {genders.map((g) => (
                        <button key={g} onClick={() => setGender(g)}
                          className={cn("flex-1 h-10 rounded-lg text-xs font-medium capitalize transition-colors",
                            gender === g ? "bg-[#1A2F5A] text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                          )}>
                          {g}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {!showOptional && (
                    <button onClick={() => setShowOptional(true)} className="text-xs text-[#1A2F5A] font-medium hover:underline">
                      + Add more details (optional)
                    </button>
                  )}
                  <a href="/patients?register=true" target="_blank" rel="noopener noreferrer" className="text-xs text-slate-500 hover:text-[#1A2F5A] hover:underline">
                    Need full registration? →
                  </a>
                </div>
                {showOptional && (
                  <div className="space-y-3 pt-1">
                    <div className="flex gap-3">
                      <div className="flex-1">
                        <label className="text-xs font-medium text-slate-600">DOB</label>
                        <input type="date" value={dob} onChange={(e) => setDob(e.target.value)} className="w-full h-10 px-3 border border-slate-200 rounded-lg text-sm mt-1 outline-none" />
                      </div>
                      <div className="w-28">
                        <label className="text-xs font-medium text-slate-600">Blood Group</label>
                        <select value={bloodGroup} onChange={(e) => setBloodGroup(e.target.value)} className="w-full h-10 px-2 border border-slate-200 rounded-lg text-sm mt-1 outline-none">
                          <option value="">—</option>
                          {["A+","A-","B+","B-","AB+","AB-","O+","O-"].map((bg) => <option key={bg} value={bg}>{bg}</option>)}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-600">Address</label>
                      <input value={address} onChange={(e) => setAddress(e.target.value)} className="w-full h-10 px-3 border border-slate-200 rounded-lg text-sm mt-1 outline-none" placeholder="Address (optional)" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-600">Known Allergies</label>
                      <input value={allergies} onChange={(e) => setAllergies(e.target.value)} className="w-full h-10 px-3 border border-slate-200 rounded-lg text-sm mt-1 outline-none" placeholder="e.g., Penicillin, Sulfa, NKDA (No Known Drug Allergies)" />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Department + Doctor */}
            <div className="flex gap-3 mt-4">
              <div className="flex-1">
                <label className="text-xs font-medium text-slate-600">Department</label>
                <select value={deptId} onChange={(e) => { setDeptId(e.target.value); setDoctorId(""); }} className="w-full h-10 px-2 border border-slate-200 rounded-lg text-sm mt-1 outline-none">
                  <option value="">Select...</option>
                  {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
                {departments.length === 0 && (
                  <Link to="/settings/departments" className="text-[10px] text-amber-600 hover:underline mt-0.5 block">No departments — add in Settings →</Link>
                )}
              </div>
              <div className="flex-1">
                <label className="text-xs font-medium text-slate-600">Doctor</label>
                <select value={doctorId} onChange={(e) => setDoctorId(e.target.value)} className="w-full h-10 px-2 border border-slate-200 rounded-lg text-sm mt-1 outline-none">
                  <option value="">Select...</option>
                  {filteredDoctors.map((d) => <option key={d.id} value={d.id}>Dr. {d.full_name}</option>)}
                </select>
                {doctors.length === 0 && (
                  <Link to="/settings/staff" className="text-[10px] text-amber-600 hover:underline mt-0.5 block">No doctors — add in Settings →</Link>
                )}
              </div>
            </div>

            {/* Referral */}
            <div className="mt-3">
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-slate-600">Referral</label>
                <button
                  onClick={() => setShowReferralModal(true)}
                  className="text-xs text-[#0E7B7B] font-medium hover:underline flex items-center gap-1"
                >
                  <UserPlus className="h-3 w-3" />
                  + Referral
                </button>
              </div>
              {referralSource && (
                <div className="mt-1 px-3 py-1.5 bg-teal-50 border border-teal-200 rounded-lg text-xs text-teal-800 flex items-center justify-between">
                  <span>Referred by: <strong>{referralSource}</strong></span>
                  <button onClick={() => { setReferralSource(""); setReferralDoctorId(null); }} className="text-teal-500 hover:text-teal-700 ml-2">✕</button>
                </div>
              )}
            </div>
            <div className="mt-4">
              <label className="text-xs font-medium text-slate-600">Priority</label>
              <div className="flex gap-1.5 mt-1">
                {priorities.map((p) => (
                  <button key={p} onClick={() => setPriority(p)}
                    className={cn("flex-1 h-8 rounded-lg text-[11px] font-medium capitalize transition-colors",
                      priority === p ? priorityLabels[p].active : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    )}>
                    {priorityLabels[p].label}
                  </button>
                ))}
              </div>
            </div>

            {/* Visit Type */}
            <div className="mt-4">
              <label className="text-xs font-medium text-slate-600">Visit Type</label>
              <div className="flex gap-1.5 mt-1">
                {(["new", "revisit", "followup", "emergency"] as const).map((vt) => (
                  <button key={vt} onClick={() => setVisitType(vt)}
                    className={cn("flex-1 h-8 rounded-lg text-[11px] font-medium capitalize transition-colors",
                      visitType === vt
                        ? vt === "emergency" ? "bg-red-600 text-white"
                          : vt === "revisit" ? "bg-amber-600 text-white"
                          : vt === "followup" ? "bg-violet-600 text-white"
                          : "bg-[#1A2F5A] text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    )}>
                    {vt === "followup" ? "Follow-up" : vt.charAt(0).toUpperCase() + vt.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Visit Purpose */}
            <div className="mt-3">
              <label className="text-xs font-medium text-slate-600">Visit Purpose</label>
              <select
                value={visitPurpose}
                onChange={(e) => setVisitPurpose(e.target.value as typeof visitPurpose)}
                className="w-full h-9 px-2 mt-1 border border-slate-200 rounded-lg text-xs outline-none bg-white"
              >
                <option value="new">New Consultation</option>
                <option value="revisit">Revisit (same problem)</option>
                <option value="follow_up">Follow-Up</option>
                <option value="review">Review</option>
                <option value="procedure">Procedure</option>
              </select>
            </div>

            {/* Revisit auto-detection suggestion */}
            {revisitSuggestion && (
              <div className="mt-2 p-2.5 bg-amber-50 border border-amber-300 rounded-lg">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[11px] font-semibold text-amber-800">
                      Possible revisit detected
                    </p>
                    <p className="text-[11px] text-amber-700 mt-0.5">
                      Last visit: {new Date(revisitSuggestion.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                      {revisitSuggestion.doctor ? ` · Dr. ${revisitSuggestion.doctor}` : ""}
                    </p>
                    {revisitDiscountNote && (
                      <p className="text-[11px] text-emerald-700 font-semibold mt-0.5">
                        🏷 {revisitDiscountNote} · Fee: ₹{consultationFee.toLocaleString("en-IN")}
                        {revisitDiscount > 0 && <span className="line-through text-slate-400 ml-1 font-normal">₹{baseFee.toLocaleString("en-IN")}</span>}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-1.5 flex-shrink-0">
                    <button
                      onClick={() => {
                        setRevisitOfTokenId(revisitSuggestion.tokenId);
                        if (visitPurpose === "new") setVisitPurpose("revisit");
                        setRevisitSuggestion(null);
                      }}
                      className="text-[10px] bg-amber-600 text-white px-2 py-1 rounded font-semibold hover:bg-amber-700"
                    >
                      Link Visit
                    </button>
                    <button
                      onClick={() => setRevisitSuggestion(null)}
                      className="text-[10px] text-amber-600 border border-amber-300 px-2 py-1 rounded hover:bg-amber-50"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* MLC Flag */}
            <div className="mt-3 flex items-start gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={isMlc} onChange={(e) => setIsMlc(e.target.checked)}
                  className="rounded border-slate-300 accent-red-600" />
                <span className="text-xs font-medium text-slate-700">Medico-Legal Case (MLC)</span>
              </label>
              {isMlc && (
                <input value={policeStation} onChange={(e) => setPoliceStation(e.target.value)}
                  placeholder="Police station name"
                  className="flex-1 h-8 px-2 border border-red-300 rounded-lg text-xs outline-none focus:border-red-500 focus:ring-1 focus:ring-red-200" />
              )}
            </div>
            {isMlc && (
              <div className="mt-1 px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-[11px] text-red-700 font-medium">MLC — Inform police within 24 hours. Maintain MLC register.</p>
              </div>
            )}

            {/* Payer Type */}
            <div className="mt-3">
              <label className="text-xs font-medium text-slate-600">Payer Type</label>
              <div className="flex gap-2 mt-1">
                <select value={payerType} onChange={(e) => { setPayerType(e.target.value); setPayerId(null); }}
                  className="flex-1 h-9 px-2 border border-slate-200 rounded-lg text-xs outline-none">
                  <option value="cash">Cash</option>
                  <option value="credit">Credit / Deferred</option>
                  <option value="corporate">Corporate</option>
                  <option value="tpa">TPA / Insurance</option>
                  <option value="pmjay">PMJAY / Ayushman</option>
                  <option value="cghs">CGHS</option>
                  <option value="esi">ESI</option>
                  <option value="state_scheme">State Scheme</option>
                  <option value="other">Other</option>
                </select>
                {payerType !== "cash" && (
                  <select value={payerId || ""} onChange={(e) => setPayerId(e.target.value || null)}
                    className="flex-1 h-9 px-2 border border-slate-200 rounded-lg text-xs outline-none">
                    <option value="">Select payer…</option>
                    {payerMasters.filter((pm) => pm.payer_type === payerType).map((pm) => (
                      <option key={pm.id} value={pm.id}>{pm.payer_name}</option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            {/* DPDP Consent */}
            {!useExisting && (
              <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={dpdpConsent}
                    onChange={(e) => setDpdpConsent(e.target.checked)}
                    className="mt-0.5 rounded border-blue-300 accent-blue-600"
                  />
                  <span className="text-xs text-blue-900 leading-relaxed">
                    Patient consents to collection and processing of personal and health data
                    as required for medical treatment, billing, and regulatory compliance
                    under the <strong>Digital Personal Data Protection Act, 2023</strong>.
                  </span>
                </label>
              </div>
            )}

            {/* Token preview */}
            <div className="mt-4 p-3 bg-slate-50 rounded-lg border border-slate-100 text-center">
              <span className="text-xs text-slate-500">Token </span>
              <span className="text-lg font-bold text-[#1A2F5A]">{nextToken}</span>
              <span className="text-xs text-slate-500"> will be assigned</span>
            </div>

            {/* Proceed to Payment */}
            <button
              onClick={handleProceedToPayment}
              className="w-full h-11 mt-4 bg-[#1A2F5A] text-white rounded-lg text-[13px] font-semibold hover:bg-[#152647] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
            >
              <CreditCard className="h-4 w-4" />
              Proceed to Payment →
            </button>
          </>
        ) : step === "payment" ? (
          /* ══════════ STEP 2: PAYMENT ══════════ */
          <>
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-[#0E7B7B]" />
              Collect Consultation Fee
            </h2>
            <p className="text-[13px] text-slate-500 mt-0.5">Pay before token issuance</p>

            {/* Patient summary */}
            <div className="mt-5 p-3 bg-slate-50 rounded-lg border border-slate-100 space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Patient</span>
                <span className="font-medium text-slate-800">{patientDisplayName || "—"}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Department</span>
                <span className="font-medium text-slate-800">{selectedDeptName}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Doctor</span>
                <span className="font-medium text-slate-800">{doctorId ? `Dr. ${selectedDoctorName}` : "—"}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Token</span>
                <span className="font-bold text-[#1A2F5A]">{nextToken}</span>
              </div>
            </div>

            {/* Consultation Fee */}
            <div className="mt-4">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-slate-600">Consultation Fee (₹)</label>
                <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded",
                  feeSource === "doctor" ? "bg-emerald-100 text-emerald-700" :
                  feeSource === "dept" ? "bg-blue-100 text-blue-700" :
                  feeSource === "global" ? "bg-slate-100 text-slate-600" :
                  "bg-amber-100 text-amber-700"
                )}>
                  {feeSource === "doctor" ? "Doctor rate" : feeSource === "dept" ? "Dept rate" : feeSource === "global" ? "Global rate" : "Default rate"}
                </span>
              </div>
              <input
                type="number"
                value={consultationFee}
                onChange={(e) => { setConsultationFee(Number(e.target.value) || 0); setFeeSource("default"); }}
                min={0}
                className="w-full h-12 px-4 border border-slate-200 rounded-lg text-lg font-bold mt-1 focus:border-[#0E7B7B] focus:ring-2 focus:ring-[#0E7B7B]/10 outline-none"
              />
            </div>

            {/* Payment Mode */}
            <div className="mt-4">
              <label className="text-xs font-medium text-slate-600">Payment Mode</label>
              <div className="flex gap-2 mt-1.5">
                {PAYMENT_MODES.map((m) => (
                  <button
                    key={m.value}
                    onClick={() => setPaymentMode(m.value)}
                    className={cn(
                      "flex-1 h-11 rounded-lg text-sm font-medium transition-colors",
                      paymentMode === m.value
                        ? "bg-[#0E7B7B] text-white shadow-md"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    )}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Reference for UPI/Card */}
            {paymentMode !== "cash" && (
              <div className="mt-3">
                <label className="text-xs font-medium text-slate-600">Reference / Txn ID</label>
                <input
                  value={paymentRef}
                  onChange={(e) => setPaymentRef(e.target.value)}
                  placeholder="Transaction reference..."
                  className="w-full h-10 px-3 border border-slate-200 rounded-lg text-sm mt-1 focus:border-[#0E7B7B] focus:ring-2 focus:ring-[#0E7B7B]/10 outline-none"
                />
              </div>
            )}

            {/* Pay & Issue Token */}
            <button
              onClick={() => handlePayAndIssue(false)}
              disabled={submitting || consultationFee <= 0}
              className="w-full h-12 mt-5 bg-[#0E7B7B] text-white rounded-lg text-[14px] font-bold hover:bg-[#0a6565] active:scale-[0.98] transition-all disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {submitting ? "Processing..." : `💳 Pay ₹${consultationFee.toLocaleString("en-IN")} & Issue Token →`}
            </button>

            {/* Skip / Back */}
            <div className="flex items-center justify-between mt-3">
              <button
                onClick={() => setStep("details")}
                className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1"
              >
                <ArrowLeft className="h-3 w-3" /> Back to details
              </button>
              <button
                onClick={() => handlePayAndIssue(true)}
                disabled={submitting}
                className="text-xs text-amber-600 font-medium hover:underline"
              >
                Skip — Pay Later →
              </button>
            </div>
          </>
        ) : (
          /* ══════════ STEP 3: RECEIPT ══════════ */
          <>
            <h2 className="text-lg font-bold text-emerald-700 flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5" />
              Token Issued Successfully
            </h2>

            {/* Printable Receipt */}
            <div ref={receiptRef} className="mt-4 border border-slate-200 rounded-lg p-5 bg-white" id="opd-receipt">
              <div className="text-center border-b border-dashed border-slate-300 pb-3 mb-3">
                <p className="text-sm font-bold text-slate-800">OPD CONSULTATION RECEIPT</p>
                <p className="text-[11px] text-slate-500 mt-0.5">{receiptData?.date}</p>
              </div>

              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Bill No.</span>
                  <span className="font-mono font-medium text-slate-800">{receiptData?.billNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Patient</span>
                  <span className="font-medium text-slate-800">{receiptData?.patientName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">UHID</span>
                  <span className="font-mono text-slate-800">{receiptData?.uhid}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Department</span>
                  <span className="text-slate-800">{receiptData?.department}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Doctor</span>
                  <span className="text-slate-800">{receiptData?.doctor}</span>
                </div>
              </div>

              <div className="border-t border-dashed border-slate-300 mt-3 pt-3 space-y-1.5">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Token</span>
                  <span className="text-lg font-bold text-[#1A2F5A]">{receiptData?.token}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Consultation Fee</span>
                  <span className="font-bold text-slate-800">₹{receiptData?.fee?.toLocaleString("en-IN")}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Payment</span>
                  <span className={cn("font-medium", receiptData?.paid ? "text-emerald-600" : "text-amber-600")}>
                    {receiptData?.paid ? `Paid (${receiptData.paymentMode})` : "Pending"}
                  </span>
                </div>
              </div>

              <div className="border-t border-dashed border-slate-300 mt-3 pt-2 text-center">
                <p className="text-[10px] text-slate-400">Thank you for visiting. Get well soon!</p>
              </div>
            </div>

            {/* Print + Done buttons */}
            <div className="flex gap-3 mt-4">
              <button
                onClick={handlePrintReceipt}
                className="flex-1 h-11 bg-[#1A2F5A] text-white rounded-lg text-[13px] font-semibold hover:bg-[#152647] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
              >
                <Printer className="h-4 w-4" /> Print Receipt
              </button>
              <button
                onClick={() => { onCreated(); onClose(); }}
                className="flex-1 h-11 bg-slate-100 text-slate-700 rounded-lg text-[13px] font-semibold hover:bg-slate-200 active:scale-[0.98] transition-all"
              >
                Done
              </button>
            </div>
          </>
        )}
      </div>
      <div onClick={(e) => e.stopPropagation()}>
        <AddReferralDoctorModal
          open={showReferralModal}
          onClose={() => setShowReferralModal(false)}
          onSaved={(name, id) => { setReferralSource(name); setReferralDoctorId(id || null); }}
          hospitalId={hospitalId}
        />

        {/* Duplicate patient confirmation dialog */}
        {showDupeConfirm && dupeCandidate && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40" onClick={() => setShowDupeConfirm(false)}>
            <div className="bg-background rounded-xl p-6 w-full max-w-[380px] shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                <h3 className="text-sm font-bold text-foreground">Possible Duplicate Patient</h3>
              </div>
              <p className="text-xs text-muted-foreground mb-3">A patient with similar details already exists:</p>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
                <p className="text-sm font-medium text-foreground">{dupeCandidate.full_name}</p>
                <p className="text-xs text-muted-foreground">{dupeCandidate.uhid} · Phone: {dupeCandidate.phone || "—"}</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleUseDupePatient}
                  className="flex-1 h-9 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  Use Existing Patient
                </button>
                <button
                  onClick={() => { if (dupeResolveCallback) dupeResolveCallback(); }}
                  className="flex-1 h-9 text-xs font-medium rounded-lg border border-border text-foreground hover:bg-muted"
                >
                  Create New Anyway
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default WalkInModal;
