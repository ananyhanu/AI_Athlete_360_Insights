import { createFileRoute, Link } from "@tanstack/react-router";
import { Activity, ChevronRight } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { batteryTests } from "@/lib/battery-tests";

export const Route = createFileRoute("/select-test")({
  head: () => ({
    meta: [
      { title: "Select Test — AI Athlete 360" },
      {
        name: "description",
        content: "Choose one of the ten provisional battery assessment workflows.",
      },
      { property: "og:title", content: "Select Test — AI Athlete 360" },
      { property: "og:description", content: "Pick the fitness battery test to assess." },
    ],
  }),
  component: SelectTest,
});

function SelectTest() {
  return (
    <AppShell
      title="Select Test"
      subtitle="Provisional battery workflow"
      backTo="/register-athlete"
    >
      <div className="space-y-3">
        {batteryTests.map((test) => (
          <Link
            key={test.id}
            to="/battery/$testId"
            params={{ testId: test.id }}
            className="flex items-center gap-4 rounded-2xl bg-card p-5 shadow-card transition-transform active:scale-[0.99]"
          >
            <span className="bg-gradient-primary grid size-12 shrink-0 place-items-center rounded-2xl text-primary-foreground">
              <Activity className="size-6" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-display text-base font-bold">{test.name}</span>
              <span className="block truncate text-sm text-muted-foreground">
                {test.measures} ·{" "}
                {test.captureMode === "manual" ? "Coach entry" : "Prototype video"}
              </span>
            </span>
            <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
          </Link>
        ))}
      </div>
    </AppShell>
  );
}
