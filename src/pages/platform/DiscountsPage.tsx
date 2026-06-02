import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Plus, X, Save, Loader2, ToggleLeft, ToggleRight } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface DiscountCode {
  id: string; code: string; description: string | null;
  discount_type: "percentage" | "flat"; discount_value: number;
  applies_to: string; valid_from: string; valid_until: string | null;
  max_uses: number | null; used_count: number; is_active: boolean;
  created_at: string;
}

const BLANK: Partial<DiscountCode> = {
  code: "", description: "", discount_type: "percentage", discount_value: 0,
  applies_to: "all", valid_from: new Date().toISOString().split("T")[0],
  valid_until: "", max_uses: null, is_active: true,
};

async function fetchCodes(): Promise<DiscountCode[]> {
  const { data } = await (supabase as any).from("discount_codes")
    .select("*").order("created_at", { ascending: false });
  return data || [];
}

export default function DiscountsPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Partial<DiscountCode>>(BLANK);
  const [editId, setEditId] = useState<string | null>(null);

  const { data = [], isLoading } = useQuery({ queryKey: ["platform-discounts"], queryFn: fetchCodes, staleTime: 30_000 });

  const f = (key: keyof DiscountCode, val: any) => setForm((p) => ({ ...p, [key]: val }));

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        ...form,
        valid_from: form.valid_from || new Date().toISOString(),
        valid_until: form.valid_until || null,
        discount_value: Number(form.discount_value),
        max_uses: form.max_uses ? Number(form.max_uses) : null,
      };
      if (editId) {
        await (supabase as any).from("discount_codes").update(payload).eq("id", editId);
      } else {
        await (supabase as any).from("discount_codes").insert([payload]);
      }
    },
    onSuccess: () => {
      toast.success(editId ? "Code updated" : "Code created");
      setShowForm(false);
      setEditId(null);
      setForm(BLANK);
      qc.invalidateQueries({ queryKey: ["platform-discounts"] });
    },
    onError: (e: any) => toast.error(e?.message || "Failed"),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      await (supabase as any).from("discount_codes").update({ is_active }).eq("id", id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["platform-discounts"] }),
  });

  const openEdit = (c: DiscountCode) => {
    setForm({ ...c, valid_from: c.valid_from?.split("T")[0], valid_until: c.valid_until?.split("T")[0] || "" });
    setEditId(c.id);
    setShowForm(true);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="h-14 border-b border-slate-800 flex items-center justify-between px-6 shrink-0">
        <h1 className="text-[15px] font-semibold text-white">Discount Codes</h1>
        <button onClick={() => { setForm(BLANK); setEditId(null); setShowForm(true); }}
          className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg transition-colors">
          <Plus size={12} /> New Code
        </button>
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-slate-900 z-10">
            <tr className="text-[10px] uppercase font-bold text-slate-500 border-b border-slate-800">
              {["Code","Type","Value","Applies To","Valid From","Valid Until","Uses","Active",""].map((h) => (
                <th key={h} className="px-5 py-3 text-left">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={9} className="px-5 py-10 text-center text-xs text-slate-600">Loading…</td></tr>
            ) : data.length === 0 ? (
              <tr><td colSpan={9} className="px-5 py-10 text-center text-xs text-slate-600">No discount codes yet</td></tr>
            ) : data.map((c) => (
              <tr key={c.id} className="border-t border-slate-800/60 hover:bg-slate-800/30 transition-colors">
                <td className="px-5 py-3 text-xs font-mono font-bold text-white">{c.code}</td>
                <td className="px-5 py-3 text-xs text-slate-400">{c.discount_type}</td>
                <td className="px-5 py-3 text-xs text-slate-300 font-mono">
                  {c.discount_type === "percentage" ? `${c.discount_value}%` : `₹${Number(c.discount_value).toLocaleString("en-IN")}`}
                </td>
                <td className="px-5 py-3 text-xs text-slate-400">{c.applies_to}</td>
                <td className="px-5 py-3 text-xs text-slate-500">{format(new Date(c.valid_from), "dd MMM yyyy")}</td>
                <td className="px-5 py-3 text-xs text-slate-500">{c.valid_until ? format(new Date(c.valid_until), "dd MMM yyyy") : "—"}</td>
                <td className="px-5 py-3 text-xs text-slate-400 font-mono">{c.used_count}{c.max_uses ? `/${c.max_uses}` : ""}</td>
                <td className="px-5 py-3">
                  <button onClick={() => toggleActive.mutate({ id: c.id, is_active: !c.is_active })} className="text-slate-500 hover:text-white transition-colors">
                    {c.is_active ? <ToggleRight size={18} className="text-emerald-400" /> : <ToggleLeft size={18} />}
                  </button>
                </td>
                <td className="px-5 py-3">
                  <button onClick={() => openEdit(c)} className="text-xs text-blue-400 hover:text-blue-300">Edit</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create / Edit modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-[440px] shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
              <p className="text-sm font-semibold text-white">{editId ? "Edit Code" : "New Discount Code"}</p>
              <button onClick={() => setShowForm(false)}><X size={15} className="text-slate-500 hover:text-white" /></button>
            </div>
            <div className="p-5 space-y-3">
              {[
                { label: "Code (CAPS)", key: "code" as const, type: "text", placeholder: "LAUNCH50" },
                { label: "Description (internal)", key: "description" as const, type: "text", placeholder: "Optional" },
                { label: "Discount Value", key: "discount_value" as const, type: "number", placeholder: "50" },
                { label: "Max Uses (blank = unlimited)", key: "max_uses" as const, type: "number", placeholder: "" },
                { label: "Valid From", key: "valid_from" as const, type: "date", placeholder: "" },
                { label: "Valid Until (blank = never expires)", key: "valid_until" as const, type: "date", placeholder: "" },
              ].map(({ label, key, type, placeholder }) => (
                <div key={key}>
                  <label className="text-xs text-slate-400">{label}</label>
                  <input
                    type={type}
                    value={(form[key] as any) ?? ""}
                    onChange={(e) => f(key, e.target.value === "" && type === "number" ? null : e.target.value)}
                    placeholder={placeholder}
                    className="w-full mt-1 h-8 px-3 text-xs bg-slate-800 border border-slate-700 rounded-lg text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
                  />
                </div>
              ))}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400">Type</label>
                  <select value={form.discount_type} onChange={(e) => f("discount_type", e.target.value)}
                    className="w-full mt-1 h-8 px-2 text-xs bg-slate-800 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:border-blue-500">
                    <option value="percentage">Percentage (%)</option>
                    <option value="flat">Flat (₹)</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-400">Applies To</label>
                  <select value={form.applies_to} onChange={(e) => f("applies_to", e.target.value)}
                    className="w-full mt-1 h-8 px-2 text-xs bg-slate-800 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:border-blue-500">
                    <option value="all">All Plans</option>
                    <option value="starter">Starter only</option>
                    <option value="professional">Professional only</option>
                    <option value="enterprise">Enterprise only</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="px-5 pb-5">
              <button onClick={() => save.mutate()} disabled={save.isPending}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50">
                {save.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                {editId ? "Update" : "Create Code"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
