import { useState, useRef, useEffect, forwardRef, useCallback } from "react";
import { Header } from "@/components/Header";
import { ChatMessage, TypingIndicator } from "@/components/ChatMessage";
import { ChatInput } from "@/components/ChatInput";
import { QuickActions, ActionType } from "@/components/QuickActions";
import { WelcomeMessage } from "@/components/WelcomeMessage";

import { AdminPanel } from "@/components/AdminPanel";

import { OfflineIndicator } from "@/components/OfflineIndicator";
import { PuskiceSection } from "@/components/PuskiceSection";
import { DirectChat } from "@/components/DirectChat";
import { AuthScreen } from "@/components/AuthScreen";
import { ProUpgradeModal } from "@/components/ProUpgradeModal";
import { HamburgerMenu } from "@/components/HamburgerMenu";
import { FlashcardsSection } from "@/components/FlashcardsSection";
import { ProfileSettings } from "@/components/ProfileSettings";
import { ChatHistoryModal, detectSubject, generateTitle } from "@/components/ChatHistoryModal";
import { useSupabaseAuth } from "@/context/SupabaseAuthContext";
import { useToast } from "@/hooks/use-toast";
import { useOfflineStatus } from "@/hooks/useOfflineStatus";
import { useLanguage } from "@/context/LanguageContext";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, MessageCircle, FileText, Users, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

