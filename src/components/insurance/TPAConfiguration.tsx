import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useHospitalId } from "@/hooks/useHospitalId";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Plus } from "lucide-react";
import { formatINR } from "@/lib/currency";

interface TPA {
  id: string;
  tpa_name: string;
  tpa_code: string | null;
  coordinator_name: string | null;
  coordinator_phone: string | null;
  claims_email: string | null;
  credit_days: number;
  submission_method: string;
  required_documents: string[];
  is_active: boolean;
  // New coverage rule columns
  room_rent_ceiling: number;
  co_payment_type: string;
  co_payment_value: number;
  deductible: number;
}

const defaultDocs = [
  "Admission letter", "Investigation reports", "Pre-auth form",
  "Policy card copy", "Discharge summary", "Claim form",
  "Aadhar copy", "Referral letter", "PMJAY card", "CGHS card", "ECHS card",
];

function coverageRuleSummary(tpa: TPA): string {
  const parts: string[] = [];
  if ((tpa.room_rent_ceiling ?? 0) > 0) {
    parts.push(`${formatINR(tpa.room_rent_ceiling)}/day`);
  } else {
    parts.push("No room cap");
  }
  const cpt = tpa.co_payment_type ?? "none";
  if (cpt === "percentage" && (tpa.co_payment_value ?? 0) > 0) {
    parts.push(`Co-pay: ${tpa.co_payment_value}%`);
  } else if (cpt === "fixed" && (tpa.co_payment_value ?? 0) > 0) {
    parts.push(`Co-pay: ${formatINR(tpa.co_payment_value)}`);
  } else {
    parts.push("No co-pay");
  }
  return parts.join(" · ");
}

