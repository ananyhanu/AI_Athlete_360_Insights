import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { useAssessmentAutoSync } from "@/hooks/use-assessment-auto-sync";
import { usePrototypeSession } from "@/lib/prototype-session";

type Props = {
  title: string;
  subtitle?: string;
  backTo?: string;
  children: ReactNode;
};

export function AppShell({ title, subtitle, backTo, children }: Props) {
  const navigate = useNavigate();
  const session = usePrototypeSession();
  useAssessmentAutoSync(Boolean(session));

  useEffect(() => {
    if (session === null) navigate({ to: "/login", replace: true });
  }, [navigate, session]);

  if (session === undefined || session === null) {
    return (
      <div className="grid min-h-screen place-items-center bg-background px-5 text-center">
        <p className="text-sm text-muted-foreground">
          {session === undefined ? "Checking local session..." : "Redirecting to local sign in..."}
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-gradient-primary px-5 pb-8 pt-6 text-primary-foreground shadow-card">
        <div className="mx-auto grid max-w-2xl grid-cols-[auto_minmax(0,1fr)] items-center gap-3">
          {backTo ? (
            <Link
              to={backTo}
              aria-label="Go back"
              className="grid size-10 shrink-0 place-items-center rounded-full bg-primary-foreground/15 transition-colors hover:bg-primary-foreground/25"
            >
              <ArrowLeft className="size-5" />
            </Link>
          ) : (
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-foreground/15 font-display text-sm font-bold">
              360
            </span>
          )}
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold">{title}</h1>
            {subtitle ? (
              <p className="truncate text-sm text-primary-foreground/80">{subtitle}</p>
            ) : null}
          </div>
        </div>
      </header>
      <main className="mx-auto -mt-4 max-w-2xl px-5 pb-16">{children}</main>
    </div>
  );
}
