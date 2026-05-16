import React, { useState } from "react";
import { cn } from "@/lib/utils";
import { Mic } from "lucide-react";
import type { EncounterData } from "../ConsultationWorkspace";

interface Props {
  encounter: EncounterData;
  onChange: (partial: Partial<EncounterData>) => void;
}

const GEN_EXAM_CHIPS = [
  "Conscious & alert", "Well-nourished", "Afebrile", "Febrile",
  "No pallor", "Pallor present", "Mild pallor", "No icterus",
  "Icterus present", "No cyanosis", "No clubbing", "No oedema",
  "Oedema bilateral", "Lymphadenopathy",
];

const DIAG_CHIPS = [
  "Upper Respiratory Tract Infection", "Hypertension",
  "Type 2 Diabetes", "Acute Gastroenteritis", "Migraine",
  "Urinary Tract Infection", "Bronchial Asthma", "Anaemia",
];

const ExaminationTab: React.FC<Props> = ({ encounter, onChange }) => {
  const [recording, setRecording] = useState(false);

  const appendToExam = (text: string) => {
    const cur = encounter.examination_notes;
    onChange({ examination_notes: cur + (cur ? ", " : "") + text });
  };

  const handleVoice = (field: "examination_notes" | "soap_objective") => {
    const SR = (window as unknown as Record<string, unknown>).SpeechRecognition || (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
    if (!SR) return;
    const recognition = new (SR as new () => { lang: string; continuous: boolean; interimResults?: boolean; onresult: ((e: { results: { 0: { 0: { transcript: string } } } }) => void) | null; onerror: (() => void) | null; onend: (() => void) | null; start: () => void })();
    recognition.lang = "en-IN";
    recognition.continuous = false;
    setRecording(true);
    recognition.onresult = (e) => {
      const text = e.results[0][0].transcript;
      const cur = field === "examination_notes" ? encounter.examination_notes : encounter.soap_objective;
      onChange({ [field]: cur + (cur ? " " : "") + text });
      setRecording(false);
    };
    recognition.onerror = () => setRecording(false);
    recognition.onend = () => setRecording(false);
    recognition.start();
  };

  return (
    <div className="h-full flex flex-col p-4 overflow-y-auto gap-3">
      {/* General Examination */}
      <div className="flex-1 min-h-0 flex flex-col">
        <label className="text-xs font-bold text-slate-700 mb-1">General Examination</label>
        <div className="flex flex-wrap gap-1 mb-2">
          {GEN_EXAM_CHIPS.map((c) => (
            <button key={c} onClick={() => appendToExam(c)} className="text-[11px] px-2.5 py-0.5 rounded-full bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100 transition-colors">
              {c}
            </button>
          ))}
        </div>
        <div className="relative flex-1">
          <textarea
            value={encounter.examination_notes}
            onChange={(e) => onChange({ examination_notes: e.target.value })}
            className="w-full h-full min-h-[80px] border border-slate-200 rounded-lg p-3 text-sm resize-none focus:border-[#1A2F5A] focus:ring-2 focus:ring-[#1A2F5A]/10 outline-none"
            placeholder="General examination findings..."
          />
        </div>
      </div>

      {/* Systemic Examination */}
      <div className="flex-1 min-h-0 flex flex-col">
        <label className="text-xs font-bold text-slate-700 mb-1">Systemic Examination / Clinical Notes</label>
        <div className="relative flex-1">
          <textarea
            value={encounter.soap_objective}
            onChange={(e) => onChange({ soap_objective: e.target.value })}
            className="w-full h-full min-h-[80px] border border-slate-200 rounded-lg p-3 text-sm resize-none focus:border-[#1A2F5A] focus:ring-2 focus:ring-[#1A2F5A]/10 outline-none"
            placeholder="Systemic examination findings..."
          />
          <button
            onClick={() => handleVoice("soap_objective")}
            className={cn("absolute bottom-3 right-3 w-8 h-8 rounded-full flex items-center justify-center", recording ? "bg-red-500 animate-pulse" : "bg-[#1A2F5A] hover:bg-[#152647]")}
          >
            <Mic className="h-3.5 w-3.5 text-white" />
          </button>
        </div>
      </div>

      {/* Diagnosis */}
      <div className="flex-shrink-0 pt-2 border-t border-slate-100">
        <label className="text-xs font-bold text-slate-700 mb-1 block">Diagnosis / Impression</label>
        <div className="flex gap-2">
          <input
            value={encounter.diagnosis}
            onChange={(e) => onChange({ diagnosis: e.target.value })}
            placeholder="Type diagnosis..."
            className="flex-1 h-9 px-3 border border-slate-200 rounded-lg text-sm outline-none focus:border-[#1A2F5A]"
          />
          <div className="flex items-center gap-1">
            <span className="text-[11px] text-slate-500">ICD-10:</span>
            <input
              value={encounter.icd10_code}
              onChange={(e) => onChange({ icd10_code: e.target.value })}
              placeholder="e.g., J06.9"
              className="w-24 h-9 px-2 border border-slate-200 rounded-lg text-sm outline-none"
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-1 mt-2">
          {DIAG_CHIPS.map((d) => (
            <button key={d} onClick={() => onChange({ diagnosis: d })} className="text-[11px] px-2.5 py-0.5 rounded-full bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100 transition-colors">
              {d}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ExaminationTab;
