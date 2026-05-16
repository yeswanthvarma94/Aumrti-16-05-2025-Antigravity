import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useHospitalId } from "@/hooks/useHospitalId";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Loader2, Package, TrendingDown, ShieldCheck, ArchiveX, Plus } from "lucide-react";
import AssetRegisterTab from "@/components/assets/AssetRegisterTab";
import DepreciationTab from "@/components/assets/DepreciationTab";
import InsuranceTab from "@/components/assets/InsuranceTab";
import DisposalTab from "@/components/assets/DisposalTab";
import AddAssetModal from "@/components/assets/AddAssetModal";

interface KPIs {
  totalAssets: number;
  grossValue: number;
  accumulatedDepreciation: number;
  netBookValue: number;
  insuranceExpiring: number;
}

const fmt = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

const AssetsPage: React.FC = () => {
  const { hospitalId, loading: hospitalLoading } = useHospitalId();
  const [tab, setTab] = useState("register");
  const [kpis, setKpis] = useState<KPIs>({ totalAssets: 0, grossValue: 0, accumulatedDepreciation: 0, netBookValue: 0, insuranceExpiring: 0 });
  const [refreshKey, setRefreshKey] = useState(0);
  const [showAddModal, setShowAddModal] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  const refresh = () => setRefreshKey((k) => k + 1);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setUserId(user.id);
    });
  }, []);

  const loadKPIs = useCallback(async () => {
    if (!hospitalId) return;
    const { data } = await (supabase as any)
      .from("asset_register")
      .select("acquisition_cost, accumulated_depreciation, insurance_expiry")
      .eq("hospital_id", hospitalId)
      .eq("is_active", true);

    if (!data) return;

    const thirtyDaysLater = new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0];
    const today = new Date().toISOString().split("T")[0];

    let gross = 0, accDep = 0, expiring = 0;
    for (const a of data) {
      gross += Number(a.acquisition_cost) || 0;
      accDep += Number(a.accumulated_depreciation) || 0;
      if (a.insurance_expiry && a.insurance_expiry >= today && a.insurance_expiry <= thirtyDaysLater) expiring++;
    }

    setKpis({
      totalAssets: data.length,
      grossValue: gross,
      accumulatedDepreciation: accDep,
      netBookValue: gross - accDep,
      insuranceExpiring: expiring,
    });
  }, [hospitalId]);

  useEffect(() => { loadKPIs(); }, [loadKPIs, refreshKey]);

  if (hospitalLoading || !hospitalId) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  const kpiCards = [
    { label: "Total Assets", value: kpis.totalAssets.toString(), icon: Package, color: "text-foreground" },
    { label: "Gross Value", value: fmt(kpis.grossValue), icon: Package, color: "text-blue-600" },
    { label: "Accumulated Dep.", value: fmt(kpis.accumulatedDepreciation), icon: TrendingDown, color: "text-red-600" },
    { label: "Net Book Value", value: fmt(kpis.netBookValue), icon: Package, color: "text-green-600" },
    { label: "Insurance Expiring (30d)", value: kpis.insuranceExpiring.toString(), icon: ShieldCheck, color: kpis.insuranceExpiring > 0 ? "text-amber-600" : "text-muted-foreground" },
  ];

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 56px)" }}>
      <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0" style={{ height: 52 }}>
        <h1 className="text-base font-bold text-foreground">🏗️ Asset Management</h1>
        <Button size="sm" className="gap-1.5" onClick={() => setShowAddModal(true)}>
          <Plus size={14} /> Add Asset
        </Button>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-5 gap-0 border-b border-border shrink-0">
        {kpiCards.map((k) => (
          <div key={k.label} className="flex flex-col items-center justify-center py-3 border-r border-border last:border-r-0">
            <span className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</span>
            <span className="text-[10px] text-muted-foreground mt-0.5">{k.label}</span>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex-1 overflow-hidden flex flex-col">
        <Tabs value={tab} onValueChange={setTab} className="flex flex-col flex-1 overflow-hidden">
          <div className="border-b border-border px-4 shrink-0">
            <TabsList className="h-9 bg-transparent p-0 gap-0">
              {[
                { value: "register", label: "Asset Register", icon: Package },
                { value: "depreciation", label: "Depreciation", icon: TrendingDown },
                { value: "insurance", label: "Insurance", icon: ShieldCheck },
                { value: "disposal", label: "Disposal", icon: ArchiveX },
              ].map((t) => (
                <TabsTrigger
                  key={t.value}
                  value={t.value}
                  className="h-9 px-4 text-xs rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:bg-transparent gap-1.5"
                >
                  <t.icon size={13} /> {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            <TabsContent value="register" className="mt-0">
              <AssetRegisterTab hospitalId={hospitalId} refreshKey={refreshKey} onAdd={() => setShowAddModal(true)} />
            </TabsContent>
            <TabsContent value="depreciation" className="mt-0">
              <DepreciationTab hospitalId={hospitalId} refreshKey={refreshKey} userId={userId} />
            </TabsContent>
            <TabsContent value="insurance" className="mt-0">
              <InsuranceTab hospitalId={hospitalId} refreshKey={refreshKey} />
            </TabsContent>
            <TabsContent value="disposal" className="mt-0">
              <DisposalTab hospitalId={hospitalId} refreshKey={refreshKey} userId={userId} onRefresh={refresh} />
            </TabsContent>
          </div>
        </Tabs>
      </div>

      {showAddModal && (
        <AddAssetModal
          hospitalId={hospitalId}
          onClose={() => setShowAddModal(false)}
          onSaved={() => { setShowAddModal(false); refresh(); }}
        />
      )}
    </div>
  );
};

export default AssetsPage;
