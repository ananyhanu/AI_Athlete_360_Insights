import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Activity, Lock, Mail } from "lucide-react";
import { useState, type FormEvent } from "react";
import { ApiError } from "@/lib/api-client";
import { authenticateWithPassword } from "@/lib/authentication-service";
import { assessmentApiBaseUrl } from "@/lib/assessment-sync-runtime";
import { startAuthenticatedSession, startPrototypeCoachSession } from "@/lib/prototype-session";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Coach Login — AI Athlete 360" },
      {
        name: "description",
        content: "Sign in to AI Athlete 360 to manage athletes and fitness assessments.",
      },
      { property: "og:title", content: "Coach Login — AI Athlete 360" },
      { property: "og:description", content: "Sign in to manage athletes and assessments." },
    ],
  }),
  component: Login,
});

function Login() {
  const navigate = useNavigate();
  const apiBaseUrl = assessmentApiBaseUrl();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const formData = new FormData(e.currentTarget);
    const email = formData.get("email");
    const password = formData.get("password");

    try {
      if (typeof email !== "string" || typeof password !== "string") return;
      if (!apiBaseUrl) {
        startPrototypeCoachSession(email);
      } else {
        const authenticated = await authenticateWithPassword({ baseUrl: apiBaseUrl, email, password });
        startAuthenticatedSession({
          accessToken: authenticated.accessToken,
          email: authenticated.user.email,
          roles: authenticated.user.roles,
        });
      }
      await navigate({ to: "/dashboard" });
    } catch (caught) {
      setError(
        caught instanceof ApiError && caught.code === "invalid_credentials"
          ? "Email or password is incorrect."
          : "Sign in could not be completed. Check the service connection and try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="bg-gradient-primary px-6 pb-14 pt-16 text-primary-foreground">
        <div className="mx-auto max-w-md">
          <div className="grid size-14 place-items-center rounded-2xl bg-primary-foreground/15">
            <Activity className="size-7" />
          </div>
          <h1 className="mt-5 text-3xl font-bold">Welcome back</h1>
          <p className="mt-1 text-sm text-primary-foreground/80">
            Coach sign in to AI Athlete 360
          </p>
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        method="post"
        className="mx-auto -mt-8 w-full max-w-md rounded-3xl bg-card p-6 shadow-card"
      >
        <label className="block text-sm font-semibold text-foreground" htmlFor="email">
          Email
        </label>
        <div className="mt-2 flex items-center gap-3 rounded-2xl border border-border bg-secondary px-4">
          <Mail className="size-5 shrink-0 text-muted-foreground" />
          <input
            id="email"
            name="email"
            type="email"
            required
            placeholder="coach@sports.gov.in"
            className="h-14 w-full min-w-0 bg-transparent text-base outline-none placeholder:text-muted-foreground"
          />
        </div>

        <label className="mt-5 block text-sm font-semibold text-foreground" htmlFor="password">
          Password
        </label>
        <div className="mt-2 flex items-center gap-3 rounded-2xl border border-border bg-secondary px-4">
          <Lock className="size-5 shrink-0 text-muted-foreground" />
          <input
            id="password"
            name="password"
            type="password"
            required
            placeholder="••••••••"
            className="h-14 w-full min-w-0 bg-transparent text-base outline-none placeholder:text-muted-foreground"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="bg-gradient-primary mt-8 h-14 w-full rounded-2xl text-base font-semibold text-primary-foreground shadow-card transition-transform active:scale-[0.98] disabled:opacity-70"
        >
          {loading ? "Signing in…" : "Login"}
        </button>
        {error ? (
          <p className="mt-4 text-center text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        <p className="mt-4 text-center text-xs text-muted-foreground">
          {apiBaseUrl
            ? "Your session expires automatically and is cleared when the browser session ends."
            : "Local prototype session only. Configure the assessment API to verify credentials."}
        </p>
      </form>
    </div>
  );
}
