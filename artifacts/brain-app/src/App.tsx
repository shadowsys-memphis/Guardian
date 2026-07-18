import { Switch, Route, Router as WouterRouter, Redirect, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { PopsView } from "@/pages/pops-view";
import { AdminView } from "@/pages/admin-view";
import { JessicaView } from "@/pages/jessica-view";
import { JessicaPhone } from "@/pages/jessica-phone";
import { ShopperView } from "@/pages/shopper-view";
import { DoctorReport } from "@/pages/doctor-report";
import { GuardianPage } from "@/pages/guardian";
import { GuardianSuccessPage } from "@/pages/guardian-success";
import { MySubscriptionPage } from "@/pages/my-subscription";
import { VaultGate } from "@/pages/vault-gate";
import { SettingsView } from "@/pages/settings-view";
import { VaultProvider, useVault } from "@/lib/vault-context";
import { Home, Phone, ShoppingCart, ShieldAlert, CreditCard } from "lucide-react";

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
  { path: "/shopper", label: "Shopper", icon: <ShoppingCart size={20} /> },
  { path: "/admin", label: "Admin", icon: <ShieldAlert size={20} /> },
  { path: "/my-subscription", label: "Plan", icon: <CreditCard size={20} /> },
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

function PrivateWorkspace() {
  const { isUnlocked } = useVault();

  if (!isUnlocked) {
    return <VaultGate>{null}</VaultGate>;
  }

  return (
    <div className="pb-16">
      <Switch>
        <Route path="/">
          <Redirect to="/pops" />
        </Route>
        <Route path="/pops" component={PopsView} />
        <Route path="/jessica" component={JessicaPhone} />
        <Route path="/shopper" component={ShopperView} />
        <Route path="/admin" component={AdminView} />
        <Route path="/admin/report" component={DoctorReport} />
        <Route path="/scripts" component={JessicaView} />
        <Route path="/my-subscription" component={MySubscriptionPage} />
        <Route path="/settings" component={SettingsView} />
        <Route component={NotFound} />
      </Switch>
      <BottomNav />
    </div>
  );
}

function AppContent() {
  return (
    <Switch>
      <Route path="/guardian" component={GuardianPage} />
      <Route path="/guardian/success" component={GuardianSuccessPage} />
      <Route>
        <PrivateWorkspace />
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <VaultProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <AppContent />
          </WouterRouter>
          <Toaster />
        </VaultProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
