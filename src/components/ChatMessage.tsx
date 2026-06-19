import { cn } from "@/lib/utils";
import { useCustomization } from "@/context/CustomizationContext";
import { SpeakButton } from "./SpeakButton";

interface Message {
  role: "user" | "assistant";
  content: string;
  imageUrl?: string;
  imageUrls?: string[];
  fileType?: "image" | "pdf" | "sticker";
  fileName?: string;
}

interface ChatMessageProps {
  message: Message;
  onQuizAnswer?: (answer: string) => void;
  onSaveFlashcards?: (content: string) => void;
}

export const ChatMessage = ({ message, onQuizAnswer, onSaveFlashcards }: ChatMessageProps) => {
  const { getAvatarUrl } = useCustomization();
  const isUser = message.role === "user";
  const isSticker = message.fileType === "sticker";

  // Sticker messages render differently
  if (isSticker) {
    return (
      <div
        className={cn(
          "flex gap-2 sm:gap-3 animate-message-in",
          isUser ? "flex-row-reverse" : "flex-row"
        )}
      >
        {isUser ? (
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center flex-shrink-0 bg-primary text-primary-foreground">
            <span className="text-xs sm:text-sm font-bold">You</span>
          </div>
        ) : (
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full overflow-hidden flex-shrink-0 shadow-glow border-2 border-primary/20">
            <img
              src={getAvatarUrl()}
              alt="StudyGPT"
              className="w-full h-full object-cover"
            />
          </div>
        )}
        <div className="text-4xl sm:text-5xl animate-soft-bounce">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex gap-2 sm:gap-3 animate-message-in",
        isUser ? "flex-row-reverse" : "flex-row"
      )}
    >
      {/* Avatar */}
      {isUser ? (
        <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center flex-shrink-0 bg-primary text-primary-foreground">
          <span className="text-xs sm:text-sm font-bold">You</span>
        </div>
      ) : (
        <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full overflow-hidden flex-shrink-0 shadow-glow border-2 border-primary/20">
          <img
            src={getAvatarUrl()}
            alt="StudyGPT"
            className="w-full h-full object-cover"
          />
        </div>
      )}

      {/* Message bubble */}
      <div
        className={cn(
          "max-w-[85%] sm:max-w-[80%] rounded-2xl px-3 py-2.5 sm:px-4 sm:py-3 shadow-soft",
          isUser
            ? "bg-primary text-primary-foreground rounded-br-md"
            : "bg-card text-card-foreground rounded-bl-md border border-border"
        )}
      >
        {/* Show multiple images if present */}
        {message.imageUrls && message.imageUrls.length > 0 && message.fileType !== "pdf" && (
          <div className="mb-2 flex flex-wrap gap-2">
            {message.imageUrls.map((url, i) => (
              <img
                key={i}
                src={url}
                alt={`Shared-${i}`}
                className="max-w-[200px] max-h-40 sm:max-h-48 rounded-lg object-cover border border-border"
              />
            ))}
          </div>
        )}
        {/* Fallback to single image if present */}
        {(!message.imageUrls || message.imageUrls.length === 0) && message.imageUrl && message.fileType !== "pdf" && (
          <div className="mb-2">
            <img
              src={message.imageUrl}
              alt="Shared"
              className="max-w-full max-h-40 sm:max-h-48 rounded-lg"
            />
          </div>
        )}
        {/* Show PDF indicator */}
        {message.fileType === "pdf" && (
          <div className="mb-2 flex items-center gap-2 px-3 py-2 bg-background/50 rounded-lg">
            <span className="text-lg">📄</span>
            <span className="text-sm font-medium">PDF Shared</span>
          </div>
        )}
        <div className="text-sm leading-relaxed whitespace-pre-wrap">
          {renderContent(message.content)}
        </div>
        {/* Speak button for assistant messages */}
        {!isUser && message.content && (
          <div className="flex justify-end mt-2 -mb-1 -mr-1">
            <SpeakButton text={message.content.replace(/\[QUIZ_QUESTION\]|\[END_QUIZ\]|\[FLASHCARDS_START\]|\[FLASHCARDS_END\]/g, '')} />
          </div>
        )}
      </div>
    </div>
  );
};

const renderContent = (content: string) => {
  // Clean markers for display
  const cleanContent = content
    .replace(/\[QUIZ_QUESTION\]|\[END_QUIZ\]|\[FLASHCARDS_START\]|\[FLASHCARDS_END\]/g, '')
    .trim();

  // If it was a quiz, only show the question part
  if (content.includes("[QUIZ_QUESTION]")) {
    const lines = cleanContent.split('\n');
    return <p className="font-medium text-base">{lines[0]}</p>;
  }

  // If it was flashcards, show a teaser
  if (content.includes("[FLASHCARDS_START]")) {
    return (
      <div className="space-y-2">
        <p className="italic text-muted-foreground flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-amber-500" /> Generated flashcards for you!
        </p>
        <p className="text-xs text-muted-foreground opacity-70">Check the options below to save them.</p>
      </div>
    );
  }

  return <p>{cleanContent}</p>;
};

import { Button } from "@/components/ui/button";
import { Sparkles, Layers } from "lucide-react";

export const TypingIndicator = () => {
  const { getAvatarUrl } = useCustomization();

  return (
    <div className="flex gap-2 sm:gap-3 animate-message-in">
      <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full overflow-hidden flex-shrink-0 shadow-glow border-2 border-primary/20">
        <img
          src={getAvatarUrl()}
          alt="StudyGPT"
          className="w-full h-full object-cover"
        />
      </div>
      <div className="bg-card border border-border rounded-2xl rounded-bl-md px-3 py-2.5 sm:px-4 sm:py-3 shadow-soft">
        <div className="flex gap-1.5">
          <span className="w-2 h-2 bg-muted-foreground rounded-full animate-typing" style={{ animationDelay: "0s" }} />
          <span className="w-2 h-2 bg-muted-foreground rounded-full animate-typing" style={{ animationDelay: "0.2s" }} />
          <span className="w-2 h-2 bg-muted-foreground rounded-full animate-typing" style={{ animationDelay: "0.4s" }} />
        </div>
      </div>
    </div>
  );
};
