import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Microscope } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import LabQueuePanel from "@/components/lab/LabQueuePanel";
import LabInfoPanel from "@/components/lab/LabInfoPanel";
import LabResultWorkspace from "@/components/lab/LabResultWorkspace";
import NewLabOrderModal from "@/components/lab/NewLabOrderModal";
import LabQCDashboard from "@/components/lab/LabQCDashboard";
import LabCalibrationTab from "@/components/lab/LabCalibrationTab";
import ExternalReferralsTab from "@/components/lab/ExternalReferralsTab";

interface LabOrder {
  id: string;
  priority: string;
  status: string;
  order_date: string;
  order_time: string;
  clinical_notes: string | null;
  patient_id: string;
  ordered_by: string;
  patients: { full_name: string; uhid: string; gender: string | null; dob: string | null; phone?: string | null; blood_group?: string | null } | null;
  ordered_by_user: { full_name: string } | null;
  lab_order_items: { id: string; status: string; result_flag: string | null; result_value: string | null; test_id: string; lab_test_master: { tat_minutes: number } | null }[];
}

const LabPage: React.FC = () => {
  const { toast } = useToast();
  const [orders, setOrders] = useState<LabOrder[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [filterTab, setFilterTab] = useState("all");
  const [showNewOrder, setShowNewOrder] = useState(false);
  const [hospitalId, setHospitalId] = useState<string | null>(null);

  const fetchHospitalId = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data, error } = await supabase
      .from("users")
      .select("hospital_id")
      .eq("auth_user_id", user.id)
      .limit(1)
      .maybeSingle();
    if (error) { console.error("Lab hospital fetch error:", error.message); return; }
    if (data) setHospitalId(data.hospital_id);
  }, []);

  const fetchOrders = useCallback(async () => {
    if (!hospitalId) return;
    const today = new Date().toISOString().split("T")[0];
    const { data, error } = await supabase
      .from("lab_orders")
      .select(`
        id, priority, status, order_date, order_time, clinical_notes, patient_id, ordered_by,
        patients (full_name, uhid, gender, dob, phone, blood_group),
        ordered_by_user:users!lab_orders_ordered_by_fkey (full_name),
        lab_order_items (id, status, result_flag, result_value, test_id, lab_test_master:lab_test_master!lab_order_items_test_id_fkey (tat_minutes))
      `)
      .eq("hospital_id", hospitalId)
      .eq("order_date", today)
      .neq("status", "cancelled")
      .order("order_time", { ascending: true });

    if (error) {
      console.error("Lab orders fetch error:", error);
    } else {
      // Remove orphaned orders (0 items) from DB and exclude from display
      const emptyIds = (data || [])
        .filter((o: any) => !o.lab_order_items || o.lab_order_items.length === 0)
        .map((o: any) => o.id);
      if (emptyIds.length > 0) {
        await supabase.from("lab_orders").delete().in("id", emptyIds);
      }

      const sorted = (data || [])
        .filter((o: any) => o.lab_order_items && o.lab_order_items.length > 0)
        .sort((a: any, b: any) => {
          const p: Record<string, number> = { stat: 0, urgent: 1, routine: 2 };
          return (p[a.priority] ?? 2) - (p[b.priority] ?? 2);
        });
      setOrders(sorted as any);
    }
  }, [hospitalId]);

  useEffect(() => { fetchHospitalId(); }, [fetchHospitalId]);
  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  // Realtime
  useEffect(() => {
    if (!hospitalId) return;
    const channel = supabase
      .channel("lab-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "lab_orders", filter: `hospital_id=eq.${hospitalId}` }, () => fetchOrders())
      .on("postgres_changes", { event: "*", schema: "public", table: "lab_order_items", filter: `hospital_id=eq.${hospitalId}` }, () => fetchOrders())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [hospitalId, fetchOrders]);

  const filteredOrders = orders.filter((o) => {
    if (filterTab === "all") return true;
    if (filterTab === "pending") return ["ordered", "sample_collected"].includes(o.status);
    if (filterTab === "in_process") return o.status === "in_process";
    if (filterTab === "ready") return o.status === "partial_results";
    if (filterTab === "completed") return o.status === "completed";
    return true;
  });

  const selectedOrder = orders.find((o) => o.id === selectedOrderId) || null;

  const statCount = orders.filter((o) => o.priority === "stat").length;
  const urgentCount = orders.filter((o) => o.priority === "urgent").length;
  const routineCount = orders.filter((o) => o.priority === "routine").length;

  const [mainTab, setMainTab] = useState<"worklist" | "qc" | "calibration" | "external">("worklist");

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 56px)" }}>
      {/* Top tab bar */}
      <div className="h-[40px] flex-shrink-0 bg-card border-b border-border px-5 flex items-center gap-4">
        <button
          onClick={() => setMainTab("worklist")}
          className={`text-xs font-semibold px-3 py-1.5 rounded-md transition-colors ${mainTab === "worklist" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
        >
          🔬 Worklist
        </button>
        <button
          onClick={() => setMainTab("qc")}
          className={`text-xs font-semibold px-3 py-1.5 rounded-md transition-colors ${mainTab === "qc" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
        >
          📊 QC Dashboard
        </button>
        <button
          onClick={() => setMainTab("calibration")}
          className={`text-xs font-semibold px-3 py-1.5 rounded-md transition-colors ${mainTab === "calibration" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
        >
          🔧 Calibration (NABL)
        </button>
        <button
          onClick={() => setMainTab("external")}
          className={`text-xs font-semibold px-3 py-1.5 rounded-md transition-colors ${mainTab === "external" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
        >
          🔗 External Referrals
        </button>
      </div>

      {mainTab === "qc" && hospitalId ? (
        <LabQCDashboard hospitalId={hospitalId} />
      ) : mainTab === "calibration" && hospitalId ? (
        <LabCalibrationTab hospitalId={hospitalId} />
      ) : mainTab === "external" && hospitalId ? (
        <div className="flex-1 overflow-hidden">
          <ExternalReferralsTab hospitalId={hospitalId} />
        </div>
      ) : (
        <div className="flex flex-1 overflow-hidden">
          {/* Left: Queue */}
          <LabQueuePanel
            orders={filteredOrders}
            selectedOrderId={selectedOrderId}
            onSelectOrder={setSelectedOrderId}
            filterTab={filterTab}
            onFilterChange={setFilterTab}
            statCount={statCount}
            urgentCount={urgentCount}
            routineCount={routineCount}
            onNewOrder={() => setShowNewOrder(true)}
          />

          {/* Center: Workspace */}
          {selectedOrder ? (
            <LabResultWorkspace order={selectedOrder} onRefresh={fetchOrders} />
          ) : (
            <div className="flex-1 bg-muted/30 flex items-center justify-center overflow-hidden">
              <div className="text-center space-y-3">
                <Microscope size={48} className="mx-auto text-muted-foreground/40" />
                <p className="text-base text-muted-foreground">Select a test order from the queue</p>
                <p className="text-sm text-muted-foreground/60">or create a new lab order</p>
              </div>
            </div>
          )}

          {/* Right: Info */}
          <LabInfoPanel selectedOrder={selectedOrder} onSelectOrder={setSelectedOrderId} />
        </div>
      )}

      {/* New Order Modal */}
      {showNewOrder && hospitalId && (
        <NewLabOrderModal
          hospitalId={hospitalId}
          onClose={() => setShowNewOrder(false)}
          onCreated={() => {
            fetchOrders();
            setShowNewOrder(false);
          }}
        />
      )}
    </div>
  );
};

export default LabPage;
