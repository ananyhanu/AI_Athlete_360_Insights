import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Building2, Chrome, KeyRound, Lock, Mail, Phone, UserPlus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { ApiError } from "@/lib/api-client";
import {
  authenticateWithPassword,
  registerCoach,
  requestMobileOtp,
  verifyMobileOtp,
} from "@/lib/authentication-service";
import type { AppRole } from "@/lib/authorization";
import { assessmentApiBaseUrl } from "@/lib/assessment-sync-runtime";
import { startAuthenticatedSession } from "@/lib/prototype-session";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Coach Sign In — AI Athlete 360" },
      { name: "description", content: "Sign in or register as a verified coach for AI Athlete 360." },
      { property: "og:title", content: "Coach Sign In — AI Athlete 360" },
      { property: "og:description", content: "Secure coach access for athlete assessments." },
    ],
  }),
  component: Login,
});

type AuthMode = "sign-in" | "sign-up";

function Login() {
  const navigate = useNavigate();
  const apiBaseUrl = assessmentApiBaseUrl();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<AuthMode>("sign-in");
  const [pendingSignup, setPendingSignup] = useState<{ email: string; mobileNumber: string } | null>(null);
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);

  async function completeSession(accessToken: string, email: string, roles: readonly AppRole[]) {
    startAuthenticatedSession({ accessToken, email, roles });
    await navigate({ to: "/dashboard" });
  }

  async function handlePasswordLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const formData = new FormData(event.currentTarget);
    const email = formData.get("email");
    const password = formData.get("password");

    try {
      if (typeof email !== "string" || typeof password !== "string") return;
      if (!apiBaseUrl) throw new Error("The assessment API is not configured.");
      const authenticated = await authenticateWithPassword({ baseUrl: apiBaseUrl, email, password });
      await completeSession(authenticated.accessToken, authenticated.user.email, authenticated.user.roles);
    } catch (caught) {
      setError(authenticationError(caught));
    } finally {
      setLoading(false);
    }
  }

  async function handleSignup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!apiBaseUrl) {
      setError("Verified account signup requires a configured assessment API.");
      return;
    }
    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "");
    const mobileNumber = String(formData.get("mobileNumber") ?? "");
    const password = String(formData.get("password") ?? "");
    const confirmPassword = String(formData.get("confirmPassword") ?? "");
    if (password !== confirmPassword) {
      setError("The password confirmation does not match.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await registerCoach({ baseUrl: apiBaseUrl, email, mobileNumber, password });
      setPendingSignup({ email, mobileNumber });
      setOtpSent(false);
    } catch (caught) {
      setError(authenticationError(caught));
    } finally {
      setLoading(false);
    }
  }

  async function sendOtp() {
    if (!apiBaseUrl || !pendingSignup) return;
    setLoading(true);
    setError(null);
    try {
      const response = await requestMobileOtp({
        baseUrl: apiBaseUrl,
        email: pendingSignup.email,
        mobileNumber: pendingSignup.mobileNumber,
      });
      setOtp(response.developmentOtp ?? "");
      setOtpSent(true);
    } catch (caught) {
      setError(authenticationError(caught));
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!apiBaseUrl || !pendingSignup) return;
    setLoading(true);
    setError(null);
    try {
      const authenticated = await verifyMobileOtp({ baseUrl: apiBaseUrl, email: pendingSignup.email, otp });
      await completeSession(authenticated.accessToken, authenticated.user.email, authenticated.user.roles);
    } catch (caught) {
      setError(authenticationError(caught));
    } finally {
      setLoading(false);
    }
  }

  function startProvider(provider: "google" | "government") {
    if (!apiBaseUrl) {
      setError("Configure the assessment API before using external sign-in.");
      return;
    }
    window.location.assign(`${apiBaseUrl}/v1/auth/${provider}/start`);
  }

  function switchMode(nextMode: AuthMode) {
    setMode(nextMode);
    setError(null);
    setOtp("");
    setOtpSent(false);
    setPendingSignup(null);
  }

  return (
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(28rem,0.85fr)]">
      <aside className="relative hidden overflow-hidden bg-foreground lg:block">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: "url('/images/login-page-run-athlete.png')" }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-foreground/80 via-transparent to-foreground/10" />
        <div className="absolute bottom-10 left-10 max-w-sm text-primary-foreground">
          <span className="inline-flex items-center gap-2 border-l-4 border-primary bg-foreground/90 px-4 py-2 text-xs font-bold uppercase tracking-wide">
            <img src="/images/ai-athlete-logo.png" alt="" className="size-4 rounded-sm object-cover" />
            AI Athlete 360
          </span>
          <p className="mt-4 text-2xl font-bold">Turn every assessment into a coach-ready decision.</p>
        </div>
      </aside>

      <div className="flex min-h-screen flex-col">
        <div className="relative overflow-hidden border-b-4 border-primary bg-foreground px-6 pb-16 pt-14 text-primary-foreground">
          <div
            className="absolute inset-0 bg-cover bg-center lg:hidden"
            style={{ backgroundImage: "url('/images/login-page-run-athlete.png')" }}
          />
          <div className="absolute inset-0 bg-foreground/80 lg:hidden" />
          <div className="relative mx-auto max-w-md">
            <img
              src="/images/ai-athlete-logo.png"
              alt="AI Athlete Assessment logo"
              className="size-14 rounded-md object-cover shadow-card"
            />
            <h1 className="mt-5 text-3xl font-bold">Coach access</h1>
            <p className="mt-1 text-sm text-primary-foreground/80">AI Athlete 360 assessment workspace</p>
          </div>
        </div>

        <main className="mx-auto -mt-9 w-full max-w-md px-4 pb-8 lg:my-auto lg:py-10">
          <section className="border border-border bg-card p-6 shadow-card">
          {!pendingSignup ? (
            <>
              <div className="grid grid-cols-2 rounded-xl bg-secondary p-1">
                <button type="button" onClick={() => switchMode("sign-in")} className={tabClass(mode === "sign-in")}>
                  Sign in
                </button>
                <button type="button" onClick={() => switchMode("sign-up")} className={tabClass(mode === "sign-up")}>
                  Create account
                </button>
              </div>

              {mode === "sign-in" ? (
                <form onSubmit={handlePasswordLogin} className="mt-6">
                  <AuthField icon={<Mail className="size-5" />} id="email" label="Email address">
                    <input id="email" name="email" type="email" required placeholder="coach@sports.gov.in" className={inputClass} />
                  </AuthField>
                  <AuthField icon={<Lock className="size-5" />} id="password" label="Password">
                    <input id="password" name="password" type="password" required minLength={12} placeholder="Enter your password" className={inputClass} />
                  </AuthField>
                  <button type="submit" disabled={loading} className={primaryButtonClass}>
                    {loading ? "Signing in..." : "Sign in with email"}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleSignup} className="mt-6">
                  <AuthField icon={<Mail className="size-5" />} id="signup-email" label="Work email">
                    <input id="signup-email" name="email" type="email" required placeholder="coach@sports.gov.in" className={inputClass} />
                  </AuthField>
                  <AuthField icon={<Phone className="size-5" />} id="mobile-number" label="Mobile number with country code">
                    <input id="mobile-number" name="mobileNumber" type="tel" inputMode="tel" required pattern="\+\d{8,15}" title="Include the country code, for example +919876543210." placeholder="+919876543210" className={inputClass} />
                  </AuthField>
                  <AuthField icon={<Lock className="size-5" />} id="signup-password" label="Create password">
                    <input id="signup-password" name="password" type="password" required minLength={12} placeholder="At least 12 characters" className={inputClass} />
                  </AuthField>
                  <AuthField icon={<Lock className="size-5" />} id="confirm-password" label="Confirm password">
                    <input id="confirm-password" name="confirmPassword" type="password" required minLength={12} placeholder="Re-enter your password" className={inputClass} />
                  </AuthField>
                  <button type="submit" disabled={loading} className={primaryButtonClass}>
                    <UserPlus className="size-5" />
                    {loading ? "Creating account..." : "Create verified coach account"}
                  </button>
                </form>
              )}

              <ProviderButtons onProvider={startProvider} />
            </>
          ) : (
            <section>
              <div className="grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary">
                <KeyRound className="size-6" />
              </div>
              <h2 className="mt-4 text-xl font-bold">Verify your account</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                A verification link was sent to {pendingSignup.email}. You can also verify this account with the mobile number ending in {pendingSignup.mobileNumber.slice(-4)}.
              </p>
              {!otpSent ? (
                <button type="button" disabled={loading} onClick={() => void sendOtp()} className={primaryButtonClass}>
                  <Phone className="size-5" />
                  {loading ? "Sending code..." : "Send mobile OTP"}
                </button>
              ) : (
                <form onSubmit={verifyOtp} className="mt-5">
                  <AuthField icon={<KeyRound className="size-5" />} id="otp" label="Six-digit mobile OTP">
                    <input id="otp" value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" required pattern="\d{6}" placeholder="123456" className={inputClass} />
                  </AuthField>
                  <button type="submit" disabled={loading || otp.length !== 6} className={primaryButtonClass}>
                    {loading ? "Verifying..." : "Verify OTP and continue"}
                  </button>
                  <button type="button" disabled={loading} onClick={() => void sendOtp()} className="mt-3 w-full text-sm font-semibold text-primary">
                    Send a new code
                  </button>
                </form>
              )}
              <button type="button" onClick={() => switchMode("sign-in")} className="mt-5 w-full text-sm font-semibold text-muted-foreground">
                Back to sign in
              </button>
            </section>
          )}

          {error ? <p className="mt-5 text-sm font-medium text-destructive" role="alert">{error}</p> : null}
          <p className="mt-5 text-center text-xs text-muted-foreground">
            {apiBaseUrl
              ? "Email links, mobile OTP, and external identity providers are verified by the configured assessment API."
              : "Local prototype session only. Configure the assessment API to enable verified accounts and external sign-in."}
          </p>
          </section>
        </main>
      </div>
    </div>
  );
}

