import React, { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, Plus, X, Users, Stethoscope, HeartPulse,
  Receipt, Pill, TestTube, ClipboardList, Shield, Wrench, Trash2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/* ─── Types ─── */
type AppRole = string;

interface StaffForm {
  full_name: string;
  phone: string;
  email: string;
  role: AppRole;
  department_id: string;
  registration_number: string;
  ward_id: string;
  // Employment & Salary
  employee_id: string;
  employment_type: string;
  basic_salary: string;
  hra_percent: string;
  da_percent: string;
  conveyance: string;
  medical_allowance: string;
  pf_applicable: boolean;
  esic_applicable: boolean;
  uan_number: string;
  pan_number: string;
  esi_ip_number: string;
  license_expiry_date: string;
  // Doctor pricing
  consultation_fee: string;
  follow_up_fee: string;
  validity_days: string;
}

const EMPTY_FORM: StaffForm = {
  full_name: "", phone: "", email: "", role: "" as AppRole,
  department_id: "", registration_number: "", ward_id: "",
  employee_id: "", employment_type: "permanent", basic_salary: "",
  hra_percent: "20", da_percent: "10", conveyance: "1600", medical_allowance: "1250",
  pf_applicable: true, esic_applicable: false, uan_number: "", pan_number: "", esi_ip_number: "", license_expiry_date: "",
  consultation_fee: "", follow_up_fee: "", validity_days: "7",
};

/* ─── Role config ─── */
const ROLE_META: Record<string, { icon: React.ElementType; label: string; color: string }> = {
  doctor:            { icon: Stethoscope,   label: "Doctor",            color: "bg-blue-50 text-blue-700 border-blue-200" },
  nurse:             { icon: HeartPulse,    label: "Nurse",             color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  accountant:        { icon: Receipt,       label: "Accountant",        color: "bg-amber-50 text-amber-700 border-amber-200" },
  billing_executive: { icon: Receipt,       label: "Billing Executive", color: "bg-amber-50 text-amber-700 border-amber-200" },
  billing_staff:     { icon: Receipt,       label: "Billing Staff",     color: "bg-amber-50 text-amber-700 border-amber-200" },
  cfo:               { icon: Receipt,       label: "CFO",               color: "bg-amber-50 text-amber-700 border-amber-200" },
  pharmacist:        { icon: Pill,          label: "Pharmacist",        color: "bg-violet-50 text-violet-700 border-violet-200" },
  lab_tech:          { icon: TestTube,      label: "Lab Tech",          color: "bg-rose-50 text-rose-700 border-rose-200" },
  lab_technician:    { icon: TestTube,      label: "Lab Technician",    color: "bg-rose-50 text-rose-700 border-rose-200" },
  radiologist:       { icon: TestTube,      label: "Radiologist",       color: "bg-rose-50 text-rose-700 border-rose-200" },
  receptionist:      { icon: ClipboardList, label: "Reception",         color: "bg-green-50 text-green-700 border-green-200" },
  hr_manager:        { icon: Users,         label: "HR Manager",        color: "bg-cyan-50 text-cyan-700 border-cyan-200" },
  hospital_admin:    { icon: Shield,        label: "Admin",             color: "bg-[hsl(222,55%,23%)] text-white border-transparent" },
  super_admin:       { icon: Shield,        label: "Super Admin",       color: "bg-[hsl(222,55%,23%)] text-white border-transparent" },
};

const DEFAULT_ROLE_CARDS: { role: AppRole; icon: React.ElementType; label: string }[] = [
  { role: "doctor",         icon: Stethoscope,   label: "Doctor" },
  { role: "nurse",          icon: HeartPulse,     label: "Nurse" },
  { role: "accountant",     icon: Receipt,        label: "Billing" },
  { role: "pharmacist",     icon: Pill,           label: "Pharmacist" },
  { role: "lab_tech",       icon: TestTube,       label: "Lab Tech" },
  { role: "receptionist",   icon: ClipboardList,  label: "Reception" },
  { role: "hospital_admin", icon: Shield,         label: "Admin / CEO" },
];

/* Valid app_role enum values from Postgres — staff role MUST be one of these */
const VALID_APP_ROLES = [
  "super_admin", "hospital_admin", "doctor", "nurse", "receptionist",
  "pharmacist", "lab_tech", "accountant", "billing_executive", "hr_manager",
  "lab_technician", "radiologist", "cfo", "billing_staff",
] as const;
const VALID_APP_ROLES_SET = new Set<string>(VALID_APP_ROLES);

/* ─── Bulk doctor row ─── */
interface BulkRow { name: string; speciality: string; phone: string; dept_id: string; fee: string }
const EMPTY_BULK: BulkRow = { name: "", speciality: "", phone: "", dept_id: "", fee: "" };

/* ─── Page ─── */
const SettingsStaffPage: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [filter, setFilter] = useState("all");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<StaffForm>(EMPTY_FORM);

  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkRows, setBulkRows] = useState<BulkRow[]>([{ ...EMPTY_BULK }]);

  const [loginModal, setLoginModal] = useState<{ open: boolean; userId: string; userName: string; email: string } | null>(null);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [creatingLogin, setCreatingLogin] = useState(false);

  /* ─── Queries ─── */
  const { data: users, isLoading } = useQuery({
    queryKey: ["settings-staff"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users")
        .select("id, full_name, email, phone, role, is_active, registration_number, department_id, auth_user_id, can_login")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: departments } = useQuery({
    queryKey: ["settings-departments-list"],
    queryFn: async () => {
      const { data } = await supabase.from("departments").select("id, name").eq("is_active", true).order("name");
      return data ?? [];
    },
  });

  const { data: wards } = useQuery({
    queryKey: ["settings-wards-list"],
    queryFn: async () => {
      const { data } = await supabase.from("wards").select("id, name").eq("is_active", true).order("name");
      return data ?? [];
    },
  });

  const { data: customRoles } = useQuery({
    queryKey: ["settings-custom-roles"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("role_permissions")
        .select("role_name, role_label, is_system_role")
        .order("role_label");
      return data ?? [];
    },
  });

  /* ─── Dynamic role cards + filter tabs ─── */
  // Always show the 7 system defaults. If admins customised a role label
  // (via Roles & Permissions) for a VALID app_role enum value, use that label.
  // Custom synthetic names (custom_*) or any role outside the DB enum are ignored
  // because users.role is a strict Postgres ENUM and would reject them.
  const ROLE_CARDS = useMemo(() => {
    const labelOverride = new Map<string, string>();
    (customRoles ?? []).forEach((r: any) => {
      if (VALID_APP_ROLES_SET.has(r.role_name) && r.role_label) {
        labelOverride.set(r.role_name, r.role_label);
      }
    });
    return DEFAULT_ROLE_CARDS.map((c) => ({
      ...c,
      label: labelOverride.get(c.role) || c.label,
    }));
  }, [customRoles]);

  /* ─── Computed ─── */
  const filtered = useMemo(() => {
    if (!users) return [];
    if (filter === "all") return users;
    if (filter === "admin") return users.filter((u) => u.role === "hospital_admin" || u.role === "super_admin");
    return users.filter((u) => u.role === filter);
  }, [users, filter]);

  const FILTER_TABS = useMemo(() => {
    const tabs: { key: string; label: string }[] = [{ key: "all", label: "All" }];
    if (!users) return tabs;
    const roleCounts = new Map<string, number>();
    users.forEach((u) => {
      const r = u.role;
      // Skip any legacy/invalid role values that aren't in the enum
      if (!VALID_APP_ROLES_SET.has(r)) return;
      roleCounts.set(r, (roleCounts.get(r) || 0) + 1);
    });
    roleCounts.forEach((_, role) => {
      if (role === "hospital_admin" || role === "super_admin") {
        if (!tabs.find((t) => t.key === "admin")) tabs.push({ key: "admin", label: "Admin" });
      } else {
        const meta = ROLE_META[role];
        const customRole = customRoles?.find((cr: any) => cr.role_name === role);
        tabs.push({ key: role, label: customRole?.role_label || meta?.label || role });
      }
    });
    return tabs;
  }, [users, customRoles]);

  const doctorCount = useMemo(() => users?.filter((u) => u.role === "doctor").length ?? 0, [users]);

  /* ─── Mutations ─── */
  const getHospitalId = async () => {
    const { data } = await supabase.from("users").select("hospital_id").limit(1).maybeSingle();
    if (!data) throw new Error("No hospital context");
    return data.hospital_id;
  };

  // Only send department_id for roles that actually use the departments dropdown
  const getSafeDepartmentId = () => {
    return form.department_id && form.department_id.trim() !== "" ? form.department_id : null;
  };

  const buildProfilePayload = (userId: string, hid: string, deptId: string | null) => ({
    user_id: userId,
    hospital_id: hid,
    designation: form.role,
    employment_type: form.employment_type || "permanent",
    department_id: deptId,
    registration_number: form.registration_number || null,
    employee_id: form.employee_id || null,
    basic_salary: form.basic_salary ? parseFloat(form.basic_salary) : null,
    hra_percent: form.hra_percent ? parseFloat(form.hra_percent) : 20,
    da_percent: form.da_percent ? parseFloat(form.da_percent) : 10,
    conveyance: form.conveyance ? parseFloat(form.conveyance) : 1600,
    medical_allowance: form.medical_allowance ? parseFloat(form.medical_allowance) : 1250,
    pf_applicable: form.pf_applicable,
    esic_applicable: form.esic_applicable,
    uan_number: form.uan_number || null,
    pan_number: form.pan_number || null,
    esi_ip_number: form.esi_ip_number || null,
    license_expiry_date: form.license_expiry_date || null,
    is_active: true,
  });

  const saveStaff = useMutation({
    mutationFn: async () => {
      // Guard: role must be a valid Postgres app_role enum value
      if (!form.role || !VALID_APP_ROLES_SET.has(form.role)) {
        throw new Error("Please select a valid role before saving.");
      }
      const hid = await getHospitalId();
      const deptId = getSafeDepartmentId();
      if (editingId) {
        const { error } = await supabase.from("users").update({
          full_name: form.full_name,
          phone: form.phone || null,
          email: form.email,
          role: form.role as any,
          department_id: deptId,
          registration_number: form.registration_number || null,
        }).eq("id", editingId);
        if (error) throw error;

        // Upsert staff_profiles with salary data
        await (supabase as any).from("staff_profiles").upsert(
          buildProfilePayload(editingId, hid, deptId),
          { onConflict: "user_id" }
        );
      } else {
        const newId = crypto.randomUUID();
        const { error } = await supabase.from("users").insert({
          id: newId,
          hospital_id: hid,
          full_name: form.full_name,
          email: form.email || `${form.phone || Date.now()}@placeholder.local`,
          phone: form.phone || null,
          role: form.role as any,
          department_id: deptId,
          registration_number: form.registration_number || null,
          is_active: true,
          can_login: false,
          auth_user_id: null,
        } as any);
        if (error) throw error;

        // Create staff_profiles row with salary data
        await (supabase as any).from("staff_profiles").insert(buildProfilePayload(newId, hid, deptId));

        // Create service_master row for doctor consultation fee
        if (form.role === "doctor" && form.consultation_fee) {
          const { error: feeErr } = await (supabase as any).from("service_master").insert({
            hospital_id: hid,
            name: `Consultation - Dr. ${form.full_name}`,
            category: "consultation",
            item_type: "consultation",
            doctor_id: newId,
            department_id: deptId,
            fee: parseFloat(form.consultation_fee),
            follow_up_fee: form.follow_up_fee ? parseFloat(form.follow_up_fee) : null,
            validity_days: parseInt(form.validity_days) || 7,
            is_active: true,
          });
          if (feeErr) console.error("Fee save error:", feeErr);
        }
      }

      // Save/update service_master for doctor on edit
      if (editingId && form.role === "doctor" && form.consultation_fee) {
        const deptId2 = getSafeDepartmentId();
        // Check if fee row already exists
        const { data: existingFee } = await (supabase as any).from("service_master")
          .select("id")
          .eq("hospital_id", hid)
          .eq("doctor_id", editingId)
          .eq("item_type", "consultation")
          .maybeSingle();
        
        const feePayload = {
          hospital_id: hid,
          name: `Consultation - Dr. ${form.full_name}`,
          category: "consultation",
          item_type: "consultation",
          doctor_id: editingId,
          department_id: deptId2,
          fee: parseFloat(form.consultation_fee),
          follow_up_fee: form.follow_up_fee ? parseFloat(form.follow_up_fee) : null,
          validity_days: parseInt(form.validity_days) || 7,
          is_active: true,
        };

        if (existingFee?.id) {
          const { error: feeErr } = await (supabase as any).from("service_master")
            .update(feePayload).eq("id", existingFee.id);
          if (feeErr) console.error("Fee update error:", feeErr);
        } else {
          const { error: feeErr } = await (supabase as any).from("service_master")
            .insert(feePayload);
          if (feeErr) console.error("Fee insert error:", feeErr);
        }
      }
    },
    onSuccess: () => {
      toast({ title: `${form.full_name} ${editingId ? "updated" : "added"} as ${ROLE_META[form.role]?.label ?? form.role} ✓` });
      qc.invalidateQueries({ queryKey: ["settings-staff"] });
      closeDrawer();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from("users").update({ is_active: !active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settings-staff"] }),
  });

  const bulkSave = useMutation({
    mutationFn: async () => {
      const hid = await getHospitalId();
      const valid = bulkRows.filter((r) => r.name.trim());
      if (!valid.length) return;
      const rows = valid.map((r) => ({
        id: crypto.randomUUID(),
        hospital_id: hid,
        full_name: r.name,
        email: `${r.name.toLowerCase().replace(/\s+/g, ".")}@placeholder.local`,
        phone: r.phone || null,
        role: "doctor" as const,
        department_id: r.dept_id && r.dept_id.trim() !== "" ? r.dept_id : null,
        registration_number: null,
        is_active: true,
        can_login: false,
        auth_user_id: null,
      }));
      const { error } = await supabase.from("users").insert(rows as any);
      if (error) throw error;

      // Create staff_profiles for bulk-added doctors
      const profileRows = rows.map((r) => ({
        hospital_id: hid,
        user_id: r.id,
        designation: "doctor",
        department_id: r.department_id,
        is_active: true,
      }));
      await (supabase as any).from("staff_profiles").insert(profileRows);

      // Create service_master rows for doctors with fees
      const svcRows = valid
        .map((v, i) => ({ ...v, id: rows[i].id, dept_id: rows[i].department_id }))
        .filter((v) => v.fee && parseFloat(v.fee) > 0)
        .map((v) => ({
          hospital_id: hid,
          name: `Consultation - ${v.name}`,
          category: "consultation",
          item_type: "consultation",
          doctor_id: v.id,
          department_id: v.dept_id,
          fee: parseFloat(v.fee),
          is_active: true,
        }));
      if (svcRows.length > 0) {
        await (supabase as any).from("service_master").insert(svcRows);
      }
      return valid.length;
    },
    onSuccess: (count) => {
      toast({ title: `${count} doctors added successfully` });
      qc.invalidateQueries({ queryKey: ["settings-staff"] });
      setBulkOpen(false);
      setBulkRows([{ ...EMPTY_BULK }]);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  /* ─── Login handler ─── */
  const handleCreateLogin = async () => {
    if (!loginModal) return;
    if (!loginEmail || loginPassword.length < 8) {
      toast({ title: "Password must be at least 8 characters", variant: "destructive" });
      return;
    }
    // Pre-check if email already exists in users table
    const { data: existingUser } = await supabase
      .from("users")
      .select("id, full_name")
      .eq("email", loginEmail.trim().toLowerCase())
      .neq("id", loginModal.userId)
      .limit(1);

    if (existingUser && existingUser.length > 0) {
      toast({
        title: "Email already in use",
        description: `This email is already assigned to ${existingUser[0].full_name}. Please use a different email.`,
        variant: "destructive",
      });
      return;
    }

    setCreatingLogin(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-staff-login", {
        body: {
          user_id: loginModal.userId,
          email: loginEmail.trim().toLowerCase(),
          password: loginPassword,
          full_name: loginModal.userName,
        },
      });
      if (error || data?.error) {
        throw new Error(data?.error || error?.message || "Failed to create login");
      }
      toast({ title: `Login created for ${loginModal.userName}`, description: "They can now sign in with their email and password." });
      // Sync email back to users table if it changed
      const normalizedEmail = loginEmail.trim().toLowerCase();
      if (normalizedEmail !== loginModal.email) {
        await supabase.from("users").update({ email: normalizedEmail } as any).eq("id", loginModal.userId);
      }
      qc.invalidateQueries({ queryKey: ["settings-staff"] });
      setLoginModal(null);
      setLoginPassword("");
      setLoginEmail("");
    } catch (err: any) {
      const msg = (err.message || "").toLowerCase();
      let title = "Failed to create login";
      let description = err.message;
      if (msg.includes("already") || msg.includes("exists") || msg.includes("duplicate") || msg.includes("unique") || msg.includes("registered")) {
        title = "Email already registered";
        description = "This email already has a login account. Please use a different email address.";
      } else if (msg.includes("non-2xx") || msg.includes("status code")) {
        // Edge function returned an error — most likely duplicate email in Supabase Auth
        title = "Email already registered";
        description = "This email is already in use. Please use a different email address.";
      } else if (msg.includes("invalid") && msg.includes("email")) {
        title = "Invalid email";
        description = "Please enter a valid email address.";
      } else if (msg.includes("rate") || msg.includes("limit")) {
        title = "Too many attempts. Please wait a moment and try again.";
      }
      toast({ title, description, variant: "destructive" });
    } finally {
      setCreatingLogin(false);
    }
  };

  /* ─── Helpers ─── */
  const openDrawer = async (user?: any) => {
    if (user) {
      setEditingId(user.id);
      // Fetch staff_profiles data for salary fields
      const { data: profile } = await (supabase as any)
        .from("staff_profiles").select("*").eq("user_id", user.id).maybeSingle();
      // Fetch service_master for doctor consultation pricing
      let svcRow: any = null;
      if (user.role === "doctor") {
        const hid = await getHospitalId();
        const { data } = await (supabase as any).from("service_master")
          .select("fee, follow_up_fee, validity_days")
          .eq("hospital_id", hid).eq("doctor_id", user.id)
          .eq("item_type", "consultation").maybeSingle();
        svcRow = data;
      }
      setForm({
        full_name: user.full_name, phone: user.phone ?? "", email: user.email,
        role: user.role, department_id: user.department_id ?? "", registration_number: user.registration_number ?? "", ward_id: "",
        employee_id: profile?.employee_id ?? "",
        employment_type: profile?.employment_type ?? "permanent",
        basic_salary: profile?.basic_salary?.toString() ?? "",
        hra_percent: profile?.hra_percent?.toString() ?? "20",
        da_percent: profile?.da_percent?.toString() ?? "10",
        conveyance: profile?.conveyance?.toString() ?? "1600",
        medical_allowance: profile?.medical_allowance?.toString() ?? "1250",
        pf_applicable: profile?.pf_applicable ?? true,
        esic_applicable: profile?.esic_applicable ?? false,
        uan_number: profile?.uan_number ?? "",
        pan_number: profile?.pan_number ?? "",
        esi_ip_number: profile?.esi_ip_number ?? "",
        license_expiry_date: profile?.license_expiry_date ?? "",
        consultation_fee: svcRow?.fee?.toString() ?? "",
        follow_up_fee: svcRow?.follow_up_fee?.toString() ?? "",
        validity_days: svcRow?.validity_days?.toString() ?? "7",
      });
    } else {
      setEditingId(null);
      setForm({ ...EMPTY_FORM });
    }
    setDrawerOpen(true);
  };

  const closeDrawer = () => { setDrawerOpen(false); setEditingId(null); setForm({ ...EMPTY_FORM }); };

  const initials = (name: string) => name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);

  const deptName = (id: string | null) => departments?.find((d) => d.id === id)?.name ?? "—";

  return (
    <div className="h-[calc(100vh-56px)] flex flex-col overflow-hidden relative">
      {/* HEADER */}
      <div className="flex-shrink-0 px-6 py-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/settings")} className="text-muted-foreground hover:text-foreground active:scale-95">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-lg font-bold text-foreground">Doctors & Staff</h1>
            <p className="text-xs text-muted-foreground">Settings › Doctors & Staff</p>
          </div>
        </div>
        <button onClick={() => openDrawer()} className="flex items-center gap-1.5 bg-[hsl(222,55%,23%)] text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 active:scale-[0.97]">
          <Plus size={14} /> Add Staff Member
        </button>
      </div>

      {/* FILTER TABS */}
      <div className="flex-shrink-0 px-6 py-2.5 border-b border-border flex gap-1.5 overflow-x-auto">
        {FILTER_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setFilter(t.key)}
            className={cn(
              "px-4 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors active:scale-[0.97]",
              filter === t.key ? "bg-[hsl(222,55%,23%)] text-white" : "bg-muted text-muted-foreground hover:bg-muted/80"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* QUICK ADD DOCTORS BANNER */}
      {!isLoading && doctorCount === 0 && (
        <div className="flex-shrink-0 mx-6 mt-3 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 flex items-center justify-between">
          <p className="text-[13px] text-blue-800 font-medium">👨‍⚕️ No doctors added yet — OPD and IPD are blocked</p>
          <button onClick={() => { setBulkOpen(true); setBulkRows([{ ...EMPTY_BULK }, { ...EMPTY_BULK }, { ...EMPTY_BULK }]); }}
            className="text-sm font-medium text-blue-700 border border-blue-300 rounded-lg px-3 py-1.5 hover:bg-blue-100 active:scale-[0.97]">
            Quick Add Doctors
          </button>
        </div>
      )}

      {/* TABLE */}
      <div className="flex-1 overflow-y-auto">
        {!isLoading && filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center gap-3">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
              <Users size={24} className="text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground">No staff added yet</p>
            <p className="text-xs text-muted-foreground max-w-[240px]">Add your first doctor to start using clinical modules</p>
            <button onClick={() => openDrawer()} className="flex items-center gap-1.5 bg-[hsl(222,55%,23%)] text-white px-4 py-2 rounded-lg text-sm font-medium active:scale-[0.97]">
              <Plus size={14} /> Add First Doctor
            </button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted/50 backdrop-blur-sm z-10">
              <tr className="text-left text-[11px] text-muted-foreground uppercase tracking-wider">
                <th className="px-6 py-2.5 font-medium">Name</th>
                <th className="px-4 py-2.5 font-medium">Role</th>
                <th className="px-4 py-2.5 font-medium">Department</th>
                <th className="px-4 py-2.5 font-medium">Phone</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">Loading...</td></tr>}
              {filtered.map((u) => {
                const meta = ROLE_META[u.role] ?? ROLE_META.receptionist;
                return (
                  <tr key={u.id} className="border-b border-border/50 hover:bg-muted/20">
                    <td className="px-6 py-2.5">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-[hsl(222,55%,23%)] text-white flex items-center justify-center text-[11px] font-semibold shrink-0">
                          {initials(u.full_name)}
                        </div>
                        <div className="min-w-0">
                          <p className="text-[13px] font-medium text-foreground truncate">{u.full_name}</p>
                          <p className="text-[11px] text-muted-foreground truncate">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={cn("text-[11px] px-2 py-0.5 rounded-full border font-medium", meta.color)}>
                        {meta.label}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-[13px] text-muted-foreground">{deptName(u.department_id)}</td>
                    <td className="px-4 py-2.5 text-[13px] text-muted-foreground">{u.phone || "—"}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <span className={cn("h-2 w-2 rounded-full", u.is_active ? "bg-emerald-500" : "bg-muted-foreground/40")} />
                         <span className="text-[12px] text-muted-foreground">{u.is_active ? "Active" : "Inactive"}</span>
                         {u.can_login && <span className="text-[10px] text-emerald-600 ml-2">• Login enabled</span>}
                       </div>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                         <button onClick={() => openDrawer(u)} className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted">Edit</button>
                         <button
                           onClick={() => toggleActive.mutate({ id: u.id, active: u.is_active })}
                           className="text-xs text-muted-foreground hover:text-destructive px-2 py-1 rounded hover:bg-muted"
                         >
                           {u.is_active ? "Deactivate" : "Activate"}
                         </button>
                         {!(u as any).auth_user_id && u.is_active && (
                           <button
                             onClick={() => {
                               setLoginModal({ open: true, userId: u.id, userName: u.full_name, email: u.email });
                                setLoginEmail(u.email?.includes("@placeholder.local") ? "" : u.email);
                                setLoginPassword("");
                             }}
                             className="text-xs text-primary hover:text-primary/80 px-2 py-1 rounded hover:bg-primary/10 font-medium"
                           >
                             Enable Login
                           </button>
                         )}
                         {(u as any).auth_user_id && (
                           <span className="text-[11px] text-emerald-600 px-2 py-1 font-medium">✓ Can Login</span>
                         )}
                       </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ─── SLIDE-OVER DRAWER ─── */}
      {drawerOpen && (
        <>
          <div className="fixed inset-0 bg-black/20 z-40" onClick={closeDrawer} />
          <div className="fixed right-0 top-0 bottom-0 w-full sm:w-[420px] bg-card border-l border-border z-50 flex flex-col shadow-xl animate-in slide-in-from-right duration-200">
            <div className="flex-shrink-0 px-6 py-4 border-b border-border flex items-center justify-between">
              <h2 className="text-lg font-bold text-foreground">{editingId ? "Edit Staff Member" : "Add Staff Member"}</h2>
              <button onClick={closeDrawer} className="text-muted-foreground hover:text-foreground active:scale-95"><X size={18} /></button>
            </div>

            <div className="flex-1 overflow-y-auto min-h-0 px-6 py-5 space-y-5">
              {/* Role selection */}
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-2 block uppercase tracking-wide">Role *</label>
                <div className="grid grid-cols-2 gap-2">
                  {ROLE_CARDS.map((rc) => {
                    const Icon = rc.icon;
                    const selected = form.role === rc.role;
                    return (
                      <button
                        key={rc.role}
                        onClick={() => setForm({ ...form, role: rc.role, department_id: "", ward_id: "", registration_number: "" })}
                        className={cn(
                          "flex items-center gap-2.5 px-3 py-2.5 rounded-lg border-[1.5px] text-left transition-colors active:scale-[0.98]",
                          selected
                            ? "border-[hsl(222,55%,23%)] bg-blue-50"
                            : "border-border hover:border-muted-foreground/30"
                        )}
                      >
                        <Icon size={16} className={selected ? "text-[hsl(222,55%,23%)]" : "text-muted-foreground"} />
                        <span className={cn("text-[13px] font-medium", selected ? "text-[hsl(222,55%,23%)]" : "text-foreground")}>{rc.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Basic details */}
              <div className="space-y-3">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Basic Details</label>
                <div>
                  <label className="text-[14px] font-medium text-muted-foreground mb-1 block">Full Name *</label>
                  <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} placeholder="Dr. Priya Sharma" className="h-10" />
                </div>
                <div>
                  <label className="text-[14px] font-medium text-muted-foreground mb-1 block">Phone Number *</label>
                  <Input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="9876543210" className="h-10" />
                </div>
                <div>
                  <label className="text-[14px] font-medium text-muted-foreground mb-1 block">Email Address <span className="text-muted-foreground/60">(optional)</span></label>
                  <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="priya@hospital.com" className="h-10" />
                </div>
              </div>

              {/* Department — shown for all roles */}
              <div className="space-y-3">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {form.role === "doctor" ? "Doctor Details" : "Assignment"}
                </label>
                <div>
                  <label className="text-[14px] font-medium text-muted-foreground mb-1 block">
                    {form.role === "doctor" ? "Department *" : "Assigned Department"} {form.role !== "doctor" && <span className="text-muted-foreground/60">(optional)</span>}
                  </label>
                  <select value={form.department_id} onChange={(e) => setForm({ ...form, department_id: e.target.value })}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                    <option value="">Select department</option>
                    {departments?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
                {form.role === "doctor" && (
                  <div>
                    <label className="text-[14px] font-medium text-muted-foreground mb-1 block">Registration No (MCI/NMC)</label>
                    <Input value={form.registration_number} onChange={(e) => setForm({ ...form, registration_number: e.target.value })} placeholder="MH-12345" className="h-10" />
                  </div>
                )}
              </div>

              {form.role === "nurse" && (
                <div className="space-y-3">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Nurse Details</label>
                  <div>
                    <label className="text-[14px] font-medium text-muted-foreground mb-1 block">Ward Assignment <span className="text-muted-foreground/60">(display only)</span></label>
                    <select value={form.ward_id} onChange={(e) => setForm({ ...form, ward_id: e.target.value })}
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                      <option value="">Select ward</option>
                      {wards?.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[14px] font-medium text-muted-foreground mb-1 block">Nursing Registration No</label>
                    <Input value={form.registration_number} onChange={(e) => setForm({ ...form, registration_number: e.target.value })} placeholder="Optional" className="h-10" />
                  </div>
                </div>
              )}

              {/* Consultation Pricing — doctor only */}
              {form.role === "doctor" && (
                <div className="space-y-3">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Consultation Pricing</label>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="text-[14px] font-medium text-muted-foreground mb-1 block">Consultation Fee (₹)</label>
                      <Input type="number" value={form.consultation_fee} onChange={(e) => setForm({ ...form, consultation_fee: e.target.value })} placeholder="500" className="h-10" />
                    </div>
                    <div>
                      <label className="text-[14px] font-medium text-muted-foreground mb-1 block">Follow-up Fee (₹)</label>
                      <Input type="number" value={form.follow_up_fee} onChange={(e) => setForm({ ...form, follow_up_fee: e.target.value })} placeholder="200" className="h-10" />
                    </div>
                    <div>
                      <label className="text-[14px] font-medium text-muted-foreground mb-1 block">Validity (days)</label>
                      <Input type="number" value={form.validity_days} onChange={(e) => setForm({ ...form, validity_days: e.target.value })} placeholder="7" className="h-10" />
                      <p className="text-[10px] text-muted-foreground mt-0.5">Follow-up valid within these many days</p>
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-3">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Employment & Salary</label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[14px] font-medium text-muted-foreground mb-1 block">Employee ID</label>
                    <Input value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: e.target.value })} placeholder="EMP-001" className="h-10" />
                  </div>
                  <div>
                    <label className="text-[14px] font-medium text-muted-foreground mb-1 block">Employment Type</label>
                    <select value={form.employment_type} onChange={(e) => setForm({ ...form, employment_type: e.target.value })}
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                      <option value="permanent">Permanent</option>
                      <option value="contract">Contract</option>
                      <option value="visiting">Visiting</option>
                      <option value="intern">Intern</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-[14px] font-medium text-muted-foreground mb-1 block">Basic Salary (₹/month)</label>
                  <Input type="number" value={form.basic_salary} onChange={(e) => setForm({ ...form, basic_salary: e.target.value })} placeholder="25000" className="h-10" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[14px] font-medium text-muted-foreground mb-1 block">HRA %</label>
                    <Input type="number" value={form.hra_percent} onChange={(e) => setForm({ ...form, hra_percent: e.target.value })} className="h-10" />
                  </div>
                  <div>
                    <label className="text-[14px] font-medium text-muted-foreground mb-1 block">DA %</label>
                    <Input type="number" value={form.da_percent} onChange={(e) => setForm({ ...form, da_percent: e.target.value })} className="h-10" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[14px] font-medium text-muted-foreground mb-1 block">Conveyance (₹)</label>
                    <Input type="number" value={form.conveyance} onChange={(e) => setForm({ ...form, conveyance: e.target.value })} className="h-10" />
                  </div>
                  <div>
                    <label className="text-[14px] font-medium text-muted-foreground mb-1 block">Medical Allow. (₹)</label>
                    <Input type="number" value={form.medical_allowance} onChange={(e) => setForm({ ...form, medical_allowance: e.target.value })} className="h-10" />
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <label className="flex items-center gap-2 text-[13px] text-foreground cursor-pointer">
                    <input type="checkbox" checked={form.pf_applicable} onChange={(e) => setForm({ ...form, pf_applicable: e.target.checked })} className="rounded border-input" />
                    PF Applicable
                  </label>
                  <label className="flex items-center gap-2 text-[13px] text-foreground cursor-pointer">
                    <input type="checkbox" checked={form.esic_applicable} onChange={(e) => setForm({ ...form, esic_applicable: e.target.checked })} className="rounded border-input" />
                    ESIC Applicable
                  </label>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-[14px] font-medium text-muted-foreground mb-1 block">UAN (EPF)</label>
                    <Input value={form.uan_number} onChange={(e) => setForm({ ...form, uan_number: e.target.value })} placeholder="12-digit UAN" className="h-10" maxLength={12} />
                  </div>
                  <div>
                    <label className="text-[14px] font-medium text-muted-foreground mb-1 block">PAN</label>
                    <Input value={form.pan_number} onChange={(e) => setForm({ ...form, pan_number: e.target.value.toUpperCase() })} placeholder="ABCDE1234F" className="h-10" maxLength={10} />
                  </div>
                  <div>
                    <label className="text-[14px] font-medium text-muted-foreground mb-1 block">ESI IP No.</label>
                    <Input value={form.esi_ip_number} onChange={(e) => setForm({ ...form, esi_ip_number: e.target.value })} placeholder="ESI IP number" className="h-10" />
                  </div>
                </div>
                <div>
                  <label className="text-[14px] font-medium text-muted-foreground mb-1 block">License Expiry Date</label>
                  <Input type="date" value={form.license_expiry_date} onChange={(e) => setForm({ ...form, license_expiry_date: e.target.value })} className="h-10" />
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex-shrink-0 px-6 py-4 border-t border-border flex gap-3 pb-[env(safe-area-inset-bottom,16px)]">
              <button onClick={closeDrawer} className="flex-1 h-12 rounded-lg border border-border text-sm font-medium text-muted-foreground hover:bg-muted active:scale-[0.98]">
                Cancel
              </button>
              <button
                onClick={() => saveStaff.mutate()}
                disabled={!form.full_name || (!form.phone && !form.email) || saveStaff.isPending}
                className="flex-[2] h-12 rounded-lg bg-[hsl(222,55%,23%)] text-white text-sm font-semibold hover:opacity-90 active:scale-[0.97] disabled:opacity-40"
              >
                {saveStaff.isPending ? "Saving..." : editingId ? "Update Staff Member" : "Save Staff Member"}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ─── BULK ADD DOCTORS MODAL ─── */}
      {bulkOpen && (
        <>
          <div className="fixed inset-0 bg-black/30 z-40 flex items-center justify-center" onClick={() => setBulkOpen(false)}>
            <div className="bg-card rounded-xl border border-border shadow-xl w-full max-w-[700px] max-h-[calc(100vh-100px)] flex flex-col" onClick={(e) => e.stopPropagation()}>
              <div className="flex-shrink-0 px-6 py-4 border-b border-border flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-foreground">Quick Add Doctors</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">Add multiple doctors at once</p>
                </div>
                <button onClick={() => setBulkOpen(false)} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
                <div className="grid grid-cols-[2fr_1.5fr_1fr_1.5fr_1fr_28px] gap-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide px-1">
                  <span>Full Name</span><span>Speciality</span><span>Phone</span><span>Department</span><span>Fee (₹)</span><span />
                </div>
                {bulkRows.map((row, i) => (
                  <div key={i} className="grid grid-cols-[2fr_1.5fr_1fr_1.5fr_1fr_28px] gap-2 items-center">
                    <Input value={row.name} onChange={(e) => {
                      const r = [...bulkRows]; r[i] = { ...r[i], name: e.target.value }; setBulkRows(r);
                    }} placeholder="Dr. Example" className="h-9" />
                    <Input value={row.speciality} onChange={(e) => {
                      const r = [...bulkRows]; r[i] = { ...r[i], speciality: e.target.value }; setBulkRows(r);
                    }} placeholder="General Medicine" className="h-9" />
                    <Input value={row.phone} onChange={(e) => {
                      const r = [...bulkRows]; r[i] = { ...r[i], phone: e.target.value }; setBulkRows(r);
                    }} placeholder="9876543210" className="h-9" />
                    <select value={row.dept_id} onChange={(e) => {
                      const r = [...bulkRows]; r[i] = { ...r[i], dept_id: e.target.value }; setBulkRows(r);
                    }} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
                      <option value="">Dept</option>
                      {departments?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                    <Input type="number" value={row.fee} onChange={(e) => {
                      const r = [...bulkRows]; r[i] = { ...r[i], fee: e.target.value }; setBulkRows(r);
                    }} placeholder="500" className="h-9" />
                    <button onClick={() => setBulkRows((r) => r.filter((_, idx) => idx !== i))} className="text-muted-foreground hover:text-destructive">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
                {bulkRows.length < 10 && (
                  <button onClick={() => setBulkRows((r) => [...r, { ...EMPTY_BULK }])} className="flex items-center gap-1.5 text-sm text-primary font-medium hover:underline mt-1">
                    <Plus size={14} /> Add Another Doctor
                  </button>
                )}
              </div>

              <div className="flex-shrink-0 px-6 py-4 border-t border-border">
                <button
                  onClick={() => bulkSave.mutate()}
                  disabled={!bulkRows.some((r) => r.name.trim()) || bulkSave.isPending}
                  className="w-full h-11 rounded-lg bg-[hsl(222,55%,23%)] text-white text-sm font-semibold hover:opacity-90 active:scale-[0.97] disabled:opacity-40"
                >
                  {bulkSave.isPending ? "Saving..." : `Save All Doctors (${bulkRows.filter((r) => r.name.trim()).length})`}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ─── LOGIN CREDENTIALS MODAL ─── */}
      {loginModal && (
        <>
          <div className="fixed inset-0 bg-black/30 z-40" onClick={() => { setLoginModal(null); setLoginPassword(""); setLoginEmail(""); }} />
          <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-card rounded-xl border border-border shadow-xl w-full max-w-[420px] p-6">
            <h2 className="text-lg font-bold text-foreground mb-1">Create Login Credentials</h2>
            <p className="text-sm text-muted-foreground mb-5">
              {loginModal.userName} will be able to sign in at the login page with these credentials.
            </p>

            <div className="space-y-4">
              <div>
                <label className="text-[14px] font-medium text-muted-foreground mb-1 block">Email</label>
                <Input
                  type="email"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  placeholder="staff@hospital.com"
                  className="h-10"
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  {loginModal.email?.includes("@placeholder.local")
                    ? "Enter the staff member's real email address for login"
                    : "Must be a valid, unique email address"}
                </p>
              </div>
              <div>
                <label className="text-[14px] font-medium text-muted-foreground mb-1 block">Password</label>
                <Input
                  type="password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="Minimum 8 characters"
                  className="h-10"
                />
                {loginPassword.length > 0 && loginPassword.length < 8 && (
                  <p className="text-[11px] text-destructive mt-1">Password must be at least 8 characters</p>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 mt-6">
              <button
                onClick={() => { setLoginModal(null); setLoginPassword(""); setLoginEmail(""); }}
                className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateLogin}
                disabled={creatingLogin || !loginEmail || loginPassword.length < 8}
                className="px-5 py-2 rounded-lg bg-[hsl(222,55%,23%)] text-white text-sm font-semibold hover:opacity-90 active:scale-[0.97] disabled:opacity-40"
              >
                {creatingLogin ? "Creating..." : "Create Login"}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default SettingsStaffPage;
