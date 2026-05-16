import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, MessageSquare, Send, Calendar, FileText, CreditCard, Receipt, Heart, AlertTriangle, Star, Bell, Zap, Info, Check, X, Download, RotateCcw, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { cn } from "@/lib/utils";

// ── Trigger event metadata ──────────────────────────────────

interface TriggerMeta {
  label: string;
  description: string;
  icon: React.ElementType;
  variables: string[];
  isReminder?: boolean;
  defaultTemplate: string;
}

const TRIGGER_META: Record<string, TriggerMeta> = {
  appointment_confirmed: {
    label: "Appointment Confirmed",
    description: "Patient books or confirms an appointment",
    icon: Calendar,
    variables: ["{patient_name}", "{doctor_name}", "{hospital_name}", "{date}", "{time}", "{token_number}", "{department}"],
    defaultTemplate: `🏥 *{hospital_name}*\n\n✅ *Appointment Confirmed*\n\nPatient: {patient_name}\nDoctor: Dr. {doctor_name}\nDate: {date}\nTime: {time}\n\nPlease arrive 15 minutes early.`,
  },
  appointment_reminder_24h: {
    label: "Appointment Reminder (24h)",
    description: "24 hours before scheduled appointment",
    icon: Bell,
    variables: ["{patient_name}", "{doctor_name}", "{hospital_name}", "{date}", "{time}", "{department}"],
    isReminder: true,
    defaultTemplate: `🏥 *{hospital_name}*\n\nHello {patient_name} 👋\n\nReminder: Your appointment is tomorrow.\n\n📅 Date: {date}\n👨‍⚕️ Doctor: Dr. {doctor_name}\n\nPlease arrive 15 minutes before your scheduled time.`,
  },
  appointment_reminder_2h: {
    label: "Appointment Reminder (2h)",
    description: "2 hours before scheduled appointment",
    icon: Bell,
    variables: ["{patient_name}", "{doctor_name}", "{hospital_name}", "{date}", "{time}", "{department}"],
    isReminder: true,
    defaultTemplate: `🏥 *{hospital_name}*\n\nHi {patient_name}, your appointment with Dr. {doctor_name} is in 2 hours.\n\n🕐 Time: {time}\n\nSee you soon!`,
  },
  lab_result_ready: {
    label: "Lab Result Ready",
    description: "Lab results are validated and available",
    icon: FileText,
    variables: ["{patient_name}", "{hospital_name}", "{test_count}", "{date}"],
    defaultTemplate: `🏥 *{hospital_name} — Lab Report Ready*\n\nDear {patient_name},\n\nYour lab results are ready.\n📋 Tests: {test_count} test(s)\n📅 Date: {date}\n\nPlease consult your doctor for interpretation.`,
  },
  bill_generated: {
    label: "Bill Generated",
    description: "A new bill is finalized for the patient",
    icon: Receipt,
    variables: ["{patient_name}", "{hospital_name}", "{bill_number}", "{date}", "{amount}", "{patient_payable}"],
    defaultTemplate: `🏥 *{hospital_name}*\n\n🧾 *Bill Generated*\n\nPatient: {patient_name}\nBill No: {bill_number}\nDate: {date}\n\n💰 Total: ₹{amount}\n💳 Patient Payable: ₹{patient_payable}`,
  },
  payment_received: {
    label: "Payment Received",
    description: "Payment is recorded against a bill",
    icon: CreditCard,
    variables: ["{patient_name}", "{hospital_name}", "{bill_number}", "{amount}", "{payment_mode}", "{balance}"],
    defaultTemplate: `🏥 *{hospital_name}*\n\n✅ *Payment Received*\n\nPatient: {patient_name}\nBill No: {bill_number}\nAmount Paid: ₹{amount}\nMode: {payment_mode}\n\nThank you! 🙏`,
  },
  discharge_summary: {
    label: "Discharge Summary",
    description: "Patient is discharged from IPD",
    icon: Heart,
    variables: ["{patient_name}", "{hospital_name}", "{doctor_name}", "{ward_name}", "{follow_up}"],
    defaultTemplate: `🏥 *{hospital_name}*\n\n🏠 *Discharge Summary Ready*\n\nDear {patient_name},\n\nYou have been discharged successfully.\n🏥 Ward: {ward_name}\n👨‍⚕️ Doctor: Dr. {doctor_name}\n📋 Follow-up: {follow_up}\n\nTake your medications as prescribed.\nGet well soon! 💪`,
  },
  prescription_ready: {
    label: "Prescription Ready",
    description: "Doctor issues a new prescription",
    icon: FileText,
    variables: ["{patient_name}", "{hospital_name}", "{doctor_name}", "{drug_count}"],
    defaultTemplate: `🏥 *{hospital_name}*\n\n💊 *Prescription Ready*\n\nDear {patient_name},\nDr. {doctor_name} has issued a prescription with {drug_count} medication(s).\n\nPlease take your medications as prescribed.`,
  },
  feedback_request: {
    label: "Feedback Request",
    description: "After discharge or visit completion",
    icon: Star,
    variables: ["{patient_name}", "{hospital_name}"],
    defaultTemplate: `🏥 *{hospital_name}*\n\nDear {patient_name},\n\nWe hope you are doing well! 🙏\nWe'd love to hear about your experience.\n\n⭐ Your feedback helps us improve care for everyone.\n\nThank you!\n{hospital_name}`,
  },
};

