import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, BookOpen, Trash2, ChevronLeft, Image as ImageIcon, Sparkles, Brain } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSupabaseAuth } from "@/context/SupabaseAuthContext";
import { useToast } from "@/hooks/use-toast";

interface Flashcard {
    id: string;
    front_content: string;
    back_content: string;
}

interface FlashcardSet {
    id: string;
    title: string;
    subject: string;
    created_at: string;
    cards?: Flashcard[];
}

interface FlashcardsSectionProps {
    onClose: () => void;
    onCreateFromAI: (mode: "auto" | "photo") => void;
}

export const FlashcardsSection = ({ onClose, onCreateFromAI }: FlashcardsSectionProps) => {
    const [sets, setSets] = useState<FlashcardSet[]>([]);
    const [selectedSet, setSelectedSet] = useState<FlashcardSet | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [view, setView] = useState<"list" | "viewer">("list");
    const [currentCardIndex, setCurrentCardIndex] = useState(0);
    const [isFlipped, setIsFlipped] = useState(false);

    const { user } = useSupabaseAuth();
    const { toast } = useToast();

    useEffect(() => {
        fetchSets();
    }, [user]);

    const fetchSets = async () => {
        if (!user) return;
        setIsLoading(true);
        try {
            // Using a very aggressive cast to avoid deep type instantiation errors in the Supabase client
            const supabaseAny = supabase as any;
            const { data, error } = await supabaseAny
                .from("flashcard_sets")
                .select("*, cards:flashcards(*)")
                .eq("user_id", user.id)
                .order("created_at", { ascending: false });

            if (error) throw error;
            setSets((data || []) as any[]);
        } catch (error) {
            console.error("Error fetching flashcard sets:", error);
        } finally {
            setIsLoading(false);
        }
    };

    const deleteSet = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            const { error } = await (supabase as any)
                .from("flashcard_sets")
                .delete()
                .eq("id", id);

            if (error) throw error;
            setSets(sets.filter(s => s.id !== id));
            toast({ title: "Set deleted successfully" });
        } catch (error) {
            toast({ title: "Error deleting set", variant: "destructive" });
        }
    };

    const startStudy = (set: FlashcardSet) => {
        setSelectedSet(set);
        setCurrentCardIndex(0);
        setIsFlipped(false);
        setView("viewer");
    };

    if (view === "viewer" && selectedSet && selectedSet.cards) {
        const currentCard = selectedSet.cards[currentCardIndex];

        return (
            <div className="flex flex-col h-full space-y-4 animate-fade-in">
                <div className="flex items-center justify-between">
                    <Button variant="ghost" size="sm" onClick={() => setView("list")}>
                        <ChevronLeft className="w-4 h-4 mr-1" /> Back
                    </Button>
                    <div className="text-sm font-medium">
                        Card {currentCardIndex + 1} of {selectedSet.cards.length}
                    </div>
                </div>

                <div className="flex-1 flex items-center justify-center p-4">
                    <div
                        className="w-full max-w-sm aspect-[3/4] preserve-3d cursor-pointer transition-transform duration-500 rounded-2xl shadow-xl border border-border bg-card"
                        style={{ transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)' }}
                        onClick={() => setIsFlipped(!isFlipped)}
                    >
                        {/* Front */}
                        <div className={`absolute inset-0 flex items-center justify-center p-8 backface-hidden ${isFlipped ? 'hidden' : 'flex'}`}>
                            <p className="text-xl font-semibold text-center">{currentCard?.front_content}</p>
                        </div>
                        {/* Back */}
                        <div
                            className={`absolute inset-0 flex items-center justify-center p-8 backface-hidden bg-primary text-primary-foreground rounded-2xl ${isFlipped ? 'flex' : 'hidden'}`}
                            style={{ transform: 'rotateY(180deg)' }}
                        >
                            <p className="text-xl font-medium text-center">{currentCard?.back_content}</p>
                        </div>
                    </div>
                </div>

                <div className="flex gap-4 justify-center">
                    <Button
                        variant="outline"
                        disabled={currentCardIndex === 0}
                        onClick={() => {
                            setCurrentCardIndex(prev => prev - 1);
                            setIsFlipped(false);
                        }}
                    >
                        Previous
                    </Button>
                    <Button
                        disabled={currentCardIndex === selectedSet.cards.length - 1}
                        onClick={() => {
                            setCurrentCardIndex(prev => prev + 1);
                            setIsFlipped(false);
                        }}
                    >
                        Next
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full space-y-6 animate-fade-in">
            <div className="flex flex-col space-y-2">
                <h2 className="text-2xl font-bold tracking-tight">Flashcards 📚</h2>
                <p className="text-muted-foreground">Create study cards or review your previous collections.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Button
                    variant="outline"
                    className="h-24 flex flex-col gap-2 border-dashed border-2 hover:border-primary hover:bg-primary/5 transition-all"
                    onClick={() => onCreateFromAI("photo")}
                >
                    <ImageIcon className="w-6 h-6 text-primary" />
                    <span>Create from Photo 📸</span>
                </Button>
                <Button
                    variant="outline"
                    className="h-24 flex flex-col gap-2 border-dashed border-2 hover:border-primary hover:bg-primary/5 transition-all"
                    onClick={() => onCreateFromAI("auto")}
                >
                    <Sparkles className="w-6 h-6 text-amber-500" />
                    <span>AI Auto-Generate ✨</span>
                </Button>
            </div>

            <div className="flex-1 min-h-0 flex flex-col space-y-3">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Your Previous Sets</h3>
                <ScrollArea className="flex-1">
                    {isLoading ? (
                        <div className="flex items-center justify-center p-8">
                            <Sparkles className="w-6 h-6 animate-spin text-muted-foreground" />
                        </div>
                    ) : sets.length === 0 ? (
                        <div className="flex flex-col items-center justify-center p-12 text-center space-y-4 bg-muted/30 rounded-3xl border border-dashed">
                            <Brain className="w-12 h-12 text-muted-foreground/30" />
                            <div className="space-y-1">
                                <p className="font-medium">No flashcards yet</p>
                                <p className="text-sm text-muted-foreground">Ask AI to help you create some!</p>
                            </div>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-3 pb-4">
                            {sets.map((set) => (
                                <Card
                                    key={set.id}
                                    className="group hover:shadow-md transition-all cursor-pointer border-border/50 bg-card/50 backdrop-blur-sm"
                                    onClick={() => startStudy(set)}
                                >
                                    <CardContent className="p-4 flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-primary/10 rounded-lg group-hover:bg-primary/20 transition-colors">
                                                <BookOpen className="w-4 h-4 text-primary" />
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="font-semibold text-sm sm:text-base">{set.title}</span>
                                                <span className="text-xs text-muted-foreground">{(set as any).cards?.length || 0} cards • {set.subject}</span>
                                            </div>
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive hover:bg-destructive/10"
                                            onClick={(e) => deleteSet(set.id, e)}
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    )}
                </ScrollArea>
            </div>
        </div>
    );
};
