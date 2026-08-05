import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { CheckCircle2, ShieldAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { getAuthenticatedUser } from "@/lib/authentication-service";
import { assessmentApiBaseUrl } from "@/lib/assessment-sync-runtime";
import { startAuthenticatedSession } from "@/lib/prototype-session";

export const Route = createFileRoute("/auth/callback")({
  head: () => ({
    meta: [{ title: "Completing Sign In — AI Athlete 360" }],
  }),
  component: AuthenticationCallback,
});

function AuthenticationCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const apiBaseUrl = assessmentApiBaseUrl();
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const accessToken = fragment.get("access_token");
    const providerError = fragment.get("error");
    window.history.replaceState(null, "", window.location.pathname);

    if (providerError) {
      setError("The external sign-in provider could not complete authentication. Try again or use email sign-in.");
      return;
    }
    if (!apiBaseUrl || !accessToken) {
      setError("The sign-in response is missing or this application is not connected to an assessment API.");
      return;
    }

    let active = true;
    void (async () => {
      try {
        const user = await getAuthenticatedUser({ accessToken, baseUrl: apiBaseUrl });
        if (!active) return;
        startAuthenticatedSession({ accessToken, email: user.email, roles: user.roles });
        await navigate({ to: "/dashboard" });
      } catch {
        if (active) setError("The sign-in session could not be verified. Please start again.");
      }
    })();

    return () => {
      active = false;
    };
  }, [navigate]);

  return (
    <main className="grid min-h-screen place-items-center bg-foreground px-6 py-12 text-primary-foreground">
      <section className="w-full max-w-sm text-center">
        {error ? <ShieldAlert className="mx-auto size-12" /> : <CheckCircle2 className="mx-auto size-12 animate-pulse" />}
        <h1 className="mt-5 text-2xl font-bold">{error ? "Sign-in could not finish" : "Completing secure sign-in"}</h1>
        <p className="mt-3 text-sm text-primary-foreground/85">
          {error ?? "Verifying your identity and opening the coach dashboard."}
        </p>
        {error ? (
          <button
            type="button"
            onClick={() => void navigate({ to: "/login" })}
            className="mt-6 h-12 rounded-xl bg-primary-foreground px-5 text-sm font-semibold text-primary"
          >
            Return to sign in
          </button>
        ) : null}
      </section>
    </main>
  );
}
