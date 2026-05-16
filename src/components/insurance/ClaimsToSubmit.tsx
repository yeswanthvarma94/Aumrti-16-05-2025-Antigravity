import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Send, Bot, Package, AlertTriangle } from "lucide-react";
import DenialPredictorPanel from "@/components/insurance/DenialPredictorPanel";
import ClaimBundleGenerator from "@/components/insurance/ClaimBundleGenerator";
import { Checkbox } from "@/components/ui/checkbox";

interface ClaimRow {
  bill_id: string;
  bill_number: string;
  patient_name: string;
  tpa_name: string;
  total_amount: number;
  denial_risk: number;
  has_pre_auth: boolean;
  patient_id: string;
  admission_id?: string | null;
}

const ClaimsToSubmit: React.FC = () => {
  const [rows, setRows] = useState<ClaimRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [selectedForReview, setSelectedForReview] = useState<ClaimRow | null>(null);
  const [bundleFor, setBundleFor] = useState<ClaimRow | null>(null);
  const [hospitalId, setHospitalId] = useState<string>("");
  const [aiScores, setAiScores] = useState<Record<string, number>>({});
  const [highRiskConfirmed, setHighRiskConfirmed] = useState<Record<string, boolean>>({});
  const { toast } = useToast();

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    const { data: userData } = await supabase.from("users").select("hospital_id").limit(1).maybeSingle();
    if (userData?.hospital_id) setHospitalId(userData.hospital_id);
    // Get finalised bills for insurance patients that don't have claims yet
    const { data: bills } = await supabase
      .from("bills")
      .select("id, bill_number, patient_id, total_amount, admission_id")
      .in("bill_status", ["final", "draft"])
      .neq("bill_type", "opd"); // focus on IPD/emergency

    if (!bills?.length) { setRows([]); setLoading(false); return; }

    const billIds = bills.map(b => b.id);
    const patientIds = [...new Set(bills.map(b => b.patient_id))];
    const admissionIds = bills.map(b => b.admission_id).filter(Boolean) as string[];

    const [claimsRes, patientsRes, admRes, preAuthRes] = await Promise.all([
      supabase.from("insurance_claims").select("bill_id").in("bill_id", billIds),
      supabase.from("patients").select("id, full_name").in("id", patientIds),
      admissionIds.length ? supabase.from("admissions").select("id, insurance_type").in("id", admissionIds).neq("insurance_type", "self_pay") : Promise.resolve({ data: [] }),
      admissionIds.length ? supabase.from("insurance_pre_auth").select("admission_id, status").in("admission_id", admissionIds) : Promise.resolve({ data: [] }),
    ]);

    const claimedBills = new Set((claimsRes.data || []).map(c => c.bill_id));
    const pMap = Object.fromEntries((patientsRes.data || []).map(p => [p.id, p.full_name]));
    const insuranceAdmissions = new Set((admRes.data || []).map(a => a.id));
    const preAuthMap = Object.fromEntries((preAuthRes.data || []).map(pa => [pa.admission_id, pa.status]));

    const eligible = bills.filter(b => !claimedBills.has(b.id) && b.admission_id && insuranceAdmissions.has(b.admission_id));

    setRows(eligible.map(b => {
      const hasPreAuth = preAuthMap[b.admission_id!] === "approved";
      // Simple risk score
      let risk = 40;
      if (hasPreAuth) risk -= 20;
      if (Number(b.total_amount) > 200000) risk += 15;
      risk = Math.max(0, Math.min(100, risk));

      return {
        bill_id: b.id,
        bill_number: b.bill_number,
        patient_name: pMap[b.patient_id] || "Unknown",
        tpa_name: "Insurance",
        total_amount: Number(b.total_amount || 0),
        denial_risk: risk,
        has_pre_auth: hasPreAuth,
        patient_id: b.patient_id,
        admission_id: b.admission_id,
      };
    }));
    setLoading(false);
  };

  const submitClaim = async (row: ClaimRow) => {
    setSubmitting(row.bill_id);
    const { data: userData } = await supabase.from("users").select("id, hospital_id").limit(1).maybeSingle();
    if (!userData) { setSubmitting(null); return; }

    const claimNumber = `CLM-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.floor(Math.random() * 9000 + 1000)}`;

    const finalRiskScore = aiScores[row.bill_id] ?? row.denial_risk;
    const { error } = await supabase.from("insurance_claims").insert({
      hospital_id: userData.hospital_id,
      bill_id: row.bill_id,
      patient_id: row.patient_id,
      tpa_name: row.tpa_name,
      claim_number: claimNumber,
      claimed_amount: row.total_amount,
      status: "submitted",
      submitted_at: new Date().toISOString(),
      ai_denial_risk_score: finalRiskScore,
      created_by: userData.id,
    } as any);

    if (!error) {
      toast({ title: `Claim ${claimNumber} submitted ✓` });
      loadData();
    } else {
      toast({ title: "Error submitting claim", variant: "destructive" });
    }
    setSubmitting(null);
  };

  const riskBadge = (risk: number) => {
    if (risk <= 30) return <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]">🟢 Low {risk}%</Badge>;
    if (risk <= 60) return <Badge className="bg-amber-50 text-amber-700 border-amber-200 text-[10px]">🟡 Medium {risk}%</Badge>;
    return <Badge className="bg-red-50 text-red-700 border-red-200 text-[10px]">🔴 High {risk}%</Badge>;
  };

  if (loading) return <div className="flex items-center justify-center h-full text-muted-foreground text-sm">Loading...</div>;

  return (
    <div className="h-full overflow-auto p-4">
      <div className="bg-background rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-[11px]">Patient</TableHead>
              <TableHead className="text-[11px]">Bill #</TableHead>
              <TableHead className="text-[11px]">TPA</TableHead>
              <TableHead className="text-[11px]">Amount</TableHead>
              <TableHead className="text-[11px]">Pre-Auth</TableHead>
              <TableHead className="text-[11px]">Denial Risk</TableHead>
              <TableHead className="text-[11px]">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground text-sm py-8">No claims ready to submit</TableCell></TableRow>
            ) : rows.map(r => (
              <TableRow key={r.bill_id}>
                <TableCell className="text-[13px] font-medium">{r.patient_name}</TableCell>
                <TableCell className="text-xs font-mono text-muted-foreground">{r.bill_number}</TableCell>
                <TableCell className="text-xs">{r.tpa_name}</TableCell>
                <TableCell className="text-[13px] font-bold tabular-nums">₹{r.total_amount.toLocaleString("en-IN")}</TableCell>
                <TableCell>
                  {r.has_pre_auth
                    ? <Badge className="bg-emerald-50 text-emerald-700 text-[10px]">✓ Approved</Badge>
                    : <Badge variant="outline" className="text-[10px] text-amber-600">Missing</Badge>}
                </TableCell>
                <TableCell>{riskBadge(r.denial_risk)}</TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1">
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" className="text-[11px] h-7 gap-1" onClick={() => setBundleFor(r)} disabled={!r.admission_id}>
                        <Package size={12} /> Bundle
                      </Button>
                      <Button
                        size="sm"
                        variant={aiScores[r.bill_id] !== undefined ? "outline" : "default"}
                        className={`text-[11px] h-7 gap-1 ${aiScores[r.bill_id] !== undefined ? "" : "bg-violet-600 hover:bg-violet-700"}`}
                        onClick={() => setSelectedForReview(r)}
                      >
                        <Bot size={12} /> {aiScores[r.bill_id] !== undefined ? `AI: ${aiScores[r.bill_id]}%` : "AI Review"}
                      </Button>
                      <Button
                        size="sm"
                        className="text-[11px] h-7 gap-1"
                        onClick={() => submitClaim(r)}
                        disabled={
                          submitting === r.bill_id ||
                          aiScores[r.bill_id] === undefined ||
                          (aiScores[r.bill_id] > 50 && !highRiskConfirmed[r.bill_id])
                        }
                        title={aiScores[r.bill_id] === undefined ? "Run AI Review first" : undefined}
                      >
                        <Send size={12} /> Submit
                      </Button>
                    </div>
                    {aiScores[r.bill_id] === undefined && (
                      <p className="text-[10px] text-amber-600 flex items-center gap-1">
                        <AlertTriangle size={10} /> Run AI Review before submitting
                      </p>
                    )}
                    {aiScores[r.bill_id] !== undefined && aiScores[r.bill_id] > 50 && (
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <Checkbox
                          checked={!!highRiskConfirmed[r.bill_id]}
                          onCheckedChange={v => setHighRiskConfirmed(prev => ({ ...prev, [r.bill_id]: !!v }))}
                        />
                        <span className="text-[10px] text-red-600 font-medium">High risk — I confirm and proceed</span>
                      </label>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* AI Denial Predictor Panel */}
      {selectedForReview && hospitalId && (
        <div className="mt-4 max-w-xl">
          <DenialPredictorPanel
            claimData={{
              tpa_name: selectedForReview.tpa_name,
              claimed_amount: selectedForReview.total_amount,
              documents_count: selectedForReview.has_pre_auth ? 3 : 1,
            }}
            preAuthNumber={selectedForReview.has_pre_auth ? "PA-APPROVED" : null}
            hospitalId={hospitalId}
            onRiskAssessed={score => {
              setAiScores(prev => ({ ...prev, [selectedForReview.bill_id]: score }));
              setSelectedForReview(null);
            }}
            onProceedSubmit={() => {
              submitClaim(selectedForReview);
              setSelectedForReview(null);
            }}
          />
        </div>
      )}

      {bundleFor && bundleFor.admission_id && hospitalId && (
        <ClaimBundleGenerator
          open={!!bundleFor}
          onClose={() => setBundleFor(null)}
          admissionId={bundleFor.admission_id}
          billId={bundleFor.bill_id}
          patientId={bundleFor.patient_id}
          patientName={bundleFor.patient_name}
          billNumber={bundleFor.bill_number}
          totalAmount={bundleFor.total_amount}
          tpaName={bundleFor.tpa_name}
          hospitalId={hospitalId}
          onSubmitted={() => { setBundleFor(null); loadData(); }}
        />
      )}
    </div>
  );
};

export default ClaimsToSubmit;
