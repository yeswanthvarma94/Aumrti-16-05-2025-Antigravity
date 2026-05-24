import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import EmptyState from "@/components/EmptyState";
import NABHBadge from "@/components/nabh/NABHBadge";
import WalkInModal from "./WalkInModal";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/shared";
import { predictNoShow, type NoShowPrediction } from "@/lib/clinicalPredictions";
import { sendWhatsApp } from "@/lib/whatsapp-send";
import type { OpdToken } from "@/pages/opd/OPDPage";

interface Props {
  tokens: OpdToken[];
  selectedTokenId: string | null;
  onSelectToken: (id: string) => void;
  hospitalId: string | null;
  loading: boolean;
  onTokenCreated: () => void;
}

const statusOrder: Record<string, number> = {
  called: 0,
  in_consultation: 1,
  waiting: 2,
  completed: 3,
  no_show: 4,
  cancelled: 5,
};

const priorityBadge: Record<string, { label: string; bg: string; text: string }> = {
  urgent: { label: "URGENT", bg: "bg-red-100", text: "text-red-600" },
  elderly: { label: "ELDER", bg: "bg-amber-100", text: "text-amber-700" },
  pregnant: { label: "PREG", bg: "bg-pink-100", text: "text-pink-700" },
  disabled: { label: "ASSIST", bg: "bg-violet-100", text: "text-violet-700" },
};

const statusStyles: Record<string, string> = {
  waiting: "bg-white border-slate-100",
  called: "bg-orange-50 border-orange-200",
  in_consultation: "bg-blue-50 border-blue-200",
  completed: "bg-green-50 border-green-200 opacity-70",
  no_show: "bg-slate-50 border-slate-200 opacity-50",
  cancelled: "bg-slate-50 border-slate-200 opacity-50",
};

function getWaitMinutes(createdAt: string): string {
  const diff = Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000);
  if (diff < 1) return "< 1 min";
  return `${diff} min`;
}

/**
 * TokenQueue component displays a list of OPD tokens, allowing filtering by department
 * and showing real-time updates and no-show predictions.
 */
