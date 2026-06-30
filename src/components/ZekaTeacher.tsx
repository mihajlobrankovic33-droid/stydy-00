import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { Volume2, VolumeX } from 'lucide-react';

interface ZekaTeacherProps {
  message: string;
  onFinish?: () => void;
}

export const ZekaTeacher = ({ message, onFinish }: ZekaTeacherProps) => {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    if (!message || muted) return;

    // Use Web Speech API for TTS
    const speech = new SpeechSynthesisUtterance(message);
    speech.lang = 'sr-RS'; // Default to Serbian for Zeka
    speech.rate = 1.0;
    speech.pitch = 1.2; // Slightly higher pitch for a rabbit

    speech.onstart = () => setIsSpeaking(true);
    speech.onend = () => {
      setIsSpeaking(false);
      if (onFinish) onFinish();
    };

    window.speechSynthesis.speak(speech);

    return () => {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    };
  }, [message, muted, onFinish]);

  return (
    <div className="flex items-start gap-4 p-4 rounded-xl bg-primary/10 border border-primary/20 animate-in slide-in-from-bottom-2 mt-2">
      <div className="relative">
        <div className={cn(
          "w-16 h-16 rounded-full flex items-center justify-center bg-white shadow-lg border-2 border-primary overflow-hidden",
          isSpeaking && "animate-bounce"
        )}>
          {/* Bunny Emoji as placeholder for Zeka */}
          <span className="text-4xl">🐰</span>
        </div>
        <button 
          onClick={() => {
            setMuted(!muted);
            if (!muted) window.speechSynthesis.cancel();
          }}
          className="absolute -top-2 -right-2 p-1 rounded-full bg-background border shadow hover:bg-muted"
        >
          {muted ? <VolumeX className="w-3 h-3 text-red-500" /> : <Volume2 className="w-3 h-3 text-green-500" />}
        </button>
      </div>
      
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-bold text-primary">Turbo Zeka</span>
          {isSpeaking && (
            <div className="flex gap-1 h-3 items-center">
              <span className="w-1 h-2 bg-primary rounded-full animate-pulse"></span>
              <span className="w-1 h-3 bg-primary rounded-full animate-pulse delay-75"></span>
              <span className="w-1 h-2 bg-primary rounded-full animate-pulse delay-150"></span>
            </div>
          )}
        </div>
        <p className="text-sm text-foreground/90 leading-relaxed italic whitespace-pre-wrap">
          "{message}"
        </p>
      </div>
    </div>
  );
};
