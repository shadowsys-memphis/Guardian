import { createRoot } from "react-dom/client";
import { lazy, Suspense } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "./index.css";

const GuardianPage = lazy(() =>
  import("@/pages/guardian").then((m) => ({ default: m.GuardianPage }))
);
const GuardianSuccessPage = lazy(() =>
  import("@/pages/guardian-success").then((m) => ({
    default: m.GuardianSuccessPage,
  }))
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function GuardianApp() {
  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
        <Suspense fallback={null}>
          <Switch>
            <Route path="/guardian" component={GuardianPage} />
            <Route path="/guardian/success" component={GuardianSuccessPage} />
          </Switch>
        </Suspense>
      </WouterRouter>
    </QueryClientProvider>
  );
}

createRoot(document.getElementById("root")!).render(<GuardianApp />);
