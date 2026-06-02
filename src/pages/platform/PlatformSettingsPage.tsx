import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Plus, X, Save, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import type { AumrtiAdmin } from "@/hooks/useAumrtiAdmin";

async function fetchAdmins(): Promise<AumrtiAdmin[]> {
  const { data } = await (supabase as any).from("aumrti_admins").select("*").order("created_at");
  return data || [];
}

export default function PlatformSettingsPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [step, setStep] = useState<"form" | "uuid">("form");
  const [createdUUID, setCreatedUUID] = useState("");
  const [uuidInput, setUuidInput] = useState("");

  const { data: admins = [], isLoading } = useQuery({
    queryKey: ["platform-admins"],
    queryFn: fetchAdmins,
    staleTime: 60_000,
  });

  const addAdmin = useMutation({
    mutationFn: async () => {
      await (supabase as any).from("aumrti_admins").insert([{
        auth_user_id: uuidInput,
        full_name: fullName,
        email,
        is_active: true,
      }]);
    },
    onSuccess: () => {
      toast.success("Admin added successfully");
      setShowForm(false);
      setStep("form");
      setEmail(""); setFullName(""); setPassword(""); setUuidInput(""); setCreatedUUID("");
      qc.invalidateQueries({ queryKey: ["platform-admins"] });
    },
    onError: (e: any) => toast.error(e?.message || "Failed to add admin"),
  });

  const deactivate = useMutation({
    mutationFn: async (id: string) => {
      await (supabase as any).from("aumrti_admins").update({ is_active: false }).eq("id", id);
    },
    onSuccess: () => {
      toast.success("Admin deactivated");
      qc.invalidateQueries({ queryKey: ["platform-admins"] });
    },
    onError: (e: any) => toast.error(e?.message || "Failed"),
  });

  return (
    <div className="flex flex-col h-full">
      <div className="h-14 border-b border-slate-800 flex items-center justify-between px-6 shrink-0">
        <h1 className="text-[15px] font-semibold text-white">Platform Settings</h1>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* Admins section */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-800 flex items-center justify-between">
            <p className="text-sm font-semibold text-white">Aumrti Admins</p>
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg transition-colors"
            >
              <Plus size={12} /> Add Admin
            </button>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center h-24"><Loader2 size={18} className="animate-spin text-slate-500" /></div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] uppercase font-bold text-slate-500 border-b border-slate-800">
                  {["Name", "Email", "Status", "Added", ""].map((h) => (
                    <th key={h} className="px-5 py-2.5 text-left">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {admins.map((a) => (
                  <tr key={a.id} className="border-t border-slate-800/60 hover:bg-slate-800/30">
                    <td className="px-5 py-3 text-xs font-medium text-white">{a.full_name}</td>
                    <td className="px-5 py-3 text-xs text-slate-400">{a.email}</td>
                    <td className="px-5 py-3">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${a.is_active ? "bg-emerald-500/20 text-emerald-400" : "bg-slate-700 text-slate-500"}`}>
                        {a.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-xs text-slate-500">{format(new Date(a.created_at), "dd MMM yyyy")}</td>
                    <td className="px-5 py-3">
                      {a.is_active && (
                        <button
                          onClick={() => deactivate.mutate(a.id)}
                          className="text-slate-600 hover:text-red-400 transition-colors"
                          title="Deactivate"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Instructions */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <p className="text-sm font-semibold text-white mb-3">How to add a new Aumrti admin</p>
          <ol className="space-y-2 text-xs text-slate-400 list-decimal list-inside">
            <li>Go to <span className="text-blue-400">Supabase Dashboard → Authentication → Users</span></li>
            <li>Click <strong className="text-white">Add user</strong> → enter email and a strong password → Create</li>
            <li>Copy the UUID of the new user</li>
            <li>Come back here, click <strong className="text-white">Add Admin</strong>, paste the UUID</li>
          </ol>
        </div>
      </div>

      {/* Add admin modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-[420px] shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
              <p className="text-sm font-semibold text-white">Add Aumrti Admin</p>
              <button onClick={() => { setShowForm(false); setStep("form"); }}><X size={15} className="text-slate-500 hover:text-white" /></button>
            </div>

            <div className="p-5 space-y-4">
              {step === "form" ? (
                <>
                  <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 text-xs text-blue-300">
                    First create the user in Supabase Auth (Authentication → Users → Add user), then paste their UUID below.
                  </div>
                  {[
                    { label: "Full Name", val: fullName, set: setFullName, type: "text" },
                    { label: "Email", val: email, set: setEmail, type: "email" },
                    { label: "Auth User UUID (from Supabase)", val: uuidInput, set: setUuidInput, type: "text" },
                  ].map(({ label, val, set, type }) => (
                    <div key={label}>
                      <label className="text-xs text-slate-400">{label}</label>
                      <input
                        type={type}
                        value={val}
                        onChange={(e) => set(e.target.value)}
                        className="w-full mt-1 h-8 px-3 text-xs bg-slate-800 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  ))}
                  <button
                    onClick={() => addAdmin.mutate()}
                    disabled={!fullName || !email || !uuidInput || addAdmin.isPending}
                    className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
                  >
                    {addAdmin.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                    Add Admin
                  </button>
                </>
              ) : (
                <div className="text-center space-y-3">
                  <p className="text-green-400 text-sm font-medium">Admin added successfully!</p>
                  <p className="text-xs text-slate-400">They can now log in with their credentials and access the platform.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
