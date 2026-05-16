import React from "react";
import { AlertTriangle, AlertOctagon, Siren, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getNEWS2Level, getNEWS2Label } from "@/lib/news2";

interface Props {
  news2Score: number | null;
  admissionId: string;
  onTabChange: (tab: string) => void;
}

const SepsisWarningBanner: React.FC<Props> = ({ news2Score, onTabChange }) => {
  if (news2Score === null || news2Score < 5) return null;

  const level = getNEWS2Level(news2Score);
  const label = getNEWS2Label(news2Score);

  if (level === "medium") {
    return (
      <div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-amber-300 bg-amber-50 mb-3">
        <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-amber-800">{label}</p>
          <p className="text-xs text-amber-700">Urgent clinical review required — monitor closely</p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="shrink-0 border-amber-400 text-amber-800 hover:bg-amber-100 h-7 text-xs"
          onClick={() => onTabChange("vitals")}
        >
          View Vitals <ChevronRight className="h-3 w-3 ml-1" />
        </Button>
      </div>
    );
  }

  if (level === "high") {
    return (
      <div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-red-400 bg-red-50 mb-3">
        <AlertOctagon className="h-5 w-5 text-red-600 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-red-800">{label}</p>
          <p className="text-xs text-red-700">Immediate review required — escalate to senior clinician</p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="shrink-0 border-red-400 text-red-800 hover:bg-red-100 h-7 text-xs"
          onClick={() => onTabChange("vitals")}
        >
          View Vitals <ChevronRight className="h-3 w-3 ml-1" />
        </Button>
      </div>
    );
  }

  // critical (≥8)
  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-lg border-2 border-red-600 bg-red-100 mb-3 animate-pulse">
      <Siren className="h-5 w-5 text-red-700 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-red-900">{label}</p>
        <p className="text-xs text-red-800 font-medium">Emergency response required — consider ICU transfer</p>
      </div>
      <Button
        size="sm"
        className="shrink-0 bg-red-700 hover:bg-red-800 text-white h-7 text-xs"
        onClick={() => onTabChange("vitals")}
      >
        View Vitals <ChevronRight className="h-3 w-3 ml-1" />
      </Button>
    </div>
  );
};

export default SepsisWarningBanner;
