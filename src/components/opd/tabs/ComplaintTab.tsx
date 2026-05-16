import React, { useState, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Mic } from "lucide-react";
import type { EncounterData } from "../ConsultationWorkspace";

interface Props {
  encounter: EncounterData;
  onChange: (partial: Partial<EncounterData>) => void;
}

const QUICK_COMPLAINTS = [
  "Fever", "Cough", "Cold", "Headache", "Body pain", "Vomiting",
  "Diarrhoea", "Chest pain", "Breathlessness", "Abdominal pain",
  "Burning urination", "Knee pain", "Back pain", "Skin rash",
];

const DURATIONS = [
  "Today", "2-3 days", "1 week", "2 weeks", "1 month",
  "3 months", "6 months", "1 year", "More than 1 year",
];

const ONSETS = ["Sudden", "Gradual", "Insidious"];

const ComplaintTab: React.FC<Props> = ({ encounter, onChange }) => {
  const [recording, setRecording] = useState(false);
  const [selectedChips, setSelectedChips] = useState<Set<string>>(new Set());

  const handleVoice = () => {
    const SR = (window as unknown as Record<string, unknown>).SpeechRecognition || (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
    if (!SR) return;
    const recognition = new (SR as new () => { lang: string; continuous: boolean; interimResults: boolean; onresult: ((e: { results: { 0: { 0: { transcript: string } } } }) => void) | null; onerror: (() => void) | null; onend: (() => void) | null; start: () => void })();
    recognition.lang = "en-IN";
    recognition.continuous = false;
    recognition.interimResults = false;
    setRecording(true);
    recognition.onresult = (e) => {
      const text = e.results[0][0].transcript;
      onChange({ chief_complaint: encounter.chief_complaint + (encounter.chief_complaint ? " " : "") + text });
      setRecording(false);
    };
    recognition.onerror = () => setRecording(false);
    recognition.onend = () => setRecording(false);
    recognition.start();
  };

  const toggleChip = (chip: string) => {
    const next = new Set(selectedChips);
    if (next.has(chip)) {
      next.delete(chip);
    } else {
      next.add(chip);
      const current = encounter.chief_complaint;
      onChange({ chief_complaint: current + (current ? ", " : "") + chip });
    }
    setSelectedChips(next);
  };

  return (
    <div className="h-full flex flex-col p-4 overflow-y-auto">
      {/* Chief complaint */}
      <div className="flex-1 min-h-0 flex flex-col">
        <label className="text-xs font-bold text-slate-700 mb-1.5">Chief Complaint *</label>
        <div className="relative flex-1">
          <textarea
            value={encounter.chief_complaint}
            onChange={(e) => onChange({ chief_complaint: e.target.value })}
            placeholder="Patient's main complaint in their own words..."
            className="w-full h-full border border-slate-200 rounded-lg p-3 text-sm resize-none focus:border-[#1A2F5A] focus:ring-2 focus:ring-[#1A2F5A]/10 outline-none"
          />
          <button
            onClick={handleVoice}
            className={cn(
              "absolute bottom-3 right-3 w-9 h-9 rounded-full flex items-center justify-center transition-colors",
              recording ? "bg-red-500 animate-pulse" : "bg-[#1A2F5A] hover:bg-[#152647]"
            )}
            title="Click and speak"
          >
            <Mic className="h-4 w-4 text-white" />
          </button>
        </div>
      </div>

      {/* Duration + Onset */}
      <div className="grid grid-cols-2 gap-3 mt-3">
        <div>
          <label className="text-xs font-bold text-slate-700 mb-1 block">Duration</label>
          <select
            value={encounter.history_of_present_illness}
            onChange={(e) => onChange({ history_of_present_illness: e.target.value })}
            className="w-full h-9 px-2 border border-slate-200 rounded-lg text-sm outline-none"
          >
            <option value="">Select...</option>
            {DURATIONS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-bold text-slate-700 mb-1 block">Onset</label>
          <select
            value={encounter.soap_subjective}
            onChange={(e) => onChange({ soap_subjective: e.target.value })}
            className="w-full h-9 px-2 border border-slate-200 rounded-lg text-sm outline-none"
          >
            <option value="">Select...</option>
            {ONSETS.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
      </div>

      {/* Quick chips */}
      <div className="flex flex-wrap gap-1.5 mt-3">
        {QUICK_COMPLAINTS.map((c) => (
          <button
            key={c}
            onClick={() => toggleChip(c)}
            className={cn(
              "text-xs px-3 py-1 rounded-full border transition-colors",
              selectedChips.has(c)
                ? "bg-blue-50 border-[#1A2F5A] text-[#1A2F5A]"
                : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
            )}
          >
            {c}
          </button>
        ))}
      </div>
    </div>
  );
};

export default ComplaintTab;
