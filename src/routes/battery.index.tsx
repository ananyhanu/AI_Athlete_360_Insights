import { createFileRoute, Link } from "@tanstack/react-router";
import { Activity, CheckCircle2, FileText, PlayCircle, RotateCcw } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { initials, useSelectedAthlete } from "@/lib/athletes";
import { assessmentMeta, batteryTestCount } from "@/lib/battery-tests";
import { useAssessmentSummary, type AssessmentTestState } from "@/lib/assessment-summary";

export const Route = createFileRoute("/battery/")({
  head: () => ({
    meta: [
      { title: "Assessment Summary — AI Athlete 360" },
      {
        name: "description",
        content:
          "Provisional ten-test assessment summary with athlete details and prototype workflow progress.",
      },
      { property: "og:title", content: "Assessment Summary — AI Athlete 360" },
      { property: "og:description", content: "Track and run the provisional ten-test battery." },
    ],
  }),
  component: AssessmentSummary,
});

function AssessmentSummary() {
  const athlete = useSelectedAthlete();
  const { loading, summary } = useAssessmentSummary(athlete.id);
  const progress = Math.round((summary.accepted / summary.total) * 100);

  return (
    <AppShell title="Assessment Summary" subtitle={athlete.name} backTo="/select-athlete">
      <section className="fitness-panel fitness-enter p-5">
        <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3">
          <span className="bg-gradient-primary grid size-14 shrink-0 place-items-center rounded-2xl font-display font-bold text-primary-foreground">
            {initials(athlete.name)}
          </span>
          <div className="min-w-0">
            <h2 className="truncate font-display text-lg font-bold">{athlete.name}</h2>
            <p className="truncate text-xs text-muted-foreground">
              {athlete.athleteId} · {athlete.sport}
            </p>
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <Row label="Coach" value={assessmentMeta.coachName} />
          <Row label="Event" value={athlete.event} />
          <Row label="Age" value={`${athlete.age} yrs`} />
          <Row label="Gender" value={athlete.gender} />
          <Row label="Height" value={`${athlete.heightCm} cm`} />
          <Row label="Weight" value={`${athlete.weightKg} kg`} />
          <Row label="BMI" value={String(athlete.bmi)} />
          <Row label="Date" value={assessmentMeta.date} />
          <Row label="Assessment ID" value={assessmentMeta.assessmentId} />
          <Row label="Sport" value={athlete.sport} />
        </dl>

        <Link
          to="/select-athlete"
          className="mt-4 inline-flex text-xs font-semibold text-primary underline underline-offset-4"
        >
          Change athlete
        </Link>
      </section>

      <section className="fitness-panel mt-4 p-5">
        <div className="flex items-center justify-between text-sm">
          <h2 className="font-semibold">Overall Progress</h2>
          <span className="font-display text-lg font-bold text-primary">{progress}%</span>
        </div>
        <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-secondary">
          <div
            className="bg-gradient-primary h-full rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {summary.completed} captured · {summary.accepted} coach accepted · {summary.total} required
        </p>
        {summary.needsRetest > 0 ? (
          <p className="mt-3 text-xs font-semibold text-destructive">
            {summary.needsRetest} test{summary.needsRetest === 1 ? "" : "s"} need a retake.
          </p>
        ) : null}
      </section>

      <p className="glass-surface mt-4 border-primary/20 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
        Prototype workflow: AI-derived measurements and scores are provisional estimates pending
        coach validation, approved test protocols, and model calibration.
      </p>

      <div className="mt-4 space-y-3">
        {summary.tests.map(({ attempt, state, test }) => {
          return (
            <article key={test.id} className="fitness-panel action-lift p-5 hover:action-lift-hover">
              <div className="flex items-center gap-3">
                <span className="bg-gradient-primary grid size-11 shrink-0 place-items-center rounded-2xl text-primary-foreground">
                  <Activity className="size-5" />
                </span>
                <div className="min-w-0">
                  <h2 className="truncate font-display text-base font-bold">{test.name}</h2>
                  <p className="truncate text-xs text-muted-foreground">
                    Measures: {test.measures}
                  </p>
                </div>
                {state === "accepted" ? (
                  <CheckCircle2 className="ml-auto size-6 shrink-0 text-success" />
                ) : null}
              </div>
              <p className="mt-3 text-sm text-muted-foreground">{test.description}</p>
              <StatusPill state={state} />

              {state === "not-started" || state === "needs-retest" ? (
                <Link
                  to="/battery/$testId"
                  params={{ testId: test.id }}
                  className="bg-gradient-primary action-lift mt-4 flex h-13 items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold text-primary-foreground shadow-card hover:action-lift-hover"
                >
                  <PlayCircle className="size-5" />
                  {state === "needs-retest" ? "Retake Test" : "Start Test"}
                </Link>
              ) : (
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <Link
                    to="/battery/$testId"
                    params={{ testId: test.id }}
                    className="action-lift flex items-center justify-center gap-2 rounded-xl bg-secondary py-3 text-sm font-semibold text-primary hover:action-lift-hover"
                  >
                    <RotateCcw className="size-4" />
                    Retake
                  </Link>
                  <Link
                    to="/battery/$testId/result"
                    params={{ testId: test.id }}
                    search={{ attemptId: attempt?.id, measurement: undefined }}
                    className="bg-gradient-primary action-lift flex items-center justify-center rounded-xl py-3 text-sm font-semibold text-primary-foreground shadow-card hover:action-lift-hover"
                  >
                    View Result
                  </Link>
                </div>
              )}
            </article>
          );
        })}
      </div>

      {summary.reportReady ? (
        <Link
          to="/report"
          className="bg-gradient-primary action-lift mt-5 flex h-14 items-center justify-center gap-2 rounded-xl text-base font-semibold text-primary-foreground shadow-card hover:action-lift-hover"
        >
          <FileText className="size-5" />
          Generate Final Report
        </Link>
      ) : (
        <button
          disabled
          className="fitness-panel mt-5 flex h-14 w-full cursor-not-allowed items-center justify-center gap-2 rounded-xl text-base font-semibold text-muted-foreground"
        >
          <FileText className="size-5" />
          Generate Final Report
        </button>
      )}
      {!summary.reportReady ? (
        <p className="mt-2 text-center text-xs text-muted-foreground">
          {loading
            ? "Loading encrypted assessment progress..."
            : `Capture and accept all ${batteryTestCount} tests to unlock the provisional report.`}
        </p>
      ) : null}
    </AppShell>
  );
}

function StatusPill({ state }: { state: AssessmentTestState }) {
  const tone =
    state === "accepted"
      ? "bg-success/12 text-success"
      : state === "awaiting-coach-review"
        ? "bg-primary/10 text-primary"
        : state === "needs-retest"
          ? "bg-destructive/10 text-destructive"
        : "bg-secondary text-muted-foreground";
  const label =
    state === "accepted"
      ? "Accepted"
      : state === "awaiting-coach-review"
        ? "Awaiting Coach Review"
        : state === "needs-retest"
          ? "Retake Required"
          : "Not Started";
  return (
    <p className={`mt-3 inline-flex rounded-full px-3 py-1 text-xs font-semibold ${tone}`}>
      Status: {label}
    </p>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate font-semibold text-foreground">{value}</dd>
    </div>
  );
}