const SAMPLE_VALUES: Record<string, string> = {
  "{patient_name}": "Rajesh Kumar",
  "{doctor_name}": "Sharma",
  "{hospital_name}": "City Hospital",
  "{date}": "28 Mar 2026",
  "{time}": "10:30 AM",
  "{token_number}": "T-015",
  "{department}": "General Medicine",
  "{test_count}": "3",
  "{bill_number}": "BILL-2026-0042",
  "{amount}": "5,200",
  "{patient_payable}": "3,200",
  "{payment_mode}": "UPI",
  "{balance}": "0",
  "{ward_name}": "Ward A",
  "{follow_up}": "After 7 days",
  "{drug_count}": "4",
};

function substitutePreview(template: string): string {
  let result = template;
  for (const [key, val] of Object.entries(SAMPLE_VALUES)) {
    result = result.split(key).join(val);
  }
  return result;
}

interface TemplateRow {
  id?: string;
  hospital_id?: string;
  template_name: string;
  trigger_event: string;
  message_template: string;
  is_active: boolean;
  auto_send: boolean;
  send_delay_hours: number;
  wati_template_name?: string;
}

interface NotifLog {
  id: string;
  created_at: string;
  notification_type: string;
  phone_number: string;
  sent_at: string | null;
  patient_id: string;
}

