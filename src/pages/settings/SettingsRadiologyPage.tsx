import React, { useState, useEffect } from "react";
import SettingsPageWrapper from "@/components/settings/SettingsPageWrapper";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Plus, Search, ChevronDown, ChevronRight, Trash2, Shield } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useHospitalId } from "@/hooks/useHospitalId";

interface Study {
  id: string;
  study_name: string;
  fee: number;
  is_active: boolean;
  sort_order: number;
  modality_id: string;
  modality_type: string;
}

interface Modality {
  id: string;
  name: string;
  modality_type: string;
  is_active: boolean;
}

const SettingsRadiologyPage: React.FC = () => {
  const { toast } = useToast();
  const { hospitalId } = useHospitalId();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [showAddModality, setShowAddModality] = useState(false);
  const [modalityForm, setModalityForm] = useState({ name: "", modality_type: "" });
  const [addStudyModalityId, setAddStudyModalityId] = useState<string | null>(null);
  const [addStudyModalityType, setAddStudyModalityType] = useState("");
  const [studyForm, setStudyForm] = useState({ study_name: "", fee: "0" });

  // PCPNDT compliance settings
  const [pcpndtMachineName, setPcpndtMachineName] = useState("");
  const [pcpndtMachineReg, setPcpndtMachineReg] = useState("");
  const [pcpndtDoctorReg, setPcpndtDoctorReg] = useState("");
  const [pcpndtSettingsId, setPcpndtSettingsId] = useState<string | null>(null);
  const [pcpndtSaving, setPcpndtSaving] = useState(false);

  useEffect(() => {
    if (!hospitalId) return;
    (async () => {
      const { data } = await (supabase as any)
        .from("pcpndt_settings")
        .select("*")
        .eq("hospital_id", hospitalId)
        .maybeSingle();
      if (data) {
        setPcpndtSettingsId(data.id);
        setPcpndtMachineName(data.machine_name || "");
        setPcpndtMachineReg(data.machine_registration_number || "");
        setPcpndtDoctorReg(data.doctor_pcpndt_registration || "");
      }
    })();
  }, [hospitalId]);

  const savePcpndtSettings = async () => {
    if (!hospitalId) return;
    setPcpndtSaving(true);
    const payload = {
      hospital_id: hospitalId,
      machine_name: pcpndtMachineName.trim() || null,
      machine_registration_number: pcpndtMachineReg.trim() || null,
      doctor_pcpndt_registration: pcpndtDoctorReg.trim() || null,
      updated_at: new Date().toISOString(),
    };
    let error: any;
    if (pcpndtSettingsId) {
      const res = await (supabase as any).from("pcpndt_settings").update(payload).eq("id", pcpndtSettingsId);
      error = res.error;
    } else {
      const res = await (supabase as any).from("pcpndt_settings").insert(payload).select("id").maybeSingle();
      error = res.error;
      if (!error && res.data) setPcpndtSettingsId(res.data.id);
    }
    setPcpndtSaving(false);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "PCPNDT compliance settings saved" });
    }
  };

  const { data: modalities = [], isLoading } = useQuery({
    queryKey: ["settings-radiology-modalities", hospitalId],
    queryFn: async () => {
      if (!hospitalId) return [];
      const { data, error } = await supabase
        .from("radiology_modalities")
        .select("id, name, modality_type, is_active")
        .eq("hospital_id", hospitalId)
        .order("name");
      if (error) throw error;
      return (data || []) as Modality[];
    },
    enabled: !!hospitalId,
  });

  const { data: studies = [] } = useQuery({
    queryKey: ["settings-radiology-studies", hospitalId],
    queryFn: async () => {
      if (!hospitalId) return [];
      const { data, error } = await (supabase as any)
        .from("radiology_study_master")
        .select("id, study_name, fee, is_active, sort_order, modality_id, modality_type")
        .eq("hospital_id", hospitalId)
        .order("sort_order");
      if (error) throw error;
      return (data || []) as Study[];
    },
    enabled: !!hospitalId,
  });

  const studiesByModality = (modalityId: string) =>
    studies.filter(s => s.modality_id === modalityId);

  const filtered = modalities.filter((m) => {
    const q = search.toLowerCase();
    return !q || m.name?.toLowerCase().includes(q) || m.modality_type?.toLowerCase().includes(q);
  });

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // Modality actions
  const addModalityMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("radiology_modalities").insert({
        hospital_id: hospitalId!,
        name: modalityForm.name,
        modality_type: modalityForm.modality_type.toLowerCase().replace(/\s+/g, "_"),
        is_active: true,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings-radiology-modalities"] });
      setShowAddModality(false);
      setModalityForm({ name: "", modality_type: "" });
      toast({ title: "Modality category added" });
    },
    onError: (err: any) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const toggleModalityActive = async (id: string, active: boolean) => {
    const { error } = await supabase.from("radiology_modalities").update({ is_active: active }).eq("id", id);
    if (error) { toast({ title: "Update failed", variant: "destructive" }); return; }
    queryClient.invalidateQueries({ queryKey: ["settings-radiology-modalities"] });
  };

  // Study actions
  const addStudyMutation = useMutation({
    mutationFn: async () => {
      const existing = studiesByModality(addStudyModalityId!);
      const { error } = await (supabase as any).from("radiology_study_master").insert({
        hospital_id: hospitalId!,
        modality_id: addStudyModalityId!,
        modality_type: addStudyModalityType,
        study_name: studyForm.study_name.trim(),
        fee: Number(studyForm.fee) || 0,
        is_active: true,
        sort_order: existing.length + 1,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings-radiology-studies"] });
      setAddStudyModalityId(null);
      setStudyForm({ study_name: "", fee: "0" });
      toast({ title: "Study added" });
    },
    onError: (err: any) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const updateStudyFee = async (id: string, fee: string) => {
    const { error } = await (supabase as any).from("radiology_study_master").update({ fee: Number(fee) || 0 }).eq("id", id);
    if (error) { toast({ title: "Update failed", variant: "destructive" }); return; }
    queryClient.invalidateQueries({ queryKey: ["settings-radiology-studies"] });
    toast({ title: "Fee updated" });
  };

  const updateStudyName = async (id: string, name: string) => {
    if (!name.trim()) return;
    const { error } = await (supabase as any).from("radiology_study_master").update({ study_name: name.trim() }).eq("id", id);
    if (error) { toast({ title: "Update failed", variant: "destructive" }); return; }
    queryClient.invalidateQueries({ queryKey: ["settings-radiology-studies"] });
  };

  const toggleStudyActive = async (id: string, active: boolean) => {
    const { error } = await (supabase as any).from("radiology_study_master").update({ is_active: active }).eq("id", id);
    if (error) { toast({ title: "Update failed", variant: "destructive" }); return; }
    queryClient.invalidateQueries({ queryKey: ["settings-radiology-studies"] });
  };

  const deleteStudy = async (id: string) => {
    const { error } = await (supabase as any).from("radiology_study_master").delete().eq("id", id);
    if (error) { toast({ title: "Delete failed", variant: "destructive" }); return; }
    queryClient.invalidateQueries({ queryKey: ["settings-radiology-studies"] });
    toast({ title: "Study removed" });
  };

  return (
    <SettingsPageWrapper title="Radiology Modalities" hideSave>
      <div className="space-y-4">
        <div className="flex gap-3 items-center">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search modalities..." className="pl-9 h-9" />
          </div>
          <Button size="sm" onClick={() => setShowAddModality(true)} className="gap-1"><Plus size={14} /> Add Modality</Button>
        </div>

        <p className="text-xs text-muted-foreground">{filtered.length} modalit{filtered.length !== 1 ? "ies" : "y"} — click to expand and manage studies</p>

        <div className="border border-border rounded-lg overflow-hidden divide-y divide-border">
          {isLoading && <div className="px-4 py-8 text-center text-sm text-muted-foreground">Loading...</div>}
          {!isLoading && filtered.length === 0 && <div className="px-4 py-8 text-center text-sm text-muted-foreground">No modalities found.</div>}

          {filtered.map((m) => {
            const expanded = expandedIds.has(m.id);
            const modalityStudies = studiesByModality(m.id);

            return (
              <div key={m.id}>
                {/* Modality header row */}
                <div className="flex items-center gap-3 px-3 py-3 bg-white hover:bg-muted/30 cursor-pointer" onClick={() => toggleExpand(m.id)}>
                  <button className="text-muted-foreground flex-shrink-0">
                    {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </button>
                  <span className="font-semibold text-sm text-foreground flex-1">{m.name}</span>
                  <Badge variant="outline" className="text-[11px]">{m.modality_type}</Badge>
                  <span className="text-[11px] text-muted-foreground w-20 text-center">
                    {modalityStudies.length} study/studies
                  </span>
                  <Switch
                    checked={m.is_active}
                    onCheckedChange={(v) => { toggleModalityActive(m.id, v); }}
                    onClick={e => e.stopPropagation()}
                  />
                </div>

                {/* Expanded: studies sub-table */}
                {expanded && (
                  <div className="bg-muted/20 border-t border-border">
                    {modalityStudies.length === 0 ? (
                      <div className="px-8 py-4 text-sm text-muted-foreground italic">No studies yet — add one below</div>
                    ) : (
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-muted/40">
                            <th className="px-8 py-2 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Study Name</th>
                            <th className="px-3 py-2 text-right text-[11px] font-semibold text-muted-foreground uppercase tracking-wide w-32">Fee (₹)</th>
                            <th className="px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide w-16">Active</th>
                            <th className="px-3 py-2 w-10" />
                          </tr>
                        </thead>
                        <tbody>
                          {modalityStudies.map((s) => (
                            <tr key={s.id} className="border-t border-border/50 hover:bg-white/50">
                              <td className="px-8 py-2">
                                <input
                                  defaultValue={s.study_name}
                                  onBlur={(e) => updateStudyName(s.id, e.target.value)}
                                  className="w-full bg-transparent border-0 border-b border-transparent hover:border-border focus:border-primary focus:outline-none text-sm text-foreground py-0.5 transition-colors"
                                />
                              </td>
                              <td className="px-3 py-2 text-right">
                                <Input
                                  type="number"
                                  defaultValue={s.fee || 0}
                                  onBlur={(e) => updateStudyFee(s.id, e.target.value)}
                                  className="w-24 h-7 text-right font-mono ml-auto"
                                />
                              </td>
                              <td className="px-3 py-2">
                                <Switch checked={s.is_active} onCheckedChange={(v) => toggleStudyActive(s.id, v)} />
                              </td>
                              <td className="px-3 py-2">
                                <button
                                  onClick={() => deleteStudy(s.id)}
                                  className="text-muted-foreground hover:text-destructive transition-colors"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}

                    {/* Add study inline */}
                    <div className="px-8 py-3 border-t border-border/50 flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1 text-xs h-7"
                        onClick={(e) => {
                          e.stopPropagation();
                          setAddStudyModalityId(m.id);
                          setAddStudyModalityType(m.modality_type);
                          setStudyForm({ study_name: "", fee: "0" });
                        }}
                      >
                        <Plus size={12} /> Add Study
                      </Button>
                      <span className="text-[11px] text-muted-foreground">Add individual study with its own fee</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* PCPNDT Compliance Settings */}
      <div className="mt-6 border border-border rounded-lg overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 bg-amber-50 border-b border-border">
          <Shield size={15} className="text-amber-700" />
          <h3 className="text-sm font-bold text-amber-900">PCPNDT Act Compliance</h3>
          <span className="ml-auto text-[11px] text-amber-700 bg-amber-100 px-2 py-0.5 rounded font-medium">Legally Mandatory</span>
        </div>
        <div className="p-4 space-y-4">
          <p className="text-xs text-muted-foreground">
            These details appear on printed PCPNDT Form F registers and are required under the PC-PNDT Act, 1994.
          </p>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label className="text-xs font-medium">Ultrasound Machine Name / Model</Label>
              <Input
                value={pcpndtMachineName}
                onChange={(e) => setPcpndtMachineName(e.target.value)}
                placeholder="e.g. GE LOGIQ P9"
                className="mt-1 h-9"
              />
            </div>
            <div>
              <Label className="text-xs font-medium">Machine Registration Number</Label>
              <Input
                value={pcpndtMachineReg}
                onChange={(e) => setPcpndtMachineReg(e.target.value)}
                placeholder="State authority registration no."
                className="mt-1 h-9"
              />
            </div>
            <div>
              <Label className="text-xs font-medium">Doctor PCPNDT Registration Number</Label>
              <Input
                value={pcpndtDoctorReg}
                onChange={(e) => setPcpndtDoctorReg(e.target.value)}
                placeholder="PCPNDT registration no."
                className="mt-1 h-9"
              />
            </div>
          </div>
          <Button size="sm" onClick={savePcpndtSettings} disabled={pcpndtSaving} className="h-8 text-xs">
            {pcpndtSaving ? "Saving..." : "Save PCPNDT Settings"}
          </Button>
        </div>
      </div>

      {/* Add Modality Dialog */}
      <Dialog open={showAddModality} onOpenChange={setShowAddModality}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Modality Category</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Name *</Label>
              <Input value={modalityForm.name} onChange={(e) => setModalityForm({ ...modalityForm, name: e.target.value })} placeholder="e.g. PET-CT" className="mt-1" />
            </div>
            <div>
              <Label>Type Code *</Label>
              <Input value={modalityForm.modality_type} onChange={(e) => setModalityForm({ ...modalityForm, modality_type: e.target.value })} placeholder="e.g. pet_ct" className="mt-1" />
              <p className="text-[11px] text-muted-foreground mt-1">Lowercase, used internally to group studies</p>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => addModalityMutation.mutate()} disabled={!modalityForm.name || !modalityForm.modality_type || addModalityMutation.isPending}>
              {addModalityMutation.isPending ? "Saving..." : "Save Category"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Study Dialog */}
      <Dialog open={!!addStudyModalityId} onOpenChange={(o) => !o && setAddStudyModalityId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Study</DialogTitle>
            <p className="text-sm text-muted-foreground">under {modalities.find(m => m.id === addStudyModalityId)?.name}</p>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Study Name *</Label>
              <Input value={studyForm.study_name} onChange={(e) => setStudyForm({ ...studyForm, study_name: e.target.value })} placeholder="e.g. X-Ray Chest PA View" className="mt-1" />
            </div>
            <div>
              <Label>Fee (₹) *</Label>
              <Input type="number" value={studyForm.fee} onChange={(e) => setStudyForm({ ...studyForm, fee: e.target.value })} className="mt-1" />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => addStudyMutation.mutate()} disabled={!studyForm.study_name.trim() || addStudyMutation.isPending}>
              {addStudyMutation.isPending ? "Saving..." : "Add Study"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsPageWrapper>
  );
};

export default SettingsRadiologyPage;
