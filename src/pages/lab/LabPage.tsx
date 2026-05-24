import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Microscope } from "lucide-react";
import NABHBadge from "@/components/nabh/NABHBadge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import LabQueuePanel from "@/components/lab/LabQueuePanel";
import LabInfoPanel from "@/components/lab/LabInfoPanel";
import LabResultWorkspace from "@/components/lab/LabResultWorkspace";
import NewLabOrderModal from "@/components/lab/NewLabOrderModal";
import LabQCDashboard from "@/components/lab/LabQCDashboard";
import LabCalibrationTab from "@/components/lab/LabCalibrationTab";
import ExternalReferralsTab from "@/components/lab/ExternalReferralsTab";

interface PendingOpdLabOrder {
  prescriptionId: string;
  encounterId: string;
  patient: { id: string; full_name: string; uhid: string; gender: string | null; dob: string | null };
  labTests: { test_name: string }[];
}

interface LabOrder {
  id: string;
  priority: string;
  status: string;
  order_date: string;
  order_time: string;
  created_at: string | null;
  clinical_notes: string | null;
  patient_id: string;
  ordered_by: string;
  patients: { full_name: string; uhid: string; gender: string | null; dob: string | null; phone?: string | null; blood_group?: string | null } | null;
  ordered_by_user: { full_name: string } | null;
  lab_order_items: { id: string; status: string; result_flag: string | null; result_value: string | null; test_id: string; validated_at: string | null; lab_test_master: { tat_minutes: number } | null }[];
}

