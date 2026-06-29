import { Switch, Route, Router as WouterRouter, Redirect, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { PopsView } from "@/pages/pops-view";
import { AdminView } from "@/pages/admin-view";
import { JessicaView } from "@/pages/jessica-view";
import { JessicaPhone } from "@/pages/jessica-phone";
import { SmartHomePanel } from "@/pages/smart-home";
import { DoctorReport } from "@/pages/doctor-report";
import { Home, Phone, Mic, ShieldAlert } from "lucide-react";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const NAV_ITEMS = [
  { path: "/pops", label: "Home", icon: <Home size={20} /> },
  { path: "/jessica", label: "Jessica", icon: <Phone size={20} /> },
  { path: "/smarthome", label: "Devices", icon: <Mic size={20} /> },
  { path: "/admin", label: "Admin", icon: <ShieldAlert size={20} /> },
];

function BottomNav() {
  const [location, navigate] = useLocation();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border flex items-center">
      {NAV_ITEMS.map((item) => {
        const isActive = location === item.path || (location === "/" && item.path === "/pops");
        return (
          <button
            key={item.path}
            onClick={() => navigate(item.path)}
            className={`flex-1 flex flex-col items-center gap-1 py-3 text-xs font-display uppercase tracking-wider transition-colors ${
              isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {item.icon}
            <span className="hidden md:block">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

function AppContent() {
  return (
    <div className="pb-16">
      <Switch>
        <Route path="/">
          <Redirect to="/pops" />
        </Route>
        <Route path="/pops" component={PopsView} />
        <Route path="/jessica" component={JessicaPhone} />
        <Route path="/smarthome" component={SmartHomePanel} />
        <Route path="/admin" component={AdminView} />
        <Route path="/admin/report" component={DoctorReport} />
        <Route path="/scripts" component={JessicaView} />
        <Route component={NotFound} />
      </Switch>
      <BottomNav />
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AppContent />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
