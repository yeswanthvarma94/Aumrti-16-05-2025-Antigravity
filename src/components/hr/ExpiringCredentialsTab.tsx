import React, { useState } from "react";
import { useCredentialAlert, ExpiringCredential } from "@/contexts/CredentialAlertContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, Bell, ShieldAlert } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

const CREDENTIAL_LABEL: Record<string, string> = {
  mci_nmc: "MCI / NMC Registration",
  state_medical_council: "State Medical Council",
  nursing_council: "Nursing Council",
  super_specialty: "Super Specialty Degree",
  skill_competency: "Skill Competency",
  bls_acls: "BLS / ACLS",
  other: "Other",
};

function urgencyBadge(days: number) {
  if (days < 0)
    return <Badge className="bg-red-100 text-red-700 border-red-300 text-[10px]">Expired {Math.abs(days)}d ago</Badge>;
  if (days === 0)
    return <Badge className="bg-red-100 text-red-700 border-red-300 text-[10px]">Expires today</Badge>;
  if (days <= 14)
    return <Badge className="bg-red-100 text-red-700 border-red-200 text-[10px]">{days}d left</Badge>;
  if (days <= 30)
    return <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-[10px]">{days}d left</Badge>;
  return <Badge className="bg-yellow-50 text-yellow-700 border-yellow-200 text-[10px]">{days}d left</Badge>;
}

function rowClass(days: number) {
  if (days < 0) return "bg-red-50/60";
  if (days <= 14) return "bg-red-50/30";
  if (days <= 30) return "bg-amber-50/30";
  return "";
}

const ExpiringCredentialsTab: React.FC = () => {
  const { credentials, loading, refresh } = useCredentialAlert();
  const { toast } = useToast();
  const [remindingId, setRemindingId] = useState<string | null>(null);

  const sendReminder = async (cred: ExpiringCredential) => {
    setRemindingId(cred.id);
    await new Promise(r => setTimeout(r, 400));
    toast({
      title: "Reminder logged",
      description: `${cred.staff_name} — ${CREDENTIAL_LABEL[cred.credential_type] || cred.credential_type} expires ${cred.days_left < 0 ? `${Math.abs(cred.days_left)}d ago` : `in ${cred.days_left}d`}.`,
    });
    setRemindingId(null);
  };

  const expired = credentials.filter(c => c.days_left < 0);
  const expiring = credentials.filter(c => c.days_left >= 0 && c.days_left <= 30);
  const dueSoon = credentials.filter(c => c.days_left > 30);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Sub-header */}
      <div className="flex-shrink-0 px-5 py-3 border-b border-border bg-card flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-destructive" />
          <span className="text-sm font-semibold">Expiring / Expired Credentials</span>
          {credentials.length > 0 && (
            <span className="h-5 min-w-[20px] rounded-full bg-red-500 text-[10px] font-bold text-white flex items-center justify-center px-1.5">
              {credentials.length}
            </span>
          )}
        </div>
        <Button size="sm" variant="outline" onClick={refresh} disabled={loading} className="h-7 text-xs gap-1">
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          Refresh
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading credentials…
          </div>
        ) : credentials.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-muted-foreground gap-2">
            <ShieldAlert className="h-10 w-10 opacity-20" />
            <p className="text-sm">No credentials expiring in the next 60 days.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {expired.length > 0 && (
              <section>
                <h3 className="text-xs font-bold uppercase tracking-wider text-red-600 mb-2 flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-red-500 inline-block" />
                  Expired ({expired.length})
                </h3>
                <CredentialTable rows={expired} onRemind={sendReminder} remindingId={remindingId} />
              </section>
            )}

            {expiring.length > 0 && (
              <section>
                <h3 className="text-xs font-bold uppercase tracking-wider text-amber-600 mb-2 flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-amber-500 inline-block" />
                  Expiring within 30 days ({expiring.length})
                </h3>
                <CredentialTable rows={expiring} onRemind={sendReminder} remindingId={remindingId} />
              </section>
            )}

            {dueSoon.length > 0 && (
              <section>
                <h3 className="text-xs font-bold uppercase tracking-wider text-yellow-600 mb-2 flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-yellow-500 inline-block" />
                  Due within 60 days ({dueSoon.length})
                </h3>
                <CredentialTable rows={dueSoon} onRemind={sendReminder} remindingId={remindingId} />
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

interface TableProps {
  rows: ExpiringCredential[];
  onRemind: (c: ExpiringCredential) => void;
  remindingId: string | null;
}

const CredentialTable: React.FC<TableProps> = ({ rows, onRemind, remindingId }) => (
  <div className="rounded-lg border bg-card overflow-hidden">
    <table className="w-full text-sm">
      <thead className="bg-muted/40">
        <tr>
          {["Staff Member", "Credential Type", "Name / Number", "Expiry Date", "Status", ""].map(h => (
            <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map(cred => (
          <tr key={cred.id} className={cn("border-t border-border", rowClass(cred.days_left))}>
            <td className="px-3 py-2.5 font-medium text-sm">{cred.staff_name}</td>
            <td className="px-3 py-2.5 text-xs">
              {CREDENTIAL_LABEL[cred.credential_type] || cred.credential_type}
            </td>
            <td className="px-3 py-2.5 text-xs text-muted-foreground">{cred.name || "—"}</td>
            <td className="px-3 py-2.5 text-xs">
              {format(new Date(cred.expiry_date), "dd MMM yyyy")}
            </td>
            <td className="px-3 py-2.5">{urgencyBadge(cred.days_left)}</td>
            <td className="px-3 py-2.5">
              <Button
                size="sm"
                variant="outline"
                className="h-6 text-[11px] gap-1 px-2"
                onClick={() => onRemind(cred)}
                disabled={remindingId === cred.id}
              >
                {remindingId === cred.id
                  ? <Loader2 className="h-3 w-3 animate-spin" />
                  : <Bell className="h-3 w-3" />
                }
                {remindingId === cred.id ? "…" : "Send Reminder"}
              </Button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

export default ExpiringCredentialsTab;
