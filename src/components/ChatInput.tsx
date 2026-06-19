import { useState, useRef, KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Camera, Image, FileText } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  hasFiles: boolean;
  onAddImages: (previews: string[], base64s: string[]) => void;
  onAddPdf: (name: string, base64: string) => void;
}

export const ChatInput = ({ onSend, disabled, hasFiles, onAddImages, onAddPdf }: ChatInputProps) => {
  const { t } = useLanguage();
  const [input, setInput] = useState("");
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  const handleSend = () => {
    if ((input.trim() || hasFiles) && !disabled) {
      onSend(input.trim());
      setInput("");
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleImageSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const newPreviews: string[] = [];
    const newBase64s: string[] = [];
    let processedCount = 0;

    Array.from(files).forEach((file) => {
      if (!file.type.startsWith("image/")) {
        processedCount++;
        return;
      }

      const previewUrl = URL.createObjectURL(file);
      newPreviews.push(previewUrl);

      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        newBase64s.push(base64);
        processedCount++;

        if (processedCount === files.length) {
          onAddImages(newPreviews, newBase64s);
        }
      };
      reader.readAsDataURL(file);
    });

    // Reset input
    event.target.value = "";
  };

  const handlePdfSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.type !== "application/pdf") {
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      onAddPdf(file.name, base64);
    };
    reader.readAsDataURL(file);

    // Reset input
    event.target.value = "";
  };

  return (
    <div className="flex gap-1.5 sm:gap-2 items-end">
      {/* Hidden file inputs */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleImageSelect}
        className="hidden"
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleImageSelect}
        className="hidden"
      />
      <input
        ref={pdfInputRef}
        type="file"
        accept="application/pdf"
        onChange={handlePdfSelect}
        className="hidden"
      />

      {/* Camera Button */}
      <Button
        variant="outline"
        size="icon"
        onClick={() => cameraInputRef.current?.click()}
        disabled={disabled}
        className="h-11 w-11 sm:h-[52px] sm:w-[52px] rounded-xl border-2 border-border hover:border-primary/50 transition-colors flex-shrink-0"
        title="Take Photo"
      >
        <Camera className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground" />
      </Button>

      {/* Gallery Button */}
      <Button
        variant="outline"
        size="icon"
        onClick={() => galleryInputRef.current?.click()}
        disabled={disabled}
        className="h-11 w-11 sm:h-[52px] sm:w-[52px] rounded-xl border-2 border-border hover:border-primary/50 transition-colors flex-shrink-0"
        title="Choose from Gallery"
      >
        <Image className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground" />
      </Button>

      {/* PDF Button */}
      <Button
        variant="outline"
        size="icon"
        onClick={() => pdfInputRef.current?.click()}
        disabled={disabled}
        className="h-11 w-11 sm:h-[52px] sm:w-[52px] rounded-xl border-2 border-border hover:border-primary/50 transition-colors flex-shrink-0"
        title="Share PDF"
      >
        <FileText className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground" />
      </Button>

      {/* Text Input */}
      <div className="flex-1 min-w-0">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={hasFiles ? t.addMessage : t.askAnything}
          className="min-h-[44px] sm:min-h-[52px] max-h-[100px] sm:max-h-[120px] resize-none pr-3 sm:pr-4 rounded-xl border-2 border-border bg-card focus:border-primary transition-colors text-sm sm:text-base"
          disabled={disabled}
        />
      </div>

      {/* Send Button */}
      <Button
        onClick={handleSend}
        disabled={(!input.trim() && !hasFiles) || disabled}
        size="icon"
        className="h-11 w-11 sm:h-[52px] sm:w-[52px] rounded-xl gradient-hero hover:opacity-90 transition-opacity shadow-medium flex-shrink-0"
      >
        <Send className="h-4 w-4 sm:h-5 sm:w-5" />
      </Button>
    </div>
  );
};
