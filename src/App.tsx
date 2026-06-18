import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
// Browser routing removed – app renders Home directly
import { CustomizationProvider } from "@/context/CustomizationContext";
import { SupabaseAuthProvider } from "@/context/SupabaseAuthContext";
import { LanguageProvider } from "@/context/LanguageContext";
import { PWAUpdateListener } from "@/components/PWAUpdateListener";
import Home from "./pages/Home";
import Admin from "./pages/Admin";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <LanguageProvider>
      <CustomizationProvider>
        <SupabaseAuthProvider>
          <TooltipProvider>
            <PWAUpdateListener />
            <Toaster />
            <Sonner />
                        <Home />
          </TooltipProvider>
        </SupabaseAuthProvider>
      </CustomizationProvider>
    </LanguageProvider>
  </QueryClientProvider>
);

export default App;