const LabPage: React.FC = () => {
  const { toast } = useToast();
  const [orders, setOrders] = useState<LabOrder[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [filterTab, setFilterTab] = useState("all");
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split("T")[0]);

  const handleDateChange = useCallback((d: string) => {
    setSelectedDate(d);
    setSelectedOrderId(null);
    // When switching to a past date reset the tab to "all" so completed orders aren't hidden
    if (d !== new Date().toISOString().split("T")[0]) {
      setFilterTab("all");
    }
  }, []);
  const [showNewOrder, setShowNewOrder] = useState(false);
  const [hospitalId, setHospitalId] = useState<string | null>(null);
  const [pendingOpdOrders, setPendingOpdOrders] = useState<PendingOpdLabOrder[]>([]);
  const [pendingOrderPatient, setPendingOrderPatient] = useState<PendingOpdLabOrder["patient"] | null>(null);
  const [pendingOrderTestNames, setPendingOrderTestNames] = useState<string[]>([]);
  const [pendingOrderEncounterId, setPendingOrderEncounterId] = useState<string | null>(null);

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
    const { data, error } = await supabase
      .from("lab_orders")
      .select(`
        id, priority, status, order_date, order_time, created_at, clinical_notes, patient_id, ordered_by,
        patients (full_name, uhid, gender, dob, phone, blood_group),
        ordered_by_user:users!lab_orders_ordered_by_fkey (full_name),
        lab_order_items (id, status, result_flag, result_value, test_id, validated_at, lab_test_master:lab_test_master!lab_order_items_test_id_fkey (tat_minutes, test_name))
      `)
      .eq("hospital_id", hospitalId)
      .eq("order_date", selectedDate)
      .neq("status", "cancelled")
      .order("order_time", { ascending: true });

    if (error) {
      console.error("Lab orders fetch error:", error);
    } else {
      const todayStr = new Date().toISOString().split("T")[0];
      const isToday = selectedDate === todayStr;

      if (isToday) {
        // Delete stale header-only orders (created by investigationSync first-pass) older than 5 min.
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
        const staleEmptyIds = (data || [])
          .filter((o: any) =>
            (!o.lab_order_items || o.lab_order_items.length === 0) &&
            o.created_at && o.created_at < fiveMinutesAgo
          )
          .map((o: any) => o.id);
        if (staleEmptyIds.length > 0) {
          await supabase.from("lab_orders").delete().in("id", staleEmptyIds);
        }
      }

      const sorted = (data || [])
        // For today: hide ghost orders with no items. For past dates: show all.
        .filter((o: any) => isToday ? (o.lab_order_items && o.lab_order_items.length > 0) : true)
        .sort((a: any, b: any) => {
          const p: Record<string, number> = { stat: 0, urgent: 1, routine: 2 };
          return (p[a.priority] ?? 2) - (p[b.priority] ?? 2);
        });
      setOrders(sorted as any);
    }
  }, [hospitalId, selectedDate]);

  const fetchPendingOpdOrders = useCallback(async () => {
    if (!hospitalId) return;
    const today = new Date().toISOString().split("T")[0];

    const [{ data: prescriptions }, { data: processed }] = await Promise.all([
      supabase
        .from("prescriptions")
        .select("id, encounter_id, patient_id, lab_orders, patients(id, full_name, uhid, gender, dob)")
        .eq("hospital_id", hospitalId)
        .eq("prescription_date", today)
        .neq("lab_orders", "[]"),
      supabase
        .from("lab_orders")
        .select("encounter_id")
        .eq("hospital_id", hospitalId)
        .eq("order_date", today)
        .not("encounter_id", "is", null),
    ]);

    const processedSet = new Set((processed || []).map((o: any) => o.encounter_id));

    setPendingOpdOrders(
      (prescriptions || [])
        .filter((p: any) =>
          p.encounter_id &&
          !processedSet.has(p.encounter_id) &&
          Array.isArray(p.lab_orders) &&
          p.lab_orders.length > 0
        )
        .map((p: any) => ({
          prescriptionId: p.id,
          encounterId: p.encounter_id,
          patient: p.patients,
          labTests: p.lab_orders,
        }))
    );
  }, [hospitalId]);

  useEffect(() => { fetchHospitalId(); }, [fetchHospitalId]);
  useEffect(() => { fetchOrders(); fetchPendingOpdOrders(); }, [fetchOrders, fetchPendingOpdOrders]);

  // Realtime
  useEffect(() => {
    if (!hospitalId) return;
    const channel = supabase
      .channel("lab-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "lab_orders", filter: `hospital_id=eq.${hospitalId}` }, () => { fetchOrders(); fetchPendingOpdOrders(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "lab_order_items", filter: `hospital_id=eq.${hospitalId}` }, () => fetchOrders())
      .on("postgres_changes", { event: "*", schema: "public", table: "prescriptions", filter: `hospital_id=eq.${hospitalId}` }, () => fetchPendingOpdOrders())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [hospitalId, fetchOrders, fetchPendingOpdOrders]);

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
        <div className="ml-auto" />
        <NABHBadge standardCodes={["AAC.3", "HIC.4", "QPS.2"]} />
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
            selectedDate={selectedDate}
            onDateChange={handleDateChange}
            statCount={statCount}
            urgentCount={urgentCount}
            routineCount={routineCount}
            onNewOrder={() => setShowNewOrder(true)}
            pendingOpdOrders={pendingOpdOrders}
            onCreateFromOpd={(patient, testNames, encounterId) => {
              setPendingOrderPatient(patient);
              setPendingOrderTestNames(testNames);
              setPendingOrderEncounterId(encounterId);
              setShowNewOrder(true);
            }}
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
          <LabInfoPanel
            selectedOrder={selectedOrder}
            onSelectOrder={setSelectedOrderId}
            onAddTestToOrder={(patient) => {
              setPendingOrderPatient(patient);
              setPendingOrderTestNames([]);
              setPendingOrderEncounterId(null);
              setShowNewOrder(true);
            }}
            onRepeatOrder={(patient, testNames) => {
              setPendingOrderPatient(patient);
              setPendingOrderTestNames(testNames);
              setPendingOrderEncounterId(null);
              setShowNewOrder(true);
            }}
          />
        </div>
      )}

      {/* New Order Modal */}
      {showNewOrder && hospitalId && (
        <NewLabOrderModal
          hospitalId={hospitalId}
          onClose={() => {
            setShowNewOrder(false);
            setPendingOrderPatient(null);
            setPendingOrderTestNames([]);
            setPendingOrderEncounterId(null);
          }}
          onCreated={() => {
            fetchOrders();
            fetchPendingOpdOrders();
            setShowNewOrder(false);
            setPendingOrderPatient(null);
            setPendingOrderTestNames([]);
            setPendingOrderEncounterId(null);
          }}
          preselectedPatient={pendingOrderPatient ?? undefined}
          preselectedTestNames={pendingOrderTestNames}
          linkedEncounterId={pendingOrderEncounterId}
        />
      )}
    </div>
  );
};

export default LabPage;
