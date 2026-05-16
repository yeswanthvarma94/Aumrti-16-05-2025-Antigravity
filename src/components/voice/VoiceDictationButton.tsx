import React, { useRef, useCallback, useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Mic, MicOff, Loader2, ChevronDown, Zap, Bot } from "lucide-react";
import { useVoiceScribe, SessionType, SUPPORTED_LANGUAGES } from "@/contexts/VoiceScribeContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { results: SpeechRecognitionResultList }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

interface Props {
  sessionType: SessionType;
  className?: string;
  size?: "sm" | "md";
}

const SARVAM_CHUNK_SECONDS = 25;

const VoiceDictationButton: React.FC<Props> = ({ sessionType, className, size = "md" }) => {
  const {
    isRecording, setIsRecording,
    setIsPanelOpen, setPanelState,
    setRawTranscript, setStructuredOutput,
    setCurrentSessionType, selectedLanguage, setSelectedLanguage,
  } = useVoiceScribe();
  const { toast } = useToast();
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const fullTranscriptRef = useRef("");
  const chunkTranscriptsRef = useRef<string[]>([]);
  const chunkTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const isStoppingRef = useRef(false);
  const activeEngineRef = useRef<"web_speech" | "sarvam" | "bhashini">("sarvam");
  const [langOpen, setLangOpen] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const secondsTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [adminEngine, setAdminEngine] = useState<string | null>(null);

  const isWebSpeechSupported = typeof window !== "undefined" && !!(
    (window as unknown as Record<string, unknown>).SpeechRecognition ||
    (window as unknown as Record<string, unknown>).webkitSpeechRecognition
  );

  // Fetch admin's engine preference
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase.from("users").select("hospital_id").eq("auth_user_id", user.id).maybeSingle()
        .then(({ data: userData }) => {
          if (!userData?.hospital_id) return;
          supabase.from("api_configurations")
            .select("config")
            .eq("hospital_id", userData.hospital_id)
            .eq("service_key", "voice_asr_engine")
            .maybeSingle()
            .then(({ data }) => {
              if (data?.config) {
                setAdminEngine((data.config as Record<string, string>).engine || null);
              }
            });
        });
    });
  }, []);

  const currentLang = SUPPORTED_LANGUAGES.find(l => l.code === selectedLanguage) || SUPPORTED_LANGUAGES[0];

  // Engine priority: English → web_speech; admin preference for Indian languages; default to sarvam
  const resolveEngine = (): "web_speech" | "sarvam" | "bhashini" => {
    if (selectedLanguage === "en-IN") return "web_speech";
    if (adminEngine === "bhashini") return "bhashini";
    if (adminEngine === "web_speech") return "web_speech";
    return "sarvam";
  };

  const activeEngine = resolveEngine();
  const useSarvamOrBhashini = activeEngine === "sarvam" || activeEngine === "bhashini";

  // Filter languages: hide bhashini-only languages when bhashini isn't active
  const visibleLanguages = SUPPORTED_LANGUAGES.filter(lang => {
    if (lang.engine === "bhashini" && adminEngine !== "bhashini") return false;
    return true;
  });

  useEffect(() => {
    return () => {
      if (chunkTimerRef.current) clearInterval(chunkTimerRef.current);
      if (secondsTimerRef.current) clearInterval(secondsTimerRef.current);
    };
  }, []);

  const processTranscript = useCallback(async (rawText: string) => {
    if (!rawText.trim()) return;
    setPanelState("processing");
    setIsPanelOpen(true);

    try {
      
      const { data, error } = await supabase.functions.invoke("ai-clinical-voice", {
        body: { transcript: rawText, context_type: sessionType },
      });
      
      if (error || data?.error) throw new Error(data?.error || error?.message);
      setStructuredOutput(data.structured);
      setPanelState("output");
    } catch (err) {
      console.error("AI structuring failed:", err);
      setPanelState("fallback");
    }
  }, [sessionType, setPanelState, setIsPanelOpen, setStructuredOutput]);

  const sendChunkToSarvam = useCallback(async (audioBlob: Blob): Promise<string> => {
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        resolve(result.split(",")[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(audioBlob);
    });

    const { data, error } = await supabase.functions.invoke("sarvam-transcribe", {
      body: {
        audio_base64: base64,
        language_code: selectedLanguage,
        model: "saaras:v3",
      },
    });

    if (error || data?.error) throw new Error(data?.error || error?.message);
    return data.transcript || "";
  }, [selectedLanguage]);

  const sendChunkToBhashini = useCallback(async (audioBlob: Blob): Promise<string> => {
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        resolve(result.split(",")[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(audioBlob);
    });

    const { data, error } = await supabase.functions.invoke("bhashini-transcribe", {
      body: {
        audio_base64: base64,
        language_code: selectedLanguage,
      },
    });

    if (error || data?.error) throw new Error(data?.error || error?.message);
    return data.transcript || "";
  }, [selectedLanguage]);

  const sendChunk = useCallback(async (audioBlob: Blob): Promise<string> => {
    if (activeEngineRef.current === "bhashini") {
      return sendChunkToBhashini(audioBlob);
    }
    return sendChunkToSarvam(audioBlob);
  }, [sendChunkToSarvam, sendChunkToBhashini]);

  const flushChunk = useCallback(async () => {
    if (audioChunksRef.current.length === 0) return;
    const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
    audioChunksRef.current = [];

    try {
      const text = await sendChunk(blob);
      if (text.trim()) {
        chunkTranscriptsRef.current.push(text.trim());
        const combined = chunkTranscriptsRef.current.join(" ");
        setRawTranscript(combined);
        fullTranscriptRef.current = combined;
      }
    } catch (err) {
      console.error("Chunk transcription failed:", err);
    }
  }, [sendChunk, setRawTranscript]);

  // --- MediaRecorder flow (Sarvam or Bhashini) with auto-chunking ---
  const startMediaRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm",
      });

      audioChunksRef.current = [];
      chunkTranscriptsRef.current = [];
      fullTranscriptRef.current = "";
      isStoppingRef.current = false;
      activeEngineRef.current = activeEngine;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        if (isStoppingRef.current) {
          stream.getTracks().forEach(t => t.stop());
          streamRef.current = null;

          if (audioChunksRef.current.length > 0) {
            setPanelState("transcribing");
            const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
            audioChunksRef.current = [];
            try {
              const text = await sendChunk(blob);
              if (text.trim()) chunkTranscriptsRef.current.push(text.trim());
            } catch (err) {
              console.error("Final chunk transcription failed:", err);
            }
          }

          const finalTranscript = chunkTranscriptsRef.current.join(" ");
          setRawTranscript(finalTranscript);
          fullTranscriptRef.current = finalTranscript;

          if (finalTranscript.trim()) {
            await processTranscript(finalTranscript.trim());
          } else {
            toast({ title: "No speech detected", description: "Try speaking louder or closer to the mic", variant: "destructive" });
            setPanelState("ready");
          }
        } else {
          const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
          audioChunksRef.current = [];

          try {
            const newRecorder = new MediaRecorder(stream, {
              mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
                ? "audio/webm;codecs=opus"
                : "audio/webm",
            });
            newRecorder.ondataavailable = mediaRecorder.ondataavailable;
            newRecorder.onstop = mediaRecorder.onstop;
            newRecorder.start(1000);
            mediaRecorderRef.current = newRecorder;
          } catch {
            // stream may have ended
          }

          try {
            const text = await sendChunk(blob);
            if (text.trim()) {
              chunkTranscriptsRef.current.push(text.trim());
              const combined = chunkTranscriptsRef.current.join(" ");
              setRawTranscript(combined);
              fullTranscriptRef.current = combined;
            }
          } catch (err) {
            console.error("Chunk transcription failed:", err);
          }
        }
      };

      mediaRecorder.start(1000);
      mediaRecorderRef.current = mediaRecorder;

      chunkTimerRef.current = setInterval(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording" && !isStoppingRef.current) {
          mediaRecorderRef.current.stop();
        }
      }, SARVAM_CHUNK_SECONDS * 1000);

      setRecordingSeconds(0);
      secondsTimerRef.current = setInterval(() => {
        setRecordingSeconds(s => s + 1);
      }, 1000);

      setCurrentSessionType(sessionType);
      setIsRecording(true);
      setIsPanelOpen(true);
      setPanelState("recording");
      setRawTranscript("");
    } catch (err) {
      console.error("Microphone access failed:", err);
      toast({ title: "Microphone access denied", variant: "destructive" });
    }
  }, [sessionType, activeEngine, setIsRecording, setIsPanelOpen, setPanelState, setRawTranscript, setCurrentSessionType, toast, sendChunk, processTranscript]);

  // --- Web Speech API flow ---
  const startWebSpeechRecording = useCallback(() => {
    if (!isWebSpeechSupported) {
      toast({ title: "Voice not supported", description: "Use Chrome or Edge", variant: "destructive" });
      return;
    }

    const SR = (window as unknown as Record<string, unknown>).SpeechRecognition ||
      (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
    const recognition = new (SR as new () => SpeechRecognitionLike)();
    recognition.lang = "en-IN";
    recognition.continuous = true;
    recognition.interimResults = true;

    fullTranscriptRef.current = "";
    setRawTranscript("");
    setCurrentSessionType(sessionType);

    setRecordingSeconds(0);
    secondsTimerRef.current = setInterval(() => {
      setRecordingSeconds(s => s + 1);
    }, 1000);

    recognition.onresult = (e) => {
      let interim = "";
      let final = "";
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) {
          final += r[0].transcript + " ";
        } else {
          interim += r[0].transcript;
        }
      }
      fullTranscriptRef.current = final;
      setRawTranscript(final + interim);
    };

    recognition.onerror = (e) => {
      if (e.error !== "aborted") {
        toast({ title: `Speech error: ${e.error}`, variant: "destructive" });
      }
      setIsRecording(false);
      if (secondsTimerRef.current) { clearInterval(secondsTimerRef.current); secondsTimerRef.current = null; }
    };

    recognition.onend = () => {
      setIsRecording(false);
      if (secondsTimerRef.current) { clearInterval(secondsTimerRef.current); secondsTimerRef.current = null; }
      if (fullTranscriptRef.current.trim()) {
        processTranscript(fullTranscriptRef.current.trim());
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsRecording(true);
    setIsPanelOpen(true);
    setPanelState("recording");
  }, [isWebSpeechSupported, sessionType, processTranscript, setIsRecording, setIsPanelOpen, setPanelState, setRawTranscript, setCurrentSessionType, toast]);

  const startRecording = useCallback(() => {
    if (useSarvamOrBhashini) {
      startMediaRecording();
    } else {
      startWebSpeechRecording();
    }
  }, [useSarvamOrBhashini, startMediaRecording, startWebSpeechRecording]);

  const stopRecording = useCallback(() => {
    if (chunkTimerRef.current) { clearInterval(chunkTimerRef.current); chunkTimerRef.current = null; }
    if (secondsTimerRef.current) { clearInterval(secondsTimerRef.current); secondsTimerRef.current = null; }

    if (useSarvamOrBhashini && mediaRecorderRef.current) {
      isStoppingRef.current = true;
      if (mediaRecorderRef.current.state === "recording") {
        mediaRecorderRef.current.stop();
      }
      mediaRecorderRef.current = null;
      setIsRecording(false);
    } else {
      recognitionRef.current?.stop();
      recognitionRef.current = null;
    }
  }, [useSarvamOrBhashini, setIsRecording]);

  if (!isWebSpeechSupported && !useSarvamOrBhashini) return null;

  const iconSize = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";
  const btnSize = size === "sm" ? "h-7 px-2 text-[11px]" : "h-8 px-3 text-xs";

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

  const getEngineBadge = (lang: typeof SUPPORTED_LANGUAGES[0]) => {
    if (lang.code === "auto") {
      return (
        <span className="inline-flex items-center gap-0.5 text-[10px] text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full">
          ✨ Recommended
        </span>
      );
    }
    if (lang.code === "en-IN") {
      return (
        <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
          <Zap className="h-2.5 w-2.5" /> instant
        </span>
      );
    }
    if (lang.engine === "bhashini") {
      return (
        <span className="inline-flex items-center gap-0.5 text-[10px] text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full">
          🇮🇳 Bhashini
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-full">
        <Bot className="h-2.5 w-2.5" /> {adminEngine === "bhashini" ? "Bhashini" : "Sarvam"}
      </span>
    );
  };

  return (
    <div className={cn("relative inline-flex items-center gap-1", className)}>
      {/* Language selector */}
      <Popover open={langOpen} onOpenChange={setLangOpen}>
        <PopoverTrigger asChild>
          <button
            className={cn(
              "rounded-md font-medium flex items-center gap-1 transition-all border border-border bg-background text-foreground hover:bg-muted",
              size === "sm" ? "h-7 px-1.5 text-[11px]" : "h-8 px-2 text-xs"
            )}
            disabled={isRecording}
          >
            <span>{currentLang.flag}</span>
            <ChevronDown className="h-3 w-3 opacity-50" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-1.5 max-h-[320px] overflow-y-auto" align="start" sideOffset={6}>
          <div className="space-y-0.5">
            {visibleLanguages.map((lang) => (
              <button
                key={lang.code}
                onClick={() => { setSelectedLanguage(lang.code); setLangOpen(false); }}
                className={cn(
                  "w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-xs transition-colors",
                  lang.code === selectedLanguage
                    ? "bg-primary/10 text-primary font-semibold"
                    : "hover:bg-muted text-foreground"
                )}
              >
                <span className="text-sm">{lang.flag}</span>
                <span className="flex-1 text-left">{lang.label}</span>
                {getEngineBadge(lang)}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      {/* Mic button */}
      <button
        onClick={isRecording ? stopRecording : startRecording}
        className={cn(
          "rounded-full font-semibold flex items-center justify-center transition-all active:scale-[0.90]",
          isRecording
            ? "bg-red-500 text-white hover:bg-red-600 animate-pulse h-14 w-auto px-5 gap-2 shadow-[0_0_24px_-2px_rgba(239,68,68,0.6)]"
            : "bg-gradient-to-br from-blue-500 via-indigo-500 to-cyan-400 text-white hover:from-blue-600 hover:via-indigo-600 hover:to-cyan-500 h-14 w-14 shadow-[0_0_28px_-4px_rgba(59,130,246,0.65)] hover:shadow-[0_0_36px_-2px_rgba(59,130,246,0.8)]"
        )}
      >
        {isRecording ? (
          <><MicOff className="h-6 w-6" /> Stop {formatTime(recordingSeconds)}</>
        ) : (
          <Mic className="h-6 w-6" />
        )}
      </button>
    </div>
  );
};

export default VoiceDictationButton;