function ProviderButtons({ onProvider }: { onProvider: (provider: "google" | "government") => void }) {
  return (
    <div className="mt-6 border-t border-border pt-5">
      <p className="text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">or continue with</p>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <button type="button" onClick={() => onProvider("google")} className={providerButtonClass}>
          <Chrome className="size-5 text-destructive" />
          Google
        </button>
        <button type="button" onClick={() => onProvider("government")} className={providerButtonClass}>
          <Building2 className="size-5 text-primary" />
          Government SSO
        </button>
      </div>
    </div>
  );
}

function AuthField({ children, icon, id, label }: { children: React.ReactNode; icon: React.ReactNode; id: string; label: string }) {
  return (
    <label className="mt-4 block text-sm font-semibold text-foreground" htmlFor={id}>
      {label}
      <span className="mt-2 flex items-center gap-3 rounded-xl border border-border bg-secondary px-4 text-muted-foreground">
        {icon}
        {children}
      </span>
    </label>
  );
}

function authenticationError(error: unknown) {
  if (!(error instanceof ApiError)) return "Sign-in could not be completed. Check the service connection and try again.";
  if (error.code === "invalid_credentials") return "Email or password is incorrect.";
  if (error.code === "verification_required") return "Verify your email link or mobile OTP before signing in.";
  if (error.code?.endsWith("not_configured")) return "This sign-in provider has not been configured for this deployment.";
  return error.message;
}

function tabClass(active: boolean) {
  return `h-10 rounded-lg text-sm font-semibold ${active ? "bg-card text-primary shadow-sm" : "text-muted-foreground"}`;
}

const inputClass = "h-14 w-full min-w-0 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground";
const primaryButtonClass = "bg-gradient-primary mt-6 flex h-14 w-full items-center justify-center gap-2 rounded-xl text-base font-semibold text-primary-foreground shadow-card transition-transform active:scale-[0.98] disabled:opacity-70";
const providerButtonClass = "flex h-12 items-center justify-center gap-2 rounded-xl border border-border bg-card text-sm font-semibold text-foreground shadow-sm transition-colors hover:bg-secondary";
