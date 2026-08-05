import { createFileRoute, Link } from "@tanstack/react-router";
import { BadgeCheck, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/result")({
  head: () => ({
    meta: [
      { title: "Test Result — AI Athlete 360" },
      {
        name: "description",
        content: "AI generated score, confidence level and verification status for the test.",
      },
      { property: "og:title", content: "Test Result — AI Athlete 360" },
      { property: "og:description", content: "Score, confidence and AI verification status." },
    ],
  }),
  component: Result,
});

function Result() {
  // Placeholder data — replace with FastAPI response
  const score = 82;
  const confidence = 94.6;

  return (
    <AppShell title="Test Result" subtitle="Step 4 of 4" backTo="/camera">
      <div className="bg-gradient-primary rounded-3xl p-8 text-center text-primary-foreground shadow-card">
        <p className="text-xs uppercase tracking-[0.2em] text-primary-foreground/75">Score</p>
        <p className="font-display text-6xl font-extrabold">{score}</p>
        <p className="mt-1 text-sm text-primary-foreground/80">Sit-Ups · 42 valid reps</p>
      </div>

      <div className="mt-3 rounded-2xl bg-card p-5 shadow-card">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-semibold">Confidence</span>
          <span className="font-display text-lg font-bold text-primary">{confidence}%</span>
        </div>
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-secondary">
          <div className="bg-gradient-primary h-full rounded-full" style={{ width: `${confidence}%` }} />
        </div>
      </div>

      <div className="mt-3 flex items-center gap-3 rounded-2xl bg-card p-5 shadow-card">
        <ShieldCheck className="size-6 shrink-0 text-success" />
        <div className="min-w-0">
          <p className="text-sm font-semibold">AI Status</p>
          <p className="truncate text-sm text-muted-foreground">
            Verified — no tampering detected
          </p>
        </div>
        <BadgeCheck className="ml-auto size-5 shrink-0 text-success" />
      </div>

      <Link
        to="/report"
        className="bg-gradient-primary mt-6 flex h-14 items-center justify-center rounded-2xl text-base font-semibold text-primary-foreground shadow-card transition-transform active:scale-[0.98]"
      >
        Continue
      </Link>
    </AppShell>
  );
}
