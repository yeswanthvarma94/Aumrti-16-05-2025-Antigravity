import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Printer, FileText, Mail, Sparkles, Save } from "lucide-react";
import { callAI } from "@/lib/aiProvider";
import { supabase } from "@/integrations/supabase/client";

interface AppealLetterModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  claimId?: string | null;
  claim: {
    claim_number: string | null;
    tpa_name: string;
    claimed_amount: number;
    denial_reason: string | null;
    patient_name: string;
  } | null;
}

const AppealLetterModal: React.FC<AppealLetterModalProps> = ({ open, onOpenChange, claimId, claim }) => {
  const [letter, setLetter] = useState("");
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  if (!claim) return null;

  const generateLetter = async () => {
    setGenerating(true);
    
    const today = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });

    try {
      const { data: userData } = await supabase.from("users").select("hospital_id").eq("auth_user_id", (await supabase.auth.getUser()).data.user?.id || "").maybeSingle();
      const prompt = `Write a formal medical necessity appeal letter for a denied claim with ${claim.tpa_name} (private Indian insurer).
Claim Number: ${claim.claim_number || "N/A"}
Patient: ${claim.patient_name}
Claimed Amount: ₹${claim.claimed_amount.toLocaleString("en-IN")}
Denial Reason: ${claim.denial_reason || "Not specified"}
Date: ${today}

Reference IRDAI grievance guidelines where applicable. Format as a formal letter with proper structure, legal references, and medical justification. Include sections for denial reason cited, grounds for appeal, and specific request.`;
      const result = await callAI({ featureKey: "appeal_letter", hospitalId: userData?.hospital_id || "", prompt, maxTokens: 1200 });
      setLetter(result.text);
      setGenerating(false);
      return;
    } catch {
      // Fallback to template
    }
    
    const generatedLetter = `Date: ${today}

To,
The Claims Manager,
${claim.tpa_name}
[TPA Address]

Subject: Appeal for Reconsideration of Claim Denial
Claim Number: ${claim.claim_number || "N/A"}
Patient Name: ${claim.patient_name}
Claimed Amount: ₹${claim.claimed_amount.toLocaleString("en-IN")}

Dear Sir/Madam,

We are writing to formally appeal the denial of the above-referenced insurance claim. We believe this denial was made in error, and we respectfully request an immediate review and reconsideration.

DENIAL REASON CITED:
${claim.denial_reason || "Not specified"}

GROUNDS FOR APPEAL:

1. Medical Necessity: The treatment provided was medically necessary and consistent with established clinical guidelines. The patient's condition required immediate intervention, and the treating physician determined that the prescribed course of treatment was the most appropriate and evidence-based approach.

2. Clinical Evidence: All relevant diagnostic investigations, clinical findings, and treatment protocols are documented in the patient's medical records, which were submitted along with the original claim. The clinical pathway followed is consistent with standard medical practice.

3. Regulatory Compliance: As per IRDAI (Health Insurance) Regulations, 2024, Section 4(7), the insurer is required to honor claims for medically necessary treatments covered under the policy terms. The denial appears to contravene these regulatory provisions.

4. Pre-Authorization: The treatment was administered after following all pre-authorization protocols required by ${claim.tpa_name}. All necessary documentation was submitted within the stipulated timeframe.

REQUEST:
We kindly request that you:
a) Review all enclosed medical documentation thoroughly
b) Reconsider the claim for full settlement of ₹${claim.claimed_amount.toLocaleString("en-IN")}
c) Provide a detailed response within 15 working days as mandated by IRDAI guidelines

We are available for any clarification or additional documentation that may be required. Please contact the undersigned at your earliest convenience.

Thanking you,

Dr. [Medical Director Name]
Medical Director
[Hospital Name]
[Hospital Address]
[Contact Number]
[Hospital Registration Number]`;

    setLetter(generatedLetter);
    setGenerating(false);
  };  // end fallback

  const handleSaveToClam = async () => {
    if (!claimId || !letter) return;
    setSaving(true);
    const { error } = await supabase.from("insurance_claims").update({
      appeal_letter: letter,
      appeal_submitted_at: new Date().toISOString(),
    } as any).eq("id", claimId);
    setSaving(false);
    if (!error) {
      toast({ title: "Appeal letter saved to claim record ✓" });
    } else {
      toast({ title: "Failed to save letter", variant: "destructive" });
    }
  };

  const handlePrint = () => {
    const printWindow = window.open("", "_blank", "noopener,noreferrer");
    if (!printWindow) return;
    printWindow.document.write(`
      <html><head><title>Appeal Letter - ${claim.claim_number}</title>
      <style>
        body { font-family: 'Times New Roman', serif; padding: 40px 60px; font-size: 14px; line-height: 1.8; white-space: pre-wrap; }
        @media print { body { padding: 20px 40px; } }
      </style></head>
      <body>${letter}</body></html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-lg">Generate Appeal Letter</DialogTitle>
        </DialogHeader>

        {/* Denial Details */}
        <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-3 space-y-1 flex-shrink-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="text-[10px] font-mono">{claim.claim_number || "—"}</Badge>
            <span className="text-xs text-muted-foreground">{claim.tpa_name}</span>
            <span className="text-xs font-bold">₹{claim.claimed_amount.toLocaleString("en-IN")}</span>
          </div>
          <p className="text-xs text-destructive">
            <strong>Denial Reason:</strong> {claim.denial_reason || "Not specified"}
          </p>
        </div>

        {!letter && !generating && (
          <div className="flex-1 flex flex-col items-center justify-center py-8 gap-3">
            <Sparkles size={32} className="text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">Click below to generate an AI-powered appeal letter</p>
            <Button onClick={generateLetter} className="gap-1.5 bg-violet-600 hover:bg-violet-700">
              <Sparkles size={14} /> Generate Appeal Letter
            </Button>
          </div>
        )}

        {generating && (
          <div className="flex-1 flex flex-col items-center justify-center py-8 gap-3">
            <Loader2 size={28} className="animate-spin text-violet-600" />
            <p className="text-sm text-muted-foreground">AI writing appeal letter...</p>
          </div>
        )}

        {letter && !generating && (
          <>
            <Textarea
              value={letter}
              onChange={e => setLetter(e.target.value)}
              className="flex-1 min-h-[300px] text-[13px] leading-relaxed font-mono"
            />
            <div className="flex gap-2 flex-shrink-0 flex-wrap">
              <Button variant="outline" size="sm" className="gap-1.5" onClick={handlePrint}>
                <Printer size={14} /> Print
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => {
                navigator.clipboard.writeText(letter);
                toast({ title: "Letter copied to clipboard" });
              }}>
                <FileText size={14} /> Copy
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => {
                toast({ title: "Email feature requires SMTP configuration" });
              }}>
                <Mail size={14} /> Email to TPA
              </Button>
              {claimId && (
                <Button variant="outline" size="sm" className="gap-1.5 text-emerald-700 border-emerald-300 hover:bg-emerald-50" onClick={handleSaveToClam} disabled={saving}>
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  Save to Claim
                </Button>
              )}
              <Button size="sm" className="gap-1.5 ml-auto bg-violet-600 hover:bg-violet-700" onClick={generateLetter}>
                <Sparkles size={14} /> Regenerate
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default AppealLetterModal;
