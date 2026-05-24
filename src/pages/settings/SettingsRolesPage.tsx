import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useHospitalId } from "@/hooks/useHospitalId";
import {
  ArrowLeft,
  Plus,
  Lock,
  Trash2,
  Eye,
  Save,
  X,
  ShieldCheck,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { logConfigChange } from "@/lib/ims";

/* ───── Module definitions ───── */
const MODULES = [
  { key: "opd", label: "OPD (Outpatient)", emoji: "🩺" },
  { key: "ipd", label: "IPD (Inpatient)", emoji: "🛏️" },
  { key: "emergency", label: "Emergency", emoji: "🚑" },
  { key: "nursing", label: "Nursing", emoji: "💉" },
  { key: "lab", label: "Laboratory (LIS)", emoji: "🔬" },
  { key: "radiology", label: "Radiology (RIS)", emoji: "🩻" },
  { key: "pharmacy", label: "Pharmacy", emoji: "💊" },
  { key: "ot", label: "Operation Theatre", emoji: "✂️" },
  { key: "billing", label: "Billing & Finance", emoji: "🧾" },
  { key: "insurance", label: "Insurance / TPA", emoji: "🛡️" },
  { key: "hr", label: "HR & Payroll", emoji: "👥" },
  { key: "inventory", label: "Inventory", emoji: "📦" },
  { key: "quality", label: "Quality & NABH", emoji: "🏅" },
  { key: "analytics", label: "Analytics & BI", emoji: "📊" },
  { key: "patients", label: "Patient Registry", emoji: "📋" },
  { key: "settings", label: "Settings", emoji: "⚙️" },
  { key: "reports", label: "Reports", emoji: "📈" },
  { key: "user_management", label: "User Management", emoji: "🔑" },
] as const;

type ModuleKey = (typeof MODULES)[number]["key"];
const ACTIONS = ["view", "create", "edit", "delete", "approve", "export"] as const;
type Action = (typeof ACTIONS)[number];

/* Valid app_role enum values — role_permissions.role_name MUST match users.role enum */
const VALID_APP_ROLES: { value: string; label: string }[] = [
  { value: "super_admin",       label: "Super Admin" },
  { value: "hospital_admin",    label: "Admin" },
  { value: "doctor",            label: "Doctor" },
  { value: "nurse",             label: "Nurse" },
  { value: "receptionist",      label: "Reception" },
  { value: "pharmacist",        label: "Pharmacist" },
  { value: "lab_tech",          label: "Lab Tech" },
  { value: "lab_technician",    label: "Lab Technician" },
  { value: "radiologist",       label: "Radiologist" },
  { value: "accountant",        label: "Accountant" },
  { value: "billing_executive", label: "Billing Executive" },
  { value: "billing_staff",     label: "Billing Staff" },
  { value: "hr_manager",        label: "HR Manager" },
  { value: "cfo",               label: "CFO" },
];

const ROLE_COLORS: Record<string, string> = {
  super_admin: "hsl(var(--primary))",
  doctor: "#3B82F6",
  nurse: "#8B5CF6",
  pharmacist: "#10B981",
  lab_technician: "#F59E0B",
  billing_executive: "#EF4444",
  hr_manager: "#EC4899",
  receptionist: "#06B6D4",
};

interface RolePermission {
  id: string;
  hospital_id: string;
  role_name: string;
  role_label: string;
  is_system_role: boolean;
  permissions: Record<string, unknown>;
  created_at: string;
}

/* ───── Helpers ───── */
const parsePermissions = (perms: Record<string, unknown>): Record<ModuleKey, Record<Action, boolean>> => {
  const result = {} as Record<ModuleKey, Record<Action, boolean>>;
  const isAll = perms.all === true;

  for (const mod of MODULES) {
    const val = perms[mod.key];
    
    // Default to false
    result[mod.key] = { view: false, create: false, edit: false, delete: false, approve: false, export: false };

    if (isAll) {
      result[mod.key] = { view: true, create: true, edit: true, delete: true, approve: true, export: true };
      continue;
    }

    if (typeof val === "string") {
      // Legacy string format: "r" or "rw"
      const hasRead = val === "r" || val === "rw";
      const hasWrite = val === "rw";
      result[mod.key] = {
        view: hasRead,
        create: hasWrite,
        edit: hasWrite,
        delete: hasWrite,
        approve: false,
        export: hasRead,
      };
    } else if (val && typeof val === "object") {
      // New granular format: { view: true, create: false, ... }
      const modPerms = val as Record<string, boolean>;
      result[mod.key] = {
        view: !!modPerms.view,
        create: !!modPerms.create,
        edit: !!modPerms.edit,
        delete: !!modPerms.delete,
        approve: !!modPerms.approve,
        export: !!modPerms.export,
      };
    }
  }
  return result;
};

const serializePermissions = (matrix: Record<ModuleKey, Record<Action, boolean>>): Record<string, unknown> => {
  const result: Record<string, unknown> = {};
  for (const mod of MODULES) {
    const m = matrix[mod.key];
    const hasAny = Object.values(m).some(Boolean);
    if (hasAny) {
      result[mod.key] = m;
    }
  }
  return result;
};

/* ───── Main Component ───── */
const SettingsRolesPage: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { hospitalId } = useHospitalId();

  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [matrix, setMatrix] = useState<Record<ModuleKey, Record<Action, boolean>> | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [previewRole, setPreviewRole] = useState<RolePermission | null>(null);
  const [createPickerOpen, setCreatePickerOpen] = useState(false);
  const [pickerRole, setPickerRole] = useState<string>("");
  const [pickerLabel, setPickerLabel] = useState<string>("");
  const [changeReason, setChangeReason] = useState("");

  /* ── Fetch roles ── */
  const { data: roles = [] } = useQuery({
    queryKey: ["role-permissions", hospitalId],
    queryFn: async () => {
      if (!hospitalId) return [];
      const { data, error } = await supabase
        .from("role_permissions")
        .select("*")
        .eq("hospital_id", hospitalId)
        .order("is_system_role", { ascending: false })
        .order("role_label");
      if (error) throw error;
      return (data ?? []) as unknown as RolePermission[];
    },
    enabled: !!hospitalId,
  });

  /* ── Fetch staff counts per role ── */
  const ROLE_LABEL_MAP: Record<string, string> = {
    hospital_admin: "admin",
    super_admin: "super admin",
    lab_tech: "lab technician",
  };
  const { data: staffCounts = {} } = useQuery({
    queryKey: ["staff-role-counts", hospitalId],
    queryFn: async () => {
      if (!hospitalId) return {};
      const { data, error } = await supabase.from("users").select("role").eq("hospital_id", hospitalId);
      if (error) throw error;
      const counts: Record<string, number> = {};
      for (const u of data ?? []) {
        // Map users.role to a normalized label that matches role_permissions.role_label
        const normalizedLabel = (ROLE_LABEL_MAP[u.role] || u.role).toLowerCase();
        counts[normalizedLabel] = (counts[normalizedLabel] || 0) + 1;
      }
      return counts;
    },
    enabled: !!hospitalId,
  });

  const selectedRole = roles.find((r) => r.id === selectedRoleId) ?? null;

  useEffect(() => {
    if (selectedRole) {
      setMatrix(parsePermissions(selectedRole.permissions as Record<string, unknown>));
      setEditLabel(selectedRole.role_label);
    } else {
      setMatrix(null);
      setEditLabel("");
    }
  }, [selectedRoleId, selectedRole]);

  /* ── Save mutation ── */
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedRole || !matrix) return;
      const perms = serializePermissions(matrix);
      const oldPerms = selectedRole.permissions;
      const { error } = await supabase
        .from("role_permissions")
        .update({
          permissions: perms as any,
          role_label: editLabel || selectedRole.role_label,
        } as any)
        .eq("id", selectedRole.id);
      if (error) throw error;
      logConfigChange({ hospitalId, configArea: "role_permissions", itemId: selectedRole.id, oldValue: oldPerms, newValue: perms, reason: changeReason || null });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["role-permissions"] });
      setChangeReason("");
      toast({ title: "Permissions saved" });
    },
    onError: () => toast({ title: "Failed to save", variant: "destructive" }),
  });

  /* ── Create role: pick from valid app_role enum so users.role stays compatible ── */
  const createMutation = useMutation({
    mutationFn: async () => {
      if (!hospitalId) throw new Error("No hospital");
      if (!pickerRole) throw new Error("Please pick a role");
      const { data, error } = await supabase
        .from("role_permissions")
        .insert({
          hospital_id: hospitalId,
          role_name: pickerRole,
          role_label: pickerLabel || pickerRole,
          is_system_role: false,
          permissions: {},
        } as any)
        .select()
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["role-permissions"] });
      setSelectedRoleId(data.id);
      setCreatePickerOpen(false);
      setPickerRole("");
      setPickerLabel("");
      toast({ title: "Role created" });
    },
    onError: (e: any) =>
      toast({ title: "Failed to create role", description: e.message, variant: "destructive" }),
  });

  /* ── Delete role ── */
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("role_permissions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["role-permissions"] });
      setSelectedRoleId(null);
      toast({ title: "Role deleted" });
    },
  });

  /* ── Toggle permission ── */
  const togglePerm = useCallback(
    (mod: ModuleKey, action: Action) => {
      if (!matrix) return;
      setMatrix((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          [mod]: { ...prev[mod], [action]: !prev[mod][action] },
        };
      });
    },
    [matrix, selectedRole]
  );

  /* ── Quick presets ── */
  const applyModulePreset = (mod: ModuleKey, preset: "full" | "view" | "none") => {
    if (!matrix) return;
    const vals: Record<Action, boolean> =
      preset === "full"
        ? { view: true, create: true, edit: true, delete: true, approve: true, export: true }
        : preset === "view"
        ? { view: true, create: false, edit: false, delete: false, approve: false, export: true }
        : { view: false, create: false, edit: false, delete: false, approve: false, export: false };
    setMatrix((prev) => (prev ? { ...prev, [mod]: vals } : prev));
  };

  const applyGlobalPreset = (preset: "full" | "view" | "clinical" | "finance") => {
    if (!matrix) return;
    const clinicalKeys = new Set(["opd", "ipd", "emergency", "nursing", "lab", "radiology", "pharmacy", "ot"]);
    const financeKeys = new Set(["billing", "insurance", "analytics", "reports"]);

    setMatrix((prev) => {
      if (!prev) return prev;
      const next = { ...prev };
      for (const mod of MODULES) {
        const isClinical = clinicalKeys.has(mod.key);
        const isFinance = financeKeys.has(mod.key);
        let grant: "full" | "view" | "none" = "none";
        if (preset === "full") grant = "full";
        else if (preset === "view") grant = "view";
        else if (preset === "clinical") grant = isClinical ? "full" : "none";
        else if (preset === "finance") grant = isFinance ? "full" : "none";

        next[mod.key] =
          grant === "full"
            ? { view: true, create: true, edit: true, delete: true, approve: true, export: true }
            : grant === "view"
            ? { view: true, create: false, edit: false, delete: false, approve: false, export: true }
            : { view: false, create: false, edit: false, delete: false, approve: false, export: false };
      }
      return next;
    });
  };

  const toggleAllRow = () => {
    if (!matrix) return;
    const allOn = MODULES.every((m) => ACTIONS.every((a) => matrix[m.key][a]));
    const val = !allOn;
    setMatrix((prev) => {
      if (!prev) return prev;
      const next = { ...prev };
      for (const mod of MODULES) {
        next[mod.key] = { view: val, create: val, edit: val, delete: val, approve: val, export: val };
      }
      return next;
    });
  };

  const roleColor = (name: string) => ROLE_COLORS[name] || "hsl(var(--muted-foreground))";

  /* ── Preview modal ── */
  if (previewRole) {
    const perms = parsePermissions(previewRole.permissions as Record<string, unknown>);
    const visibleModules = MODULES.filter((m) => perms[m.key].view);
    return (
      <div className="fixed inset-0 z-[100] bg-background flex flex-col">
        <div className="h-12 flex items-center justify-between px-6 bg-orange-500 text-white">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Eye size={16} />
            Previewing as: {previewRole.role_label}
            <span className="text-orange-100 text-xs ml-2">This shows what {previewRole.role_label} sees</span>
          </div>
          <Button size="sm" variant="secondary" onClick={() => setPreviewRole(null)}>
            Exit Preview
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-8">
          <h2 className="text-lg font-bold text-foreground mb-4">Visible Modules ({visibleModules.length})</h2>
          <div className="grid grid-cols-4 gap-3">
            {visibleModules.map((m) => (
              <div key={m.key} className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
                <span className="text-2xl">{m.emoji}</span>
                <div>
                  <p className="text-sm font-semibold text-foreground">{m.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {perms[m.key].create ? "Full access" : "View only"}
                  </p>
                </div>
              </div>
            ))}
          </div>
          {visibleModules.length === 0 && (
            <p className="text-muted-foreground text-sm mt-10 text-center">This role has no module access.</p>
          )}
          <h2 className="text-lg font-bold text-foreground mt-8 mb-4">
            Hidden Modules ({MODULES.length - visibleModules.length})
          </h2>
          <div className="grid grid-cols-4 gap-3">
            {MODULES.filter((m) => !perms[m.key].view).map((m) => (
              <div key={m.key} className="bg-muted/50 border border-border rounded-xl p-4 flex items-center gap-3 opacity-50">
                <span className="text-2xl">{m.emoji}</span>
                <div>
                  <p className="text-sm font-semibold text-muted-foreground">{m.label}</p>
                  <p className="text-xs text-destructive">No access</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-56px)] flex overflow-hidden bg-background">
      {/* ── LEFT PANEL ── */}
      <div className="w-[280px] flex-shrink-0 border-r border-border bg-card flex flex-col">
        <div className="h-[52px] flex items-center justify-between px-4 border-b border-border">
          <div className="flex items-center gap-2">
            <button onClick={() => navigate("/settings")} className="text-muted-foreground hover:text-foreground">
              <ArrowLeft size={16} />
            </button>
            <span className="text-sm font-bold text-foreground">Roles</span>
          </div>
          <Button size="sm" variant="default" className="h-7 text-xs gap-1" onClick={() => setCreatePickerOpen(true)}>
            <Plus size={12} /> Create
          </Button>
        </div>

        {/* ── Create Role picker modal ── */}
        {createPickerOpen && (
          <div className="fixed inset-0 z-[120] bg-black/50 flex items-center justify-center p-4" onClick={() => setCreatePickerOpen(false)}>
            <div className="bg-card border border-border rounded-xl p-6 w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-base font-bold text-foreground mb-1">Customise Permissions for a Role</h3>
              <p className="text-xs text-muted-foreground mb-4">
                Choose one of the system roles to override its default permissions for this hospital.
              </p>
              <label className="text-xs font-medium text-foreground block mb-1">Role</label>
              <select
                value={pickerRole}
                onChange={(e) => {
                  const v = e.target.value;
                  setPickerRole(v);
                  const found = VALID_APP_ROLES.find((r) => r.value === v);
                  if (found && !pickerLabel) setPickerLabel(found.label);
                }}
                className="w-full h-9 rounded-md border border-border bg-background px-2 text-sm mb-3"
              >
                <option value="">— Select a role —</option>
                {VALID_APP_ROLES
                  .filter((r) => !roles.some((existing) => existing.role_name === r.value))
                  .map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
              </select>
              <label className="text-xs font-medium text-foreground block mb-1">Display Label</label>
              <Input
                value={pickerLabel}
                onChange={(e) => setPickerLabel(e.target.value)}
                placeholder="e.g. Senior Doctor"
                className="mb-4 h-9"
              />
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="outline" onClick={() => setCreatePickerOpen(false)}>Cancel</Button>
                <Button
                  size="sm"
                  onClick={() => createMutation.mutate()}
                  disabled={!pickerRole || createMutation.isPending}
                >
                  Create
                </Button>
              </div>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {roles.map((role) => (
            <button
              key={role.id}
              onClick={() => setSelectedRoleId(role.id)}
              className={cn(
                "w-full text-left rounded-lg px-3 py-2.5 transition-colors",
                selectedRoleId === role.id
                  ? "bg-primary/10 border-l-[3px] border-primary"
                  : "hover:bg-muted"
              )}
            >
              <div className="flex items-center gap-2">
                <span
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: roleColor(role.role_name) }}
                />
                <span className="text-[13px] font-semibold text-foreground truncate">{role.role_label}</span>
                <Badge variant={role.is_system_role ? "secondary" : "outline"} className="ml-auto text-[9px] h-4 px-1.5">
                  {role.is_system_role ? "System" : "Custom"}
                </Badge>
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5 pl-5">
                {staffCounts[role.role_label.toLowerCase()] || 0} staff members
              </p>
            </button>
          ))}
        </div>

        <div className="px-4 py-2 border-t border-border">
          <p className="text-[11px] text-muted-foreground">20 roles maximum</p>
        </div>
      </div>

      {/* ── RIGHT PANEL ── */}
      <div className="flex-1 overflow-y-auto bg-muted/30 p-6">
        {!selectedRole || !matrix ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <ShieldCheck size={48} className="mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">Select a role to configure permissions</p>
            </div>
          </div>
        ) : (
          <>
            {/* Role header */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <span className="w-5 h-5 rounded-full" style={{ backgroundColor: roleColor(selectedRole.role_name) }} />
                {selectedRole.is_system_role ? (
                  <div>
                    <h2 className="text-lg font-bold text-foreground">{selectedRole.role_label}</h2>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Lock size={10} /> System role — cannot be renamed
                    </p>
                  </div>
                ) : (
                  <Input
                    value={editLabel}
                    onChange={(e) => setEditLabel(e.target.value)}
                    className="text-lg font-bold h-9 w-64 border-dashed"
                  />
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" className="gap-1" onClick={() => setPreviewRole(selectedRole)}>
                  <Eye size={14} /> Preview
                </Button>
                {!selectedRole.is_system_role && (
                  <Button
                    size="sm"
                    variant="destructive"
                    className="gap-1"
                    onClick={() => deleteMutation.mutate(selectedRole.id)}
                  >
                    <Trash2 size={14} /> Delete
                  </Button>
                )}
                <Input
                  value={changeReason}
                  onChange={e => setChangeReason(e.target.value)}
                  placeholder="Reason for change…"
                  className="h-8 text-xs w-44"
                />
                <Button size="sm" className="gap-1" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                  <Save size={14} /> Save
                </Button>
              </div>
            </div>

            {/* Quick presets */}
            <div className="flex items-center gap-2 mb-4">
              <span className="text-xs font-medium text-muted-foreground">Apply Preset:</span>
              {(["full", "view", "clinical", "finance"] as const).map((p) => (
                <Button
                  key={p}
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs capitalize"
                  onClick={() => applyGlobalPreset(p)}
                >
                  {p === "full" ? "Full Access" : p === "view" ? "View Only" : p === "clinical" ? "Clinical Only" : "Finance Only"}
                </Button>
              ))}
            </div>

            {/* Permission matrix */}
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              {/* Header row */}
              <div className="grid grid-cols-[1fr_repeat(6,80px)] bg-muted/50 border-b border-border">
                <div className="px-4 py-2.5 text-[11px] font-bold uppercase text-muted-foreground">Module</div>
                {ACTIONS.map((a) => (
                  <div key={a} className="px-2 py-2.5 text-[11px] font-bold uppercase text-muted-foreground text-center capitalize">
                    {a}
                  </div>
                ))}
              </div>

              {/* All modules master row */}
              <div className="grid grid-cols-[1fr_repeat(6,80px)] border-b border-border bg-muted/30 hover:bg-muted/50 transition-colors">
                <div className="px-4 py-2.5 flex items-center gap-2">
                  <span className="text-sm">🌐</span>
                  <span className="text-[13px] font-bold text-foreground">All Modules</span>
                </div>
                {ACTIONS.map((a, i) => (
                  <div key={a} className="flex items-center justify-center py-2.5">
                    {i === 0 ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 text-[10px] px-2"
                        onClick={toggleAllRow}
                      >
                        Toggle All
                      </Button>
                    ) : null}
                  </div>
                ))}
              </div>

              {/* Module rows */}
              {MODULES.map((mod) => {
                const perms = matrix[mod.key];
                return (
                  <div
                    key={mod.key}
                    className="group grid grid-cols-[1fr_repeat(6,80px)] border-b border-border last:border-b-0 hover:bg-muted/30 transition-colors"
                  >
                    <div className="px-4 py-2.5 flex items-center gap-2">
                      <span className="text-sm">{mod.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <span className="text-[13px] text-foreground">{mod.label}</span>
                        <div className="hidden group-hover:flex gap-1 mt-0.5">
                          <>
                            <button
                              className="text-[10px] text-primary hover:underline"
                              onClick={() => applyModulePreset(mod.key, "full")}
                            >
                              Full
                            </button>
                            <span className="text-[10px] text-muted-foreground">·</span>
                            <button
                              className="text-[10px] text-primary hover:underline"
                              onClick={() => applyModulePreset(mod.key, "view")}
                            >
                              View Only
                            </button>
                            <span className="text-[10px] text-muted-foreground">·</span>
                            <button
                              className="text-[10px] text-destructive hover:underline"
                              onClick={() => applyModulePreset(mod.key, "none")}
                            >
                              None
                            </button>
                          </>
                        </div>
                      </div>
                    </div>
                    {ACTIONS.map((action) => (
                      <div key={action} className="flex items-center justify-center py-2.5">
                        <Switch
                          checked={perms[action]}
                          onCheckedChange={() => togglePerm(mod.key, action)}
                          className="scale-75"
                        />
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default SettingsRolesPage;
