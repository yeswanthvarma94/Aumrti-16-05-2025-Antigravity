import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Printer, Copy, Send, Globe, Volume2, VolumeX } from "lucide-react";
import { callAI } from "@/lib/aiProvider";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface Props {
  hospitalId: string;
  patientName: string;
  patientPhone: string | null;
  diagnosis: string;
  medications: { drug_name: string; dose?: string; frequency?: string }[];
  followupDate: string | null;
  restrictions: string | null;
}

const LANGUAGES = [
  { code: "English", label: "English", native: "English", tts: "en-IN" },
  { code: "Hindi", label: "Hindi", native: "हिन्दी", tts: "hi-IN" },
  { code: "Telugu", label: "Telugu", native: "తెలుగు", tts: "te-IN" },
  { code: "Tamil", label: "Tamil", native: "தமிழ்", tts: "ta-IN" },
  { code: "Kannada", label: "Kannada", native: "ಕನ್ನಡ", tts: "kn-IN" },
  { code: "Marathi", label: "Marathi", native: "मराठी", tts: "mr-IN" },
  { code: "Malayalam", label: "Malayalam", native: "മലയാളം", tts: "ml-IN" },
];

const DischargeInstructions: React.FC<Props> = ({
  hospitalId,
  patientName,
  patientPhone,
  diagnosis,
  medications,
  followupDate,
  restrictions,
}) => {
  const { toast } = useToast();
  const [selectedLang, setSelectedLang] = useState("English");
  const [instructions, setInstructions] = useState("");
  const [generating, setGenerating] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  const generate = async () => {
    setGenerating(true);
    setInstructions("");

    try {
      const medList = medications
        .map((m) => [m.drug_name, m.dose, m.frequency].filter(Boolean).join(" "))
        .join(", ");

      const langLabel =
        selectedLang === "English"
          ? "English"
          : `${selectedLang} (${LANGUAGES.find((l) => l.code === selectedLang)?.native})`;

      const response = await callAI({
        featureKey: "discharge_instructions",
        hospitalId,
        prompt: `Write simple, clear discharge instructions for a patient in ${langLabel} language.

Patient details:
- Diagnosis: ${diagnosis || "Not specified"}
- Medications: ${medList || "None prescribed"}
- Follow-up: ${followupDate || "As advised"}
- Restrictions: ${restrictions || "None specified"}

Write in simple language that a patient with no medical knowledge can understand. Use short sentences. Use numbered points.
Include: what medicines to take and when, what to avoid, when to come back, warning signs to watch for.

Write ONLY in ${langLabel}. Do not include English unless the language selected is English.`,
        maxTokens: 600,
      });

      setInstructions(response.text);
    } catch (err) {
      console.error("Failed to generate instructions:", err);
      toast({
        title: "AI unavailable",
        description: "Could not generate multilingual instructions. Use standard English instructions.",
        variant: "destructive",
      });
    }
    setGenerating(false);
  };

  const handlePrint = () => {
    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(`
        <html><head><title>Discharge Instructions - ${patientName}</title>
        <style>body { font-family: sans-serif; padding: 40px; line-height: 1.7; font-size: 14px; }
        h2 { border-bottom: 2px solid #1A2F5A; padding-bottom: 8px; }
        </style></head><body>
        <h2>Discharge Instructions — ${patientName}</h2>
        <pre style="white-space: pre-wrap; font-family: inherit;">${instructions}</pre>
        <script>window.print();</script>
        </body></html>
      `);
      printWindow.document.close();
    }
  };

  const handleWhatsApp = () => {
    if (!patientPhone) {
      toast({ title: "No phone number available", variant: "destructive" });
      return;
    }
    const phone = patientPhone.replace(/\D/g, "");
    const text = `*Discharge Instructions — ${patientName}*\n\n${instructions}`;
    window.open(`https://wa.me/91${phone}?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(instructions);
    toast({ title: "Instructions copied to clipboard" });
  };

  const handlePlayAudio = () => {
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }

    const lang = LANGUAGES.find((l) => l.code === selectedLang);
    const utterance = new SpeechSynthesisUtterance(instructions);
    utterance.lang = lang?.tts || "en-IN";
    utterance.rate = 0.85; // slightly slower for medical instructions

    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);

    setSpeaking(true);
    window.speechSynthesis.speak(utterance);
  };

  return (
    <div className="mt-4">
      <div className="flex items-center gap-2 mb-2">
        <Globe size={14} className="text-primary" />
        <span className="text-xs font-bold text-foreground">
          Generate Patient Instructions
        </span>
      </div>

      {/* Language pills */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {LANGUAGES.map((lang) => (
          <button
            key={lang.code}
            onClick={() => setSelectedLang(lang.code)}
            className={cn(
              "px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
              selectedLang === lang.code
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            )}
          >
            {lang.native} {lang.label !== lang.native ? lang.label : ""}
          </button>
        ))}
      </div>

      <Button
        size="sm"
        onClick={generate}
        disabled={generating}
        className="text-xs mb-3"
      >
        {generating ? (
          <><Loader2 size={12} className="animate-spin mr-1" /> Generating...</>
        ) : (
          <>🌐 Generate in {selectedLang}</>
        )}
      </Button>

      {/* Generated instructions */}
      {instructions && (
        <div className="bg-[hsl(var(--success)/0.08)] border-l-[3px] border-l-[hsl(var(--success))] rounded-lg p-4">
          <p className="text-[13px] font-bold text-foreground mb-2">
            📋 Discharge Instructions — {selectedLang}
          </p>
          <pre className="text-sm text-foreground whitespace-pre-wrap font-sans leading-7">
            {instructions}
          </pre>

          <div className="flex gap-2 mt-3 flex-wrap">
            <Button variant="outline" size="sm" className="text-xs h-7" onClick={handlePrint}>
              <Printer size={12} className="mr-1" /> Print
            </Button>
            <Button variant="outline" size="sm" className="text-xs h-7" onClick={handleWhatsApp}>
              <Send size={12} className="mr-1" /> WhatsApp
            </Button>
            <Button variant="outline" size="sm" className="text-xs h-7" onClick={handleCopy}>
              <Copy size={12} className="mr-1" /> Copy
            </Button>
            <Button
              variant={speaking ? "default" : "outline"}
              size="sm"
              className={cn("text-xs h-7", speaking && "bg-primary")}
              onClick={handlePlayAudio}
            >
              {speaking ? <VolumeX size={12} className="mr-1" /> : <Volume2 size={12} className="mr-1" />}
              {speaking ? "Stop" : `🔊 Play in ${selectedLang}`}
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-2">
            Audio uses device text-to-speech. Configure Sarvam Bulbul V3 in API Hub for higher quality.
          </p>
        </div>
      )}
    </div>
  );
};

export default DischargeInstructions;
