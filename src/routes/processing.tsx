import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/processing")({
  head: () => ({
    meta: [
      { title: "Analyzing Movement — AI Athlete 360" },
      {
        name: "description",
        content: "AI is analyzing the athlete's movement from the uploaded test video.",
      },
      { property: "og:title", content: "Analyzing Movement — AI Athlete 360" },
      { property: "og:description", content: "AI movement analysis in progress." },
    ],
  }),
  component: Processing,
});

function Processing() {
  const navigate = useNavigate();

  useEffect(() => {
    // TODO: poll FastAPI backend for analysis status
    const t = setTimeout(() => navigate({ to: "/result" }), 3000);
    return () => clearTimeout(t);
  }, [navigate]);

  return (
    <div className="bg-gradient-primary flex min-h-screen flex-col items-center justify-center px-8 text-center text-primary-foreground">
      <div className="relative grid size-32 place-items-center">
        <span className="absolute inset-0 animate-ping rounded-full bg-primary-foreground/20" />
        <span className="absolute inset-3 rounded-full border-4 border-primary-foreground/25 border-t-primary-foreground animate-spin" />
        <span className="font-display text-lg font-bold">AI</span>
      </div>
      <h1 className="mt-10 text-2xl font-bold">Analyzing Athlete Movement...</h1>
      <p className="mt-3 max-w-xs text-sm text-primary-foreground/80">
        Detecting body keypoints, counting repetitions and validating test form.
      </p>
      <div className="mt-8 h-2 w-full max-w-xs overflow-hidden rounded-full bg-primary-foreground/20">
        <div className="h-full w-1/2 animate-pulse rounded-full bg-primary-foreground" />
      </div>
    </div>
  );
}
