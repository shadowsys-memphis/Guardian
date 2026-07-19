import { lazy, Suspense } from "react";
import { Switch, Route, Router as WouterRouter, Redirect, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { GuardianPage } from "@/pages/guardian";
import { GuardianSuccessPage } from "@/pages/guardian-success";
import { VaultGate } from "@/pages/vault-gate";
import { VaultProvider, useVault } from "@/lib/vault-context";
import { Home, Phone, ShoppingCart, ShieldAlert, CreditCard } from "lucide-react";

const PopsView = lazy(() =>
  import("@/pages/pops-view").then((m) => ({ default: m.PopsView }))
);
const AdminView = lazy(() =>
  import("@/pages/admin-view").then((m) => ({ default: m.AdminView }))
);
const JessicaView = lazy(() =>
  import("@/pages/jessica-view").then((m) => ({ default: m.JessicaView }))
);
const JessicaPhone = lazy(() =>
  import("@/pages/jessica-phone").then((m) => ({ default: m.JessicaPhone }))
);
const ShopperView = lazy(() =>
  import("@/pages/shopper-view").then((m) => ({ default: m.ShopperView }))
);
const DoctorReport = lazy(() =>
  import("@/pages/doctor-report").then((m) => ({ default: m.DoctorReport }))
);
const MySubscriptionPage = lazy(() =>
  import("@/pages/my-subscription").then((m) => ({
    default: m.MySubscriptionPage,
  }))
);
const SettingsView = lazy(() =>
  import("@/pages/settings-view").then((m) => ({ default: m.SettingsView }))
);

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
  const [location] = useLocation();

  if (!isUnlocked) {
    return <VaultGate>{null}</VaultGate>;
  }

  const isFullPageRoute = location.startsWith("/admin");

  return (
    <div className={isFullPageRoute ? undefined : "pb-16"}>
      <Suspense fallback={null}>
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
      </Suspense>
      {!isFullPageRoute && <BottomNav />}
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
