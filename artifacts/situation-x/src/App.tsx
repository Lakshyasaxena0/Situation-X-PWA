import { useEffect, useRef } from "react";
import { ClerkProvider, SignIn, SignUp, Show, useClerk } from "@clerk/react";
import { Switch, Route, useLocation, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/landing";
import Oracle from "@/pages/oracle";
import History from "@/pages/history";
import Feedback from "@/pages/feedback";
import Pricing from "@/pages/pricing";
import Invite from "@/pages/invite";
import Settings from "@/pages/settings";
import { clearAnalysisSession } from "@/lib/analysisSession";
import { ReferralRedeemer } from "@/components/ReferralRedeemer";
import { capturePendingReferral } from "@/lib/referralLink";

// An invite link (?ref=CODE) is remembered before sign-up and applied right after sign-in.
capturePendingReferral();

const queryClient = new QueryClient();

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

if (!clerkPubKey) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY");
}

function SignInPage() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
    </div>
  );
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const qc = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    // Clear the cached data and the last analysis only when a signed-in person signs out or another
    // account takes over. Signing in (or the first load of the page, when the user is not known yet)
    // must never wipe the analysis on screen.
    const unsubscribe = addListener(({ user, session }) => {
      const userId = user?.id ?? null;
      const prev = prevUserIdRef.current;
      const switched = typeof prev === "string" && typeof userId === "string" && prev !== userId;
      const signedOut = typeof prev === "string" && userId === null && !session;
      if (switched || signedOut) {
        qc.clear();
        clearAnalysisSession();
      }
      if (userId !== null || signedOut) prevUserIdRef.current = userId;
      else if (prev === undefined) prevUserIdRef.current = null;
    });
    return unsubscribe;
  }, [addListener, qc]);

  return null;
}

function HomeRedirect() {
  return (
    <>
      <Show when="signed-in">
        <Redirect to="/oracle" />
      </Show>
      <Show when="signed-out">
        <Landing />
      </Show>
    </>
  );
}

function OraclePage() {
  return (
    <>
      <Show when="signed-in">
        <Oracle />
      </Show>
      <Show when="signed-out">
        <Redirect to="/" />
      </Show>
    </>
  );
}

function HistoryPage() {
  return (
    <>
      <Show when="signed-in">
        <History />
      </Show>
      <Show when="signed-out">
        <Redirect to="/" />
      </Show>
    </>
  );
}

function FeedbackPage() {
  return (
    <>
      <Show when="signed-in">
        <Feedback />
      </Show>
      <Show when="signed-out">
        <Redirect to="/" />
      </Show>
    </>
  );
}

function PricingPage() {
  return (
    <>
      <Show when="signed-in">
        <Pricing />
      </Show>
      <Show when="signed-out">
        <Redirect to="/" />
      </Show>
    </>
  );
}

function InvitePage() {
  return (
    <>
      <Show when="signed-in">
        <Invite />
      </Show>
      <Show when="signed-out">
        <Redirect to="/" />
      </Show>
    </>
  );
}

function SettingsPage() {
  return (
    <>
      <Show when="signed-in">
        <Settings />
      </Show>
      <Show when="signed-out">
        <Redirect to="/" />
      </Show>
    </>
  );
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl || undefined}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <ClerkQueryClientCacheInvalidator />
          <Show when="signed-in">
            <ReferralRedeemer />
          </Show>
          <Switch>
            <Route path="/" component={HomeRedirect} />
            <Route path="/oracle" component={OraclePage} />
            <Route path="/history" component={HistoryPage} />
            <Route path="/feedback" component={FeedbackPage} />
            <Route path="/pricing" component={PricingPage} />
            <Route path="/invite" component={InvitePage} />
            <Route path="/settings" component={SettingsPage} />
            <Route path="/sign-in/*?" component={SignInPage} />
            <Route path="/sign-up/*?" component={SignUpPage} />
            <Route component={NotFound} />
          </Switch>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}

export default App;
