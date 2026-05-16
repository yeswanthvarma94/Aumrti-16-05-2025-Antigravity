import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, Search, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface Asset {
  id: string;
  asset_code: string;
  asset_name: string;
  category: string;
  acquisition_date: string;
  acquisition_cost: number;
  useful_life_years: number;
  depreciation_method: string;
  accumulated_depreciation: number;
  residual_value: number;
  insurance_expiry: string | null;
  disposal_date: string | null;
  is_active: boolean;
}

interface Props {
  hospitalId: string;
  refreshKey: number;
  onAdd: () => void;
}

const fmt = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

const CATEGORY_COLORS: Record<string, string> = {
  equipment: "bg-blue-50 text-blue-700 border-blue-200",
  building: "bg-amber-50 text-amber-700 border-amber-200",
  land: "bg-green-50 text-green-700 border-green-200",
  vehicle: "bg-purple-50 text-purple-700 border-purple-200",
  it: "bg-cyan-50 text-cyan-700 border-cyan-200",
  furniture: "bg-orange-50 text-orange-700 border-orange-200",
  other: "bg-gray-50 text-gray-700 border-gray-200",
};

const AssetRegisterTab: React.FC<Props> = ({ hospitalId, refreshKey, onAdd }) => {
  const { toast } = useToast();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await (supabase as any)
      .from("asset_register")
      .select("id, asset_code, asset_name, category, acquisition_date, acquisition_cost, useful_life_years, depreciation_method, accumulated_depreciation, residual_value, insurance_expiry, disposal_date, is_active")
      .eq("hospital_id", hospitalId)
      .eq("is_active", true)
      .order("acquisition_date", { ascending: false });
    setAssets(data || []);
    setLoading(false);
  }, [hospitalId]);

  useEffect(() => { load(); }, [load, refreshKey]);

  const retire = async (asset: Asset) => {
    if (!confirm(`Retire asset "${asset.asset_name}"? This cannot be undone.`)) return;
    await (supabase as any).from("asset_register").update({ is_active: false, disposal_date: new Date().toISOString().split("T")[0] }).eq("id", asset.id);
    toast({ title: "Asset retired" });
    load();
  };

  const filtered = assets.filter((a) =>
    !search || a.asset_name.toLowerCase().includes(search.toLowerCase()) || a.asset_code.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search assets..." className="pl-8 h-8 text-sm" />
        </div>
        <Button size="sm" onClick={onAdd}>+ Add Asset</Button>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">
          No assets registered yet. Click "Add Asset" to begin.
        </div>
      ) : (
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="text-[10px] font-bold uppercase text-muted-foreground">
                <th className="px-3 py-2 text-left">Code</th>
                <th className="px-3 py-2 text-left">Asset Name</th>
                <th className="px-3 py-2 text-left">Category</th>
                <th className="px-3 py-2 text-right">Cost</th>
                <th className="px-3 py-2 text-right">Accum. Dep.</th>
                <th className="px-3 py-2 text-right">Net Book Value</th>
                <th className="px-3 py-2 text-center">Method</th>
                <th className="px-3 py-2 text-center">Insurance</th>
                <th className="px-3 py-2 text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => {
                const nbv = a.acquisition_cost - a.accumulated_depreciation;
                const insExpiring = a.insurance_expiry && new Date(a.insurance_expiry) < new Date(Date.now() + 30 * 86400000);
                return (
                  <tr key={a.id} className="border-t border-border hover:bg-muted/30">
                    <td className="px-3 py-2 text-xs font-mono font-bold text-muted-foreground">{a.asset_code}</td>
                    <td className="px-3 py-2 text-xs font-medium">{a.asset_name}</td>
                    <td className="px-3 py-2">
                      <Badge variant="outline" className={cn("text-[9px] capitalize", CATEGORY_COLORS[a.category] || CATEGORY_COLORS.other)}>
                        {a.category}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-xs text-right font-mono">{fmt(a.acquisition_cost)}</td>
                    <td className="px-3 py-2 text-xs text-right font-mono text-destructive">{fmt(a.accumulated_depreciation)}</td>
                    <td className="px-3 py-2 text-xs text-right font-mono font-bold">{fmt(Math.max(0, nbv))}</td>
                    <td className="px-3 py-2 text-center text-[10px] uppercase font-bold text-muted-foreground">{a.depreciation_method}</td>
                    <td className="px-3 py-2 text-center">
                      {a.insurance_expiry ? (
                        <span className={cn("text-[10px]", insExpiring ? "text-red-600 font-bold" : "text-muted-foreground")}>
                          {format(new Date(a.insurance_expiry), "dd/MM/yy")}
                          {insExpiring && " ⚠"}
                        </span>
                      ) : <span className="text-[10px] text-muted-foreground">—</span>}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <button onClick={() => retire(a)} className="text-muted-foreground hover:text-destructive p-1" title="Retire asset">
                        <Trash2 size={12} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default AssetRegisterTab;