const TokenQueue: React.FC<Props> = ({ tokens, selectedTokenId, onSelectToken, hospitalId, loading, onTokenCreated }) => {
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [activeDept, setActiveDept] = useState<string>("all");
  const [showModal, setShowModal] = useState(false);
  const [predictions, setPredictions] = useState<Record<string, NoShowPrediction>>({});
  const [predictingIds, setPredictingIds] = useState<Set<string>>(new Set());
  const [reminderSending, setReminderSending] = useState<string | null>(null);
  const [noShowHistory, setNoShowHistory] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!hospitalId) return;
    supabase.from("departments").select("id, name").eq("hospital_id", hospitalId).eq("is_active", true).order("name", { ascending: true })
      .then(({ data }) => setDepartments(data || []));
  }, [hospitalId]);

  // Run no-show predictions for waiting tokens
  const runPredictions = useCallback(async () => {
    if (!hospitalId || tokens.length === 0) return;
    const waitingTokens = tokens.filter(t => t.status === "waiting" && !predictions[t.id] && !predictingIds.has(t.id));
    if (waitingTokens.length === 0) return;

    const newPredicting = new Set(predictingIds);
    waitingTokens.forEach(t => newPredicting.add(t.id));
    setPredictingIds(newPredicting);

    for (const token of waitingTokens.slice(0, 5)) {
      const result = await predictNoShow(
        { id: token.id, patient_id: token.patient_id, doctor_id: token.doctor_id, created_at: token.created_at, hospital_id: token.hospital_id },
        token.patient?.full_name || "Patient",
        token.doctor?.full_name || null
      );
      if (result) {
        setPredictions(prev => ({ ...prev, [token.id]: result }));
      }
    }
  }, [hospitalId, tokens, predictions, predictingIds]);

  useEffect(() => {
    if (!loading && tokens.length > 0) {
      const timer = setTimeout(runPredictions, 2000);
      return () => clearTimeout(timer);
    }
  }, [loading, tokens.length, runPredictions]);

  useEffect(() => {
    if (!hospitalId || tokens.length === 0) return;
    const patientIds = [...new Set(tokens.map(t => t.patient_id).filter(Boolean))];
    supabase
      .from("opd_tokens")
      .select("patient_id")
      .eq("hospital_id", hospitalId)
      .eq("status", "no_show")
      .in("patient_id", patientIds)
      .then(({ data }) => {
        const map: Record<string, number> = {};
        (data || []).forEach((r: any) => {
          map[r.patient_id] = (map[r.patient_id] || 0) + 1;
        });
        setNoShowHistory(map);
      });
  }, [hospitalId, tokens]);

  const handleSendReminder = async (token: OpdToken) => {
    if (!hospitalId || !token.patient?.phone) return;
    setReminderSending(token.id);
    const doctorName = token.doctor?.full_name || "your doctor";
    const message = `Dear ${token.patient.full_name}, reminder: your appointment with Dr. ${doctorName} is today. Please confirm attendance. Reply YES to confirm or call the hospital to reschedule.`;
    await sendWhatsApp({ hospitalId, phone: token.patient.phone, message });
    await supabase.from("no_show_predictions").update({ reminder_sent: true } as any).eq("appointment_id", token.id);
    setReminderSending(null);
  };

  const filtered = useMemo(() => {
    let list = [...tokens];
    if (activeDept !== "all") list = list.filter((t) => t.department_id === activeDept);
    list.sort((a, b) => (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9));
    return list;
  }, [tokens, activeDept]);

  const waitingCount = tokens.filter((t) => t.status === "waiting").length;
  const inRoomCount = tokens.filter((t) => t.status === "in_consultation").length;
  const doneCount = tokens.filter((t) => t.status === "completed").length;
  const today = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

  // No-show analytics
  const highRiskCount = Object.values(predictions).filter(p => p.risk_score >= 70).length;
  const medRiskCount = Object.values(predictions).filter(p => p.risk_score >= 40 && p.risk_score < 70).length;

  return (
    <>
      <div className="w-[280px] flex-shrink-0 bg-white border-r border-slate-200 flex flex-col h-full">
        {/* Header */}
        <div className="flex-shrink-0 p-3 border-b border-slate-100">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-slate-900">OPD Queue</span>
            <span className="text-xs text-slate-500">{today}</span>
          </div>
          <div className="mt-2">
            <Select value={activeDept} onValueChange={setActiveDept}>
              <SelectTrigger className="h-8 text-[11px] font-medium bg-slate-50 border-slate-200">
                <SelectValue placeholder="Filter by Department" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-[11px]">All Departments</SelectItem>
                {departments.map((d) => (
                  <SelectItem key={d.id} value={d.id} className="text-[11px]">
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {departments.length === 0 && (
            <p className="text-[10px] text-slate-400 mt-1.5">Add departments in <Link to="/settings/departments" className="text-[#1A2F5A] underline">Settings</Link></p>
          )}
        </div>

        {/* Stats bar */}
        <div className="flex-shrink-0 h-8 bg-slate-50 border-b border-slate-100 flex items-center gap-4 px-4">
          <span className="text-[11px] text-amber-500 font-medium">● {waitingCount} Waiting</span>
          <span className="text-[11px] text-blue-500 font-medium">● {inRoomCount} In Room</span>
          <span className="text-[11px] text-emerald-500 font-medium">✓ {doneCount} Done</span>
          <div className="ml-auto" />
          <NABHBadge standardCodes={["AAC.1", "AAC.2", "AAC.3"]} />
        </div>

        {/* Token list */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
          {loading
            ? Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)
            : filtered.length === 0 ? (
              <EmptyState
                icon="🏥"
                title="No patients in queue"
                description="Walk-in patients and appointments will appear here"
                actionLabel="Register Walk-in"
                onAction={() => setShowModal(true)}
              />
            ) : filtered.map((token) => {
              const isSelected = token.id === selectedTokenId;
              const pred = predictions[token.id];
              const showRiskBadge = pred && token.status === "waiting";
              return (
                <button
                  key={token.id}
                  onClick={() => onSelectToken(token.id)}
                  className={cn(
                    "w-full text-left p-2.5 rounded-lg border transition-all duration-100",
                    statusStyles[token.status] || "bg-white border-slate-100",
                    isSelected && "!bg-blue-50 !border-[#1A2F5A] border-[1.5px]",
                    "hover:shadow-sm hover:border-slate-300"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-lg font-bold text-[#1A2F5A]">{token.token_number}</span>
                    <div className="flex items-center gap-1">
                      {showRiskBadge && pred.risk_score >= 70 && (
                        <Badge className="text-[8px] px-1.5 py-0 bg-red-100 text-red-700 border-red-200 hover:bg-red-100">🔴 High Risk</Badge>
                      )}
                      {showRiskBadge && pred.risk_score >= 40 && pred.risk_score < 70 && (
                        <Badge className="text-[8px] px-1.5 py-0 bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100">🟡 Med Risk</Badge>
                      )}
                      {noShowHistory[token.patient_id] > 0 && (
                        <Badge className="text-[8px] px-1 py-0 bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-100">
                          Missed {noShowHistory[token.patient_id]}×
                        </Badge>
                      )}
                      {token.priority !== "normal" && priorityBadge[token.priority] && (
                        <span className={cn("text-[9px] px-1.5 py-px rounded-full font-bold", priorityBadge[token.priority].bg, priorityBadge[token.priority].text)}>
                          {priorityBadge[token.priority].label}
                        </span>
                      )}
                      {(token as any).visit_type === "revisit" && <span className="text-[9px] px-1.5 py-px rounded-full font-bold bg-amber-100 text-amber-700">[R]</span>}
                      {(token as any).visit_type === "followup" && <span className="text-[9px] px-1.5 py-px rounded-full font-bold bg-violet-100 text-violet-700">[F]</span>}
                      {(token as any).visit_type === "emergency" && <span className="text-[9px] px-1.5 py-px rounded-full font-bold bg-red-100 text-red-700">[E]</span>}
                      {(token as any).is_mlc && <span className="text-[9px] px-1.5 py-px rounded-full font-bold bg-red-600 text-white">MLC</span>}
                      {token.patient?.abha_id
                        ? <span className="text-[9px] px-1.5 py-px rounded-full font-bold bg-emerald-100 text-emerald-700">ABHA ✓</span>
                        : <span className="text-[9px] px-1.5 py-px rounded-full font-medium bg-slate-100 text-slate-400">No ABHA</span>
                      }
                      {(token as any).payer_type && (token as any).payer_type !== "cash" && (
                        <span className={cn(
                          "text-[9px] px-1.5 py-px rounded-full font-bold",
                          (token as any).payer_type === "corporate" ? "bg-blue-600 text-white" :
                          (token as any).payer_type === "tpa" ? "bg-purple-600 text-white" :
                          (token as any).payer_type === "pmjay" ? "bg-green-600 text-white" :
                          (token as any).payer_type === "cghs" ? "bg-teal-600 text-white" :
                          (token as any).payer_type === "esi" ? "bg-orange-600 text-white" :
                          (token as any).payer_type === "state_scheme" ? "bg-indigo-600 text-white" :
                          "bg-slate-500 text-white"
                        )}>
                          {(token as any).payer_type === "corporate" ? "Corp" :
                           (token as any).payer_type === "tpa" ? "TPA" :
                           (token as any).payer_type === "pmjay" ? "PMJAY" :
                           (token as any).payer_type === "cghs" ? "CGHS" :
                           (token as any).payer_type === "esi" ? "ESI" :
                           (token as any).payer_type === "state_scheme" ? "State" :
                           (token as any).payer_type === "credit" ? "Credit" : "Other"}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[13px] font-medium text-slate-900 truncate max-w-[140px]">{token.patient?.full_name || "—"}</span>
                    <span className="text-[11px] text-slate-400">{getWaitMinutes(token.created_at)}</span>
                  </div>
                  <div className="flex items-center justify-between mt-0.5">
                    <span className="text-[11px] text-slate-400 truncate max-w-[120px]">{token.department?.name || "—"}</span>
                    <span className="text-[11px] text-slate-500">{token.doctor?.full_name ? `Dr. ${token.doctor.full_name.split(" ")[0]}` : "—"}</span>
                  </div>
                  {token.status !== "waiting" && (
                    <div className="mt-1.5">
                      <StatusBadge status={token.status} />
                    </div>
                  )}
                  {/* Send Reminder button for high-risk */}
                  {showRiskBadge && pred.risk_score >= 70 && token.patient?.phone && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleSendReminder(token); }}
                      disabled={reminderSending === token.id}
                      className="mt-1.5 w-full text-[10px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded py-1 transition-colors"
                    >
                      {reminderSending === token.id ? "Sending..." : "📱 Send Reminder"}
                    </button>
                  )}
                </button>
              );
            })}
        </div>

        {/* No-Show Analytics Card */}
        {(highRiskCount > 0 || medRiskCount > 0) && (
          <div className="flex-shrink-0 border-t border-slate-100 bg-slate-50 p-2.5">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Today's No-Show Risk</p>
            <div className="flex items-center gap-3">
              {highRiskCount > 0 && <span className="text-[11px] text-red-600 font-medium">🔴 {highRiskCount} High</span>}
              {medRiskCount > 0 && <span className="text-[11px] text-amber-600 font-medium">🟡 {medRiskCount} Medium</span>}
              <span className="text-[11px] text-slate-400">~{Math.round(highRiskCount * 0.7 + medRiskCount * 0.3)} est. no-shows</span>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex-shrink-0 border-t border-slate-100 p-2">
          <button
            onClick={() => setShowModal(true)}
            className="w-full h-10 bg-[#1A2F5A] text-white rounded-lg text-[13px] font-semibold hover:bg-[#152647] active:scale-[0.98] transition-all"
          >
            + Register Walk-in
          </button>
        </div>
      </div>

      {showModal && hospitalId && (
        <WalkInModal
          hospitalId={hospitalId}
          onClose={() => setShowModal(false)}
          onCreated={() => {
            onTokenCreated();
            setShowModal(false);
          }}
        />
      )}
    </>
  );
};

export default TokenQueue;