interface Message {
  role: "user" | "assistant";
  content: string;
  imageUrl?: string;
  imageUrls?: string[];
  fileType?: "image" | "pdf" | "sticker";
  fileName?: string;
}

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/study-chat`;

// Batch size for streaming updates to prevent UI freezing
const STREAM_BATCH_SIZE = 10;

const Home = forwardRef<HTMLDivElement>((_, ref) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentAction, setCurrentAction] = useState<ActionType | null>(null);
  const [activeTab, setActiveTab] = useState<"chat" | "puskice" | "messages">("chat");
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [showProModal, setShowProModal] = useState(false);
  const [showProfileSettings, setShowProfileSettings] = useState(false);
  const [showChatHistory, setShowChatHistory] = useState(false);
  const [showFlashcards, setShowFlashcards] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [customSystemPrompt, setCustomSystemPrompt] = useState<string>(() => {
    return localStorage.getItem('custom_system_prompt') || '';
  });
  const scrollRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const streamBufferRef = useRef<string>(""); // Buffer for batching stream updates
  const streamUpdateTimeoutRef = useRef<number | null>(null);
  const { toast } = useToast();
  const { user, profile, isLoading: authLoading, isPro, isLifetimePro, isAdmin, daysRemaining, signOut } = useSupabaseAuth();
  const isOnline = useOfflineStatus();
  const { t } = useLanguage();

  // File upload state for input area
  const [filePreviews, setFilePreviews] = useState<string[]>([]);
  const [fileDatas, setFileDatas] = useState<string[]>([]);
  const [fileType, setFileType] = useState<"image" | "pdf" | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const clearFiles = () => {
    setFilePreviews([]);
    setFileDatas([]);
    setFileType(null);
    setFileName(null);
  };

  // Anti-tamper: Disable right-click and F12
  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      return false;
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // Admin panel shortcut: Ctrl+A (secret shortcut) - only for verified admins
      if (e.ctrlKey && !e.shiftKey && !e.metaKey && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        if (isAdmin) {
          setShowAdminPanel(prev => !prev);
        }
        return;
      }

      // Close admin panel with Escape
      if (e.key === 'Escape' && showAdminPanel) {
        setShowAdminPanel(false);
        return;
      }

      // Disable F12, Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+U
      if (
        e.key === 'F12' ||
        (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'J')) ||
        (e.ctrlKey && e.key === 'u')
      ) {
        e.preventDefault();
        return false;
      }
    };

    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isAdmin, showAdminPanel]);

  // Auto-scroll to bottom on new messages (robust for streaming + mobile)
  useEffect(() => {
    const scrollToBottom = () => {
      if (viewportRef.current) {
        viewportRef.current.scrollTop = viewportRef.current.scrollHeight;
      }
    };
    // Use requestAnimationFrame for smooth scrolling
    const id = requestAnimationFrame(scrollToBottom);
    return () => cancelAnimationFrame(id);
  }, [messages, isLoading]);

  // Optimized streaming with batched updates to prevent UI freezing
  const streamChat = useCallback(async (newMessages: Message[], actionType?: ActionType) => {
    setIsLoading(true);
    let assistantContent = "";
    let updateCounter = 0;
    let pendingUpdate = false;

    // Flush UI update
    const flushUpdate = () => {
      if (pendingUpdate) {
        const currentContent = assistantContent;
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === "assistant") {
            return prev.map((m, i) =>
              i === prev.length - 1 ? { ...m, content: currentContent } : m
            );
          }
          return [...prev, { role: "assistant", content: currentContent }];
        });
        pendingUpdate = false;
      }
    };

    try {
      // If offline, use Ollama local model
      if (!isOnline) {
        if (!import.meta.env.VITE_OLLAMA_URL) {
          throw new Error("VITE_OLLAMA_URL is not set. Configure Ollama endpoint.");
        }
        const ollamaUrl = import.meta.env.VITE_OLLAMA_URL;
        const response = await fetch(ollamaUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "llama3.1:8b",
            prompt: newMessages.map(m => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`).join("\n"),
            stream: true,
          }),
        });
        if (!response.ok) throw new Error(`Ollama request failed: ${response.status}`);
        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        const flushInterval = setInterval(flushUpdate, 50);
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            let newlineIdx;
            while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
              let line = buffer.slice(0, newlineIdx);
              buffer = buffer.slice(newlineIdx + 1);
              if (line.trim() === "") continue;
              try {
                const data = JSON.parse(line);
                if (data.response) {
                  assistantContent += data.response;
                  pendingUpdate = true;
                  updateCounter++;
                  if (updateCounter % STREAM_BATCH_SIZE === 0) flushUpdate();
                }
              } catch {}
            }
          }
        } finally {
          clearInterval(flushInterval);
          flushUpdate();
        }
        return;
      }

      // Online path – existing Supabase Gemini call (unchanged)
      // Get the user's session token for authenticated API calls
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error("Not authenticated");
      }

      const response = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ messages: newMessages, actionType, customSystemPrompt }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to get response");
      }

      if (!response.body) {
        throw new Error("No response body");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      // Set up periodic flush for smooth updates (every 50ms)
      const flushInterval = setInterval(flushUpdate, 50);

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          let newlineIndex: number;
          while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
            let line = buffer.slice(0, newlineIndex);
            buffer = buffer.slice(newlineIndex + 1);

            if (line.endsWith("\r")) line = line.slice(0, -1);
            if (line.startsWith(":") || line.trim() === "") continue;
            if (!line.startsWith("data: ")) continue;

            const jsonStr = line.slice(6).trim();
            if (jsonStr === "[DONE]") break;

            try {
              const parsed = JSON.parse(jsonStr);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                assistantContent += content;
                pendingUpdate = true;
                updateCounter++;

                // Immediate update every STREAM_BATCH_SIZE chunks for responsiveness
                if (updateCounter % STREAM_BATCH_SIZE === 0) {
                  flushUpdate();
                }
              }
            } catch {
              buffer = line + "\n" + buffer;
              break;
            }
          }
        }
      } finally {
        clearInterval(flushInterval);
        // Final flush to ensure all content is displayed
        flushUpdate();
      }
    } catch (error) {
      console.error("Chat error:", error);
      toast({
        title: "Oops!",
        description: error instanceof Error ? error.message : "Something went wrong. Please try again!",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
      setCurrentAction(null);
    }
  }, [customSystemPrompt, toast, isOnline]);

  // Save session to database
  const saveSession = async (msgs: Message[]) => {
    if (!user || msgs.length === 0) return;

    const simplifiedMessages = msgs.map(m => ({ role: m.role, content: m.content }));
    const title = generateTitle(simplifiedMessages);
    const subject = detectSubject(simplifiedMessages);

    try {
      if (currentSessionId) {
        // Update existing session
        await supabase
          .from('chat_sessions')
          .update({
            messages: simplifiedMessages,
            title,
            subject,
            updated_at: new Date().toISOString()
          })
          .eq('id', currentSessionId);
      } else {
        // Create new session
        const { data, error } = await supabase
          .from('chat_sessions')
          .insert({
            user_id: user.id,
            messages: simplifiedMessages,
            title,
            subject
          })
          .select('id')
          .single();

        if (!error && data) {
          setCurrentSessionId(data.id);
        }
      }
    } catch (error) {
      console.error('Error saving session:', error);
    }
  };

  const handleSend = async (content: string, stickerText?: string, stickerType?: "sticker") => {
    let finalContent = content;
    let finalType: "image" | "pdf" | "sticker" | undefined = undefined;
    let finalUrls: string[] | undefined = undefined;

    if (stickerType === "sticker") {
      finalContent = stickerText || "";
      finalType = "sticker";
    } else if (fileType === "pdf") {
      finalContent = content || `Sharing: ${fileName}`;
      finalType = "pdf";
    } else if (fileType === "image") {
      finalContent = content || (fileDatas.length > 1 ? "What's in these images?" : "What's in this image?");
      finalType = "image";
      finalUrls = fileDatas;
    }

    const userMessage: Message = {
      role: "user",
      content: finalContent,
      imageUrl: finalType === "image" ? (finalUrls ? finalUrls[0] : undefined) : undefined,
      imageUrls: finalUrls,
      fileType: finalType,
      fileName: fileType === "pdf" ? (fileName || undefined) : undefined,
    };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    clearFiles();

    // Don't send stickers to AI, they're just visual
    if (finalType !== "sticker") {
      await streamChat(newMessages, currentAction || undefined);
    }
  };

  const saveFlashcardsFromAI = async (flashcardsText: string) => {
    if (!user) return;
    try {
      const cards = flashcardsText.split('---').map(block => {
        const lines = block.trim().split('\n');
        const front = lines.find(l => l.startsWith('F:'))?.replace('F:', '').trim() || "";
        const back = lines.find(l => l.startsWith('B:'))?.replace('B:', '').trim() || "";
        return { front, back };
      }).filter(c => c.front && c.back);

      if (cards.length === 0) throw new Error("No cards found in text");

      // Determine a title for the set
      const title = messages[messages.length - 2]?.content.substring(0, 30) + "..." || "AI Generated Set";

      const { data: set, error: setError } = await (supabase as any)
        .from('flashcard_sets')
        .insert({
          user_id: user.id,
          title,
          subject: messages.length > 2 ? detectSubject(messages.map(m => ({ role: m.role, content: m.content }))) : "General"
        })
        .select()
        .single();

      if (setError) throw setError;

      const { error: cardsError } = await (supabase as any)
        .from('flashcards')
        .insert(cards.map(c => ({
          set_id: set.id,
          front_content: c.front,
          back_content: c.back
        })));

      if (cardsError) throw cardsError;

      toast({
        title: "Flashcards saved! 📚",
        description: `Saved ${cards.length} cards to your collection.`
      });
      setShowFlashcards(true); // Open flashcards to see the new set
    } catch (error) {
      console.error("Save error:", error);
      toast({ title: "Failed to save flashcards", variant: "destructive" });
    }
  };

  // Save session when messages change (debounced - longer delay to reduce DB calls)
  useEffect(() => {
    // Only save when not loading and there are messages with at least one assistant response
    const hasAssistantMessage = messages.some(m => m.role === "assistant");
    if (messages.length > 0 && !isLoading && hasAssistantMessage) {
      const timeout = setTimeout(() => {
        saveSession(messages);
      }, 2000); // Increased debounce to 2 seconds for better performance
      return () => clearTimeout(timeout);
    }
  }, [messages, isLoading]);

  const handleLoadSession = (loadedMessages: any[], sessionId: string) => {
    setMessages(loadedMessages as Message[]);
    setCurrentSessionId(sessionId);
  };

  const getActiveOptions = (content: string) => {
    if (content.includes("[QUIZ_QUESTION]")) {
      const match = content.match(/\[QUIZ_QUESTION\]([\s\S]*?)\[END_QUIZ\]/);
      if (match) {
        const lines = match[1].trim().split("\n");
        const options = lines.slice(1).filter(l => l.trim() !== "");
        return { type: 'quiz' as const, options };
      }
    }
    if (content.includes("[FLASHCARDS_START]")) {
      const match = content.match(/\[FLASHCARDS_START\]([\s\S]*?)\[FLASHCARDS_END\]/);
      return { type: 'flashcards' as const, content: match ? match[1] : "" };
    }
    return null;
  };

  const lastMessage = messages[messages.length - 1];
  const activeOptions = !isLoading && lastMessage?.role === "assistant" ? getActiveOptions(lastMessage.content) : null;

  const handleNewChat = () => {
    setMessages([]);
    setCurrentSessionId(null);
  };

  const handleQuickAction = async (action: ActionType, prompt: string) => {
    if (action === "flashcards") {
      setShowFlashcards(true);
      return;
    }
    setCurrentAction(action);
    toast({
      title: getActionTitle(action),
      description: action === "exam"
        ? "I'll give you direct answers! Send a question or photo."
        : "Tell me what topic you'd like help with!",
    });
  };

  const getActionTitle = (action: ActionType): string => {
    switch (action) {
      case "explain":
        return "📖 Explain Mode";
      case "summary":
        return "📝 Summary Mode";
      case "quiz":
        return "❓ Quiz Mode";
      case "homework":
        return "📚 Homework Help";
      case "exam":
        return "🎓 Exam Mode";
      default:
        return "";
    }
  };

  // Show loading while checking auth
  if (authLoading) {
    return (
      <div className="fixed inset-0 z-50 bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Show auth screen if not logged in
  if (!user) {
    return <AuthScreen />;
  }

  // Offline mode UI
  if (!isOnline) {
    return (
      <div className="fixed inset-0 bg-black text-white flex flex-col items-center justify-center p-4">
        <p className="mb-4 text-center">We are offline. Ask my rabbit brain what to do.</p>
        <textarea
          className="w-full max-w-2xl p-2 bg-gray-800 text-white rounded mb-2"
          placeholder="Type your question here..."
          rows={4}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              const target = e.target as HTMLTextAreaElement;
              const content = target.value.trim();
              if (content) {
                handleSend(content);
                target.value = '';
              }
            }
          }}
        />
        {/* No buttons, just textarea */}
      </div>
    );
  }

  return (
    <div className="relative flex flex-col h-screen bg-background select-none">
      <OfflineIndicator isOnline={isOnline} />
      <Header />

      {/* Top right: Install + Hamburger only */}
      <div className="absolute top-4 right-4 z-40 flex items-center gap-2">

        <HamburgerMenu
          onOpenProfile={() => setShowProfileSettings(true)}
          onOpenProModal={() => setShowProModal(true)}
          onOpenChatHistory={() => setShowChatHistory(true)}
          onClearHistory={handleNewChat}
          customSystemPrompt={customSystemPrompt}
          onCustomSystemPromptChange={(prompt) => {
            setCustomSystemPrompt(prompt);
            localStorage.setItem('custom_system_prompt', prompt);
          }}
        />
      </div>

      {/* Profile Settings Modal */}
      <ProfileSettings isOpen={showProfileSettings} onClose={() => setShowProfileSettings(false)} />

      {/* Chat History Modal */}
      <ChatHistoryModal
        open={showChatHistory}
        onOpenChange={setShowChatHistory}
        onLoadSession={handleLoadSession}
        onNewChat={handleNewChat}
        currentSessionId={currentSessionId}
      />

      {/* Pro Upgrade Modal */}
      <ProUpgradeModal open={showProModal} onOpenChange={setShowProModal} />


      {/* Admin Panel */}
      <AdminPanel isOpen={showAdminPanel} onClose={() => setShowAdminPanel(false)} />

      {/* Flashcards Fullscreen View */}
      {showFlashcards && (
        <div className="fixed inset-0 z-50 bg-background flex flex-col p-4 animate-in fade-in slide-in-from-bottom-4">
          <div className="max-w-4xl mx-auto w-full flex-1 flex flex-col pt-12 pb-8">
            <FlashcardsSection
              onClose={() => setShowFlashcards(false)}
              onCreateFromAI={(mode) => {
                setShowFlashcards(false);
                if (mode === "photo") {
                  toast({ title: "Take or Upload a photo", description: "Use the camera button in chat to create cards!" });
                  setCurrentAction("flashcards");
                } else {
                  handleSend("Create flashcards based on our recent topics!");
                }
              }}
            />
            <Button
              variant="ghost"
              className="absolute top-4 right-4"
              onClick={() => setShowFlashcards(false)}
            >
              Close
            </Button>
          </div>
        </div>
      )}

      {/* Main content with tabs */}
      <div className="flex-1 overflow-hidden min-h-0 flex flex-col">
        {/* Tab Navigation */}
        <div className="px-4 pt-2 flex-shrink-0">
          <div className="grid w-full max-w-md mx-auto grid-cols-3 bg-muted/50 rounded-lg p-1">
            <button
              onClick={() => setActiveTab("chat")}
              className={`flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === "chat"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
                }`}
            >
              <MessageCircle className="w-4 h-4" />
              {t.aiChat}
            </button>
            <button
              onClick={() => setActiveTab("puskice")}
              className={`flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === "puskice"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
                }`}
            >
              <FileText className="w-4 h-4" />
              {t.puskiceTab}
            </button>
            <button
              onClick={() => setActiveTab("messages")}
              className={`flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === "messages"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
                }`}
            >
              <Users className="w-4 h-4" />
              {t.messagesTab}
            </button>
          </div>
        </div>

        {/* Tab Content */}
        {activeTab === "chat" && (
          <div className="flex-1 flex flex-col min-h-0">
            {messages.length === 0 ? (
              <div className="flex-1 flex items-center justify-center p-4">
                <div className="w-full max-w-4xl mx-auto">
                  <WelcomeMessage />
                </div>
              </div>
            ) : (
              <ScrollArea className="flex-1 min-h-0" ref={scrollRef} viewportRef={viewportRef}>
                <div className="w-full max-w-4xl mx-auto space-y-4 p-4 pb-24">
                  {messages.map((message, index) => (
                    <ChatMessage
                      key={index}
                      message={message}
                      onQuizAnswer={(ans) => handleSend(`My answer is ${ans}`)}
                      onSaveFlashcards={saveFlashcardsFromAI}
                    />
                  ))}
                  {isLoading && messages[messages.length - 1]?.role !== "assistant" && (
                    <TypingIndicator />
                  )}
                  <div ref={bottomRef} className="h-1" />
                </div>
              </ScrollArea>
            )}

            {/* Input area - fixed at bottom, never covers content */}
            <div className="flex-shrink-0 border-t border-border bg-card/80 backdrop-blur-sm safe-area-bottom">
              <div className="max-w-4xl mx-auto px-2 py-2 sm:px-4 sm:py-3 space-y-2 sm:space-y-3">
                {/* Action indicator & Interactive Buttons */}
                {(currentAction || activeOptions) && (
                  <div className="flex flex-col items-center gap-2">
                    {/* Mode label */}
                    {currentAction && (
                      <div className={`text-xs font-medium px-3 py-1 rounded-full animate-fade-in ${currentAction === "exam"
                        ? "bg-red-500/20 text-red-400 border border-red-500/30"
                        : "bg-primary/10 text-primary border border-primary/30"
                        }`}>
                        {getActionTitle(currentAction)}
                      </div>
                    )}

                    {/* Interactive Quiz buttons */}
                    {activeOptions?.type === 'quiz' && (
                      <div className="flex flex-wrap gap-2 justify-center animate-in slide-in-from-bottom-2 duration-300">
                        {activeOptions.options.map((opt, i) => {
                          const letterMatch = opt.match(/^([A-C])\)/);
                          const letter = letterMatch ? letterMatch[1] : (i === 0 ? 'A' : i === 1 ? 'B' : 'C');
                          return (
                            <Button
                              key={i}
                              variant="outline"
                              size="sm"
                              onClick={() => handleSend(`My answer is ${letter}`)}
                              className="bg-primary/5 border-primary/20 hover:bg-primary/10 text-primary rounded-full px-4 h-9 shadow-glow-sm"
                            >
                              <span className="font-bold mr-2">{letter}</span>
                              <span className="text-xs truncate max-w-[120px]">{opt.replace(/^[A-C]\)\s*/, '').trim()}</span>
                            </Button>
                          );
                        })}
                      </div>
                    )}

                    {/* Interactive Flashcards button */}
                    {activeOptions?.type === 'flashcards' && (
                      <div className="animate-in slide-in-from-bottom-2 duration-300 w-full max-w-xs mx-auto">
                        <Button
                          size="sm"
                          onClick={() => saveFlashcardsFromAI(activeOptions.content)}
                          className="w-full bg-amber-500 hover:bg-amber-600 text-white rounded-full shadow-glow-sm flex items-center gap-2"
                        >
                          <Sparkles className="w-4 h-4" /> Save to My Flashcards
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                <ChatInput
                  onSend={handleSend}
                  disabled={isLoading}
                  hasFiles={filePreviews.length > 0 || !!fileName}
                  onAddImages={(previews, base64s) => {
                    setFileType("image");
                    setFilePreviews((prev) => [...prev, ...previews]);
                    setFileDatas((prev) => [...prev, ...base64s]);
                  }}
                  onAddPdf={(name, base64) => {
                    setFileType("pdf");
                    setFileName(name);
                    setFileDatas([base64]);
                  }}
                />

                {/* File Previews - pops up above colorful buttons, below text box */}
                {(filePreviews.length > 0 || (fileType === "pdf" && fileName)) && (
                  <div className="flex flex-wrap gap-2 justify-center animate-in slide-in-from-bottom-2 duration-300 pt-1">
                    {fileType === "image" ? (
                      filePreviews.map((preview, i) => (
                        <div key={i} className="relative inline-block">
                          <img
                            src={preview}
                            alt="Selected"
                            className="h-16 w-auto rounded-lg border border-primary/20 shadow-soft"
                          />
                          <button
                            type="button"
                            className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-red-500 text-white flex items-center justify-center text-xs font-bold shadow-md hover:bg-red-600 transition-colors"
                            onClick={() => {
                              const newPreviews = [...filePreviews];
                              newPreviews.splice(i, 1);
                              const newDatas = [...fileDatas];
                              newDatas.splice(i, 1);
                              setFilePreviews(newPreviews);
                              setFileDatas(newDatas);
                              if (newPreviews.length === 0) {
                                setFileType(null);
                              }
                            }}
                          >
                            ×
                          </button>
                        </div>
                      ))
                    ) : (
                      <div className="relative inline-block">
                        <div className="flex items-center gap-2 px-3 py-2 bg-muted rounded-lg border border-primary/20">
                          <span className="text-lg">📄</span>
                          <span className="text-sm font-medium truncate max-w-[150px]">{fileName}</span>
                        </div>
                        <button
                          type="button"
                          className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-red-500 text-white flex items-center justify-center text-xs font-bold shadow-md hover:bg-red-600 transition-colors"
                          onClick={clearFiles}
                        >
                          ×
                        </button>
                      </div>
                    )}
                  </div>
                )}

                <QuickActions onAction={handleQuickAction} disabled={isLoading} />
              </div>
            </div>
          </div>
        )}

        {activeTab === "puskice" && (
          <div className="flex-1 overflow-auto p-4">
            <PuskiceSection />
          </div>
        )}

        {activeTab === "messages" && (
          <div className="flex-1 min-h-0 overflow-hidden p-4">
            <DirectChat />
          </div>
        )}
      </div>
    </div>
  );
});

Home.displayName = "Home";

export default Home;
