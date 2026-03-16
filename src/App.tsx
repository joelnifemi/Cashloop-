import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect } from "react";
import Dashboard  from "./pages/dashboard";
import SpinPage   from "./pages/spin";
import AdminPage  from "./pages/admin";
import LoginPage  from "./pages/login";
import SignupPage from "./pages/signup";
import { isLoggedIn, clearAuth } from "./lib/auth";
import { supabase } from "./lib/supabase";

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } },
});

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const [, setLocation] = useLocation();
  useEffect(() => { if (!isLoggedIn()) setLocation("/login"); }, [setLocation]);
  if (!isLoggedIn()) return null;
  return <Component />;
}

// Keep local token in sync with Supabase session
function AuthSync() {
  const [, setLocation] = useLocation();
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT" || event === "TOKEN_REFRESHED") {
        if (event === "SIGNED_OUT") {
          clearAuth();
          setLocation("/login");
        }
      }
    });
    return () => subscription.unsubscribe();
  }, [setLocation]);
  return null;
}

function Router() {
  return (
    <>
      <AuthSync />
      <Switch>
        <Route path="/login"          component={LoginPage} />
        <Route path="/signup"         component={SignupPage} />
        <Route path="/admin-cashloop" component={AdminPage} />
        <Route path="/spin">
          {() => <ProtectedRoute component={SpinPage} />}
        </Route>
        <Route path="/">
          {() => <ProtectedRoute component={Dashboard} />}
        </Route>
      </Switch>
    </>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter>
        <Router />
      </WouterRouter>
    </QueryClientProvider>
  );
}
