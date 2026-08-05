import { createFileRoute, Link } from "@tanstack/react-router";
import { Activity } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AI Athlete 360 — AI Powered Battery Fitness Assessment" },
      {
        name: "description",
        content:
          "AI Athlete 360 helps sports coaches run AI powered battery fitness assessments, track athlete tests and generate reports.",
      },
      { property: "og:title", content: "AI Athlete 360 — AI Powered Battery Fitness Assessment" },
      {
        property: "og:description",
        content: "AI Athlete 360 helps sports coaches run AI powered battery fitness assessments, track athlete tests and generate reports.",
      },
    ],
  }),
  component: Splash,
});

function Splash() {
  return (
    <div className="bg-gradient-primary flex min-h-screen flex-col items-center justify-center px-6 text-center text-primary-foreground">
      <div className="grid size-28 place-items-center rounded-3xl bg-primary-foreground/15 shadow-elevated">
        <Activity className="size-14" strokeWidth={2.5} />
      </div>
      <h1 className="mt-8 text-4xl font-extrabold">AI Athlete 360</h1>
      <p className="mt-3 max-w-xs text-base text-primary-foreground/85">
        AI Powered Battery Fitness Assessment
      </p>
      <Link
        to="/login"
        className="mt-12 inline-flex h-14 w-full max-w-xs items-center justify-center rounded-2xl bg-primary-foreground text-base font-semibold text-primary shadow-elevated transition-transform active:scale-[0.98]"
      >
        Get Started
      </Link>
      <p className="mt-8 text-xs uppercase tracking-[0.2em] text-primary-foreground/60">
        Sports Assessment Platform
      </p>
    </div>
  );
}