const TPAConfiguration: React.FC = () => {
  const [tpas, setTpas] = useState<TPA[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<TPA | null>(null);
  const [form, setForm] = useState<any>({});
  const { toast } = useToast();
  const { hospitalId } = useHospitalId();

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    const { data } = await supabase.from("tpa_config").select("*").order("tpa_name");
    setTpas((data || []) as TPA[]);
    setLoading(false);
  };

  const openNew = () => {
    setEditing(null);
    setForm({
      tpa_name: "", tpa_code: "", coordinator_name: "", coordinator_phone: "",
      claims_email: "", credit_days: 45, submission_method: "portal",
      required_documents: [], is_active: true,
      room_rent_ceiling: 0, co_payment_type: "none", co_payment_value: 0, deductible: 0,
    });
    setDrawerOpen(true);
  };

  const openEdit = (tpa: TPA) => {
    setEditing(tpa);
    setForm({
      ...tpa,
      room_rent_ceiling: (tpa as any).room_rent_ceiling ?? 0,
      co_payment_type: (tpa as any).co_payment_type ?? "none",
      co_payment_value: (tpa as any).co_payment_value ?? 0,
      deductible: (tpa as any).deductible ?? 0,
    });
    setDrawerOpen(true);
  };

  const save = async () => {
    if (!hospitalId) return;

    const payload: any = {
      hospital_id: hospitalId,
      tpa_name: form.tpa_name,
      tpa_code: form.tpa_code || null,
      coordinator_name: form.coordinator_name || null,
      coordinator_phone: form.coordinator_phone || null,
      claims_email: form.claims_email || null,
      credit_days: Number(form.credit_days) || 45,
      submission_method: form.submission_method,
      required_documents: form.required_documents || [],
      is_active: form.is_active,
      room_rent_ceiling: Number(form.room_rent_ceiling) || 0,
      co_payment_type: form.co_payment_type || "none",
      co_payment_value: Number(form.co_payment_value) || 0,
      deductible: Number(form.deductible) || 0,
    };

    if (editing) {
      await (supabase as any).from("tpa_config").update(payload).eq("id", editing.id);
      toast({ title: "TPA updated ✓" });
    } else {
      await (supabase as any).from("tpa_config").insert(payload);
      toast({ title: "TPA added ✓" });
    }
    setDrawerOpen(false);
    loadData();
  };

  const toggleDoc = (doc: string) => {
    const docs = form.required_documents || [];
    setForm({
      ...form,
      required_documents: docs.includes(doc) ? docs.filter((d: string) => d !== doc) : [...docs, doc],
    });
  };

  const coPayType = form.co_payment_type ?? "none";

  return (
    <div className="h-full overflow-auto p-4 space-y-3">
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-bold">TPA Configuration</h3>
        <Button size="sm" className="gap-1.5 text-xs" onClick={openNew}><Plus size={14} /> Add TPA</Button>
      </div>

      <div className="bg-background rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">TPA Name</TableHead>
              <TableHead className="text-xs">Code</TableHead>
              <TableHead className="text-xs">Coordinator</TableHead>
              <TableHead className="text-xs">Credit Days</TableHead>
              <TableHead className="text-xs">Method</TableHead>
              <TableHead className="text-xs">Coverage Rules</TableHead>
              <TableHead className="text-xs">Status</TableHead>
              <TableHead className="text-xs">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={8} className="text-center py-8">Loading...</TableCell></TableRow>
            ) : tpas.map(t => (
              <TableRow key={t.id}>
                <TableCell className="text-sm font-medium">{t.tpa_name}</TableCell>
                <TableCell className="text-xs font-mono text-muted-foreground">{t.tpa_code || "—"}</TableCell>
                <TableCell className="text-xs">{t.coordinator_name || "—"}</TableCell>
                <TableCell className="text-xs tabular-nums">{t.credit_days}</TableCell>
                <TableCell className="text-xs capitalize">{t.submission_method}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{coverageRuleSummary(t)}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={`text-xs ${t.is_active ? "text-emerald-700" : "text-muted-foreground"}`}>
                    {t.is_active ? "Active" : "Inactive"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Button size="sm" variant="ghost" className="text-xs h-7" onClick={() => openEdit(t)}>Edit</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Add/Edit Drawer */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent className="w-[420px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editing ? "Edit TPA" : "Add TPA"}</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 mt-4">
            <div>
              <Label className="text-sm font-semibold">TPA Name *</Label>
              <Input className="mt-1" value={form.tpa_name || ""} onChange={e => setForm({ ...form, tpa_name: e.target.value })} />
            </div>
            <div>
              <Label className="text-sm font-semibold">TPA Code</Label>
              <Input className="mt-1" value={form.tpa_code || ""} onChange={e => setForm({ ...form, tpa_code: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm font-semibold">Coordinator Name</Label>
                <Input className="mt-1" value={form.coordinator_name || ""} onChange={e => setForm({ ...form, coordinator_name: e.target.value })} />
              </div>
              <div>
                <Label className="text-sm font-semibold">Phone</Label>
                <Input className="mt-1" value={form.coordinator_phone || ""} onChange={e => setForm({ ...form, coordinator_phone: e.target.value })} />
              </div>
            </div>
            <div>
              <Label className="text-sm font-semibold">Claims Email</Label>
              <Input className="mt-1" type="email" value={form.claims_email || ""} onChange={e => setForm({ ...form, claims_email: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm font-semibold">Credit Days</Label>
                <Input className="mt-1" type="number" value={form.credit_days || 45} onChange={e => setForm({ ...form, credit_days: e.target.value })} />
              </div>
              <div>
                <Label className="text-sm font-semibold">Submission Method</Label>
                <Select value={form.submission_method || "portal"} onValueChange={v => setForm({ ...form, submission_method: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="portal">Portal</SelectItem>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="hcx">HCX</SelectItem>
                    <SelectItem value="manual">Manual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Coverage Rules Section */}
            <div className="border border-border rounded-lg p-3 space-y-3 bg-muted/30">
              <p className="text-sm font-semibold text-foreground">Coverage Rules</p>

              <div>
                <Label className="text-sm font-semibold">Room Rent Ceiling (₹ / day)</Label>
                <Input
                  className="mt-1" type="number" min="0" placeholder="0 = no cap"
                  value={form.room_rent_ceiling ?? 0}
                  onChange={e => setForm({ ...form, room_rent_ceiling: e.target.value })}
                />
                <p className="text-xs text-muted-foreground mt-0.5">Leave 0 if this TPA has no room rent limit.</p>
              </div>

              <div>
                <Label className="text-sm font-semibold">Co-payment Type</Label>
                <Select value={coPayType} onValueChange={v => setForm({ ...form, co_payment_type: v, co_payment_value: 0 })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="fixed">Fixed Amount (₹)</SelectItem>
                    <SelectItem value="percentage">Percentage (%)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {coPayType !== "none" && (
                <div>
                  <Label className="text-sm font-semibold">
                    {coPayType === "fixed" ? "Co-payment Amount (₹)" : "Co-payment Percentage (%)"}
                  </Label>
                  <Input
                    className="mt-1" type="number" min="0"
                    placeholder={coPayType === "fixed" ? "e.g. 500" : "e.g. 10"}
                    value={form.co_payment_value ?? 0}
                    onChange={e => setForm({ ...form, co_payment_value: e.target.value })}
                  />
                </div>
              )}

              <div>
                <Label className="text-sm font-semibold">Annual Deductible (₹)</Label>
                <Input
                  className="mt-1" type="number" min="0" placeholder="0 = no deductible"
                  value={form.deductible ?? 0}
                  onChange={e => setForm({ ...form, deductible: e.target.value })}
                />
                <p className="text-xs text-muted-foreground mt-0.5">Patient pays this amount first before insurance covers the rest.</p>
              </div>
            </div>

            <div>
              <Label className="text-sm font-semibold mb-2 block">Required Documents</Label>
              <div className="space-y-1.5">
                {defaultDocs.map(doc => (
                  <label key={doc} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" className="rounded" checked={(form.required_documents || []).includes(doc)} onChange={() => toggleDoc(doc)} />
                    {doc}
                  </label>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.is_active !== false} onCheckedChange={v => setForm({ ...form, is_active: v })} />
              <Label className="text-sm">Active</Label>
            </div>
            <Button className="w-full mt-4" onClick={save}>{editing ? "Update TPA" : "Add TPA"}</Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default TPAConfiguration;