const SettingsWhatsAppPage: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  // ── WATI connection state
  const [watiConnected, setWatiConnected] = useState(false);
  const [watiEndpoint, setWatiEndpoint] = useState("");
  const [watiKey, setWatiKey] = useState("");
  const [showWatiForm, setShowWatiForm] = useState(false);
  const [testingWati, setTestingWati] = useState(false);
  const [savingWati, setSavingWati] = useState(false);

  // ── Templates state
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [expandedTemplate, setExpandedTemplate] = useState<string | null>(null);
  const [savingTemplates, setSavingTemplates] = useState(false);

  // ── Send log
  const [logs, setLogs] = useState<NotifLog[]>([]);

  // ── Textarea refs for cursor insertion
  const textareaRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});

  // ── Load hospital WATI config
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: userData } = await supabase
        .from("users")
        .select("hospital_id")
        .eq("auth_user_id", user.id)
        .maybeSingle();
      if (!userData) return;

      const { data: hospital } = await supabase
        .from("hospitals")
        .select("wati_api_url, whatsapp_enabled")
        .eq("id", userData.hospital_id)
        .maybeSingle();

      if (hospital?.wati_api_url) {
        setWatiConnected(true);
        setWatiEndpoint(hospital.wati_api_url);
      }

      // Load templates
      const { data: tpls } = await supabase
        .from("whatsapp_templates")
        .select("*")
        .eq("hospital_id", userData.hospital_id);

      if (tpls && tpls.length > 0) {
        setTemplates(tpls as any as TemplateRow[]);
      } else {
        // Generate defaults
        const defaults: TemplateRow[] = Object.entries(TRIGGER_META).map(([event, meta]) => ({
          hospital_id: userData.hospital_id,
          template_name: meta.label,
          trigger_event: event,
          message_template: meta.defaultTemplate,
          is_active: true,
          auto_send: false,
          send_delay_hours: meta.isReminder ? (event.includes("24h") ? 24 : 2) : 0,
          wati_template_name: event,
        }));
        setTemplates(defaults);
      }

      // Load logs
      const { data: logData } = await supabase
        .from("whatsapp_notifications")
        .select("id, created_at, notification_type, phone_number, sent_at, patient_id")
        .eq("hospital_id", userData.hospital_id)
        .order("created_at", { ascending: false })
        .limit(20);
      if (logData) setLogs(logData as any);
    })();
  }, []);

  // ── WATI test
  const handleTestWati = async () => {
    if (!watiEndpoint || !watiKey) {
      toast({ title: "Please enter both endpoint and API key", variant: "destructive" });
      return;
    }
    setTestingWati(true);
    try {
      // Test by fetching WATI templates list
      const res = await fetch(`${watiEndpoint}/api/v1/getMessageTemplates`, {
        headers: { Authorization: `Bearer ${watiKey}` },
      });
      if (res.ok) {
        toast({ title: "✅ WATI connection successful!" });
      } else {
        toast({ title: "WATI connection failed", description: `Status: ${res.status}`, variant: "destructive" });
      }
    } catch {
      toast({ title: "Cannot reach WATI endpoint", variant: "destructive" });
    }
    setTestingWati(false);
  };

  // ── Save WATI config
  const handleSaveWati = async () => {
    setSavingWati(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: userData } = await supabase.from("users").select("hospital_id").eq("auth_user_id", user.id).maybeSingle();
    if (!userData) return;

    await supabase
      .from("hospitals")
      .update({
        wati_api_url: watiEndpoint,
        wati_api_key: watiKey,
        whatsapp_enabled: true,
      } as any)
      .eq("id", userData.hospital_id);

    setWatiConnected(true);
    setShowWatiForm(false);
    setSavingWati(false);
    toast({ title: "WATI connected ✓ — automated sending enabled" });
  };

  // ── Disconnect WATI
  const handleDisconnect = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: userData } = await supabase.from("users").select("hospital_id").eq("auth_user_id", user.id).maybeSingle();
    if (!userData) return;

    await supabase
      .from("hospitals")
      .update({ wati_api_url: null, whatsapp_enabled: false } as any)
      .eq("id", userData.hospital_id);

    setWatiConnected(false);
    setWatiEndpoint("");
    setWatiKey("");
    // Disable auto_send on all templates
    setTemplates((prev) => prev.map((t) => ({ ...t, auto_send: false })));
    toast({ title: "WATI disconnected" });
  };

  // ── Template updates
  const updateTemplate = useCallback((event: string, field: keyof TemplateRow, value: any) => {
    setTemplates((prev) => prev.map((t) => (t.trigger_event === event ? { ...t, [field]: value } : t)));
  }, []);

  const insertVariable = (event: string, variable: string) => {
    const ta = textareaRefs.current[event];
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const current = templates.find((t) => t.trigger_event === event)?.message_template || "";
    const newVal = current.slice(0, start) + variable + current.slice(end);
    updateTemplate(event, "message_template", newVal);
    setTimeout(() => {
      ta.focus();
      ta.setSelectionRange(start + variable.length, start + variable.length);
    }, 0);
  };

  // ── Save all templates
  const handleSaveTemplates = async () => {
    setSavingTemplates(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: userData } = await supabase.from("users").select("hospital_id").eq("auth_user_id", user.id).maybeSingle();
    if (!userData) return;

    for (const tpl of templates) {
      if (tpl.id) {
        await supabase
          .from("whatsapp_templates")
          .update({
            template_name: tpl.template_name,
            message_template: tpl.message_template,
            is_active: tpl.is_active,
            auto_send: tpl.auto_send,
            send_delay_hours: tpl.send_delay_hours,
            wati_template_name: tpl.wati_template_name,
          } as any)
          .eq("id", tpl.id);
      } else {
        const { data } = await supabase
          .from("whatsapp_templates")
          .insert({
            hospital_id: userData.hospital_id,
            template_name: tpl.template_name,
            trigger_event: tpl.trigger_event,
            message_template: tpl.message_template,
            is_active: tpl.is_active,
            auto_send: tpl.auto_send,
            send_delay_hours: tpl.send_delay_hours,
            wati_template_name: tpl.wati_template_name,
          } as any)
          .select()
          .maybeSingle();
        if (data) {
          setTemplates((prev) =>
            prev.map((t) => (t.trigger_event === tpl.trigger_event && !t.id ? { ...t, id: (data as any).id } : t))
          );
        }
      }
    }
    setSavingTemplates(false);
    toast({ title: "Templates saved ✓" });
  };

  // ── Export log
  const handleExportLog = () => {
    const csv = ["Date,Patient ID,Type,Status,Phone"]
      .concat(
        logs.map((l) =>
          [
            new Date(l.created_at).toLocaleString("en-IN"),
            l.patient_id,
            l.notification_type,
            l.sent_at ? "Sent" : "Pending",
            l.phone_number,
          ].join(",")
        )
      )
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "whatsapp_log.csv";
    a.click();
  };

  return (
    <div className="h-[calc(100vh-56px)] flex flex-col overflow-hidden bg-background">
      {/* Header */}
      <div className="flex-shrink-0 h-14 flex items-center px-8 border-b border-border bg-card">
        <button onClick={() => navigate("/settings")} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
          Settings
        </button>
        <ChevronRight size={14} className="mx-2 text-muted-foreground" />
        <span className="text-sm font-semibold text-foreground">WhatsApp Configuration</span>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[800px] mx-auto px-8 py-8 space-y-8">
          {/* ══ SECTION 1: CONNECTION STATUS ══ */}
          <Card className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-foreground flex items-center gap-2">
                <MessageSquare size={18} className="text-primary" />
                WhatsApp Configuration
              </h2>
              {watiConnected ? (
                <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">
                  <Check size={12} className="mr-1" /> Connected to WATI API
                </Badge>
              ) : (
                <Badge variant="secondary" className="bg-amber-50 text-amber-700 border-amber-200">
                  <AlertTriangle size={12} className="mr-1" /> Using wa.me links
                </Badge>
              )}
            </div>

            {watiConnected ? (
              <div className="space-y-2">
                <p className="text-[13px] text-muted-foreground">
                  Endpoint: <span className="font-mono text-foreground">{watiEndpoint}</span>
                </p>
                <button onClick={handleDisconnect} className="text-xs text-destructive hover:underline">
                  Disconnect WATI
                </button>
              </div>
            ) : (
              <>
                <p className="text-[13px] text-muted-foreground mb-3">
                  Connect WATI for fully automated sending — no staff click needed.
                </p>
                {!showWatiForm ? (
                  <Button size="sm" onClick={() => setShowWatiForm(true)}>
                    <Zap size={14} className="mr-1.5" /> Connect WATI
                  </Button>
                ) : (
                  <div className="space-y-3 border border-border rounded-lg p-4 bg-muted/30">
                    <div>
                      <label className="text-xs font-medium text-foreground">WATI API Endpoint</label>
                      <Input
                        value={watiEndpoint}
                        onChange={(e) => setWatiEndpoint(e.target.value)}
                        placeholder="https://live-mt-server.wati.io/12345"
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-foreground">WATI API Key</label>
                      <Input
                        type="password"
                        value={watiKey}
                        onChange={(e) => setWatiKey(e.target.value)}
                        placeholder="Enter your WATI API key"
                        className="mt-1"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={handleTestWati} disabled={testingWati}>
                        {testingWati ? "Testing…" : "Test Connection"}
                      </Button>
                      <Button size="sm" onClick={handleSaveWati} disabled={savingWati}>
                        {savingWati ? "Saving…" : "Save WATI Config"}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setShowWatiForm(false)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Info note */}
            <div className="mt-4 bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900 rounded-lg p-3 flex gap-2">
              <Info size={14} className="text-blue-500 mt-0.5 shrink-0" />
              <p className="text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
                <strong>WATI:</strong> ₹2,999/month for 1,000 messages ·{" "}
                <a href="https://www.wati.io" target="_blank" rel="noreferrer" className="underline">
                  Get API key at wati.io
                </a>
                <br />
                <strong>Without WATI:</strong> Messages use WhatsApp links (staff clicks to send)
              </p>
            </div>
          </Card>

          {/* ══ SECTION 2: NOTIFICATION TEMPLATES ══ */}
          <div>
            <h2 className="text-base font-bold text-foreground mb-4">Notification Templates</h2>
            <div className="space-y-2.5">
              {templates.map((tpl) => {
                const meta = TRIGGER_META[tpl.trigger_event];
                if (!meta) return null;
                const Icon = meta.icon;
                const isExpanded = expandedTemplate === tpl.trigger_event;

                return (
                  <Card key={tpl.trigger_event} className="overflow-hidden">
                    {/* Card header */}
                    <div
                      className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/30 transition-colors"
                      onClick={() => setExpandedTemplate(isExpanded ? null : tpl.trigger_event)}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                          <Icon size={16} className="text-primary" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground">{meta.label}</p>
                          <p className="text-xs text-muted-foreground truncate">Triggered when: {meta.description}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 shrink-0" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] text-muted-foreground">Active</span>
                          <Switch
                            checked={tpl.is_active}
                            onCheckedChange={(v) => updateTemplate(tpl.trigger_event, "is_active", v)}
                          />
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] text-muted-foreground">Auto</span>
                          <Switch
                            checked={tpl.auto_send}
                            onCheckedChange={(v) => updateTemplate(tpl.trigger_event, "auto_send", v)}
                            disabled={!watiConnected}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Expanded body */}
                    {isExpanded && (
                      <div className="border-t border-border p-4 space-y-4 bg-muted/10">
                        {/* Template editor */}
                        <div className="grid grid-cols-2 gap-4">
                          <div className="col-span-2">
                            <label className="text-xs font-medium text-foreground">WATI Template Name (used for API sending)</label>
                            <Input
                              value={tpl.wati_template_name || ""}
                              onChange={(e) => updateTemplate(tpl.trigger_event, "wati_template_name", e.target.value)}
                              placeholder="e.g. appointment_reminder_v1"
                              className="mt-1 font-mono text-xs max-w-sm"
                            />
                            <p className="text-[10px] text-muted-foreground mt-1">Must match exactly with the template name approved in WATI.</p>
                          </div>
                          <div className="col-span-2">
                            <label className="text-xs font-medium text-foreground">Fallback Message Template (used for wa.me links)</label>
                          <Textarea
                            ref={(el) => { textareaRefs.current[tpl.trigger_event] = el; }}
                            value={tpl.message_template}
                            onChange={(e) => updateTemplate(tpl.trigger_event, "message_template", e.target.value)}
                            rows={5}
                            className="mt-1 font-mono text-xs"
                          />
                        </div>
                      </div>

                        {/* Variable chips */}
                        <div>
                          <p className="text-xs text-muted-foreground mb-1.5">Available variables:</p>
                          <div className="flex flex-wrap gap-1.5">
                            {meta.variables.map((v) => (
                              <button
                                key={v}
                                onClick={() => insertVariable(tpl.trigger_event, v)}
                                className="px-2 py-0.5 text-[11px] font-mono bg-primary/10 text-primary rounded-md hover:bg-primary/20 transition-colors"
                              >
                                {v}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Preview */}
                        <div>
                          <p className="text-xs text-muted-foreground mb-1.5">Preview:</p>
                          <div className="bg-emerald-50 dark:bg-emerald-950/30 border-l-[3px] border-emerald-500 rounded-r-lg p-3">
                            <pre className="text-[13px] text-foreground whitespace-pre-wrap font-sans leading-relaxed">
                              {substitutePreview(tpl.message_template)}
                            </pre>
                          </div>
                        </div>

                        {/* Send delay for reminders */}
                        {meta.isReminder && (
                          <div className="flex items-center gap-2">
                            <label className="text-xs font-medium text-foreground">Send delay:</label>
                            <Input
                              type="number"
                              value={tpl.send_delay_hours}
                              onChange={(e) => updateTemplate(tpl.trigger_event, "send_delay_hours", parseInt(e.target.value) || 0)}
                              className="w-20 h-8 text-sm"
                              min={0}
                            />
                            <span className="text-xs text-muted-foreground">hours before appointment</span>
                          </div>
                        )}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>

            {/* Save button */}
            <div className="sticky bottom-0 bg-background pt-4 pb-2">
              <Button onClick={handleSaveTemplates} disabled={savingTemplates} className="w-full">
                {savingTemplates ? "Saving…" : "Save All Templates"}
              </Button>
            </div>
          </div>

          {/* ══ SECTION 3: SEND LOG ══ */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-foreground">Recent Notifications</h2>
              <Button size="sm" variant="outline" onClick={handleExportLog}>
                <Download size={14} className="mr-1.5" /> Export Log
              </Button>
            </div>

            {logs.length === 0 ? (
              <Card className="p-8 text-center">
                <p className="text-sm text-muted-foreground">No notifications sent yet</p>
              </Card>
            ) : (
              <Card>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-[80px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="text-xs">
                          {new Date(log.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                          {" "}
                          {new Date(log.created_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                        </TableCell>
                        <TableCell className="text-xs font-mono">{log.phone_number}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-[10px]">
                            {log.notification_type?.replace(/_/g, " ")}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {log.sent_at ? (
                            <span className="text-xs text-emerald-600 font-medium flex items-center gap-1">
                              <Check size={12} /> Sent
                            </span>
                          ) : (
                            <span className="text-xs text-amber-600 font-medium">Pending</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <button className="text-xs text-primary hover:underline flex items-center gap-1">
                            <RotateCcw size={12} /> Resend
                          </button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsWhatsAppPage;
